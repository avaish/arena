import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
  env: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Discriminated union so TypeScript narrows correctly:
//   if (body.ok) body.data  — body.error not accessible on success branch
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Sports tracker schemas ───────────────────────────────────────────────────

export const GameStatusSchema = z.enum(["scheduled", "live", "completed", "cancelled"]);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const LeagueSchema = z.object({
  id: z.string(),
  name: z.string(),
  sport: z.string(),
  season: z.string(),
  logoUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type League = z.infer<typeof LeagueSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  leagueId: z.string(),
  logoUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type Team = z.infer<typeof TeamSchema>;

export const GameSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  startsAt: z.string(),
  venue: z.string().nullable(),
  status: GameStatusSchema,
  homeScore: z.string().nullable(),
  awayScore: z.string().nullable(),
  result: z.string().nullable(),
  matchday: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Game = z.infer<typeof GameSchema>;

export const GameWithTeamsSchema = GameSchema.extend({
  homeTeamName: z.string(),
  homeTeamShortName: z.string(),
  awayTeamName: z.string(),
  awayTeamShortName: z.string(),
  isFavorite: z.boolean(),
});
export type GameWithTeams = z.infer<typeof GameWithTeamsSchema>;

export const ToggleLeagueSchema = z.object({
  leagueId: z.string(),
});
export type ToggleLeague = z.infer<typeof ToggleLeagueSchema>;

export const ToggleTeamSchema = z.object({
  teamId: z.string(),
});
export type ToggleTeam = z.infer<typeof ToggleTeamSchema>;
