import { buildIcsCalendar } from "@/lib/calendar/ics";
import { normalizeEvents } from "@/lib/calendar/normalize";
import {
  extractFussballDeTeamId,
  FussballDeConnector
} from "@/lib/connectors/fussball-de";

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawTeams = url.searchParams.getAll("team").filter(Boolean);

  if (rawTeams.length === 0) {
    return Response.json(
      {
        error: "At least one team parameter is required.",
        example:
          "/api/calendar/multi?team=02TBFC6PAG000000VS5489BSVV9JRPRB::TuS%201896%20Sachsenhausen%20U16"
      },
      { status: 400 }
    );
  }

  if (rawTeams.length > 5) {
    return Response.json(
      { error: "The MVP supports up to 5 teams per calendar." },
      { status: 400 }
    );
  }

  try {
    const selections = rawTeams.map(parseTeamSelection);

    // Validate references before making network calls so malformed links fail clearly.
    for (const selection of selections) {
      extractFussballDeTeamId(selection.reference);
    }

    const eventGroups = await Promise.all(
      selections.map((selection) =>
        new FussballDeConnector({
          teamReference: selection.reference,
          teamName: selection.name
        }).fetchEvents()
      )
    );

    const events = normalizeEvents(eventGroups.flat());
    const configuredNames = selections
      .map((selection) => selection.name)
      .filter((name): name is string => Boolean(name));

    const calendarName =
      configuredNames.length === 1
        ? configuredNames[0]
        : configuredNames.length > 1
          ? `${configuredNames.length} Fußballteams`
          : "Mein Fußballkalender";

    const ics = buildIcsCalendar(calendarName, events);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="football-calendar.ics"',
        "Cache-Control": "public, max-age=300, stale-while-revalidate=300"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json(
      {
        error: "Could not build the combined FUSSBALL.DE calendar.",
        detail: message
      },
      { status: 502 }
    );
  }
}
