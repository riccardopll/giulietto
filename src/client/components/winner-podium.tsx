import { Avatar } from "./avatar";
import { Crown, RotateCcw } from "lucide-react";
import { findPlayer, type GameView, type Rematch } from "../../shared/game";
import { standings } from "../standings";
import { cn } from "../utils";
import { Button } from "@ui/button";
import { PlacementMedal } from "@ui/placement-medal";

type Player = GameView["players"][number];

export function WinnerPodium({
  game,
  winner,
  busy,
  invite,
  onRematch,
  onReset,
}: {
  game: GameView;
  winner: Player;
  busy: boolean;
  invite?: Rematch;
  onRematch: () => void;
  onReset: () => void;
}) {
  const groups = standings(game.players, winner.id);
  const others = groups.filter((group) => group.place > 3);
  const me = findPlayer(game, game.you);
  const canRematch = !!me && !me.bot && !me.forfeited;
  return (
    <section className="mx-auto my-4 w-full max-w-lg px-2 py-3 text-center">
      <h1 className="text-3xl font-bold wrap-anywhere">
        {winner.id === game.you ? "You win" : `${winner.name} wins`}
      </h1>
      <div className="mt-6 grid grid-cols-3 items-end gap-2" aria-label="Podium">
        {[2, 1, 3].map((place) => {
          const group = groups.find((entry) => entry.place === place);
          if (!group) return <div key={place} />;
          return (
            <section
              key={place}
              aria-label={`${["", "First", "Second", "Third"][place]} place`}
              className="min-w-0"
            >
              <div className="mb-3 space-y-2">
                {place === 1 && (
                  <Crown className="mx-auto size-8 fill-gold text-gold" aria-hidden="true" />
                )}
                {group.players.length === 1 && (
                  <Avatar
                    avatar={group.players[0].avatar}
                    bot={group.players[0].bot}
                    id={group.players[0].id}
                    className={cn("mx-auto size-12", place === 1 && "size-16")}
                  />
                )}
                {group.players.map((player) => (
                  <p key={player.id} className="text-sm font-bold wrap-anywhere">
                    {player.name}
                    {player.id === game.you && (
                      <span className="block text-2xs font-normal text-muted-foreground">You</span>
                    )}
                  </p>
                ))}
              </div>
              <div
                className={cn(
                  "rounded-t-2xl bg-accent px-2 pt-5",
                  place === 1 ? "h-52 bg-primary" : place === 2 ? "h-40" : "h-28",
                )}
              >
                <PlacementMedal place={place} className="mx-auto h-[70px] w-14" />
              </div>
            </section>
          );
        })}
      </div>
      {others.length > 0 && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold">Other players</h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-3">
            {others.map((group) => (
              <li
                key={group.place}
                aria-label={`Place ${group.place}`}
                className="min-w-0 max-w-24 space-y-1"
              >
                {group.players.length === 1 && (
                  <Avatar
                    avatar={group.players[0].avatar}
                    bot={group.players[0].bot}
                    id={group.players[0].id}
                    className="mx-auto size-12"
                  />
                )}
                {group.players.map((player) => (
                  <p key={player.id} className="text-xs font-semibold wrap-anywhere">
                    {player.name}
                    {player.id === game.you ? " (you)" : ""}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 grid gap-3">
        {canRematch && (
          <Button size="lg" className="w-full" disabled={busy || !!invite} onClick={onRematch}>
            <RotateCcw className="size-5" />
            Rematch
          </Button>
        )}
        <Button
          variant={canRematch ? "outline" : "default"}
          size="lg"
          className="w-full"
          onClick={onReset}
        >
          Back to tables
        </Button>
      </div>
    </section>
  );
}
