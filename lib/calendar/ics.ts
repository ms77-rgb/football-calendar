import type { CalendarEvent } from "@/lib/calendar/types";

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string): string {
  const limit = 73;
  if (line.length <= limit) return line;

  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += limit) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + limit));
  }
  return chunks.join("\r\n");
}

export function buildIcsCalendar(
  name: string,
  events: CalendarEvent[]
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Football Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.id)}@football-calendar`,
      `DTSTAMP:${formatUtc(event.updatedAt)}`,
      `DTSTART:${formatUtc(event.startsAt)}`,
      `DTEND:${formatUtc(event.endsAt)}`,
      `SUMMARY:${escapeText(event.title)}`
    );

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeText(event.location)}`);
    }
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
