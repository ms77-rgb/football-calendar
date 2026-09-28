import { buildIcsCalendar } from "@/lib/calendar/ics";
import { normalizeEvents, preferFussballDeDuplicateMatches } from "@/lib/calendar/normalize";
import { FussballDeConnector, extractFussballDeTeamId } from "@/lib/connectors/fussball-de";
import { SpielerPlusConnector } from "@/lib/connectors/spielerplus";

type TeamSelection = {
  reference: string;
  name?: string;
};

function parseTeamSelection(value: string): TeamSelection {
  const separator = value.indexOf("::");

  if (separator === -1) {
    return { reference: value };
  }

  return {
    reference: value.slice(0, separator),
    name: value.slice(separator + 2) || undefined
  };
}

function timingSafeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const configuredToken = process.env.CALENDAR_FEED_TOKEN;
  const spielerPlusCookie = process.env.SPIELERPLUS_COOKIE;
  const spielerPlusUserIds = (process.env.SPIELERPLUS_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configuredToken || !spielerPlusCookie) {
    return Response.json(
      {
        error: "Private calendar feed is not configured on the server.",
        missing: [
          !configuredToken ? "CALENDAR_FEED_TOKEN" : null,
          !spielerPlusCookie ? "SPIELERPLUS_COOKIE" : null
        ].filter(Boolean)
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const { token } = await context.params;

  if (!timingSafeEqualText(token, configuredToken)) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  const url = new URL(request.url);
  const rawTeams = url.searchParams.getAll("team").filter(Boolean);

  if (rawTeams.length > 5) {
    return Response.json(
      { error: "The MVP supports up to 5 FUSSBALL.DE teams per calendar." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const selections = rawTeams.map(parseTeamSelection);

    for (const selection of selections) {
      extractFussballDeTeamId(selection.reference);
    }

    const fussballDePromise = Promise.all(
      selections.map((selection) =>
        new FussballDeConnector({
          teamReference: selection.reference,
          teamName: selection.name
        }).fetchEvents()
      )
    );

    const spielerPlusPromise = new SpielerPlusConnector({
      cookieHeader: spielerPlusCookie,
      userIds: spielerPlusUserIds,
      maxEvents: 50
    }).fetchEvents();

    const [fussballDeGroups, spielerPlusEvents] = await Promise.all([
      fussballDePromise,
      spielerPlusPromise
    ]);

    const fussballDeEvents = fussballDeGroups.flat();
    const normalizedEvents = normalizeEvents([
      ...fussballDeEvents,
      ...spielerPlusEvents
    ]);
    const events = preferFussballDeDuplicateMatches(normalizedEvents);
    const suppressedSpielerPlusDuplicates =
      normalizedEvents.length - events.length;

    if (url.searchParams.get("debug") === "1") {
      return Response.json(
        {
          fussballDeCount: fussballDeEvents.length,
          spielerPlusCount: spielerPlusEvents.length,
          totalCount: events.length,
          suppressedSpielerPlusDuplicates,
          spielerPlusSamples: spielerPlusEvents.slice(0, 10).map((event) => ({
            id: event.sourceEventId,
            title: event.title,
            startsAt: event.startsAt.toISOString()
          }))
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex, nofollow"
          }
        }
      );
    }

    const configuredNames = selections
      .map((selection) => selection.name)
      .filter((name): name is string => Boolean(name));

    const calendarName =
      configuredNames.length > 0
        ? "Fußball + SpielerPlus"
        : "SpielerPlus";

    const ics = buildIcsCalendar(calendarName, events);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="football-calendar.ics"',
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      {
        error: "Could not build the private combined calendar.",
        detail: message
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
