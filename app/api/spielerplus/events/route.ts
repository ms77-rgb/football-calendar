import { normalizeEvents } from "@/lib/calendar/normalize";
import { SpielerPlusConnector } from "@/lib/connectors/spielerplus";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cookieHeader =
      typeof body?.cookieHeader === "string" ? body.cookieHeader : "";

    if (!cookieHeader) {
      return Response.json(
        { error: "Cookie-Header wird benötigt." },
        { status: 400 }
      );
    }

    const connector = new SpielerPlusConnector({
      cookieHeader,
      maxEvents: 100
    });

    const events = normalizeEvents(await connector.fetchEvents());

    return Response.json(
      {
        count: events.length,
        events: events.map((event) => ({
          id: event.sourceEventId,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          endsAt: event.endsAt.toISOString(),
          location: event.location ?? null,
          description: event.description ?? null,
          url: event.url ?? null
        }))
      },
      {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache"
        }
      }
    );
  } catch (error) {
    return Response.json(
      {
        error: "SpielerPlus-Termine konnten nicht gelesen werden.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache"
        }
      }
    );
  }
}
