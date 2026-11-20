import { get, put } from "@vercel/blob";
import type { CalendarEvent } from "@/lib/calendar/types";

const PATH = "spielerplus/latest-events.json";

type StoredEvent = Omit<CalendarEvent, "startsAt" | "endsAt" | "updatedAt"> & {
  startsAt: string;
  endsAt: string;
  updatedAt: string;
};

export async function readSyncedSpielerPlusEvents(): Promise<CalendarEvent[] | null> {
  const result = await get(PATH, { access: "private" });
  if (!result) return null;
  const payload = await new Response(result.stream).json() as {
    version: number;
    events: StoredEvent[];
  };
  if (payload.version !== 1 || !Array.isArray(payload.events)) {
    throw new Error("Invalid saved SpielerPlus calendar data.");
  }
  return payload.events.map((event) => ({
    ...event,
    startsAt: new Date(event.startsAt),
    endsAt: new Date(event.endsAt),
    updatedAt: new Date(event.updatedAt)
  }));
}

export async function saveSyncedSpielerPlusEvents(events: CalendarEvent[]): Promise<void> {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    events: events.map((event) => ({
      ...event,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      updatedAt: event.updatedAt.toISOString()
    }))
  };
  await put(PATH, JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json"
  });
}
