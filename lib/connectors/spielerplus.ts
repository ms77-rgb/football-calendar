import * as cheerio from "cheerio";

import type { CalendarConnector, ConnectorContext } from "@/lib/connectors/base";
import type { CalendarEvent } from "@/lib/calendar/types";

const ALLOWED_SPIELERPLUS_HOSTS = new Set([
  "spielerplus.de",
  "www.spielerplus.de"
]);

const DEFAULT_TIME_ZONE = "Europe/Berlin";
const DEFAULT_TRAINING_DURATION_MINUTES = 90;
const DEFAULT_GAME_DURATION_MINUTES = 120;

type SpielerPlusEventType = "training" | "game";

export type SpielerPlusEventReference = {
  eventType: SpielerPlusEventType;
  eventId: string;
  url: string;
};

export type SpielerPlusConnectorOptions = {
  cookieHeader: string;
  timeZone?: string;
  fetchImpl?: typeof fetch;
  maxEvents?: number;
};

export type SpielerPlusProbeResult = {
  status: number;
  finalUrl: string;
  title: string;
  contentType: string;
  bodyLength: number;
  loginDetected: boolean;
  eventSignals: string[];
  relevantLinks: Array<{ text: string; href: string }>;
};

function assertAllowedSpielerPlusUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Ungültige SpielerPlus-URL.");
  }

  if (url.protocol !== "https:" || !ALLOWED_SPIELERPLUS_HOSTS.has(url.hostname)) {
    throw new Error("Erlaubt sind nur HTTPS-URLs auf spielerplus.de.");
  }

  return url;
}

function sanitizeCookieHeader(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Cookie-Header fehlt.");
  }

  if (trimmed.includes("\r") || trimmed.includes("\n")) {
    throw new Error("Cookie-Header enthält ungültige Zeilenumbrüche.");
  }

  return trimmed.replace(/^cookie:\s*/i, "");
}

async function fetchWithSafeRedirects(
  startUrl: URL,
  cookie: string,
  fetchImpl: typeof fetch,
  maxRedirects = 5
): Promise<Response> {
  let current = startUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchImpl(current.toString(), {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml",
        cookie,
        "user-agent":
          "football-calendar/0.1 SpielerPlus connector (+https://github.com/ms77-rgb/football-calendar)"
      },
      redirect: "manual",
      cache: "no-store"
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    const next = new URL(location, current);
    assertAllowedSpielerPlusUrl(next.toString());
    current = next;
  }

  throw new Error("Zu viele Weiterleitungen von SpielerPlus.");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isLoginPage(html: string): boolean {
  const $ = cheerio.load(html);
  const title = normalizeText($("title").first().text()).toLowerCase();
  const pageText = normalizeText($("body").text()).toLowerCase();

  return (
    /login|anmelden|einloggen/.test(title) ||
    $('form[action*="login"], input[type="password"]').length > 0 ||
    /passwort/.test(pageText)
  );
}

function localTimeInZoneToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
  timeZone: string
): Date {
  const desiredAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0
  );

  let candidate = desiredAsUtc;

  for (let i = 0; i < 2; i += 1) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });

    const formatted = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );

    const actualAsUtc = Date.UTC(
      formatted.year,
      formatted.month - 1,
      formatted.day,
      formatted.hour,
      formatted.minute,
      0
    );

    candidate += desiredAsUtc - actualAsUtc;
  }

  return new Date(candidate);
}

function parseGermanDate(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;

  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3])
  };
}

function parseClock(value: string | undefined): {
  hour: number;
  minute: number;
} | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

export function parseSpielerPlusEventIndexHtml(
  html: string,
  baseUrl = "https://www.spielerplus.de/events/index"
): SpielerPlusEventReference[] {
  const $ = cheerio.load(html);
  const references = new Map<string, SpielerPlusEventReference>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    let url: URL;
    try {
      url = assertAllowedSpielerPlusUrl(new URL(href, baseUrl).toString());
    } catch {
      return;
    }

    const eventType: SpielerPlusEventType | null =
      url.pathname === "/training/view"
        ? "training"
        : url.pathname === "/game/view"
          ? "game"
          : null;

    if (!eventType) return;

    const eventId = url.searchParams.get("id");
    if (!eventId || !/^\d+$/.test(eventId)) return;

    const key = `${eventType}:${eventId}`;
    references.set(key, {
      eventType,
      eventId,
      url: url.toString()
    });
  });

  return [...references.values()];
}

export function parseSpielerPlusEventHtml(
  html: string,
  reference: SpielerPlusEventReference,
  options?: {
    timeZone?: string;
    now?: Date;
  }
): CalendarEvent {
  const $ = cheerio.load(html);
  const timeZone = options?.timeZone ?? DEFAULT_TIME_ZONE;
  const date =
    parseGermanDate(normalizeText($("title").first().text())) ??
    parseGermanDate(normalizeText($("#header-title").first().text()));

  if (!date) {
    throw new Error(
      `SpielerPlus-Termin ${reference.eventType}:${reference.eventId} enthält kein Datum.`
    );
  }

  const times = new Map<string, string>();
  $(".event-time-item").each((_, element) => {
    const label = normalizeText($(element).find(".event-time-label").first().text())
      .toLowerCase();
    const value = normalizeText($(element).find(".event-time-value").first().text());

    if (label && value) {
      times.set(label, value);
    }
  });

  const startClock = parseClock(times.get("beginn"));
  if (!startClock) {
    throw new Error(
      `SpielerPlus-Termin ${reference.eventType}:${reference.eventId} enthält keine Beginn-Uhrzeit.`
    );
  }

  const startsAt = localTimeInZoneToUtc(
    { ...date, ...startClock },
    timeZone
  );

  const endClock = parseClock(times.get("ende"));
  let endsAt: Date;

  if (endClock) {
    endsAt = localTimeInZoneToUtc({ ...date, ...endClock }, timeZone);
    if (endsAt <= startsAt) {
      endsAt = new Date(endsAt.getTime() + 24 * 60 * 60_000);
    }
  } else {
    const durationMinutes =
      reference.eventType === "game"
        ? DEFAULT_GAME_DURATION_MINUTES
        : DEFAULT_TRAINING_DURATION_MINUTES;
    endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  }

  let location: string | undefined;
  $(".info-area").each((_, element) => {
    const heading = normalizeText($(element).find("h4").first().text()).toLowerCase();
    if (heading !== "adresse") return;

    const value = normalizeText($(element).find("small").first().text());
    const address = value.split(/untergrund\s*:/i)[0]?.trim();
    if (address) location = address;
  });

  const meeting = parseClock(times.get("treffen"));
  const descriptionParts = ["Quelle: SpielerPlus"];

  if (meeting) {
    descriptionParts.push(
      `Treffen: ${String(meeting.hour).padStart(2, "0")}:${String(meeting.minute).padStart(2, "0")}`
    );
  }

  const title = reference.eventType === "game" ? "Spiel" : "Training";
  const sourceEventId = `${reference.eventType}:${reference.eventId}`;

  return {
    id: `spielerplus:${sourceEventId}`,
    source: "spielerplus",
    sourceEventId,
    title,
    description: descriptionParts.join(" · "),
    location,
    startsAt,
    endsAt,
    url: reference.url,
    updatedAt: options?.now ?? new Date()
  };
}

export async function probeSpielerPlusSession(options: {
  url: string;
  cookieHeader: string;
  fetchImpl?: typeof fetch;
}): Promise<SpielerPlusProbeResult> {
  const startUrl = assertAllowedSpielerPlusUrl(options.url);
  const cookie = sanitizeCookieHeader(options.cookieHeader);
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchWithSafeRedirects(startUrl, cookie, fetchImpl);
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  const $ = cheerio.load(body);

  const title = normalizeText($("title").first().text());
  const pageText = normalizeText($("body").text()).toLowerCase();
  const loginDetected = isLoginPage(body);

  const signalWords = [
    "training",
    "termin",
    "termine",
    "absage",
    "abgesagt",
    "teilnahme",
    "mannschaft",
    "event"
  ];

  const eventSignals = signalWords.filter((word) => pageText.includes(word));

  const relevantLinks = $("a[href]")
    .toArray()
    .map((element) => {
      const text = normalizeText($(element).text()).slice(0, 120);
      const href = $(element).attr("href");

      if (!href) return null;

      try {
        const absolute = new URL(href, response.url || startUrl).toString();
        const parsed = assertAllowedSpielerPlusUrl(absolute);
        const combined = `${text} ${parsed.pathname}`.toLowerCase();

        if (!/(termin|training|event|team|mannschaft|calendar|kalender)/.test(combined)) {
          return null;
        }

        return { text: text || parsed.pathname, href: parsed.toString() };
      } catch {
        return null;
      }
    })
    .filter(
      (value): value is { text: string; href: string } => Boolean(value)
    )
    .filter(
      (value, index, values) =>
        values.findIndex((candidate) => candidate.href === value.href) === index
    )
    .slice(0, 30);

  return {
    status: response.status,
    finalUrl: response.url || startUrl.toString(),
    title,
    contentType,
    bodyLength: body.length,
    loginDetected,
    eventSignals,
    relevantLinks
  };
}

/**
 * Reads the currently visible SpielerPlus event list with an authenticated
 * session and then parses each training/game detail page into CalendarEvent.
 *
 * Credentials are supplied by the caller and are never persisted here.
 */
export class SpielerPlusConnector implements CalendarConnector {
  readonly source = "spielerplus" as const;

  private readonly cookie: string;
  private readonly timeZone: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxEvents: number;

  constructor(options: SpielerPlusConnectorOptions) {
    this.cookie = sanitizeCookieHeader(options.cookieHeader);
    this.timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxEvents = Math.max(1, Math.min(options.maxEvents ?? 100, 200));
  }

  async fetchEvents(context?: ConnectorContext): Promise<CalendarEvent[]> {
    const indexUrl = assertAllowedSpielerPlusUrl(
      "https://www.spielerplus.de/events/index"
    );
    const indexResponse = await fetchWithSafeRedirects(
      indexUrl,
      this.cookie,
      this.fetchImpl
    );

    if (!indexResponse.ok) {
      throw new Error(
        `SpielerPlus Terminliste lieferte HTTP ${indexResponse.status}.`
      );
    }

    const indexHtml = await indexResponse.text();
    if (isLoginPage(indexHtml)) {
      throw new Error(
        "SpielerPlus-Sitzung ist nicht mehr angemeldet. Bitte Sitzung erneuern."
      );
    }

    const references = parseSpielerPlusEventIndexHtml(
      indexHtml,
      indexResponse.url || indexUrl.toString()
    ).slice(0, this.maxEvents);

    const events = await Promise.all(
      references.map(async (reference) => {
        const response = await fetchWithSafeRedirects(
          assertAllowedSpielerPlusUrl(reference.url),
          this.cookie,
          this.fetchImpl
        );

        if (!response.ok) {
          throw new Error(
            `SpielerPlus ${reference.eventType}:${reference.eventId} lieferte HTTP ${response.status}.`
          );
        }

        const html = await response.text();
        if (isLoginPage(html)) {
          throw new Error(
            "SpielerPlus-Sitzung ist während des Abrufs abgelaufen."
          );
        }

        return parseSpielerPlusEventHtml(html, reference, {
          timeZone: this.timeZone,
          now: context?.now
        });
      })
    );

    return events;
  }
}
