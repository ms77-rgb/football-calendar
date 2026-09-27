import { buildIcsCalendar } from "@/lib/calendar/ics";
import { normalizeEvents } from "@/lib/calendar/normalize";
import { DemoConnector } from "@/lib/connectors/demo";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  if (token !== "demo") {
    return new Response("Calendar not found", { status: 404 });
  }

  const connector = new DemoConnector();
  const events = normalizeEvents(await connector.fetchEvents());
  const ics = buildIcsCalendar("Football Calendar Demo", events);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="football-calendar.ics"',
      "Cache-Control": "public, max-age=300"
    }
  });
}
