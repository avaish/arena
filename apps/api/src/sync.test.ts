import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@arena/db";
import { syncIPL } from "./sync";

const db = drizzle(env.APP_DB, { schema });

beforeEach(async () => {
  await db.delete(schema.game);
  await db.delete(schema.team);
  await db.delete(schema.league);
});

function fakeSeriesResponse(series: object[] = [fakeSeries()]) {
  return {
    apikey: "test",
    status: "success",
    data: series,
    info: { hitsToday: 1, hitsLimit: 100 },
  };
}

function fakeSeries(overrides: Record<string, unknown> = {}) {
  return {
    id: "series-1",
    name: "Indian Premier League 2025",
    startDate: "2025-03-22",
    endDate: "2025-05-25",
    odi: 0,
    t20: 74,
    test: 0,
    squads: 10,
    matches: 74,
    ...overrides,
  };
}

function fakeMatchListResponse(matches: object[] = [fakeMatch()]) {
  return {
    apikey: "test",
    status: "success",
    data: {
      info: fakeSeries(),
      matchList: matches,
    },
    info: { hitsToday: 2, hitsLimit: 100 },
  };
}

function fakeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-abc",
    name: "Chennai Super Kings vs Mumbai Indians, 1st Match",
    matchType: "t20",
    status: "Match not started",
    venue: "MA Chidambaram Stadium, Chennai",
    date: "2025-03-22",
    dateTimeGMT: "2025-03-22T14:00:00",
    teams: ["Chennai Super Kings", "Mumbai Indians"],
    teamInfo: [
      { name: "Chennai Super Kings", shortname: "CSK", img: "https://example.com/csk.png" },
      { name: "Mumbai Indians", shortname: "MI", img: "https://example.com/mi.png" },
    ],
    score: [],
    series_id: "series-1",
    fantasyEnabled: false,
    bbbEnabled: false,
    hasSquad: true,
    matchStarted: false,
    matchEnded: false,
    ...overrides,
  };
}

// Fake fetch that returns canned responses in order. No mocking framework needed.
function createFakeFetch(...responses: object[]): typeof fetch & { calls: string[] } {
  let callIndex = 0;
  const calls: string[] = [];
  const fakeFn = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const body = responses[callIndex++] ?? { status: "error", data: [] };
    return new Response(JSON.stringify(body));
  }) as typeof fetch & { calls: string[] };
  fakeFn.calls = calls;
  return fakeFn;
}

describe("syncIPL", () => {
  it("creates league, teams, and game from API data", async () => {
    const fakeFetch = createFakeFetch(fakeSeriesResponse(), fakeMatchListResponse());

    const result = await syncIPL(env.APP_DB, "test-key", fakeFetch);

    expect(result.synced).toBe(1);

    const leagues = await db.select().from(schema.league).all();
    expect(leagues).toHaveLength(1);
    expect(leagues[0].id).toBe("ipl-2025");
    expect(leagues[0].sport).toBe("cricket");

    const teams = await db.select().from(schema.team).all();
    expect(teams).toHaveLength(2);
    const teamIds = teams.map((t) => t.id).sort();
    expect(teamIds).toEqual(["csk", "mi"]);

    const games = await db.select().from(schema.game).all();
    expect(games).toHaveLength(1);
    expect(games[0].homeTeamId).toBe("csk");
    expect(games[0].awayTeamId).toBe("mi");
    expect(games[0].status).toBe("scheduled");
    expect(games[0].venue).toBe("MA Chidambaram Stadium, Chennai");
  });

  it("updates scores and status for live games", async () => {
    // First sync: scheduled game
    const fakeFetch1 = createFakeFetch(fakeSeriesResponse(), fakeMatchListResponse());
    await syncIPL(env.APP_DB, "test-key", fakeFetch1);

    // Second sync: game is now live with scores
    const liveMatch = fakeMatch({
      matchStarted: true,
      matchEnded: false,
      status: "Chennai Super Kings opt to bat",
      score: [
        { r: 180, w: 5, o: 20, inning: "CSK Inning 1" },
        { r: 90, w: 3, o: 10, inning: "MI Inning 1" },
      ],
    });
    const fakeFetch2 = createFakeFetch(fakeSeriesResponse(), fakeMatchListResponse([liveMatch]));
    await syncIPL(env.APP_DB, "test-key", fakeFetch2);

    const games = await db.select().from(schema.game).all();
    expect(games).toHaveLength(1);
    expect(games[0].status).toBe("live");
    expect(games[0].homeScore).toBe("180/5 (20)");
    expect(games[0].awayScore).toBe("90/3 (10)");
  });

  it("sets result for completed games", async () => {
    const completedMatch = fakeMatch({
      matchStarted: true,
      matchEnded: true,
      status: "Chennai Super Kings won by 5 wickets",
      score: [
        { r: 150, w: 10, o: 20, inning: "MI Inning 1" },
        { r: 151, w: 5, o: 18.2, inning: "CSK Inning 1" },
      ],
    });
    const fakeFetch = createFakeFetch(
      fakeSeriesResponse(),
      fakeMatchListResponse([completedMatch])
    );

    await syncIPL(env.APP_DB, "test-key", fakeFetch);

    const games = await db.select().from(schema.game).all();
    expect(games[0].status).toBe("completed");
    expect(games[0].result).toBe("Chennai Super Kings won by 5 wickets");
  });

  it("parses matchday from match name", async () => {
    const match42 = fakeMatch({ name: "CSK vs MI, 42nd Match" });
    const fakeFetch = createFakeFetch(fakeSeriesResponse(), fakeMatchListResponse([match42]));

    await syncIPL(env.APP_DB, "test-key", fakeFetch);

    const games = await db.select().from(schema.game).all();
    expect(games[0].matchday).toBe(42);
  });

  it("returns 0 when series search fails", async () => {
    const fakeFetch = createFakeFetch({ status: "error", data: [] });

    const result = await syncIPL(env.APP_DB, "test-key", fakeFetch);
    expect(result.synced).toBe(0);
  });

  it("returns 0 when no IPL series found", async () => {
    const fakeFetch = createFakeFetch(
      fakeSeriesResponse([fakeSeries({ name: "Big Bash League" })])
    );

    const result = await syncIPL(env.APP_DB, "test-key", fakeFetch);
    expect(result.synced).toBe(0);
  });

  it("skips matches without teamInfo", async () => {
    const noTeamInfo = fakeMatch({ teamInfo: undefined, teams: [] });
    const fakeFetch = createFakeFetch(fakeSeriesResponse(), fakeMatchListResponse([noTeamInfo]));

    const result = await syncIPL(env.APP_DB, "test-key", fakeFetch);
    expect(result.synced).toBe(0);
  });

  it("passes API key in fetch URLs", async () => {
    const fakeFetch = createFakeFetch(fakeSeriesResponse(), fakeMatchListResponse());

    await syncIPL(env.APP_DB, "my-secret-key", fakeFetch);

    expect(fakeFetch.calls).toHaveLength(2);
    expect(fakeFetch.calls[0]).toContain("apikey=my-secret-key");
    expect(fakeFetch.calls[1]).toContain("apikey=my-secret-key");
  });
});
