import { buildIcsCalendar } from "@/lib/calendar/ics";
import { normalizeEvents } from "@/lib/calendar/normalize";
import { FussballDeConnector } from "@/lib/connectors/fussball-de";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const team = url.searchParams.get("team");
  const name = url.searchParams.get("name") ?? undefined;

  if (!team) {
    return Response.json(
      {
        error: "Missing team query parameter.",
        example:
          "/api/calendar/fussball-de?team=02TBFC6PAG000000VS5489BSVV9JRPRB&name=TuS%201896%20Sachsenhausen%20U16"
      },
      { status: 400 }
    );
  }

  try {
    const connector = new FussballDeConnector({
      teamReference: team,
      teamName: name
    });

    const events = normalizeEvents(await connector.fetchEvents());
    const calendarName = name ? `${name} · Football Calendar` : "FUSSBALL.DE · Football Calendar";
    const ics = buildIcsCalendar(calendarName, events);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="football-calendar.ics"',
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      {
        error: "Could not import the FUSSBALL.DE match plan.",
        detail: message
      },
      { status: 502 }
    );
  }
}
