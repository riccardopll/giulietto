import { useEffect, useState } from "react";
import { findPlayer, ROUND_PAUSE_MS, type GameView, type Rematch } from "../../shared/game";
import { cn, toRoman } from "../utils";
import { ChatButton, type ChatState } from "./chat";
import { LifeCount } from "./lives";
import { WinnerPodium } from "./winner-podium";
import { Button } from "./ui/button";
import { Countdown, CountdownBar } from "./ui/countdown";

const cellClass = "px-1 py-3 text-center align-middle whitespace-normal wrap-anywhere sm:px-2";

function useCountdown({ deadline, serverTime }: GameView, frozen: boolean) {
  const [clock, setClock] = useState({ deadline, serverTime, elapsed: 0 });
  if (clock.deadline !== deadline || clock.serverTime !== serverTime)
    setClock({ deadline, serverTime, elapsed: 0 });
  useEffect(() => {
    if (frozen) return;
    const received = Date.now();
    const timer = setInterval(
      () => setClock((current) => ({ ...current, elapsed: Date.now() - received })),
      50,
    );
    return () => clearInterval(timer);
  }, [frozen, deadline, serverTime]);
  return Math.max(0, Math.min(ROUND_PAUSE_MS, clock.deadline - clock.serverTime - clock.elapsed));
}

export function ResultsPanel({
  game,
  preview,
  busy,
  chat,
  invite,
  onRematch,
  onReset,
}: {
  game: GameView;
  preview: boolean;
  busy: boolean;
  chat: ChatState;
  invite?: Rematch;
  onRematch: () => void;
  onReset: () => void;
}) {
  const remaining = useCountdown(game, preview);
  const finished = game.phase === "finished";
  const winner = finished && game.winner ? findPlayer(game, game.winner) : undefined;
  if (winner)
    return (
      <WinnerPodium
        game={game}
        winner={winner}
        busy={busy}
        invite={invite}
        onRematch={onRematch}
        onReset={onReset}
      />
    );
  return (
    <section className="mx-auto my-4 w-full max-w-2xl rounded-2xl border border-border bg-card p-3 text-center sm:p-6">
      <div className="mb-4 flex items-center gap-3 px-1 pt-2">
        <h1 className="min-w-0 text-left text-2xl font-semibold wrap-anywhere">
          {finished ? "Table closed" : game.tie ? "Everyone returns" : "Round results"}
        </h1>
        {!finished && <ChatButton unread={chat.unread} onClick={() => chat.setOpen(true)} />}
      </div>
      {game.tie && (
        <p className="mb-5 text-sm text-muted-foreground">All players return with one life.</p>
      )}
      <div className="-mx-3 sm:-mx-6">
        <table className="w-full table-fixed text-sm sm:text-base">
          <colgroup>
            <col className="w-[38%]" />
            <col />
            <col />
            <col className="w-[32%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              {["Player", "Bid", "Won", "Lives"].map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    "h-10 px-1 text-center align-middle text-xs font-medium whitespace-normal wrap-anywhere text-muted-foreground sm:px-2 sm:text-sm",
                    i === 0 && "pl-4 text-left sm:pl-8",
                    i === 3 && "pr-4 sm:pr-8",
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {game.players.map((player, i) => {
              const result = game.results.find((entry) => entry.id === player.id);
              return (
                <tr
                  key={player.id}
                  className={cn(
                    "border-b border-border last:border-0",
                    player.id === game.you && "bg-accent/60",
                  )}
                >
                  <td className={cn(cellClass, "pl-4 text-left sm:pl-8")}>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="w-5 shrink-0 text-xs text-muted-foreground">
                        {toRoman(i + 1)}
                      </span>
                      <span className="min-w-0">{player.name}</span>
                    </div>
                  </td>
                  <td className={cellClass}>{result?.bid ?? "–"}</td>
                  <td className={cellClass}>{result?.taken ?? "–"}</td>
                  <td className={cn(cellClass, "pr-4 sm:pr-8")}>
                    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">
                      <LifeCount n={player.lives} className="col-start-2 gap-1.5" />
                      {!!result?.lost && (
                        <span
                          className="col-start-3 justify-self-start rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-destructive tabular-nums"
                          aria-label={`${result.lost} lives lost`}
                        >
                          −{result.lost}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {finished ? (
        <Button
          className="mt-6 h-auto min-h-12 w-full max-w-68 whitespace-normal rounded-xl px-4 py-3"
          onClick={onReset}
        >
          Back to tables
        </Button>
      ) : (
        <div className="mt-3 border-t pt-4">
          <Countdown className="justify-center" label="Next round in" remaining={remaining} />
          <CountdownBar className="mt-4" remaining={remaining} total={ROUND_PAUSE_MS} />
        </div>
      )}
    </section>
  );
}
