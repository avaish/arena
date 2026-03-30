import type { GameWithTeams } from "@arena/types";

type Props = {
  game: GameWithTeams;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function GameCard({ game }: Props) {
  const isLive = game.status === "live";
  const isCompleted = game.status === "completed";

  return (
    <div
      className={`bg-white border border-gray-200 rounded p-4 text-sm ${
        game.isFavorite ? "border-l-4 border-l-amber-500" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs">
          {game.matchday ? `Game ${game.matchday}` : ""}
        </span>
        {isLive && (
          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">
            LIVE
          </span>
        )}
        {isCompleted && <span className="text-xs text-gray-400">Completed</span>}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="font-medium">
            {game.homeTeamShortName}{" "}
            {!isCompleted && game.homeScore && (
              <span className="text-gray-500 font-normal">{game.homeScore}</span>
            )}
          </p>
          <p className="font-medium mt-1">
            {game.awayTeamShortName}{" "}
            {!isCompleted && game.awayScore && (
              <span className="text-gray-500 font-normal">{game.awayScore}</span>
            )}
          </p>
        </div>

        {isCompleted ? (
          <div className="text-right text-sm">
            <p className="text-gray-700 font-medium">{game.homeScore ?? "-"}</p>
            <p className="text-gray-700 font-medium mt-1">{game.awayScore ?? "-"}</p>
          </div>
        ) : (
          <div className="text-right text-xs text-gray-400">
            <p>{formatDate(game.startsAt)}</p>
            {game.venue && <p className="mt-0.5">{game.venue}</p>}
          </div>
        )}
      </div>

      {game.result && (
        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">{game.result}</p>
      )}
    </div>
  );
}
