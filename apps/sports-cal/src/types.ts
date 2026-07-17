export interface Game {
  /** Stable unique id, used as the ICS UID (e.g. "espn-401584722"). */
  uid: string;
  /** League tag shown in the title, e.g. "NBA". */
  league: string;
  /** Full event summary, e.g. "[NBA] Brooklyn Nets vs Boston Celtics". */
  title: string;
  /** Start time as an ISO-8601 UTC string. */
  start: string;
  durationMins: number;
  venue?: string;
  /** Broadcaster / streaming service names, e.g. ["ESPN", "Peacock"]. */
  tv?: string[];
  /** Best link to watch the game (streaming service, or the event page). */
  url?: string;
}

export interface CachePayload {
  refreshedAt: string;
  windowDays: number;
  games: Game[];
  /** Per-source fetch errors from the last refresh (sources are isolated). */
  errors: { source: string; message: string }[];
}

export interface DateWindow {
  from: Date;
  to: Date;
}

export const CACHE_KEY = "games:v1";
export const WINDOW_DAYS = 60;
