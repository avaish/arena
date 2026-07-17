import { describe, expect, it } from "vitest";
import { buildCalendar, escapeIcsText, foldIcsLine, gameToVevent, toIcsUtc } from "./ics";
import type { CachePayload, Game } from "./types";

const game: Game = {
  uid: "espn-nba-401584722",
  league: "NBA",
  title: "[NBA] Brooklyn Nets vs Boston Celtics",
  start: "2026-08-01T23:30:00.000Z",
  durationMins: 150,
  venue: "Barclays Center, Brooklyn, New York",
  tv: ["ESPN", "NBA League Pass"],
  url: "https://www.espn.com/watch/",
};

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, backslashes, and newlines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("toIcsUtc", () => {
  it("formats a UTC basic date-time", () => {
    expect(toIcsUtc(new Date("2026-08-01T23:30:00Z"))).toBe("20260801T233000Z");
  });
});

describe("foldIcsLine", () => {
  it("leaves short lines alone", () => {
    expect(foldIcsLine("SUMMARY:hi")).toBe("SUMMARY:hi");
  });

  it("folds long lines with space-prefixed continuations", () => {
    const folded = foldIcsLine("SUMMARY:" + "x".repeat(200));
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines.slice(1)) expect(line.startsWith(" ")).toBe(true);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(74);
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toContain("x".repeat(200));
  });
});

describe("gameToVevent", () => {
  it("emits UTC start/end and escaped fields", () => {
    const lines = gameToVevent(game, new Date("2026-07-17T00:00:00Z"));
    expect(lines).toContain("DTSTART:20260801T233000Z");
    expect(lines).toContain("DTEND:20260802T020000Z");
    expect(lines).toContain("SUMMARY:📺 [NBA] Brooklyn Nets vs Boston Celtics");
    expect(lines).toContain("LOCATION:Barclays Center\\, Brooklyn\\, New York");
    expect(lines).toContain("UID:espn-nba-401584722@arena-sports-cal");
  });

  it("includes TV networks and a watch URL", () => {
    const lines = gameToVevent(game, new Date("2026-07-17T00:00:00Z"));
    expect(lines).toContain(
      "DESCRIPTION:NBA game\\nTV: ESPN\\, NBA League Pass\\nWatch: https://www.espn.com/watch/"
    );
    expect(lines).toContain("URL:https://www.espn.com/watch/");
  });

  it("marks New York area games with a home icon", () => {
    const homeGame = { ...game, nyArea: true };
    const lines = gameToVevent(homeGame, new Date("2026-07-17T00:00:00Z"));
    expect(lines).toContain("SUMMARY:🏠 [NBA] Brooklyn Nets vs Boston Celtics");
  });

  it("omits TV and URL lines when absent", () => {
    const bare = { ...game, tv: undefined, url: undefined };
    const lines = gameToVevent(bare, new Date("2026-07-17T00:00:00Z"));
    expect(lines).toContain("DESCRIPTION:NBA game");
    expect(lines.some((l) => l.startsWith("URL:"))).toBe(false);
  });
});

describe("buildCalendar", () => {
  it("produces a valid VCALENDAR wrapper with CRLF line endings", () => {
    const payload: CachePayload = {
      refreshedAt: "2026-07-17T00:00:00.000Z",
      windowDays: 60,
      games: [game],
      errors: [],
    };
    const ics = buildCalendar(payload);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("X-WR-TIMEZONE:America/New_York");
    expect(ics.split("BEGIN:VEVENT").length - 1).toBe(1);
  });
});
