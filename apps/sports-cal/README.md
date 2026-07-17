# @arena/sports-cal

Cloudflare Worker that serves a merged iCalendar feed of upcoming games (next
60 days) for a fixed set of followed teams, refreshed from public APIs every
6 hours via a cron trigger and cached in Workers KV.

## Routes

| Route           | Purpose                                                      |
| --------------- | ------------------------------------------------------------ |
| `/calendar.ics` | The merged ICS feed (served from KV cache; UTC event times). |
| `/`             | HTML sanity check: next 20 games in Eastern Time.            |
| `/refresh`      | Force a refresh now; returns `{games, errors}` JSON.         |
| `/now`          | JSON: games live right now + the next five upcoming.         |
| `/tv`           | "Atharv Sports Network": full-screen auto-refreshing page    |
|                 | showing the live game (with watch button) or a countdown.    |

## Subscribe on iPhone

1. Settings → Apps → Calendar → Calendar Accounts → Add Account → Other →
   **Add Subscribed Calendar**.
2. Enter `https://arena-sports-cal.atharv-vaish.workers.dev/calendar.ics`
   (or open `webcal://arena-sports-cal.atharv-vaish.workers.dev/calendar.ics`
   in Safari to skip typing).
3. Save. iOS periodically re-fetches the feed; events carry UTC times and
   render in your local timezone.

## Teams & sources

| Team                  | Source                                                        |
| --------------------- | ------------------------------------------------------------- |
| Yankees (MLB)         | ESPN team schedule API (`baseball/mlb`, team 10)              |
| Nets (NBA)            | ESPN team schedule API (`basketball/nba`, team 17)            |
| Liberty (WNBA)        | ESPN team schedule API (`basketball/wnba`, team 9)            |
| Devils (NHL)          | ESPN team schedule API (`hockey/nhl`, team 11)                |
| Eagles (NFL)          | ESPN team schedule API (`football/nfl`, team 21, pre+regular) |
| NYCFC (MLS)           | ESPN soccer scoreboard (`usa.1`, team 17606)                  |
| Gotham FC (NWSL)      | ESPN soccer scoreboard (`usa.nwsl`, team 15364)               |
| Man City (EPL + UCL)  | ESPN soccer scoreboard (`eng.1`, `uefa.champions`, team 382)  |
| USMNT                 | ESPN soccer scoreboards (World Cup/friendlies/WCQ/CNL)        |
| Cadillac (F1)         | ESPN racing scoreboard — all GP race + sprint sessions        |
| MI New York (MLC)     | ESPN cricket scoreboard (league 21266)                        |
| Mumbai Indians (IPL)  | ESPN cricket scoreboard (league 8048)                         |
| India (men's cricket) | ESPN search discovers current series ids → cricket scoreboard |
| NY Sirens (PWHL)      | HockeyTech/LeagueStat public feed (`client_code=pwhl`)        |

Notes:

- Soccer uses league _scoreboard_ date-range queries because ESPN's soccer
  team `/schedule` endpoint only returns the first ~15 games of a season.
- ESPN's cricket scoreboard only accepts single-day or single-month `dates`
  values, so cricket sources query each month overlapping the window.
- India internationals are modelled by ESPN as one "league" per series, so
  the worker discovers series ids at refresh time via the ESPN search API
  ("India tour" / "tour of India" / "Asia Cup", men's, current years).
- Off-season teams simply contribute zero events; per-source failures are
  isolated and reported in the `/refresh` response and on the HTML page.

## Deploy

```bash
cd apps/sports-cal
npx wrangler deploy
curl https://arena-sports-cal.atharv-vaish.workers.dev/refresh   # prime cache
```

The KV namespace id in `wrangler.toml` was created with
`npx wrangler kv namespace create CAL_KV`.

## TV / watch links

Each event's `DESCRIPTION` lists the broadcasters ESPN (or the PWHL feed)
reports for the game, and the `URL` property carries a watch link: a direct
link to the streaming service when one of the broadcasters is a known
streamer (MLB.TV, Apple TV, ESPN+/ESPN, Peacock, Paramount+, Prime Video,
league passes, Willow, …), otherwise the ESPN gamecast page for the game.
The `/` page shows the same info in a TV column.

Event titles are prefixed with 🏠 when the venue is in the New York metro
area (NYC boroughs, Long Island arenas, Newark/Harrison/East Rutherford NJ)
and 📺 otherwise.

NY-area games also carry a ticket link (ESPN's Vivid Seats deep link with a
"tickets as low as $X" note, or the PWHL's Ticketmaster link) in the event
description, as a 🎟️ next to the venue on `/`, and as a button on `/tv`.
