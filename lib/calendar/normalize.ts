import type { CalendarEvent } from "@/lib/calendar/types";

export function normalizeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const byKey = new Map<string, CalendarEvent>();

  for (const event of events) {
    const key = `${event.source}:${event.sourceEventId}`;
    const current = byKey.get(key);

    if (!current || event.updatedAt > current.updatedAt) {
      byKey.set(key, event);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  );
}


const DUPLICATE_MATCH_TOLERANCE_MS = 60 * 60_000;

function isSpielerPlusGame(event: CalendarEvent): boolean {
  return (
    event.source === "spielerplus" &&
    event.sourceEventId.startsWith("game:")
  );
}

/**
 * Prefer the richer FUSSBALL.DE match when the same game is also present in
 * SpielerPlus. SpielerPlus currently exposes only the generic title "Spiel",
 * so we match conservatively on kickoff time and only suppress SpielerPlus
 * game events. Trainings and other SpielerPlus events are never affected.
 */
export function preferFussballDeDuplicateMatches(
  events: CalendarEvent[]
): CalendarEvent[] {
  const fussballDeMatches = events.filter(
    (event) => event.source === "fussball.de"
  );

  return events.filter((event) => {
    if (!isSpielerPlusGame(event)) return true;

    return !fussballDeMatches.some(
      (match) =>
        Math.abs(match.startsAt.getTime() - event.startsAt.getTime()) <=
        DUPLICATE_MATCH_TOLERANCE_MS
    );
  });
}
