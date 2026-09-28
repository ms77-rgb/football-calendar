import { probeSpielerPlusSession } from "@/lib/connectors/spielerplus";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url : "";
    const cookieHeader =
      typeof body?.cookieHeader === "string" ? body.cookieHeader : "";

    if (!url || !cookieHeader) {
      return Response.json(
        { error: "URL und Cookie-Header werden benötigt." },
        { status: 400 }
      );
    }

    const result = await probeSpielerPlusSession({ url, cookieHeader });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Pragma": "no-cache"
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: "SpielerPlus-Sitzung konnte nicht geprüft werden.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store",
          "Pragma": "no-cache"
        }
      }
    );
  }
}
