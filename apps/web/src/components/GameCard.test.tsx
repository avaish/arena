import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import GameCard from "./GameCard";
import type { GameWithTeams } from "@arena/types";

function makeGame(overrides: Partial<GameWithTeams> = {}): GameWithTeams {
  return {
    id: "game-1",
    leagueId: "ipl-2025",
    homeTeamId: "csk",
    awayTeamId: "mi",
    startsAt: "2025-03-22T14:00:00.000Z",
    venue: "MA Chidambaram Stadium",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    result: null,
    matchday: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    homeTeamName: "Chennai Super Kings",
    homeTeamShortName: "CSK",
    awayTeamName: "Mumbai Indians",
    awayTeamShortName: "MI",
    isFavorite: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe("GameCard", () => {
  it("renders team short names", () => {
    render(<GameCard game={makeGame()} />);
    expect(screen.getByText("CSK")).toBeDefined();
    expect(screen.getByText("MI")).toBeDefined();
  });

  it("renders matchday label", () => {
    render(<GameCard game={makeGame({ matchday: 7 })} />);
    expect(screen.getByText("Game 7")).toBeDefined();
  });

  it("omits matchday label when null", () => {
    const { container } = render(<GameCard game={makeGame({ matchday: null })} />);
    expect(container.textContent).not.toContain("Game");
  });

  it("renders venue for scheduled games", () => {
    render(<GameCard game={makeGame()} />);
    expect(screen.getByText("MA Chidambaram Stadium")).toBeDefined();
  });

  it("does not render venue or date for completed games", () => {
    const { container } = render(
      <GameCard
        game={makeGame({
          status: "completed",
          homeScore: "180/5 (20)",
          awayScore: "150/8 (20)",
        })}
      />
    );
    expect(container.textContent).not.toContain("MA Chidambaram Stadium");
  });

  it("renders LIVE badge for live games", () => {
    render(<GameCard game={makeGame({ status: "live" })} />);
    expect(screen.getByText("LIVE")).toBeDefined();
  });

  it("renders Completed badge for completed games", () => {
    render(<GameCard game={makeGame({ status: "completed" })} />);
    expect(screen.getByText("Completed")).toBeDefined();
  });

  it("does not render LIVE or Completed for scheduled games", () => {
    const { container } = render(<GameCard game={makeGame({ status: "scheduled" })} />);
    expect(container.textContent).not.toContain("LIVE");
    expect(container.textContent).not.toContain("Completed");
  });

  it("renders scores when present", () => {
    render(
      <GameCard
        game={makeGame({
          status: "live",
          homeScore: "180/5 (20)",
          awayScore: "90/3 (10)",
        })}
      />
    );
    expect(screen.getByText("180/5 (20)")).toBeDefined();
    expect(screen.getByText("90/3 (10)")).toBeDefined();
  });

  it("shows scores instead of date/venue for completed games", () => {
    render(
      <GameCard
        game={makeGame({
          status: "completed",
          homeScore: "180/5 (20)",
          awayScore: "150/8 (20)",
          result: "CSK won by 30 runs",
        })}
      />
    );
    expect(screen.getByText("180/5 (20)")).toBeDefined();
    expect(screen.getByText("150/8 (20)")).toBeDefined();
  });

  it("renders result for completed games", () => {
    render(
      <GameCard
        game={makeGame({
          status: "completed",
          result: "CSK won by 5 wickets",
        })}
      />
    );
    expect(screen.getByText("CSK won by 5 wickets")).toBeDefined();
  });

  it("applies favorite highlight border", () => {
    const { container } = render(<GameCard game={makeGame({ isFavorite: true })} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border-l-amber-500");
  });

  it("does not apply favorite highlight when not favorite", () => {
    const { container } = render(<GameCard game={makeGame({ isFavorite: false })} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toContain("border-l-amber-500");
  });

  it("formats date in local timezone", () => {
    // The exact output depends on the test environment's locale, but it should
    // contain some recognizable date string (not the raw ISO string).
    const { container } = render(
      <GameCard game={makeGame({ startsAt: "2025-03-22T14:00:00.000Z" })} />
    );
    expect(container.textContent).not.toContain("2025-03-22T14:00:00.000Z");
    // Should contain "Mar" or "2025" depending on locale
    expect(container.textContent).toMatch(/2025|Mar/);
  });
});
