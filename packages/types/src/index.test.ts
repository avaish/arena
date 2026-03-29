import { describe, it, expect } from "vitest";
import {
  HealthResponseSchema,
  GameStatusSchema,
  LeagueSchema,
  GameSchema,
  GameWithTeamsSchema,
  ToggleLeagueSchema,
  ToggleTeamSchema,
  type ApiResponse,
} from "./index";

describe("ApiResponse", () => {
  it("ok branch has data", () => {
    const res: ApiResponse<number> = { ok: true, data: 42 };
    if (res.ok) expect(res.data).toBe(42);
  });

  it("error branch has error string", () => {
    const res: ApiResponse<number> = { ok: false, error: "oops" };
    if (!res.ok) expect(res.error).toBe("oops");
  });
});

describe("HealthResponseSchema", () => {
  it("parses a valid health response", () => {
    const result = HealthResponseSchema.safeParse({
      status: "ok",
      timestamp: new Date().toISOString(),
      env: "test",
    });
    expect(result.success).toBe(true);
  });

  it("rejects wrong status value", () => {
    const result = HealthResponseSchema.safeParse({
      status: "error",
      timestamp: new Date().toISOString(),
      env: "test",
    });
    expect(result.success).toBe(false);
  });
});

describe("GameStatusSchema", () => {
  it("accepts valid statuses", () => {
    for (const s of ["scheduled", "live", "completed", "cancelled"]) {
      expect(GameStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(GameStatusSchema.safeParse("postponed").success).toBe(false);
  });
});

describe("LeagueSchema", () => {
  const valid = {
    id: "ipl-2025",
    name: "Indian Premier League",
    sport: "cricket",
    season: "2025",
    logoUrl: null,
    createdAt: "2025-01-01T00:00:00.000Z",
  };

  it("parses a valid league", () => {
    expect(LeagueSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts logoUrl as string", () => {
    expect(
      LeagueSchema.safeParse({ ...valid, logoUrl: "https://example.com/logo.png" }).success
    ).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(
      LeagueSchema.safeParse({
        id: valid.id,
        sport: valid.sport,
        season: valid.season,
        logoUrl: valid.logoUrl,
        createdAt: valid.createdAt,
      }).success
    ).toBe(false);
  });
});

describe("GameSchema", () => {
  const valid = {
    id: "match-1",
    leagueId: "ipl-2025",
    homeTeamId: "csk",
    awayTeamId: "mi",
    startsAt: "2025-03-22T14:00:00.000Z",
    venue: "MA Chidambaram Stadium",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    result: null,
    matchday: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };

  it("parses a valid game", () => {
    expect(GameSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(GameSchema.safeParse({ ...valid, status: "delayed" }).success).toBe(false);
  });

  it("accepts nullable fields as null", () => {
    expect(GameSchema.safeParse({ ...valid, venue: null, matchday: null }).success).toBe(true);
  });
});

describe("GameWithTeamsSchema", () => {
  const valid = {
    id: "match-1",
    leagueId: "ipl-2025",
    homeTeamId: "csk",
    awayTeamId: "mi",
    startsAt: "2025-03-22T14:00:00.000Z",
    venue: null,
    status: "live",
    homeScore: "180/5 (20)",
    awayScore: "90/3 (10)",
    result: null,
    matchday: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    homeTeamName: "Chennai Super Kings",
    homeTeamShortName: "CSK",
    awayTeamName: "Mumbai Indians",
    awayTeamShortName: "MI",
    isFavorite: true,
  };

  it("parses a valid game with teams", () => {
    expect(GameWithTeamsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects if team fields are missing", () => {
    const { homeTeamName, ...missing } = valid; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(GameWithTeamsSchema.safeParse(missing).success).toBe(false);
  });
});

describe("ToggleLeagueSchema", () => {
  it("parses valid input", () => {
    expect(ToggleLeagueSchema.safeParse({ leagueId: "ipl-2025" }).success).toBe(true);
  });

  it("rejects empty object", () => {
    expect(ToggleLeagueSchema.safeParse({}).success).toBe(false);
  });
});

describe("ToggleTeamSchema", () => {
  it("parses valid input", () => {
    expect(ToggleTeamSchema.safeParse({ teamId: "csk" }).success).toBe(true);
  });

  it("rejects empty object", () => {
    expect(ToggleTeamSchema.safeParse({}).success).toBe(false);
  });
});
