import { Clock3, Trophy } from "lucide-react";
import type { view } from "../../shared/game";
import { cn, toRoman } from "../utils";
import { Lives } from "./lives";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type State = ReturnType<typeof view>;
const cellClass = "px-1 py-2.5 text-center whitespace-normal wrap-anywhere sm:px-2";

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
  return (
    <section className="mx-auto my-4 w-full max-w-2xl rounded-2xl border border-border bg-card px-2 py-6 text-center sm:p-8">
      {finished && <span className="block text-xs text-muted-foreground">Game over</span>}
      {finished && <Trophy className="mx-auto my-4 size-9 text-[#bd9144]" />}
      <h1 className="mb-6 text-2xl font-semibold wrap-anywhere">
        {finished
          ? game.winner === game.you
            ? "You win"
            : game.winner
              ? `${game.players.find((player) => player.id === game.winner)?.name} wins`
              : "Table closed"
          : game.tie
            ? "Everyone returns"
            : "Round results"}
      </h1>
      {game.tie && (
        <p className="mb-5 text-sm text-muted-foreground">All players return with one life.</p>
      )}
      <Table className="table-fixed text-sm sm:text-base">
        <colgroup>
          <col className="w-[34%]" />
          <col />
          <col />
          <col />
          <col className="w-[23%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="border-border">
            {["Player", "Bid", "Won", "Lost", "Lives"].map((label, i) => (
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
              <TableRow key={player.id} className="border-border">
                <TableCell className={cn(cellClass, "text-left")}>
                  <span className="block text-xs text-muted-foreground">Seat {toRoman(i + 1)}</span>
                  {player.name}
                  {player.id === game.you ? " (you)" : ""}
                </TableCell>
                <TableCell className={cellClass}>{result?.bid ?? "–"}</TableCell>
                <TableCell className={cellClass}>{result?.taken ?? "–"}</TableCell>
                <TableCell
                  className={cn(cellClass, result?.lost ? "text-destructive" : "text-primary")}
                >
                  {result ? (result.lost ? `−${result.lost}` : "✓") : "–"}
                </TableCell>
                <TableCell className={cellClass}>
                  <Lives n={player.lives} total={game.startingLives} />
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
        <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          Next round in {seconds}s
        </p>
      )}
    </section>
  );
}
