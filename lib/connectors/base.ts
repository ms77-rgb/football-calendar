import type { CalendarEvent, EventSource } from "@/lib/calendar/types";

export type ConnectorContext = {
  now?: Date;
};

export interface CalendarConnector {
  readonly source: EventSource;
  fetchEvents(context?: ConnectorContext): Promise<CalendarEvent[]>;
}
