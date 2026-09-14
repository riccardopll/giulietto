import type { Leader } from "../../shared/player-stats";
import { Avatar } from "./avatar";
import { PlacementMedal } from "./ui/placement-medal";
import { cn } from "../utils";

function PlayerIdentity({ player, featured = false }: { player: Leader; featured?: boolean }) {
  return (
    <div className={cn("min-w-0", !featured && "flex-1")}>
      <p
        className={cn(
          "text-sm font-semibold",
          featured ? "line-clamp-2 wrap-anywhere" : "truncate",
        )}
        title={player.name}
      >
        {player.name}
        {player.you ? " (you)" : ""}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Level {player.level}</p>
    </div>
  );
}

function Wins({ player }: { player: Leader }) {
  return (
    <span className="shrink-0 text-sm font-semibold tabular-nums">
      {player.wins} {player.wins === 1 ? "win" : "wins"}
    </span>
  );
}

export function Leaderboard({ players }: { players: Leader[] }) {
  return (
    <ol aria-label="Leaderboard" className="grid grid-cols-3">
      {players.map((player, index) =>
        index < 3 ? (
          <li
            key={index}
            value={index + 1}
            aria-label={`Place ${index + 1}: ${player.name}${player.you ? " (you)" : ""}`}
            className={cn(
              "row-start-1 flex min-w-0 flex-col items-center px-1 pb-8 text-center",
              index === 0
                ? "col-start-2 pt-2"
                : index === 1
                  ? "col-start-1 pt-10"
                  : "col-start-3 pt-10",
              player.you && "text-primary",
            )}
          >
            <div className="relative mb-7">
              <Avatar
                avatar={player.avatar}
                className={cn(
                  index === 0
                    ? "size-20 ring-2 ring-gold/60 ring-offset-2 ring-offset-background shadow-[0_0_20px] shadow-gold/20 sm:size-24"
                    : "size-16 sm:size-20",
                )}
              />
              <PlacementMedal
                place={index + 1}
                className="absolute -bottom-5 left-1/2 h-10 w-8 -translate-x-1/2"
              />
            </div>
            <PlayerIdentity player={player} featured />
            <div className="mt-1.5">
              <Wins player={player} />
            </div>
          </li>
        ) : (
          <li
            key={index}
            value={index + 1}
            className={cn(
              "col-span-3 flex min-h-16 min-w-0 items-center gap-3 border-t px-2 py-3",
              player.you && "bg-accent/60 text-primary",
            )}
          >
            <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <Avatar avatar={player.avatar} className="size-10" />
            <PlayerIdentity player={player} />
            <Wins player={player} />
          </li>
        ),
      )}
    </ol>
  );
}
