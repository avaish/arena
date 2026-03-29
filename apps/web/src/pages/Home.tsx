import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "../auth";
import { api } from "../lib/api";
import GameCard from "../components/GameCard";
import type { League, GameWithTeams } from "@arena/types";

export default function Home() {
  const { data: session } = authClient.useSession();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [feed, setFeed] = useState<GameWithTeams[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (session) {
      const params = favoritesOnly ? "?favorites_only=true" : "";
      api<GameWithTeams[]>(`/api/user/feed${params}`)
        .then(setFeed)
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else {
      api<League[]>("/api/leagues")
        .then(setLeagues)
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }
  }, [session, favoritesOnly]);

  if (loading) return <p className="text-gray-500 text-sm">loading...</p>;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  // Logged out: show league list
  if (!session) {
    return (
      <div>
        <h2 className="text-lg font-bold mb-4">Leagues</h2>
        {leagues.length === 0 ? (
          <p className="text-gray-500 text-sm">No leagues available yet.</p>
        ) : (
          <div className="space-y-2">
            {leagues.map((league) => (
              <Link
                key={league.id}
                to="/leagues/$leagueId"
                params={{ leagueId: league.id }}
                className="block bg-white border border-gray-200 rounded p-4 hover:border-gray-300"
              >
                <p className="font-medium">{league.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {league.sport} · {league.season}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Logged in: show feed
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Your Feed</h2>
        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          className={`text-xs px-3 py-1 rounded border ${
            favoritesOnly
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          }`}
        >
          {favoritesOnly ? "My Teams" : "All Games"}
        </button>
      </div>

      {feed.length === 0 ? (
        <div className="text-sm text-gray-500">
          <p>No games in your feed.</p>
          <Link to="/settings" className="text-gray-900 underline mt-1 inline-block">
            Follow a league to get started.
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {feed.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
