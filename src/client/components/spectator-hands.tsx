import { findPlayer, type GameView } from "../../shared/game";
import { t } from "../i18n";
import { cn } from "../utils";
import { PlayingCard } from "./playing-card";

export function SpectatorHands({
  game,
  seats,
  current,
}: {
  game: GameView;
  seats: string[];
  current: string | null;
}) {
  return (
    <section
      className="col-span-full grid grid-cols-2 gap-x-3 gap-y-1.5 [--watch-card-width:min(calc((50cqw-.375rem-10px)/6),3.5dvh)]"
      aria-label={t.match.spectating}
    >
      {seats.map((id) => {
        const player = findPlayer(game, id)!;
        return (
          <div
            key={id}
            className={cn("min-w-0", player.lives <= 0 && "opacity-50")}
            role="group"
            aria-label={t.match.handOf(player.name)}
            aria-current={current === id ? "true" : undefined}
            data-watched-hand={id}
          >
            <strong
              className={cn(
                "block truncate text-2xs leading-3 font-semibold",
                current === id && "text-primary",
              )}
              title={player.name}
            >
              {player.name}
            </strong>
            <div className="mt-0.5 flex h-[calc(var(--watch-card-width)*1.6)] gap-0.5">
              {player.hand.map((card, i) => (
                <div className="relative w-(--watch-card-width) shrink-0" key={card ?? i}>
                  <PlayingCard card={card} className="rounded-[.2rem]" />
                  {card !== null && (
                    <span
                      className="absolute inset-x-0 bottom-0 z-10 rounded-b-[.2rem] bg-card/90 text-center text-[9px] leading-3 font-semibold tabular-nums"
                      aria-hidden="true"
                    >
                      {card === 31 ? "0/41" : card}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
