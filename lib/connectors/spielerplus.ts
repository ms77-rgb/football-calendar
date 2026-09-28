import * as cheerio from "cheerio";

import type { CalendarConnector, ConnectorContext } from "@/lib/connectors/base";
import type { CalendarEvent } from "@/lib/calendar/types";

const ALLOWED_SPIELERPLUS_HOSTS = new Set([
  "spielerplus.de",
  "www.spielerplus.de"
]);

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
          "football-calendar/0.1 SpielerPlus session probe (+https://github.com/ms77-rgb/football-calendar)"
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

  const loginDetected =
    /login|anmelden|einloggen/.test(title.toLowerCase()) ||
    $('form[action*="login"], input[type="password"]').length > 0 ||
    /passwort/.test(pageText);

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
 * MVP contract for a private SpielerPlus iCalendar feed.
 *
 * The actual ICS parser will be added in a later integration step.
 * We intentionally keep credentials out of this connector.
 */
export class SpielerPlusConnector implements CalendarConnector {
  readonly source = "spielerplus" as const;

  constructor(private readonly calendarUrl: string) {}

  async fetchEvents(_context?: ConnectorContext): Promise<CalendarEvent[]> {
    void this.calendarUrl;
    throw new Error("SpielerPlus ICS import is not implemented yet.");
  }
}
