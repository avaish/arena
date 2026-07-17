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
      return `<tr>
        <td>${escapeHtml(ET_FORMAT.format(new Date(g.start)))}</td>
        <td><span class="tag">${escapeHtml(g.league)}</span></td>
        <td>${escapeHtml(g.title.replace(/^\[[^\]]*\]\s*/, ""))}</td>
        <td>${escapeHtml(g.venue ?? "")}</td>
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
