import type { CalendarConnector } from "@/lib/connectors/base";
import type { CalendarEvent } from "@/lib/calendar/types";

export class DemoConnector implements CalendarConnector {
  readonly source = "manual" as const;

  async fetchEvents(): Promise<CalendarEvent[]> {
    return [
      {
        id: "demo-match-1",
        source: "manual",
        sourceEventId: "match-1",
        title: "Demo FC – Beispiel SV",
        description: "MVP-Demotermin",
        location: "Sportplatz Musterstadt",
        startsAt: new Date("2026-10-03T13:00:00+02:00"),
        endsAt: new Date("2026-10-03T15:00:00+02:00"),
        teamName: "Demo FC",
        updatedAt: new Date("2026-09-27T09:00:00Z")
      }
    ];
  }
}
