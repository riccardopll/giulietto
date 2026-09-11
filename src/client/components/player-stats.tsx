import { useEffect, useState } from "react";
import type { StatsResponse } from "@/shared/player-stats";
import { Button } from "./ui/button";

export function PlayerStats({ token }: { token: string }) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [board, setBoard] = useState<"experience" | "wins">("experience");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stats", { headers: { "x-player-token": token }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Could not load stats.");
        return (await response.json()) as StatsResponse;
      })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not load stats.");
      });
    return () => controller.abort();
  }, [token, attempt]);
  return (
    <section className="mt-7 border-t pt-6" aria-label="Player stats and leaderboards">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Your stats</h2>
        <Button
          className="min-h-11"
          variant="ghost"
          onClick={() => {
            setError("");
            setAttempt(attempt + 1);
          }}
        >
          Refresh stats
        </Button>
      </div>
      {error ? (
        <div role="status">
          <p>{error}</p>
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => {
              setError("");
              setAttempt(attempt + 1);
            }}
          >
            Retry stats
          </Button>
        </div>
      ) : !data ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading stats…
        </p>
      ) : (
        <>
          <p className="mt-2 font-medium">
            Level {data.player.level} · {data.player.xp} XP
          </p>
          <p className="text-sm text-muted-foreground">
            {100 - (data.player.xp % 100)} XP to the next level
          </p>
          <dl className="my-4 grid grid-cols-2 gap-3 text-sm">
            {Object.entries({
              Matches: data.player.matches,
              Wins: data.player.wins,
              "Win rate": `${data.player.matches ? Math.round((100 * data.player.wins) / data.player.matches) : 0}%`,
              Rounds: data.player.rounds,
              "Tricks won": data.player.tricks,
              "Exact predictions": data.player.exactPredictions,
            }).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Completed matches: 10 XP, plus 20 XP for a win. Every 100 XP adds a level, with no
            limit. Stats belong to this guest session.
          </p>
          <h2 className="mt-6 text-lg font-semibold">Leaderboards</h2>
          <div className="my-3 flex gap-2" aria-label="Leaderboard order">
            <Button
              className="min-h-11"
              variant={board === "experience" ? "default" : "outline"}
              aria-pressed={board === "experience"}
              onClick={() => setBoard("experience")}
            >
              Experience
            </Button>
            <Button
              className="min-h-11"
              variant={board === "wins" ? "default" : "outline"}
              aria-pressed={board === "wins"}
              onClick={() => setBoard("wins")}
            >
              Wins
            </Button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            All time · Top 20 · Public and private matches
          </p>
          {data[board].length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Finish a match to join the leaderboards.
            </p>
          ) : (
            <ol className="divide-y">
              {data[board].map((player, index) => (
                <li key={index} className="flex items-center gap-3 py-3 text-sm">
                  <span className="w-5 shrink-0 tabular-nums">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {player.name}
                      {player.you ? " (you)" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Level {player.level} · {player.matches}{" "}
                      {player.matches === 1 ? "match" : "matches"}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {board === "experience"
                      ? `${player.xp} XP`
                      : `${player.wins} ${player.wins === 1 ? "win" : "wins"}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
