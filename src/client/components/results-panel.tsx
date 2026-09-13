import { Check, Clock3, Heart } from "lucide-react";
import type { view } from "../../shared/game";
import { cn, toRoman } from "../utils";
import { WinnerPodium } from "./winner-podium";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type State = ReturnType<typeof view>;
const cellClass = "px-1 py-3 text-center whitespace-normal wrap-anywhere sm:px-2";

export function ResultsPanel({
  game,
  seconds,
  onReset,
}: {
  game: State;
  seconds: number;
  onReset: () => void;
}) {
  const finished = game.phase === "finished";
  const winner = finished ? game.players.find((player) => player.id === game.winner) : undefined;
  if (winner) return <WinnerPodium game={game} winner={winner} onReset={onReset} />;
  return (
    <section className="mx-auto my-4 w-full max-w-2xl rounded-2xl border border-border bg-card p-3 text-center sm:p-6">
      <h1 className="mb-4 px-1 pt-2 text-left text-2xl font-semibold wrap-anywhere">
        {finished ? "Table closed" : game.tie ? "Everyone returns" : "Round results"}
      </h1>
      {game.tie && (
        <p className="mb-5 text-sm text-muted-foreground">All players return with one life.</p>
      )}
      <Table className="table-fixed text-sm sm:text-base">
        <colgroup>
          <col className="w-[48%]" />
          <col />
          <col />
          <col className="w-[22%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="border-border">
            {["Player", "Bid", "Won", "Lives"].map((label, i) => (
              <TableHead
                key={label}
                className={cn(
                  "h-10 px-1 text-center text-xs whitespace-normal wrap-anywhere text-muted-foreground sm:px-2 sm:text-sm",
                  i === 0 && "text-left",
                )}
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {game.players.map((player, i) => {
            const result = game.results.find((entry) => entry.id === player.id);
            return (
              <TableRow
                key={player.id}
                className={cn(
                  "border-border",
                  player.id === game.you && "bg-accent/60 hover:bg-accent/60",
                )}
              >
                <TableCell className={cn(cellClass, "text-left")}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground">
                      {toRoman(i + 1)}
                    </span>
                    <span className="min-w-0">
                      {player.name}
                      {player.id === game.you && (
                        <span className="ml-1.5 inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                          you
                        </span>
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cellClass}>{result?.bid ?? "–"}</TableCell>
                <TableCell className={cellClass}>{result?.taken ?? "–"}</TableCell>
                <TableCell className={cellClass}>
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className="inline-flex items-center gap-1.5 font-semibold tabular-nums"
                      aria-label={`${player.lives} ${player.lives === 1 ? "life" : "lives"}`}
                    >
                      <Heart
                        className="size-4 text-[#ca687c]"
                        fill="currentColor"
                        aria-hidden="true"
                      />
                      {player.lives}
                    </span>
                    <span
                      className={cn(
                        "flex h-4 items-center text-xs",
                        result?.lost ? "text-destructive" : "text-primary",
                      )}
                      aria-label={result ? `${result.lost} lives lost` : "No round result"}
                    >
                      {result ? (
                        result.lost ? (
                          `−${result.lost}`
                        ) : (
                          <Check className="size-4" aria-hidden="true" />
                        )
                      ) : (
                        "–"
                      )}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {finished ? (
        <Button
          className="mt-6 h-auto min-h-12 w-full max-w-68 whitespace-normal rounded-xl px-4 py-3"
          onClick={onReset}
        >
          Back to tables
        </Button>
      ) : (
        <div className="mt-3 border-t pt-4">
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" aria-hidden="true" />
            Next round in {seconds}s
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary/10" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary/60 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.max(0, Math.min(1, seconds / 12)) * 100}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
