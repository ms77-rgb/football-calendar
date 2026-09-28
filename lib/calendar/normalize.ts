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
