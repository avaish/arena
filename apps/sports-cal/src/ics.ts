import type { CachePayload, Game } from "./types";

/** RFC 5545 text escaping for property values. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Format a date as an ICS UTC date-time (YYYYMMDDTHHMMSSZ). */
export function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * Fold a content line to stay within the RFC 5545 75-octet limit.
 * Splits at 73 chars (conservative for multi-byte UTF-8) with a
 * space-prefixed continuation line.
 */
export function foldIcsLine(line: string): string {
  const limit = 73;
  if (line.length <= limit) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, limit));
  rest = rest.slice(limit);
  while (rest.length > limit - 1) {
    parts.push(" " + rest.slice(0, limit - 1));
    rest = rest.slice(limit - 1);
  }
  if (rest.length > 0) parts.push(" " + rest);
  return parts.join("\r\n");
}

export function gameToVevent(game: Game, dtstamp: Date): string[] {
  const start = new Date(game.start);
  const end = new Date(start.getTime() + game.durationMins * 60_000);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(game.uid)}@arena-sports-cal`,
    `DTSTAMP:${toIcsUtc(dtstamp)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(game.title)}`,
  ];
  if (game.venue) lines.push(`LOCATION:${escapeIcsText(game.venue)}`);
  lines.push(`DESCRIPTION:${escapeIcsText(game.league)} game`);
  lines.push("STATUS:CONFIRMED", "TRANSP:TRANSPARENT", "END:VEVENT");
  return lines;
}

export function buildCalendar(payload: CachePayload): string {
  const dtstamp = new Date(payload.refreshedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//arena//sports-cal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:My Teams",
    "X-WR-TIMEZONE:America/New_York",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const game of payload.games) {
    lines.push(...gameToVevent(game, dtstamp));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
