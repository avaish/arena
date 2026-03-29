import { useState, useEffect } from "react";
import { api, apiPost } from "../lib/api";
import type { League, Team } from "@arena/types";

export default function Settings() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [followedLeagueIds, setFollowedLeagueIds] = useState<string[]>([]);
  const [favoriteTeamIds, setFavoriteTeamIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<Record<string, Team[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<League[]>("/api/leagues"),
      api<string[]>("/api/user/leagues"),
      api<string[]>("/api/user/teams"),
    ])
      .then(([l, fl, ft]) => {
        setLeagues(l);
        setFollowedLeagueIds(fl);
        setFavoriteTeamIds(ft);
        // Load teams for followed leagues
        return Promise.all(
          fl.map((id) => api<Team[]>(`/api/leagues/${id}/teams`).then((t) => [id, t] as const))
        );
      })
      .then((results) => {
        const teamMap: Record<string, Team[]> = {};
        for (const [id, t] of results) {
          teamMap[id] = t;
        }
        setTeams(teamMap);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function toggleLeague(leagueId: string) {
    try {
      const res = await apiPost<{ following: boolean }>("/api/user/leagues", { leagueId });
      if (res.following) {
        setFollowedLeagueIds((prev) => [...prev, leagueId]);
        // Load teams for newly followed league
        const t = await api<Team[]>(`/api/leagues/${leagueId}/teams`);
        setTeams((prev) => ({ ...prev, [leagueId]: t }));
      } else {
        setFollowedLeagueIds((prev) => prev.filter((id) => id !== leagueId));
        setTeams((prev) => {
          const next = { ...prev };
          delete next[leagueId];
          return next;
        });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleTeam(teamId: string) {
    try {
      const res = await apiPost<{ favorited: boolean }>("/api/user/teams", { teamId });
      if (res.favorited) {
        setFavoriteTeamIds((prev) => [...prev, teamId]);
      } else {
        setFavoriteTeamIds((prev) => prev.filter((id) => id !== teamId));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) return <p className="text-gray-500 text-sm">loading...</p>;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  return (
    <div>
      <h2 className="text-lg font-bold mb-4">Settings</h2>

      <section className="mb-8">
        <h3 className="text-sm font-medium text-gray-500 mb-3">Leagues</h3>
        {leagues.length === 0 ? (
          <p className="text-sm text-gray-400">No leagues available yet.</p>
        ) : (
          <div className="space-y-2">
            {leagues.map((league) => {
              const isFollowing = followedLeagueIds.includes(league.id);
              return (
                <button
                  key={league.id}
                  onClick={() => toggleLeague(league.id)}
                  className={`w-full text-left bg-white border rounded p-3 text-sm ${
                    isFollowing ? "border-gray-900" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{league.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {league.sport} · {league.season}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {isFollowing ? "following" : "follow"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {followedLeagueIds.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 mb-3">Favorite Teams</h3>
          {followedLeagueIds.map((leagueId) => {
            const leagueTeams = teams[leagueId] ?? [];
            const league = leagues.find((l) => l.id === leagueId);
            if (leagueTeams.length === 0) return null;
            return (
              <div key={leagueId} className="mb-4">
                <p className="text-xs text-gray-400 mb-2">{league?.name ?? leagueId}</p>
                <div className="flex flex-wrap gap-2">
                  {leagueTeams.map((team) => {
                    const isFavorite = favoriteTeamIds.includes(team.id);
                    return (
                      <button
                        key={team.id}
                        onClick={() => toggleTeam(team.id)}
                        className={`text-xs px-3 py-1.5 rounded border ${
                          isFavorite
                            ? "bg-amber-50 border-amber-300 text-amber-700"
                            : "border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {team.shortName}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
