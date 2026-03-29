import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

export const passkey = sqliteTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  credentialID: text("credential_id").notNull(),
  webauthnUserId: text("webauthn_user_id"),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
  transports: text("transports"),
  createdAt: integer("created_at", { mode: "timestamp" }),
  aaguid: text("aaguid"),
});

// ── Sports tracker tables ────────────────────────────────────────────────────

export const league = sqliteTable("league", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sport: text("sport").notNull(),
  season: text("season").notNull(),
  logoUrl: text("logo_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const team = sqliteTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  leagueId: text("league_id")
    .notNull()
    .references(() => league.id),
  logoUrl: text("logo_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const game = sqliteTable("game", {
  id: text("id").primaryKey(),
  leagueId: text("league_id")
    .notNull()
    .references(() => league.id),
  homeTeamId: text("home_team_id")
    .notNull()
    .references(() => team.id),
  awayTeamId: text("away_team_id")
    .notNull()
    .references(() => team.id),
  startsAt: integer("starts_at", { mode: "timestamp" }).notNull(),
  venue: text("venue"),
  status: text("status").notNull(),
  homeScore: text("home_score"),
  awayScore: text("away_score"),
  result: text("result"),
  matchday: integer("matchday"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const userLeague = sqliteTable(
  "user_league",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    leagueId: text("league_id")
      .notNull()
      .references(() => league.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.leagueId] })]
);

export const userTeam = sqliteTable(
  "user_team",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.teamId] })]
);
