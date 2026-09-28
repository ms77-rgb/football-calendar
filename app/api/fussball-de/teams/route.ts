import { fetchFussballDeClubTeams } from "@/lib/connectors/fussball-de";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const club = (url.searchParams.get("club") ?? "").trim();

  if (!club) {
    return Response.json(
      { error: "Es fehlt die FUSSBALL.DE-Vereins-URL." },
      { status: 400 }
    );
  }

  try {
    const teams = await fetchFussballDeClubTeams(club);
    return Response.json({ teams });
  } catch (error) {
    return Response.json(
      {
        error: "Mannschaften konnten nicht geladen werden.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
