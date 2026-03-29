import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { zValidator } from "@hono/zod-validator";
import { drizzle } from "drizzle-orm/d1";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "@arena/db";
import type { ApiResponse, HealthResponse, GameWithTeams, GameStatus } from "@arena/types";
import { ToggleLeagueSchema, ToggleTeamSchema } from "@arena/types";
import { createAuth } from "./auth";

type Bindings = {
  APP_KV: KVNamespace;
  APP_DB: D1Database;
  ENVIRONMENT: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  PASSKEY_RP_ID: string;
  PASSKEY_ORIGIN: string;
};

type Variables = {
  user: { id: string; email: string | null; isAnonymous?: boolean | null };
  session: { id: string; userId: string };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      origin?.endsWith(".pages.dev") || origin === "http://localhost:5173" ? origin : "",
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── Auth middleware ────────────────────────────────────────────────────────────
// Use on any route that requires a valid session.
// On success, c.var.user and c.var.session are populated.
const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const session = await createAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) {
      return c.json<ApiResponse<never>>({ ok: false, error: "unauthorized" }, 401);
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  }
);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  const body: ApiResponse<HealthResponse> = {
    ok: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      env: c.env.ENVIRONMENT,
    },
  };
  return c.json(body);
});

// Protected route example — add requireAuth to any route you want to guard.
// c.var.user and c.var.session are typed and available after the middleware runs.
app.get("/api/me", requireAuth, (c) => {
  return c.json<ApiResponse<{ userId: string }>>({
    ok: true,
    data: { userId: c.var.user.id },
  });
});

// ── League & Game routes ──────────────────────────────────────────────────────

app.get("/api/leagues", async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const leagues = await db.select().from(schema.league).all();
  return c.json<ApiResponse<typeof leagues>>({ ok: true, data: leagues });
});

app.get("/api/leagues/:leagueId/teams", async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const teams = await db
    .select()
    .from(schema.team)
    .where(eq(schema.team.leagueId, c.req.param("leagueId")))
    .all();
  return c.json<ApiResponse<typeof teams>>({ ok: true, data: teams });
});

app.get("/api/leagues/:leagueId/games", async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const leagueId = c.req.param("leagueId");
  const status = c.req.query("status");

  let query = db
    .select({
      id: schema.game.id,
      leagueId: schema.game.leagueId,
      homeTeamId: schema.game.homeTeamId,
      awayTeamId: schema.game.awayTeamId,
      startsAt: schema.game.startsAt,
      venue: schema.game.venue,
      status: schema.game.status,
      homeScore: schema.game.homeScore,
      awayScore: schema.game.awayScore,
      result: schema.game.result,
      matchday: schema.game.matchday,
      createdAt: schema.game.createdAt,
      updatedAt: schema.game.updatedAt,
      homeTeamName: schema.team.name,
      homeTeamShortName: schema.team.shortName,
    })
    .from(schema.game)
    .innerJoin(schema.team, eq(schema.game.homeTeamId, schema.team.id))
    .where(eq(schema.game.leagueId, leagueId))
    .orderBy(schema.game.startsAt)
    .$dynamic();

  if (status) {
    query = query.where(and(eq(schema.game.leagueId, leagueId), eq(schema.game.status, status)));
  }

  // Two-pass: we need both home and away team names but can't join the same table twice easily.
  // Instead, do a single query and look up away team names separately.
  const rows = await query.all();

  const awayTeamIds = [...new Set(rows.map((r) => r.awayTeamId))];
  const awayTeams =
    awayTeamIds.length > 0
      ? await db
          .select({ id: schema.team.id, name: schema.team.name, shortName: schema.team.shortName })
          .from(schema.team)
          .where(inArray(schema.team.id, awayTeamIds))
          .all()
      : [];
  const awayTeamMap = new Map(awayTeams.map((t) => [t.id, t]));

  const games: GameWithTeams[] = rows.map((r) => {
    const away = awayTeamMap.get(r.awayTeamId);
    return {
      ...r,
      status: r.status as GameStatus,
      startsAt: r.startsAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      awayTeamName: away?.name ?? "",
      awayTeamShortName: away?.shortName ?? "",
      isFavorite: false,
    };
  });

  return c.json<ApiResponse<GameWithTeams[]>>({ ok: true, data: games });
});

// ── User preference routes ────────────────────────────────────────────────────

app.get("/api/user/leagues", requireAuth, async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const rows = await db
    .select({ leagueId: schema.userLeague.leagueId })
    .from(schema.userLeague)
    .where(eq(schema.userLeague.userId, c.var.user.id))
    .all();
  return c.json<ApiResponse<string[]>>({ ok: true, data: rows.map((r) => r.leagueId) });
});

app.post("/api/user/leagues", requireAuth, zValidator("json", ToggleLeagueSchema), async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const { leagueId } = c.req.valid("json");
  const userId = c.var.user.id;

  const deleted = await db
    .delete(schema.userLeague)
    .where(and(eq(schema.userLeague.userId, userId), eq(schema.userLeague.leagueId, leagueId)))
    .returning();

  if (deleted.length > 0) {
    return c.json<ApiResponse<{ following: boolean }>>({ ok: true, data: { following: false } });
  }

  await db.insert(schema.userLeague).values({ userId, leagueId, createdAt: new Date() });
  return c.json<ApiResponse<{ following: boolean }>>({ ok: true, data: { following: true } });
});

app.get("/api/user/teams", requireAuth, async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const rows = await db
    .select({ teamId: schema.userTeam.teamId })
    .from(schema.userTeam)
    .where(eq(schema.userTeam.userId, c.var.user.id))
    .all();
  return c.json<ApiResponse<string[]>>({ ok: true, data: rows.map((r) => r.teamId) });
});

app.post("/api/user/teams", requireAuth, zValidator("json", ToggleTeamSchema), async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const { teamId } = c.req.valid("json");
  const userId = c.var.user.id;

  const deleted = await db
    .delete(schema.userTeam)
    .where(and(eq(schema.userTeam.userId, userId), eq(schema.userTeam.teamId, teamId)))
    .returning();

  if (deleted.length > 0) {
    return c.json<ApiResponse<{ favorited: boolean }>>({ ok: true, data: { favorited: false } });
  }

  await db.insert(schema.userTeam).values({ userId, teamId, createdAt: new Date() });
  return c.json<ApiResponse<{ favorited: boolean }>>({ ok: true, data: { favorited: true } });
});

app.get("/api/user/feed", requireAuth, async (c) => {
  const db = drizzle(c.env.APP_DB, { schema });
  const userId = c.var.user.id;
  const favoritesOnly = c.req.query("favorites_only") === "true";

  // Get user's followed leagues and favorite teams
  const [followedLeagues, favoriteTeams] = await Promise.all([
    db
      .select({ leagueId: schema.userLeague.leagueId })
      .from(schema.userLeague)
      .where(eq(schema.userLeague.userId, userId))
      .all(),
    db
      .select({ teamId: schema.userTeam.teamId })
      .from(schema.userTeam)
      .where(eq(schema.userTeam.userId, userId))
      .all(),
  ]);

  const leagueIds = followedLeagues.map((r) => r.leagueId);
  if (leagueIds.length === 0) {
    return c.json<ApiResponse<GameWithTeams[]>>({ ok: true, data: [] });
  }

  const favoriteTeamIds = new Set(favoriteTeams.map((r) => r.teamId));

  // Fetch games from followed leagues with home team info
  const rows = await db
    .select({
      id: schema.game.id,
      leagueId: schema.game.leagueId,
      homeTeamId: schema.game.homeTeamId,
      awayTeamId: schema.game.awayTeamId,
      startsAt: schema.game.startsAt,
      venue: schema.game.venue,
      status: schema.game.status,
      homeScore: schema.game.homeScore,
      awayScore: schema.game.awayScore,
      result: schema.game.result,
      matchday: schema.game.matchday,
      createdAt: schema.game.createdAt,
      updatedAt: schema.game.updatedAt,
      homeTeamName: schema.team.name,
      homeTeamShortName: schema.team.shortName,
    })
    .from(schema.game)
    .innerJoin(schema.team, eq(schema.game.homeTeamId, schema.team.id))
    .where(inArray(schema.game.leagueId, leagueIds))
    .orderBy(schema.game.startsAt)
    .all();

  // Look up away team names
  const awayTeamIds = [...new Set(rows.map((r) => r.awayTeamId))];
  const awayTeams =
    awayTeamIds.length > 0
      ? await db
          .select({ id: schema.team.id, name: schema.team.name, shortName: schema.team.shortName })
          .from(schema.team)
          .where(inArray(schema.team.id, awayTeamIds))
          .all()
      : [];
  const awayTeamMap = new Map(awayTeams.map((t) => [t.id, t]));

  let games: GameWithTeams[] = rows.map((r) => {
    const away = awayTeamMap.get(r.awayTeamId);
    const isFavorite = favoriteTeamIds.has(r.homeTeamId) || favoriteTeamIds.has(r.awayTeamId);
    return {
      ...r,
      status: r.status as GameStatus,
      startsAt: r.startsAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      awayTeamName: away?.name ?? "",
      awayTeamShortName: away?.shortName ?? "",
      isFavorite,
    };
  });

  if (favoritesOnly) {
    games = games.filter((g) => g.isFavorite);
  }

  return c.json<ApiResponse<GameWithTeams[]>>({ ok: true, data: games });
});

// ── Auth routes ───────────────────────────────────────────────────────────────

app.on(["GET", "POST"], "/api/auth/**", async (c) => {
  let req = c.req.raw;
  const contentLengthHeader = c.req.header("content-length");
  if (c.req.method === "POST" && contentLengthHeader === "0") {
    const headers = new Headers(req.headers);
    headers.set("content-length", "2");
    req = new Request(req.url, {
      method: req.method,
      headers,
      body: "{}",
      duplex: "half",
    } as RequestInit);
  }
  return createAuth(c.env).handler(req);
});

// ── Error handling ────────────────────────────────────────────────────────────

app.notFound((c) => c.json<ApiResponse<never>>({ ok: false, error: "not found" }, 404));

app.onError((err, c) => {
  console.error(err);
  return c.json<ApiResponse<never>>({ ok: false, error: err.message }, 500);
});

export default app;
