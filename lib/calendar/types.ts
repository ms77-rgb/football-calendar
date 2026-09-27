export type EventSource = "fussball.de" | "spielerplus" | "manual";

export type CalendarEvent = {
  id: string;
  source: EventSource;
  sourceEventId: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  teamName?: string;
  url?: string;
  updatedAt: Date;
};
