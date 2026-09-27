import type { CalendarConnector, ConnectorContext } from "@/lib/connectors/base";
import type { CalendarEvent } from "@/lib/calendar/types";

/**
 * Connector boundary for FUSSBALL.DE.
 *
 * The concrete implementation is deliberately deferred until we have
 * verified a stable and permitted data-access path for production use.
 */
export class FussballDeConnector implements CalendarConnector {
  readonly source = "fussball.de" as const;

  constructor(private readonly teamReference: string) {}

  async fetchEvents(_context?: ConnectorContext): Promise<CalendarEvent[]> {
    void this.teamReference;
    throw new Error("FUSSBALL.DE import is not implemented yet.");
  }
}
