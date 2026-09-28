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
    .map((element) => parseKickoffText($(element).text()))
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  const clubs = $(".club-name")
    .toArray()
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);

  const detailLinks = $("td.column-detail a")
    .toArray()
    .map((element) => absoluteFussballDeUrl($(element).attr("href")));

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
    const kickoff = localTimeInZoneToUtc(kickoffRows[index], timeZone);
    const endsAt = new Date(
      kickoff.getTime() + DEFAULT_MATCH_DURATION_MINUTES * 60_000
    );
    const url = detailLinks[index];
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
