import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@arena/db";
import type { ApiResponse, GameWithTeams } from "@arena/types";

const db = drizzle(env.APP_DB, { schema });
const now = new Date();
const futureDate = new Date(Date.now() + 86400000);

// Sign a cookie value the same way Hono does (HMAC-SHA256, base64).
async function signCookie(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${value}.${base64Sig}`;
}

// Clean all tables before each test to avoid unique constraint conflicts.
// Delete in reverse FK order.
beforeEach(async () => {
  await db.delete(schema.userTeam);
  await db.delete(schema.userLeague);
  await db.delete(schema.game);
  await db.delete(schema.team);
  await db.delete(schema.league);
  await db.delete(schema.session);
  await db.delete(schema.user);
});

// Seed a user + session directly in D1. Better Auth resolves sessions via the
// `better-auth.session_token` cookie, looking up the `session.token` column.
async function seedAuthUser(userId = "test-user", sessionToken = "test-token") {
  await db.insert(schema.user).values({
    id: userId,
    name: "Test User",
    email: `${userId}@test.com`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.session).values({
    id: `session-${userId}`,
    token: sessionToken,
    userId,
    expiresAt: futureDate,
    createdAt: now,
    updatedAt: now,
  });
  return sessionToken;
}

async function seedLeague(id = "ipl-2025") {
  await db.insert(schema.league).values({
    id,
    name: "Indian Premier League",
    sport: "cricket",
    season: "2025",
    createdAt: now,
  });
  return id;
}

async function seedTeams(leagueId = "ipl-2025") {
  const teams = [
    { id: "csk", name: "Chennai Super Kings", shortName: "CSK", leagueId, createdAt: now },
    { id: "mi", name: "Mumbai Indians", shortName: "MI", leagueId, createdAt: now },
  ];
  await db.insert(schema.team).values(teams);
  return teams;
}

async function seedGame(overrides: Partial<typeof schema.game.$inferInsert> = {}) {
  const game = {
    id: "game-1",
    leagueId: "ipl-2025",
    homeTeamId: "csk",
    awayTeamId: "mi",
    startsAt: futureDate,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await db.insert(schema.game).values(game);
  return game;
}

async function authedHeaders(token = "test-token") {
  const signed = await signCookie(token, env.BETTER_AUTH_SECRET);
  return { cookie: `better-auth.session_token=${encodeURIComponent(signed)}` };
}

// ── Public routes ────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await SELF.fetch("http://localhost/api/health");
    expect(res.status).toBe(200);
    const body: ApiResponse<{ status: string }> = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("GET /api/leagues", () => {
  it("returns empty list when no leagues exist", async () => {
    const res = await SELF.fetch("http://localhost/api/leagues");
    const body: ApiResponse<unknown[]> = await res.json();
    expect(body).toEqual({ ok: true, data: [] });
  });

  it("returns seeded leagues", async () => {
    await seedLeague();
    const res = await SELF.fetch("http://localhost/api/leagues");
    const body: ApiResponse<{ id: string }[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("ipl-2025");
    }
  });
});

describe("GET /api/leagues/:leagueId/teams", () => {
  beforeEach(async () => {
    await seedLeague();
    await seedTeams();
  });

  it("returns teams for a league", async () => {
    const res = await SELF.fetch("http://localhost/api/leagues/ipl-2025/teams");
    const body: ApiResponse<{ id: string }[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toHaveLength(2);
      const ids = body.data.map((t) => t.id).sort();
      expect(ids).toEqual(["csk", "mi"]);
    }
  });

  it("returns empty for unknown league", async () => {
    const res = await SELF.fetch("http://localhost/api/leagues/nba-2025/teams");
    const body: ApiResponse<unknown[]> = await res.json();
    expect(body).toEqual({ ok: true, data: [] });
  });
});

describe("GET /api/leagues/:leagueId/games", () => {
  beforeEach(async () => {
    await seedLeague();
    await seedTeams();
  });

  it("returns games with team names", async () => {
    await seedGame();
    const res = await SELF.fetch("http://localhost/api/leagues/ipl-2025/games");
    const body: ApiResponse<GameWithTeams[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].homeTeamName).toBe("Chennai Super Kings");
      expect(body.data[0].awayTeamName).toBe("Mumbai Indians");
      expect(body.data[0].homeTeamShortName).toBe("CSK");
      expect(body.data[0].awayTeamShortName).toBe("MI");
    }
  });

  it("filters by status", async () => {
    await seedGame({ id: "game-1", status: "scheduled" });
    await seedGame({ id: "game-2", status: "completed" });
    const res = await SELF.fetch("http://localhost/api/leagues/ipl-2025/games?status=completed");
    const body: ApiResponse<GameWithTeams[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe("completed");
    }
  });
});

// ── Auth-protected routes ────────────────────────────────────────────────────

describe("GET /api/me", () => {
  it("returns 401 without auth", async () => {
    const res = await SELF.fetch("http://localhost/api/me");
    expect(res.status).toBe(401);
  });

  it("returns user id with valid session", async () => {
    await seedAuthUser();
    const res = await SELF.fetch("http://localhost/api/me", { headers: await authedHeaders() });
    expect(res.status).toBe(200);
    const body: ApiResponse<{ userId: string }> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) expect(body.data.userId).toBe("test-user");
  });
});

describe("POST /api/user/leagues (toggle)", () => {
  beforeEach(async () => {
    await seedAuthUser();
    await seedLeague();
  });

  it("returns 401 without auth", async () => {
    const res = await SELF.fetch("http://localhost/api/user/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leagueId: "ipl-2025" }),
    });
    expect(res.status).toBe(401);
  });

  it("follows a league on first POST", async () => {
    const res = await SELF.fetch("http://localhost/api/user/leagues", {
      method: "POST",
      headers: { ...(await authedHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ leagueId: "ipl-2025" }),
    });
    const body: ApiResponse<{ following: boolean }> = await res.json();
    expect(body).toEqual({ ok: true, data: { following: true } });
  });

  it("unfollows on second POST (toggle)", async () => {
    // Follow
    await SELF.fetch("http://localhost/api/user/leagues", {
      method: "POST",
      headers: { ...(await authedHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ leagueId: "ipl-2025" }),
    });
    // Unfollow
    const res = await SELF.fetch("http://localhost/api/user/leagues", {
      method: "POST",
      headers: { ...(await authedHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ leagueId: "ipl-2025" }),
    });
    const body: ApiResponse<{ following: boolean }> = await res.json();
    expect(body).toEqual({ ok: true, data: { following: false } });
  });
});

describe("GET /api/user/leagues", () => {
  it("returns empty when user follows nothing", async () => {
    await seedAuthUser();
    const res = await SELF.fetch("http://localhost/api/user/leagues", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<string[]> = await res.json();
    expect(body).toEqual({ ok: true, data: [] });
  });

  it("returns followed league ids", async () => {
    await seedAuthUser();
    await seedLeague();
    await db
      .insert(schema.userLeague)
      .values({ userId: "test-user", leagueId: "ipl-2025", createdAt: now });
    const res = await SELF.fetch("http://localhost/api/user/leagues", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<string[]> = await res.json();
    expect(body).toEqual({ ok: true, data: ["ipl-2025"] });
  });
});

describe("POST /api/user/teams (toggle)", () => {
  beforeEach(async () => {
    await seedAuthUser();
    await seedLeague();
    await seedTeams();
  });

  it("favorites a team on first POST", async () => {
    const res = await SELF.fetch("http://localhost/api/user/teams", {
      method: "POST",
      headers: { ...(await authedHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ teamId: "csk" }),
    });
    const body: ApiResponse<{ favorited: boolean }> = await res.json();
    expect(body).toEqual({ ok: true, data: { favorited: true } });
  });

  it("unfavorites on second POST (toggle)", async () => {
    await SELF.fetch("http://localhost/api/user/teams", {
      method: "POST",
      headers: { ...(await authedHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ teamId: "csk" }),
    });
    const res = await SELF.fetch("http://localhost/api/user/teams", {
      method: "POST",
      headers: { ...(await authedHeaders()), "content-type": "application/json" },
      body: JSON.stringify({ teamId: "csk" }),
    });
    const body: ApiResponse<{ favorited: boolean }> = await res.json();
    expect(body).toEqual({ ok: true, data: { favorited: false } });
  });
});

describe("GET /api/user/teams", () => {
  it("returns favorited team ids", async () => {
    await seedAuthUser();
    await seedLeague();
    await seedTeams();
    await db.insert(schema.userTeam).values({ userId: "test-user", teamId: "csk", createdAt: now });
    const res = await SELF.fetch("http://localhost/api/user/teams", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<string[]> = await res.json();
    expect(body).toEqual({ ok: true, data: ["csk"] });
  });
});

describe("GET /api/user/feed", () => {
  beforeEach(async () => {
    await seedAuthUser();
    await seedLeague();
    await seedTeams();
    await seedGame();
    // Follow the league
    await db
      .insert(schema.userLeague)
      .values({ userId: "test-user", leagueId: "ipl-2025", createdAt: now });
  });

  it("returns 401 without auth", async () => {
    const res = await SELF.fetch("http://localhost/api/user/feed");
    expect(res.status).toBe(401);
  });

  it("returns games from followed leagues", async () => {
    const res = await SELF.fetch("http://localhost/api/user/feed", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<GameWithTeams[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].isFavorite).toBe(false);
    }
  });

  it("marks games as favorite when user favorites a team", async () => {
    await db.insert(schema.userTeam).values({ userId: "test-user", teamId: "csk", createdAt: now });
    const res = await SELF.fetch("http://localhost/api/user/feed", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<GameWithTeams[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.data[0].isFavorite).toBe(true);
    }
  });

  it("filters to favorites only", async () => {
    await seedGame({ id: "game-2", homeTeamId: "mi", awayTeamId: "csk" });
    // Only favorite CSK
    await db.insert(schema.userTeam).values({ userId: "test-user", teamId: "csk", createdAt: now });
    const res = await SELF.fetch("http://localhost/api/user/feed?favorites_only=true", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<GameWithTeams[]> = await res.json();
    expect(body.ok).toBe(true);
    if (body.ok) {
      // Both games involve CSK, so both should be favorites
      expect(body.data).toHaveLength(2);
      expect(body.data.every((g) => g.isFavorite)).toBe(true);
    }
  });

  it("returns empty when user follows no leagues", async () => {
    // Remove league follow
    await db.delete(schema.userLeague);
    const res = await SELF.fetch("http://localhost/api/user/feed", {
      headers: await authedHeaders(),
    });
    const body: ApiResponse<GameWithTeams[]> = await res.json();
    expect(body).toEqual({ ok: true, data: [] });
  });
});
