import { saveSyncedSpielerPlusEvents } from "@/lib/calendar/synced-spielerplus";
import type { CalendarEvent } from "@/lib/calendar/types";

export const runtime = "nodejs";

function equalToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  const secret = process.env.CALENDAR_FEED_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !equalToken(supplied, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 512_000) return new Response("Payload too large", { status: 413 });

  let data: unknown;
  try {
    const body = await request.text();
    if (body.length > 512_000) return new Response("Payload too large", { status: 413 });
    data = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const raw = data as { events?: unknown } | null;
  if (!raw || !Array.isArray(raw.events) || raw.events.length > 500) {
    return new Response("Expected an events array of at most 500 items", { status: 400 });
  }

  const events: CalendarEvent[] = [];
  for (const value of raw.events) {
    const event = value as Record<string, unknown> | null;
    if (!event || event.source !== "spielerplus" ||
      typeof event.id !== "string" || typeof event.sourceEventId !== "string" ||
      typeof event.title !== "string" || typeof event.startsAt !== "string" ||
      typeof event.endsAt !== "string" || event.id.length > 300 ||
      event.title.length > 500 || event.sourceEventId.length > 300) {
      return new Response("Invalid SpielerPlus event", { status: 400 });
    }
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) ||
      endsAt < startsAt) {
      return new Response("Invalid event dates", { status: 400 });
    }
    events.push({
      id: event.id,
      source: "spielerplus",
      sourceEventId: event.sourceEventId,
      title: event.title,
      startsAt,
      endsAt,
      updatedAt: new Date(),
      ...(typeof event.description === "string" ? { description: event.description.slice(0, 3000) } : {}),
      ...(typeof event.location === "string" ? { location: event.location.slice(0, 500) } : {}),
      ...(typeof event.teamName === "string" ? { teamName: event.teamName.slice(0, 200) } : {}),
      ...(typeof event.url === "string" && /^https:\/\/www\.spielerplus\.de\//.test(event.url)
        ? { url: event.url } : {}),
      ...(typeof event.allDay === "boolean" ? { allDay: event.allDay } : {})
    });
  }
  try {
    await saveSyncedSpielerPlusEvents(events);
    return Response.json({ ok: true, count: events.length }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json({ error: "Unable to save events" }, { status: 503 });
  }
}
