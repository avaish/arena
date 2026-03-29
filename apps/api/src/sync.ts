import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "@arena/db";

const API_BASE = "https://api.cricapi.com/v1";

// ── CricketData.org response types ──────────────────────────────────────────

interface CricApiResponse<T> {
  apikey: string;
  data: T;
  status: string;
  info: { hitsToday: number; hitsLimit: number };
}

interface CricApiSeries {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  odi: number;
  t20: number;
  test: number;
  squads: number;
  matches: number;
}

interface CricApiMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: { name: string; shortname: string; img: string }[];
  score?: { r: number; w: number; o: number; inning: string }[];
  series_id: string;
  fantasyEnabled: boolean;
  bbbEnabled: boolean;
  hasSquad: boolean;
  matchStarted: boolean;
  matchEnded: boolean;
}

// ── Sync logic ──────────────────────────────────────────────────────────────

export async function syncIPL(
  db: D1Database,
  apiKey: string,
  fetcher: typeof fetch = fetch
): Promise<{ synced: number }> {
  const d = drizzle(db, { schema });
  const now = new Date();

  // Step 1: Find the current IPL series
  const seriesRes = await fetcher(
    `${API_BASE}/series?apikey=${apiKey}&search=${encodeURIComponent("Indian Premier League")}`
  );
  const seriesData = (await seriesRes.json()) as CricApiResponse<CricApiSeries[]>;

  if (seriesData.status !== "success" || !seriesData.data?.length) {
    console.error("Failed to fetch IPL series", seriesData);
    return { synced: 0 };
  }

  const iplSeries = seriesData.data
    .filter((s) => s.name.includes("Indian Premier League") && s.matches > 0)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

  if (!iplSeries) {
    console.error("No IPL series found in search results");
    return { synced: 0 };
  }

  // Step 2: Upsert the league
  const leagueId = `ipl-${iplSeries.startDate.slice(0, 4)}`;
  const existingLeague = await d
    .select()
    .from(schema.league)
    .where(eq(schema.league.id, leagueId))
    .get();

  if (!existingLeague) {
    await d.insert(schema.league).values({
      id: leagueId,
      name: iplSeries.name,
      sport: "cricket",
      season: iplSeries.startDate.slice(0, 4),
      createdAt: now,
    });
  }

  // Step 3: Get all matches in the series
  const matchesRes = await fetcher(`${API_BASE}/series_info?apikey=${apiKey}&id=${iplSeries.id}`);
  const matchesData = (await matchesRes.json()) as CricApiResponse<{
    info: CricApiSeries;
    matchList: CricApiMatch[];
  }>;

  if (matchesData.status !== "success" || !matchesData.data?.matchList) {
    console.error("Failed to fetch IPL matches", matchesData);
    return { synced: 0 };
  }

  const matches = matchesData.data.matchList;
  let synced = 0;

  // Step 4: Upsert teams and matches
  const teamCache = new Map<string, boolean>();

  for (const match of matches) {
    if (!match.teams || match.teams.length < 2) continue;

    // Upsert teams from teamInfo if available
    if (match.teamInfo) {
      for (const ti of match.teamInfo) {
        if (teamCache.has(ti.shortname)) continue;
        const teamId = ti.shortname.toLowerCase().replace(/\s+/g, "-");
        const existing = await d.select().from(schema.team).where(eq(schema.team.id, teamId)).get();
        if (!existing) {
          await d.insert(schema.team).values({
            id: teamId,
            name: ti.name,
            shortName: ti.shortname,
            leagueId,
            logoUrl: ti.img || null,
            createdAt: now,
          });
        } else if (ti.img && !existing.logoUrl) {
          await d.update(schema.team).set({ logoUrl: ti.img }).where(eq(schema.team.id, teamId));
        }
        teamCache.set(ti.shortname, true);
      }
    }

    // Determine team IDs
    const homeTeamInfo = match.teamInfo?.[0];
    const awayTeamInfo = match.teamInfo?.[1];
    if (!homeTeamInfo || !awayTeamInfo) continue;

    const homeTeamId = homeTeamInfo.shortname.toLowerCase().replace(/\s+/g, "-");
    const awayTeamId = awayTeamInfo.shortname.toLowerCase().replace(/\s+/g, "-");

    // Determine game status
    let status: string = "scheduled";
    if (match.matchEnded) {
      status = "completed";
    } else if (match.matchStarted) {
      status = "live";
    }

    // Build score strings from score array
    let homeScore: string | null = null;
    let awayScore: string | null = null;
    if (match.score?.length) {
      const homeInnings = match.score.filter((s) =>
        s.inning.toLowerCase().includes(homeTeamInfo.shortname.toLowerCase())
      );
      const awayInnings = match.score.filter((s) =>
        s.inning.toLowerCase().includes(awayTeamInfo.shortname.toLowerCase())
      );
      if (homeInnings.length) {
        homeScore = homeInnings.map((s) => `${s.r}/${s.w} (${s.o})`).join(" & ");
      }
      if (awayInnings.length) {
        awayScore = awayInnings.map((s) => `${s.r}/${s.w} (${s.o})`).join(" & ");
      }
    }

    // Parse match number from name (e.g., "Match 1" from "Team A vs Team B, 1st Match")
    const matchdayMatch = match.name.match(/(\d+)(?:st|nd|rd|th)\s+Match/i);
    const matchday = matchdayMatch ? parseInt(matchdayMatch[1], 10) : null;

    // Upsert the game
    const existingGame = await d
      .select()
      .from(schema.game)
      .where(eq(schema.game.id, match.id))
      .get();

    if (!existingGame) {
      await d.insert(schema.game).values({
        id: match.id,
        leagueId,
        homeTeamId,
        awayTeamId,
        startsAt: new Date(match.dateTimeGMT),
        venue: match.venue || null,
        status,
        homeScore,
        awayScore,
        result: match.matchEnded ? match.status : null,
        matchday,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Update status, scores, and result for existing games
      await d
        .update(schema.game)
        .set({
          status,
          homeScore,
          awayScore,
          result: match.matchEnded ? match.status : null,
          updatedAt: now,
        })
        .where(eq(schema.game.id, match.id));
    }

    synced++;
  }

  console.log(`Synced ${synced} IPL matches for ${leagueId}`);
  return { synced };
}
