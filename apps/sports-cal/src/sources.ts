import type { DateWindow, Game } from "./types";

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_SEARCH = "https://site.web.api.espn.com/apis/search/v2";
const PWHL_FEED = "https://lscluster.hockeytech.com/feed/index.php";
// Public API key used by pwhl.com's own frontend (HockeyTech/LeagueStat).
const PWHL_KEY = "446521baf8c38984";

const DEFAULT_DURATION_MINS: Record<string, number> = {
  MLB: 195,
  NBA: 150,
  WNBA: 150,
  NHL: 160,
  NFL: 195,
  MLS: 120,
  NWSL: 120,
  EPL: 120,
  UCL: 120,
  USMNT: 120,
  F1: 120,
  PWHL: 150,
  MLC: 225,
  IPL: 225,
  Cricket: 450, // internationals: covers an ODI / a Test match day
};

function durationFor(league: string): number {
  return DEFAULT_DURATION_MINS[league] ?? 150;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "arena-sports-cal/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function inWindow(iso: string, window: DateWindow): boolean {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t >= window.from.getTime() && t <= window.to.getTime();
}

/* ── New York metro area detection ──────────────────────────────────────── */

const NY_METRO_CITIES: Record<string, string[]> = {
  // city (lowercase) → states it counts for; venue strings are "Name, City, State"
  "new york": ["new york", "ny"],
  "new york city": ["new york", "ny"],
  manhattan: ["new york", "ny"],
  brooklyn: ["new york", "ny"],
  bronx: ["new york", "ny"],
  queens: ["new york", "ny"],
  flushing: ["new york", "ny"],
  harlem: ["new york", "ny"],
  "staten island": ["new york", "ny"],
  elmont: ["new york", "ny"],
  uniondale: ["new york", "ny"],
  "east meadow": ["new york", "ny"],
  newark: ["new jersey", "nj"],
  harrison: ["new jersey", "nj"],
  "east rutherford": ["new jersey", "nj"],
  "jersey city": ["new jersey", "nj"],
};

/** Venue strings look like "Name, City, State" (state sometimes missing). */
export function isNyAreaVenue(venue?: string): boolean {
  if (!venue) return false;
  const parts = venue.split(",").map((p) => p.trim().toLowerCase());
  for (let i = 1; i < parts.length; i++) {
    const states = NY_METRO_CITIES[parts[i]];
    if (!states) continue;
    const state = parts[i + 1];
    if (state !== undefined) {
      if (states.includes(state)) return true;
    } else if (parts.length === 2) {
      // "Venue, City" form; in longer forms a trailing part is a state, not
      // a city (e.g. "Highmark Stadium, Orchard Park, New York").
      return true;
    }
  }
  return false;
}

/* ── Broadcast / watch-link extraction ──────────────────────────────────── */

/** Direct links for streaming services that commonly carry these games. */
const STREAM_URLS: [RegExp, string][] = [
  [/mlb\.tv/i, "https://www.mlb.com/tv"],
  [/apple tv/i, "https://tv.apple.com"],
  [/espn\+/i, "https://plus.espn.com"],
  [/^espn/i, "https://www.espn.com/watch/"],
  [/peacock/i, "https://www.peacocktv.com/sports"],
  [/paramount\+/i, "https://www.paramountplus.com"],
  [/prime video|amazon/i, "https://www.amazon.com/gp/video/sports"],
  [/netflix/i, "https://www.netflix.com"],
  [/youtube/i, "https://www.youtube.com"],
  [/\bmax\b|hbo/i, "https://play.max.com"],
  [/league pass/i, "https://www.wnba.com/watch"],
  [/nba tv/i, "https://www.nba.com/watch"],
  [/willow/i, "https://www.willow.tv"],
  [/nfl\+/i, "https://www.nfl.com/plus"],
  [/f1 tv/i, "https://f1tv.formula1.com"],
  [/fubo/i, "https://www.fubo.tv"],
  [/disney\+/i, "https://www.disneyplus.com"],
];

export function watchUrlFor(tv: string[], fallback?: string): string | undefined {
  for (const [pattern, url] of STREAM_URLS) {
    if (tv.some((name) => pattern.test(name))) return url;
  }
  return fallback;
}

interface EspnBroadcastShapes {
  /** Team schedule shape: broadcasts[].media.shortName; scoreboard also has broadcasts[].names[]. */
  broadcasts?: { media?: { shortName?: string }; names?: string[] }[];
  /** Scoreboard shape. */
  geoBroadcasts?: { media?: { shortName?: string } }[];
}

export function extractBroadcasts(comp?: EspnBroadcastShapes): string[] {
  const names = new Set<string>();
  for (const b of comp?.broadcasts ?? []) {
    if (b.media?.shortName) names.add(b.media.shortName);
    for (const n of b.names ?? []) names.add(n);
  }
  for (const g of comp?.geoBroadcasts ?? []) {
    if (g.media?.shortName) names.add(g.media.shortName);
  }
  return [...names].slice(0, 5);
}

interface EspnLink {
  rel?: string[];
  href?: string;
}

interface EspnTickets {
  summary?: string;
  links?: { href?: string }[];
}

export function extractTickets(tickets?: EspnTickets[]): { url?: string; note?: string } {
  const first = tickets?.[0];
  return {
    url: first?.links?.find((l) => l.href?.startsWith("http"))?.href,
    note: first?.summary,
  };
}

/** The event's web page on espn.com (gamecast), used as a watch-link fallback. */
export function espnEventLink(links?: EspnLink[]): string | undefined {
  return links?.find(
    (l) => l.href?.startsWith("https://") && (l.rel?.includes("summary") || l.rel?.includes("live"))
  )?.href;
}

/* ── ESPN team schedules (NBA/WNBA/MLB/NHL/NFL/soccer) ──────────────────── */

export interface EspnTeamConfig {
  sport: string;
  leagues: { code: string; tag: string }[];
  teamId: string;
  /** Also query these seasontype values (NFL: 1 = preseason). */
  seasonTypes?: number[];
}

interface EspnScheduleEvent {
  id?: string;
  date?: string;
  name?: string;
  links?: EspnLink[];
  competitions?: ({
    venue?: { fullName?: string; address?: { city?: string; state?: string } };
    competitors?: { homeAway?: string; team?: { id?: string; displayName?: string } }[];
    tickets?: EspnTickets[];
  } & EspnBroadcastShapes)[];
}

function venueString(venue?: {
  fullName?: string;
  address?: { city?: string; state?: string };
}): string | undefined {
  if (!venue?.fullName) return undefined;
  const parts = [venue.fullName, venue.address?.city, venue.address?.state].filter(Boolean);
  return parts.join(", ");
}

export function mapTeamScheduleEvents(
  events: EspnScheduleEvent[],
  teamId: string,
  tag: string,
  window: DateWindow
): Game[] {
  const games: Game[] = [];
  for (const ev of events) {
    if (!ev.date || !ev.id || !inWindow(ev.date, window)) continue;
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const me = competitors.find((c) => c.team?.id === teamId);
    const opp = competitors.find((c) => c.team?.id !== teamId && c.team?.displayName);
    let title: string;
    if (me?.team?.displayName && opp?.team?.displayName) {
      const sep = me.homeAway === "away" ? "@" : "vs";
      title = `[${tag}] ${me.team.displayName} ${sep} ${opp.team.displayName}`;
    } else {
      title = `[${tag}] ${ev.name ?? "Game"}`;
    }
    const tv = extractBroadcasts(comp);
    const venue = venueString(comp?.venue);
    const nyArea = isNyAreaVenue(venue);
    const tix = nyArea ? extractTickets(comp?.tickets) : {};
    games.push({
      uid: `espn-${tag.toLowerCase()}-${ev.id}`,
      league: tag,
      title,
      start: new Date(ev.date).toISOString(),
      durationMins: durationFor(tag),
      venue,
      nyArea,
      tv: tv.length > 0 ? tv : undefined,
      url: watchUrlFor(tv, espnEventLink(ev.links)),
      tickets: tix.url,
      ticketsNote: tix.note,
    });
  }
  return games;
}

export async function fetchEspnTeam(cfg: EspnTeamConfig, window: DateWindow): Promise<Game[]> {
  const games = new Map<string, Game>();
  for (const league of cfg.leagues) {
    const base = `${ESPN_SITE}/${cfg.sport}/${league.code}/teams/${cfg.teamId}/schedule`;
    const variants = (cfg.seasonTypes ?? [undefined]).map((st) =>
      st !== undefined ? `${base}?seasontype=${st}` : base
    );
    for (const url of variants) {
      const data = (await fetchJson(url)) as { events?: EspnScheduleEvent[] };
      for (const game of mapTeamScheduleEvents(data.events ?? [], cfg.teamId, league.tag, window)) {
        games.set(game.uid, game);
      }
    }
  }
  return [...games.values()];
}

/* ── Soccer (ESPN league scoreboards) ───────────────────────────────────────
 * The soccer team /schedule endpoint only returns the first ~15 games of the
 * season, so instead we pull each league's scoreboard for the whole window
 * and filter to the followed team. */

function fmtDateRange(window: DateWindow): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return `${fmt(window.from)}-${fmt(window.to)}`;
}

export async function fetchSoccerTeam(
  leagues: { code: string; tag: string }[],
  teamId: string,
  window: DateWindow
): Promise<Game[]> {
  const games = new Map<string, Game>();
  for (const league of leagues) {
    const url = `${ESPN_SITE}/soccer/${league.code}/scoreboard?dates=${fmtDateRange(window)}&limit=400`;
    const data = (await fetchJson(url)) as { events?: EspnScheduleEvent[] };
    const teamEvents = (data.events ?? []).filter((ev) =>
      ev.competitions?.[0]?.competitors?.some((c) => c.team?.id === teamId)
    );
    for (const game of mapTeamScheduleEvents(teamEvents, teamId, league.tag, window)) {
      games.set(game.uid, game);
    }
  }
  return [...games.values()];
}

/* ── F1 (ESPN racing scoreboard) ────────────────────────────────────────── */

interface F1Event {
  id?: string;
  name?: string;
  links?: EspnLink[];
  circuit?: { fullName?: string; address?: { city?: string; country?: string } };
  competitions?: ({ date?: string; type?: { abbreviation?: string } } & EspnBroadcastShapes)[];
}

export function mapF1Events(events: F1Event[], window: DateWindow): Game[] {
  const games: Game[] = [];
  for (const ev of events) {
    if (!ev.id || !ev.name) continue;
    const venue = [ev.circuit?.fullName, ev.circuit?.address?.city, ev.circuit?.address?.country]
      .filter(Boolean)
      .join(", ");
    for (const session of ev.competitions ?? []) {
      const type = session.type?.abbreviation;
      if (!session.date || (type !== "Race" && type !== "Sprint")) continue;
      if (!inWindow(session.date, window)) continue;
      const suffix = type === "Sprint" ? " (Sprint)" : "";
      const tv = extractBroadcasts(session);
      games.push({
        uid: `espn-f1-${ev.id}-${type.toLowerCase()}`,
        league: "F1",
        title: `[F1] ${ev.name}${suffix}`,
        start: new Date(session.date).toISOString(),
        durationMins: durationFor("F1"),
        venue: venue || undefined,
        nyArea: isNyAreaVenue(venue),
        tv: tv.length > 0 ? tv : undefined,
        url: watchUrlFor(tv, espnEventLink(ev.links)),
      });
    }
  }
  return games;
}

export async function fetchF1(window: DateWindow): Promise<Game[]> {
  const url = `${ESPN_SITE}/racing/f1/scoreboard?dates=${fmtDateRange(window)}`;
  const data = (await fetchJson(url)) as { events?: F1Event[] };
  return mapF1Events(data.events ?? [], window);
}

/* ── Cricket (ESPN cricket scoreboards, month-granularity dates) ────────── */

interface CricketEvent {
  id?: string;
  date?: string;
  name?: string;
  links?: EspnLink[];
  competitions?: ({
    venue?: { fullName?: string };
    competitors?: { homeAway?: string; team?: { displayName?: string } }[];
  } & EspnBroadcastShapes)[];
}

/** Months (YYYYMM) overlapping the window, for cricket scoreboard queries. */
export function monthsInWindow(window: DateWindow): string[] {
  const months: string[] = [];
  const d = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), 1));
  while (d.getTime() <= window.to.getTime()) {
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
}

export function mapCricketEvents(
  events: CricketEvent[],
  teamName: string,
  tag: string,
  window: DateWindow
): Game[] {
  const games: Game[] = [];
  for (const ev of events) {
    if (!ev.date || !ev.id || !inWindow(ev.date, window)) continue;
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const me = competitors.find((c) => c.team?.displayName === teamName);
    if (!me) continue;
    const opp = competitors.find((c) => c.team?.displayName && c.team.displayName !== teamName);
    const sep = me.homeAway === "away" ? "@" : "vs";
    const title = opp?.team?.displayName
      ? `[${tag}] ${teamName} ${sep} ${opp.team.displayName}`
      : `[${tag}] ${ev.name ?? teamName}`;
    const tv = extractBroadcasts(comp);
    games.push({
      uid: `espn-cricket-${ev.id}`,
      league: tag,
      title,
      start: new Date(ev.date).toISOString(),
      durationMins: durationFor(tag),
      venue: comp?.venue?.fullName,
      nyArea: isNyAreaVenue(comp?.venue?.fullName),
      tv: tv.length > 0 ? tv : undefined,
      url: watchUrlFor(tv, espnEventLink(ev.links)),
    });
  }
  return games;
}

async function fetchCricketLeague(
  leagueId: string,
  teamName: string,
  tag: string,
  window: DateWindow
): Promise<Game[]> {
  const games = new Map<string, Game>();
  for (const month of monthsInWindow(window)) {
    const url = `${ESPN_SITE}/cricket/${leagueId}/scoreboard?dates=${month}`;
    const data = (await fetchJson(url)) as { events?: CricketEvent[] };
    for (const game of mapCricketEvents(data.events ?? [], teamName, tag, window)) {
      games.set(game.uid, game);
    }
  }
  return [...games.values()];
}

export const fetchMlcMiNewYork = (window: DateWindow) =>
  fetchCricketLeague("21266", "MI New York", "MLC", window);

export const fetchIplMumbaiIndians = (window: DateWindow) =>
  fetchCricketLeague("8048", "Mumbai Indians", "IPL", window);

/**
 * India men's internationals: ESPN models each bilateral series / tournament
 * as its own cricket "league", so we discover current series ids via the
 * ESPN search API, then pull each series' scoreboard.
 */
interface SearchResult {
  type?: string;
  contents?: { displayName?: string; uid?: string }[];
}

export function pickIndiaSeries(
  results: SearchResult[],
  window: DateWindow
): { id: string; name: string }[] {
  const years = new Set<number>([window.from.getUTCFullYear(), window.to.getUTCFullYear()]);
  const tokens: string[] = [];
  for (const y of years) {
    tokens.push(String(y), `${y - 1}/${String(y).slice(2)}`, `${y}/${String(y + 1).slice(2)}`);
  }
  const picked = new Map<string, string>();
  for (const result of results) {
    if (result.type !== "league") continue;
    for (const item of result.contents ?? []) {
      const name = item.displayName ?? "";
      const id = /~l:(\d+)/.exec(item.uid ?? "")?.[1];
      if (!id || /women|under-19|u19|\bindia a\b|austral|afro/i.test(name)) continue;
      // Accept series named with a current year, plus recurring tournament
      // leagues like "Men's T20 Asia Cup" that carry no year at all.
      const isRecurringTournament = /asia cup|world cup/i.test(name) && !/\d{4}/.test(name);
      if (!isRecurringTournament && !tokens.some((t) => name.includes(t))) continue;
      picked.set(id, name);
    }
  }
  return [...picked.entries()].slice(0, 5).map(([id, name]) => ({ id, name }));
}

export async function fetchIndiaCricket(window: DateWindow): Promise<Game[]> {
  const queries = ["India tour", "tour of India", "Asia Cup"];
  const results: SearchResult[] = [];
  for (const q of queries) {
    const url = `${ESPN_SEARCH}?query=${encodeURIComponent(q)}&limit=10`;
    const data = (await fetchJson(url)) as { results?: SearchResult[] };
    results.push(...(data.results ?? []));
  }
  const games = new Map<string, Game>();
  for (const series of pickIndiaSeries(results, window)) {
    for (const game of await fetchCricketLeague(series.id, "India", "Cricket", window)) {
      games.set(game.uid, game);
    }
  }
  return [...games.values()];
}

/* ── PWHL (HockeyTech/LeagueStat feed) ──────────────────────────────────── */

interface PwhlSeason {
  season_id?: string;
  start_date?: string;
  end_date?: string;
}

interface PwhlGame {
  game_id?: string;
  GameDateISO8601?: string;
  home_team?: string;
  visiting_team?: string;
  home_team_city?: string;
  home_team_nickname?: string;
  visiting_team_city?: string;
  visiting_team_nickname?: string;
  venue_name?: string;
  venue_location?: string;
  tickets_url?: string;
  /** Keyed by feed type (home_video, national_video, …). */
  broadcasters?: Record<string, { name?: string; url?: string }[]>;
}

const PWHL_SIRENS_TEAM_ID = "4";

function pwhlUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({
    feed: "modulekit",
    key: PWHL_KEY,
    fmt: "json",
    client_code: "pwhl",
    lang: "en",
    ...params,
  });
  return `${PWHL_FEED}?${qs}`;
}

function pwhlTeamName(city?: string, nickname?: string): string {
  return [city, nickname].filter(Boolean).join(" ") || "TBD";
}

export function mapPwhlGames(games: PwhlGame[], window: DateWindow): Game[] {
  const mapped: Game[] = [];
  for (const g of games) {
    const isHome = g.home_team === PWHL_SIRENS_TEAM_ID;
    const isAway = g.visiting_team === PWHL_SIRENS_TEAM_ID;
    if ((!isHome && !isAway) || !g.game_id || !g.GameDateISO8601) continue;
    if (!inWindow(g.GameDateISO8601, window)) continue;
    const sirens = isHome
      ? pwhlTeamName(g.home_team_city, g.home_team_nickname)
      : pwhlTeamName(g.visiting_team_city, g.visiting_team_nickname);
    const opponent = isHome
      ? pwhlTeamName(g.visiting_team_city, g.visiting_team_nickname)
      : pwhlTeamName(g.home_team_city, g.home_team_nickname);
    const broadcasterList = Object.values(g.broadcasters ?? {}).flat();
    const tv = [...new Set(broadcasterList.map((b) => b.name).filter((n): n is string => !!n))];
    const url =
      watchUrlFor(tv, broadcasterList.find((b) => b.url)?.url) ??
      "https://www.thepwhl.com/en/where-to-watch";
    const venue = [g.venue_name, g.venue_location].filter(Boolean).join(", ") || undefined;
    const nyArea = isNyAreaVenue(venue);
    mapped.push({
      uid: `pwhl-${g.game_id}`,
      league: "PWHL",
      title: `[PWHL] ${sirens} ${isHome ? "vs" : "@"} ${opponent}`,
      start: new Date(g.GameDateISO8601).toISOString(),
      durationMins: durationFor("PWHL"),
      venue,
      nyArea,
      tv: tv.length > 0 ? tv : undefined,
      url,
      tickets: nyArea && g.tickets_url?.startsWith("http") ? g.tickets_url : undefined,
    });
  }
  return mapped;
}

export async function fetchPwhlSirens(window: DateWindow): Promise<Game[]> {
  const seasonsData = (await fetchJson(pwhlUrl({ view: "seasons" }))) as {
    SiteKit?: { Seasons?: PwhlSeason[] };
  };
  const seasons = (seasonsData.SiteKit?.Seasons ?? [])
    .filter((s) => {
      if (!s.season_id || !s.start_date || !s.end_date) return false;
      const start = Date.parse(`${s.start_date}T00:00:00Z`);
      const end = Date.parse(`${s.end_date}T23:59:59Z`);
      return start <= window.to.getTime() && end >= window.from.getTime();
    })
    .slice(0, 2);
  const games = new Map<string, Game>();
  for (const season of seasons) {
    const data = (await fetchJson(pwhlUrl({ view: "schedule", season_id: season.season_id! }))) as {
      SiteKit?: { Schedule?: PwhlGame[] };
    };
    for (const game of mapPwhlGames(data.SiteKit?.Schedule ?? [], window)) {
      games.set(game.uid, game);
    }
  }
  return [...games.values()];
}

/* ── All sources ────────────────────────────────────────────────────────── */

export interface SourceResult {
  games: Game[];
  errors: { source: string; message: string }[];
}

export async function fetchAllGames(window: DateWindow): Promise<SourceResult> {
  const sources: { name: string; run: () => Promise<Game[]> }[] = [
    {
      name: "MLB Yankees",
      run: () =>
        fetchEspnTeam(
          { sport: "baseball", leagues: [{ code: "mlb", tag: "MLB" }], teamId: "10" },
          window
        ),
    },
    {
      name: "NBA Nets",
      run: () =>
        fetchEspnTeam(
          { sport: "basketball", leagues: [{ code: "nba", tag: "NBA" }], teamId: "17" },
          window
        ),
    },
    {
      name: "WNBA Liberty",
      run: () =>
        fetchEspnTeam(
          { sport: "basketball", leagues: [{ code: "wnba", tag: "WNBA" }], teamId: "9" },
          window
        ),
    },
    {
      name: "NHL Devils",
      run: () =>
        fetchEspnTeam(
          { sport: "hockey", leagues: [{ code: "nhl", tag: "NHL" }], teamId: "11" },
          window
        ),
    },
    {
      name: "NFL Eagles",
      run: () =>
        fetchEspnTeam(
          {
            sport: "football",
            leagues: [{ code: "nfl", tag: "NFL" }],
            teamId: "21",
            seasonTypes: [1, 2],
          },
          window
        ),
    },
    {
      name: "MLS NYCFC",
      run: () => fetchSoccerTeam([{ code: "usa.1", tag: "MLS" }], "17606", window),
    },
    {
      name: "NWSL Gotham FC",
      run: () => fetchSoccerTeam([{ code: "usa.nwsl", tag: "NWSL" }], "15364", window),
    },
    {
      name: "Manchester City",
      run: () =>
        fetchSoccerTeam(
          [
            { code: "eng.1", tag: "EPL" },
            { code: "uefa.champions", tag: "UCL" },
          ],
          "382",
          window
        ),
    },
    {
      name: "USMNT",
      run: () =>
        fetchSoccerTeam(
          [
            { code: "fifa.world", tag: "USMNT" },
            { code: "fifa.friendly", tag: "USMNT" },
            { code: "fifa.worldq.concacaf", tag: "USMNT" },
            { code: "concacaf.nations.league", tag: "USMNT" },
          ],
          "660",
          window
        ),
    },
    { name: "F1 (Cadillac)", run: () => fetchF1(window) },
    { name: "MLC MI New York", run: () => fetchMlcMiNewYork(window) },
    { name: "IPL Mumbai Indians", run: () => fetchIplMumbaiIndians(window) },
    { name: "India cricket", run: () => fetchIndiaCricket(window) },
    { name: "PWHL Sirens", run: () => fetchPwhlSirens(window) },
  ];

  const settled = await Promise.allSettled(sources.map((s) => s.run()));
  const byUid = new Map<string, Game>();
  const errors: { source: string; message: string }[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      for (const game of result.value) byUid.set(game.uid, game);
    } else {
      errors.push({ source: sources[i].name, message: String(result.reason) });
    }
  });
  const games = [...byUid.values()].sort((a, b) => a.start.localeCompare(b.start));
  return { games, errors };
}
