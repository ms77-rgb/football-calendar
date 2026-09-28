import { searchFussballDeClubs } from "@/lib/connectors/fussball-de";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return Response.json(
      { error: "Bitte mindestens zwei Zeichen eingeben." },
      { status: 400 }
    );
  }

  try {
    const clubs = await searchFussballDeClubs(query);
    return Response.json({ clubs });
  } catch (error) {
    return Response.json(
      {
        error: "Vereinssuche bei FUSSBALL.DE fehlgeschlagen.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
