import { useState, useEffect } from "react";
import { useParams } from "@tanstack/react-router";
import { api } from "../lib/api";
import GameCard from "../components/GameCard";
import type { Team, GameWithTeams } from "@arena/types";

export default function LeagueDetail() {
  const { leagueId } = useParams({ from: "/leagues/$leagueId" });
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<GameWithTeams[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      api<Team[]>(`/api/leagues/${leagueId}/teams`),
      api<GameWithTeams[]>(`/api/leagues/${leagueId}/games`),
    ])
      .then(([t, g]) => {
        setTeams(t);
        setGames(g);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) return <p className="text-gray-500 text-sm">loading...</p>;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">{leagueId}</h2>
        <a
          href={`/api/leagues/${leagueId}/games/ical`}
          className="text-xs px-3 py-1 rounded border border-gray-200 text-gray-500 hover:border-gray-300"
        >
          iCal
        </a>
      </div>

      {teams.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {teams.map((team) => (
            <span
              key={team.id}
              className="text-xs bg-gray-100 border border-gray-200 rounded px-2 py-1"
            >
              {team.shortName}
            </span>
          ))}
        </div>
      )}

      {games.length === 0 ? (
        <p className="text-gray-500 text-sm">No games scheduled.</p>
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
