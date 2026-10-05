import * as cheerio from "cheerio";

import type { CalendarEvent } from "@/lib/calendar/types";
import type { CalendarConnector, ConnectorContext } from "@/lib/connectors/base";

const TEAM_ID_PATTERN = /team-id\/([A-Z0-9]+)/i;
const DEFAULT_TIME_ZONE = "Europe/Berlin";
const DEFAULT_MATCH_DURATION_MINUTES = 120;

export type FussballDeConnectorOptions = {
  teamReference: string;
  teamName?: string;
  timeZone?: string;
  fetchImpl?: typeof fetch;
};

export function extractFussballDeTeamId(reference: string): string {
  const trimmed = reference.trim();

  if (/^[A-Z0-9]{20,}$/i.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(TEAM_ID_PATTERN);
  if (!match?.[1]) {
    throw new Error("No FUSSBALL.DE team-id found in the supplied reference.");
  }

  return match[1];
}

export function buildFussballDeMatchplanUrl(teamId: string): string {
  return `https://www.fussball.de/ajax.team.matchplan/-/mode/PAGE/team-id/${encodeURIComponent(teamId)}`;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function rowIsCancelled($: cheerio.CheerioAPI, element: any): boolean {
  const row = $(element).closest("tr");
  const block = row.closest("tbody").length > 0 ? row.closest("tbody") : row.parent();
  const text = cleanText(block.text()).toLowerCase();
  const markup = block.toString().toLowerCase();

  return (
    /\babgesetzt\b/.test(text) ||
    /\babse\.?(?:\s|$)/.test(text) ||
    /\babgesagt\b/.test(text) ||
    /\babges\.?(?:\s|$)/.test(text) ||
    /\bausgefallen\b/.test(text) ||
    /\bannulliert\b/.test(text) ||
    /\bspielausfall\b/.test(text) ||
    /\bnicht angetreten\b/.test(text) ||
    /cancelled|canceled|abgesetzt|abgesagt|ausgefallen|annulliert/.test(markup)
  );
}

function textShowsCancellation(text: string, markup = ""): boolean {
  const normalized = cleanText(text).toLowerCase();
  const normalizedMarkup = markup.toLowerCase();

  return (
    /\babsetzung\b/.test(normalized) ||
    /\babgesetzt\b/.test(normalized) ||
    /\babse\.?(?:\s|$)/.test(normalized) ||
    /\babgesagt\b/.test(normalized) ||
    /\babges\.?(?:\s|$)/.test(normalized) ||
    /\bausgefallen\b/.test(normalized) ||
    /\bannulliert\b/.test(normalized) ||
    /\bspielausfall\b/.test(normalized) ||
    /\bnicht angetreten\b/.test(normalized) ||
    /cancelled|canceled|absetzung|abgesetzt|abgesagt|ausgefallen|annulliert/.test(normalizedMarkup)
  );
}

function detailLinkIsCancelled($: cheerio.CheerioAPI, element: any): boolean {
  let current = $(element);

  for (let depth = 0; depth < 8 && current.length > 0; depth += 1) {
    const linkCount = current.find("td.column-detail a, a[href*='/spiel/']").length;

    // Stop before climbing into a container that holds more than one fixture.
    if (linkCount > 1) {
      return false;
    }

    if (textShowsCancellation(current.text(), current.toString())) {
      return true;
    }

    current = current.parent();
  }

  return false;
}

function parseKickoffText(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  const text = cleanText(value);
  const date = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const time = text.match(/(\d{1,2}):(\d{2})/);

  if (!date || !time) return null;

  return {
    day: Number(date[1]),
    month: Number(date[2]),
    year: Number(date[3]),
    hour: Number(time[1]),
    minute: Number(time[2])
  };
}

/**
 * Converts local wall-clock time in a named timezone to UTC without adding
 * another timezone dependency. Two correction passes cover DST boundaries.
 */
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

function extractMatchId(url: string | undefined, fallback: string): string {
  if (!url) return fallback;

  const decoded = decodeURIComponent(url);
  const matchId =
    decoded.match(/match-id\/([A-Z0-9]+)/i)?.[1] ??
    decoded.match(/spiel\/[^/]+\/\-\/spiel\/([A-Z0-9]+)/i)?.[1];

  return matchId ?? url;
}

function absoluteFussballDeUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;

  try {
    return new URL(href, "https://www.fussball.de").toString();
  } catch {
    return undefined;
  }
}

export function parseFussballDeMatchplanHtml(
  html: string,
  options: {
    teamId: string;
    teamName?: string;
    timeZone?: string;
    now?: Date;
  }
): CalendarEvent[] {
  const $ = cheerio.load(html);
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const updatedAt = options.now ?? new Date();

  const kickoffRows = $("tr.row-headline")
    .toArray()
    .map((element) => ({
      kickoff: parseKickoffText($(element).text()),
      cancelled: rowIsCancelled($, element)
    }))
    .filter(
      (value): value is {
        kickoff: NonNullable<ReturnType<typeof parseKickoffText>>;
        cancelled: boolean;
      } => Boolean(value.kickoff)
    );

  const clubs = $(".club-name")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);

  const detailLinks = $("td.column-detail a")
    .toArray()
    .map((element) => ({
      url: absoluteFussballDeUrl($(element).attr("href")),
      cancelled: detailLinkIsCancelled($, element)
    }));

  const venues = $(
    ".column-venue, .venue, .location, td.column-detail .location"
  )
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);

  const numberOfMatches = Math.min(kickoffRows.length, Math.floor(clubs.length / 2));
  const events: CalendarEvent[] = [];

  for (let index = 0; index < numberOfMatches; index += 1) {
    const homeTeam = clubs[index * 2];
    const awayTeam = clubs[index * 2 + 1];
    if (
      kickoffRows[index].cancelled ||
      detailLinks[index]?.cancelled
    ) {
      continue;
    }

    const kickoff = localTimeInZoneToUtc(kickoffRows[index].kickoff, timeZone);
    const endsAt = new Date(
      kickoff.getTime() + DEFAULT_MATCH_DURATION_MINUTES * 60_000
    );
    const url = detailLinks[index]?.url;
    const fallbackId = [
      options.teamId,
      kickoff.toISOString(),
      homeTeam,
      awayTeam
    ].join(":");
    const sourceEventId = extractMatchId(url, fallbackId);

    events.push({
      id: `fussball-de:${sourceEventId}`,
      source: "fussball.de",
      sourceEventId,
      title: `${homeTeam} – ${awayTeam}`,
      description: options.teamName
        ? `Spiel von ${options.teamName} · Quelle: FUSSBALL.DE`
        : "Quelle: FUSSBALL.DE",
      location: venues[index] || undefined,
      startsAt: kickoff,
      endsAt,
      teamName: options.teamName,
      url,
      updatedAt
    });
  }

  return events;
}

/**
 * Experimental FUSSBALL.DE connector.
 *
 * FUSSBALL.DE historically exposes team match plans through an AJAX endpoint.
 * This adapter keeps that platform-specific behavior isolated behind our
 * connector contract so it can be replaced if the provider changes its markup
 * or access model.
 */
export class FussballDeConnector implements CalendarConnector {
  readonly source = "fussball.de" as const;

  private readonly teamId: string;
  private readonly teamName?: string;
  private readonly timeZone: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FussballDeConnectorOptions | string) {
    const normalized =
      typeof options === "string" ? { teamReference: options } : options;

    this.teamId = extractFussballDeTeamId(normalized.teamReference);
    this.teamName = normalized.teamName;
    this.timeZone = normalized.timeZone ?? DEFAULT_TIME_ZONE;
    this.fetchImpl = normalized.fetchImpl ?? fetch;
  }

  async fetchEvents(context?: ConnectorContext): Promise<CalendarEvent[]> {
    const response = await this.fetchImpl(buildFussballDeMatchplanUrl(this.teamId), {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "football-calendar/0.1 (+https://github.com/ms77-rgb/football-calendar)"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `FUSSBALL.DE returned HTTP ${response.status} for team ${this.teamId}.`
      );
    }

    const html = await response.text();

    return parseFussballDeMatchplanHtml(html, {
      teamId: this.teamId,
      teamName: this.teamName,
      timeZone: this.timeZone,
      now: context?.now
    });
  }
}


export type FussballDeClubSearchResult = {
  name: string;
  url: string;
};

export type FussballDeTeamSearchResult = {
  id: string;
  name: string;
  url: string;
};

export function parseFussballDeClubSearchHtml(
  html: string
): FussballDeClubSearchResult[] {
  const $ = cheerio.load(html);
  const results = new Map<string, FussballDeClubSearchResult>();

  $('a[href*="/verein/"]').each((_, element) => {
    const href = $(element).attr("href");
    const name = cleanText($(element).text());
    const url = absoluteFussballDeUrl(href);

    if (!url || !name) return;

    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "www.fussball.de") return;
      if (!parsed.pathname.startsWith("/verein/")) return;
      results.set(parsed.pathname, { name, url });
    } catch {
      // Ignore malformed links from upstream markup.
    }
  });

  return [...results.values()].slice(0, 20);
}

export function parseFussballDeClubTeamsHtml(
  html: string
): FussballDeTeamSearchResult[] {
  const $ = cheerio.load(html);
  const results = new Map<string, FussballDeTeamSearchResult>();

  $('a[href*="/mannschaft/"][href*="/team-id/"]').each((_, element) => {
    const href = $(element).attr("href");
    const url = absoluteFussballDeUrl(href);
    if (!url) return;

    let id: string;
    try {
      id = extractFussballDeTeamId(url);
    } catch {
      return;
    }

    const directText = cleanText($(element).text());
    const fallbackText = cleanText($(element).closest("li, article, section, div").text());
    const name = directText || fallbackText || id;

    if (!results.has(id)) {
      results.set(id, { id, name, url });
    }
  });

  return [...results.values()];
}

export async function searchFussballDeClubs(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<FussballDeClubSearchResult[]> {
  const normalized = cleanText(query);
  if (normalized.length < 2) return [];

  const url = `https://www.fussball.de/suche/-/text/${encodeURIComponent(normalized)}/restriction/-1`;
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "football-calendar/0.1 (+https://github.com/ms77-rgb/football-calendar)"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`FUSSBALL.DE search returned HTTP ${response.status}.`);
  }

  return parseFussballDeClubSearchHtml(await response.text());
}

export async function fetchFussballDeClubTeams(
  clubUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<FussballDeTeamSearchResult[]> {
  let parsed: URL;

  try {
    parsed = new URL(clubUrl);
  } catch {
    throw new Error("Invalid FUSSBALL.DE club URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "www.fussball.de" ||
    !parsed.pathname.startsWith("/verein/")
  ) {
    throw new Error("Only FUSSBALL.DE club URLs are allowed.");
  }

  const response = await fetchImpl(parsed.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "football-calendar/0.1 (+https://github.com/ms77-rgb/football-calendar)"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`FUSSBALL.DE club page returned HTTP ${response.status}.`);
  }

  return parseFussballDeClubTeamsHtml(await response.text());
}
