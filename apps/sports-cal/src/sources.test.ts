import { describe, expect, it } from "vitest";
import {
  mapCricketEvents,
  mapF1Events,
  mapPwhlGames,
  mapTeamScheduleEvents,
  monthsInWindow,
  pickIndiaSeries,
} from "./sources";

const window = {
  from: new Date("2026-07-17T00:00:00Z"),
  to: new Date("2026-09-15T00:00:00Z"),
};

describe("mapTeamScheduleEvents", () => {
  const event = {
    id: "401",
    date: "2026-08-01T23:05Z",
    name: "New York Yankees at Boston Red Sox",
    competitions: [
      {
        venue: { fullName: "Fenway Park", address: { city: "Boston", state: "Massachusetts" } },
        competitors: [
          { homeAway: "home", team: { id: "2", displayName: "Boston Red Sox" } },
          { homeAway: "away", team: { id: "10", displayName: "New York Yankees" } },
        ],
      },
    ],
  };

  it("builds an away-game title from my team's perspective", () => {
    const games = mapTeamScheduleEvents([event], "10", "MLB", window);
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("[MLB] New York Yankees @ Boston Red Sox");
    expect(games[0].venue).toBe("Fenway Park, Boston, Massachusetts");
    expect(games[0].start).toBe("2026-08-01T23:05:00.000Z");
  });

  it("filters events outside the window", () => {
    const past = { ...event, date: "2026-03-01T00:00Z" };
    expect(mapTeamScheduleEvents([past], "10", "MLB", window)).toHaveLength(0);
  });
});

describe("mapF1Events", () => {
  it("keeps only Race and Sprint sessions", () => {
    const games = mapF1Events(
      [
        {
          id: "600",
          name: "Belgian Grand Prix",
          circuit: { fullName: "Circuit de Spa-Francorchamps" },
          competitions: [
            { date: "2026-07-17T11:30Z", type: { abbreviation: "FP1" } },
            { date: "2026-07-18T14:00Z", type: { abbreviation: "Qual" } },
            { date: "2026-07-19T13:00Z", type: { abbreviation: "Race" } },
          ],
        },
      ],
      window
    );
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("[F1] Belgian Grand Prix");
    expect(games[0].uid).toBe("espn-f1-600-race");
  });
});

describe("mapCricketEvents", () => {
  it("keeps only games featuring the followed team", () => {
    const events = [
      {
        id: "1",
        date: "2026-07-20T20:30Z",
        competitions: [
          {
            venue: { fullName: "Grand Prairie Stadium, Dallas" },
            competitors: [
              { homeAway: "home", team: { displayName: "MI New York" } },
              { homeAway: "away", team: { displayName: "Seattle Orcas" } },
            ],
          },
        ],
      },
      {
        id: "2",
        date: "2026-07-21T20:30Z",
        competitions: [
          {
            competitors: [
              { homeAway: "home", team: { displayName: "Texas Super Kings" } },
              { homeAway: "away", team: { displayName: "Seattle Orcas" } },
            ],
          },
        ],
      },
    ];
    const games = mapCricketEvents(events, "MI New York", "MLC", window);
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("[MLC] MI New York vs Seattle Orcas");
  });
});

describe("monthsInWindow", () => {
  it("returns YYYYMM strings covering the window", () => {
    expect(monthsInWindow(window)).toEqual(["202607", "202608", "202609"]);
  });
});

describe("pickIndiaSeries", () => {
  it("selects current men's series and drops women's/old ones", () => {
    const results = [
      {
        type: "league",
        contents: [
          { displayName: "India tour of England 2026", uid: "s:200~l:23810" },
          { displayName: "India Women tour of England 2026", uid: "s:200~l:23814" },
          { displayName: "India tour of Pakistan 2005/06", uid: "s:200~l:14710" },
          { displayName: "West Indies tour of India 2025/26", uid: "s:200~l:23279" },
          { displayName: "Men's T20 Asia Cup", uid: "s:200~l:20957" },
          { displayName: "Women's Asia Cup (ODI)", uid: "s:200~l:8597" },
        ],
      },
      { type: "article", contents: [{ displayName: "India tour of England 2026 preview" }] },
    ];
    const picked = pickIndiaSeries(results, window);
    const ids = picked.map((p) => p.id);
    expect(ids).toContain("23810");
    expect(ids).toContain("23279");
    expect(ids).toContain("20957");
    expect(ids).not.toContain("23814");
    expect(ids).not.toContain("14710");
    expect(ids).not.toContain("8597");
  });
});

describe("mapPwhlGames", () => {
  it("maps Sirens games with UTC conversion from ET offsets", () => {
    const games = mapPwhlGames(
      [
        {
          game_id: "300",
          GameDateISO8601: "2026-08-22T19:00:00-04:00",
          home_team: "4",
          visiting_team: "6",
          home_team_city: "New York",
          home_team_nickname: "Sirens",
          visiting_team_city: "Toronto",
          visiting_team_nickname: "Sceptres",
          venue_name: "Prudential Center",
          venue_location: "Newark, NJ",
        },
        {
          game_id: "301",
          GameDateISO8601: "2026-08-23T19:00:00-04:00",
          home_team: "1",
          visiting_team: "2",
        },
      ],
      window
    );
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("[PWHL] New York Sirens vs Toronto Sceptres");
    expect(games[0].start).toBe("2026-08-22T23:00:00.000Z");
    expect(games[0].venue).toBe("Prudential Center, Newark, NJ");
  });
});
