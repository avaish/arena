import { describe, expect, it } from "vitest";
import { computeNow } from "./index";
import type { CachePayload, Game } from "./types";

function game(uid: string, start: string, durationMins = 120): Game {
  return { uid, league: "MLB", title: `[MLB] ${uid}`, start, durationMins };
}

const payload: CachePayload = {
  refreshedAt: "2026-07-17T12:00:00.000Z",
  windowDays: 60,
  errors: [],
  games: [
    game("finished", "2026-07-17T08:00:00.000Z"),
    game("live", "2026-07-17T13:00:00.000Z", 180),
    game("soon", "2026-07-17T18:00:00.000Z"),
    game("later", "2026-07-18T18:00:00.000Z"),
  ],
};

describe("computeNow", () => {
  it("splits games into live and upNext", () => {
    const now = computeNow(payload, Date.parse("2026-07-17T14:00:00Z"));
    expect(now.live.map((g) => g.uid)).toEqual(["live"]);
    expect(now.upNext.map((g) => g.uid)).toEqual(["soon", "later"]);
  });

  it("treats a game past its duration as over", () => {
    const now = computeNow(payload, Date.parse("2026-07-17T16:30:00Z"));
    expect(now.live).toEqual([]);
    expect(now.upNext.map((g) => g.uid)).toEqual(["soon", "later"]);
  });

  it("includes a game exactly at kickoff as live", () => {
    const now = computeNow(payload, Date.parse("2026-07-17T13:00:00Z"));
    expect(now.live.map((g) => g.uid)).toEqual(["live"]);
  });

  it("caps upNext at five games", () => {
    const many: CachePayload = {
      ...payload,
      games: Array.from({ length: 10 }, (_, i) => game(`g${i}`, `2026-07-2${i}T18:00:00.000Z`)),
    };
    const now = computeNow(many, Date.parse("2026-07-17T00:00:00Z"));
    expect(now.upNext).toHaveLength(5);
  });
});
