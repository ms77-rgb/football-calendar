import type { CalendarConnector, ConnectorContext } from "@/lib/connectors/base";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * MVP contract for a private SpielerPlus iCalendar feed.
 *
 * The actual ICS parser will be added in the next integration step.
 * We intentionally keep credentials out of this connector: users provide
 * a private calendar URL instead of storing their SpielerPlus login.
 */
export class SpielerPlusConnector implements CalendarConnector {
  readonly source = "spielerplus" as const;

  constructor(private readonly calendarUrl: string) {}

  async fetchEvents(_context?: ConnectorContext): Promise<CalendarEvent[]> {
    void this.calendarUrl;
    throw new Error("SpielerPlus ICS import is not implemented yet.");
  }
}
