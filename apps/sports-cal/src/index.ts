import { buildCalendar } from "./ics";
import { fetchAllGames } from "./sources";
import { CACHE_KEY, WINDOW_DAYS, type CachePayload, type Game } from "./types";

export interface Env {
  CAL_KV: KVNamespace;
}

async function refresh(env: Env): Promise<CachePayload> {
  const now = new Date();
  const window = {
    from: now,
    to: new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000),
  };
  const { games, errors } = await fetchAllGames(window);
  const payload: CachePayload = {
    refreshedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    games,
    errors,
  };
  // Only overwrite a previous good cache if this refresh produced data.
  if (games.length > 0 || !(await env.CAL_KV.get(CACHE_KEY))) {
    await env.CAL_KV.put(CACHE_KEY, JSON.stringify(payload));
  }
  return payload;
}

async function getPayload(env: Env): Promise<CachePayload> {
  const cached = await env.CAL_KV.get<CachePayload>(CACHE_KEY, "json");
  return cached ?? refresh(env);
}

export interface NowPayload {
  asOf: string;
  refreshedAt: string;
  /** Games currently in progress (start <= now < start + duration). */
  live: Game[];
  /** The next few upcoming games. */
  upNext: Game[];
}

export function computeNow(payload: CachePayload, nowMs: number): NowPayload {
  const live = payload.games.filter((g) => {
    const start = Date.parse(g.start);
    return start <= nowMs && nowMs < start + g.durationMins * 60_000;
  });
  const upNext = payload.games.filter((g) => Date.parse(g.start) > nowMs).slice(0, 5);
  return {
    asOf: new Date(nowMs).toISOString(),
    refreshedAt: payload.refreshedAt,
    live,
    upNext,
  };
}

const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function homePage(payload: CachePayload, host: string): string {
  const now = Date.now();
  const upcoming = payload.games.filter((g) => Date.parse(g.start) >= now).slice(0, 20);
  const rows = upcoming
    .map((g: Game) => {
      const tv = escapeHtml(g.tv?.join(", ") ?? "");
      const tvCell = g.url ? `<a href="${escapeHtml(g.url)}">${tv || "watch"}</a>` : tv;
      const tixLink = g.tickets
        ? ` <a href="${escapeHtml(g.tickets)}" title="${escapeHtml(g.ticketsNote ?? "Tickets")}">🎟️</a>`
        : "";
      return `<tr>
        <td>${escapeHtml(ET_FORMAT.format(new Date(g.start)))}</td>
        <td><span class="tag">${escapeHtml(g.league)}</span></td>
        <td>${g.nyArea ? "🏠" : "📺"} ${escapeHtml(g.title.replace(/^\[[^\]]*\]\s*/, ""))}</td>
        <td>${escapeHtml(g.venue ?? "")}${tixLink}</td>
        <td>${tvCell}</td>
      </tr>`;
    })
    .join("\n");
  const errors = payload.errors
    .map((e) => `<li>${escapeHtml(e.source)}: ${escapeHtml(e.message)}</li>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Teams — next ${upcoming.length} games</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem auto; max-width: 56rem; padding: 0 1rem; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.4rem 0.75rem; border-bottom: 1px solid #e5e5e5; font-size: 0.95rem; }
  .tag { background: #eef2ff; border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.8rem; font-weight: 600; }
  code { background: #f4f4f4; padding: 0.15rem 0.35rem; border-radius: 4px; }
  .meta { color: #666; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>My Teams — upcoming games</h1>
<p>Times shown in Eastern Time. Subscribe on iPhone: <code>webcal://${escapeHtml(host)}/calendar.ics</code>
 (or <a href="/calendar.ics">download the .ics</a>).</p>
<p class="meta">🏠 in the New York area &nbsp;·&nbsp; 📺 watch from home &nbsp;·&nbsp; <a href="/tv">Atharv Sports Network (TV mode)</a></p>
<table>
<thead><tr><th>When (ET)</th><th>League</th><th>Matchup</th><th>Venue</th><th>TV</th></tr></thead>
<tbody>
${rows || `<tr><td colspan="5">No upcoming games in the next ${payload.windowDays} days.</td></tr>`}
</tbody>
</table>
<p class="meta">${payload.games.length} games cached for the next ${payload.windowDays} days ·
last refreshed ${escapeHtml(ET_FORMAT.format(new Date(payload.refreshedAt)))}</p>
${errors ? `<details><summary class="meta">Source errors on last refresh</summary><ul>${errors}</ul></details>` : ""}
</body>
</html>`;
}

const TV_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atharv Sports Network</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0b0d12; color: #f2f4f8;
         display: flex; flex-direction: column; align-items: center; justify-content: center;
         text-align: center; padding: 2rem; box-sizing: border-box; }
  .brand { position: fixed; top: 1.2rem; left: 0; right: 0; letter-spacing: 0.35em;
           font-size: 0.85rem; color: #8b93a7; text-transform: uppercase; }
  .live-dot { display: inline-block; width: 0.6em; height: 0.6em; border-radius: 50%;
              background: #e5484d; margin-right: 0.5em; animation: pulse 1.5s infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .card { margin: 1rem 0 2rem; }
  .status { font-size: 1rem; color: #e5484d; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; }
  .title { font-size: clamp(1.6rem, 5vw, 3.2rem); font-weight: 800; margin: 0.5rem 0; }
  .sub { color: #8b93a7; font-size: 1.05rem; margin: 0.25rem 0; }
  .watch { display: inline-block; margin-top: 1.5rem; background: #e5484d; color: #fff;
           text-decoration: none; font-weight: 700; font-size: 1.3rem; padding: 0.9rem 2.4rem;
           border-radius: 999px; }
  .watch.secondary { background: #232838; font-size: 1rem; padding: 0.6rem 1.6rem; }
  .countdown { font-size: clamp(2.2rem, 8vw, 5rem); font-weight: 800; font-variant-numeric: tabular-nums; }
  .footer { position: fixed; bottom: 1.2rem; left: 0; right: 0; color: #4a5165; font-size: 0.8rem; }
</style>
</head>
<body>
<div class="brand">Atharv Sports Network</div>
<div id="main"><p class="sub">Tuning in…</p></div>
<div class="footer">auto-refreshes every minute · <a href="/" style="color:#4a5165">schedule</a></div>
<script>
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const et = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";
let nextStart = null;
function card(g, live) {
  const icon = g.nyArea ? "🏠" : "📺";
  const tv = g.tv && g.tv.length ? "TV: " + esc(g.tv.join(", ")) : "";
  const watch = g.url ? '<a class="watch' + (live ? "" : " secondary") + '" href="' + esc(g.url) + '">▶ Watch</a>' : "";
  const tix = g.tickets ? ' <a class="watch secondary" href="' + esc(g.tickets) + '">🎟️ ' + esc(g.ticketsNote ?? "Tickets") + "</a>" : "";
  return '<div class="card">' +
    (live ? '<div class="status"><span class="live-dot"></span>Live now</div>' : "") +
    '<div class="title">' + icon + " " + esc(g.title) + "</div>" +
    '<div class="sub">' + esc(et(g.start)) + (g.venue ? " · " + esc(g.venue) : "") + "</div>" +
    (tv ? '<div class="sub">' + tv + "</div>" : "") + watch + tix + "</div>";
}
function render(d) {
  const main = document.getElementById("main");
  if (d.live.length > 0) {
    nextStart = null;
    main.innerHTML = d.live.map((g) => card(g, true)).join("");
  } else if (d.upNext.length > 0) {
    const g = d.upNext[0];
    nextStart = Date.parse(g.start);
    main.innerHTML = '<div class="sub">Nothing on right now. Up next:</div>' +
      '<div class="countdown" id="countdown"></div>' + card(g, false);
    tick();
  } else {
    main.innerHTML = '<div class="sub">No games in the next 60 days.</div>';
  }
}
function tick() {
  if (nextStart === null) return;
  const el = document.getElementById("countdown");
  if (!el) return;
  let s = Math.max(0, Math.floor((nextStart - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n) => String(n).padStart(2, "0");
  el.textContent = (d > 0 ? d + "d " : "") + pad(h) + ":" + pad(m) + ":" + pad(s);
  if (nextStart - Date.now() < 0) load();
}
async function load() {
  try {
    const res = await fetch("/now");
    render(await res.json());
  } catch {
    document.getElementById("main").innerHTML = '<p class="sub">Signal lost — retrying…</p>';
  }
}
load();
setInterval(load, 60000);
setInterval(tick, 1000);
</script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/": {
        const payload = await getPayload(env);
        return new Response(homePage(payload, url.host), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      case "/calendar.ics": {
        const payload = await getPayload(env);
        return new Response(buildCalendar(payload), {
          headers: {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": 'inline; filename="my-teams.ics"',
            "cache-control": "public, max-age=900",
          },
        });
      }
      case "/now": {
        const payload = await getPayload(env);
        return Response.json(computeNow(payload, Date.now()), {
          headers: { "cache-control": "no-store" },
        });
      }
      case "/tv":
        return new Response(TV_PAGE, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      case "/refresh": {
        const payload = await refresh(env);
        return Response.json({
          refreshedAt: payload.refreshedAt,
          games: payload.games.length,
          errors: payload.errors,
        });
      }
      default:
        return new Response("Not found", { status: 404 });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await refresh(env);
  },
} satisfies ExportedHandler<Env>;
