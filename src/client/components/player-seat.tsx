import { Avatar } from "./avatar";
import type { CSSProperties } from "react";
import { EmoteBubble } from "./emotes";
import { type GameView } from "../../shared/game";
import { cn, toRoman } from "../utils";
import { LifeCount } from "./lives";
import { PlayingCard } from "./playing-card";
import { PredictionEmote } from "./prediction-emote";

type SeatPlayer = GameView["players"][number];

export function PlayerSeat({
  emoteMenuOpen,
  player,
  number,
  you,
  handInTray,
  current,
  activeTurn,
  deadline,
  turnSeconds,
  serverTime,
  round,
  status,
  side,
}: {
  emoteMenuOpen: boolean;
  player: SeatPlayer;
  number: number;
  you: boolean;
  handInTray: boolean;
  current: boolean;
  activeTurn: boolean;
  deadline: number;
  turnSeconds: number;
  serverTime: number;
  round: number;
  status: string;
  side: "top" | "bottom";
}) {
  const revealed = player.hand.some((card) => card !== null);
  const turnMs = turnSeconds * 1000;
  const remaining = Math.max(0, Math.min(turnMs, deadline - serverTime));
  return (
    <section
      data-seat={player.id}
      data-side={side}
      data-you={you || undefined}
      aria-label={`Seat ${toRoman(number)}: ${player.name}${you ? " (you)" : ""}. ${status}`}
      aria-current={current ? "true" : undefined}
      className="row-span-2 grid min-w-0 grid-rows-subgrid text-2xs leading-3"
    >
      <div
        className={cn(
          "relative flex size-full min-w-0 items-center justify-center px-1",
          side === "bottom" ? "row-start-2" : "row-start-1",
          emoteMenuOpen && (handInTray || side === "bottom") && "invisible",
        )}
        data-seat-identity
      >
        <div className="relative flex min-w-0 max-w-full items-center gap-2" data-seat-profile>
          <div className="pointer-events-none absolute bottom-[calc(100%+.375rem)] left-0 z-30 flex w-full items-end justify-center gap-1">
            {player.lives > 0 && (
              <EmoteBubble emote={player.emote} serverTime={serverTime} name={player.name} />
            )}
            <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
          </div>
          <div className="relative size-10 shrink-0">
            {current && player.lives > 0 && (
              <TurnRing
                key={`${deadline}-${serverTime}`}
                remaining={100 * (remaining / turnMs)}
                duration={remaining}
              />
            )}
            <div
              className={cn(
                "relative grid size-full place-items-center rounded-full border-2 font-semibold",
                player.lives <= 0
                  ? "border-transparent"
                  : "border-background bg-card shadow-[0_0_0_1px] shadow-foreground/7",
              )}
              data-seat-avatar
              aria-hidden="true"
            >
              {player.lives > 0 && (
                <Avatar
                  avatar={player.avatar}
                  bot={player.bot}
                  id={player.id}
                  className="size-full border-0"
                />
              )}
              {player.lives <= 0 && (
                <span
                  key={round}
                  className="pointer-events-none absolute -inset-1 z-10 grid place-items-center animate-[seat-elimination_.8s_cubic-bezier(.2,.8,.2,1)_both]"
                >
                  <img
                    src="/skull-giulietto.webp"
                    alt=""
                    className="size-full object-contain drop-shadow-[0_1px_1px,0_3px_3px] drop-shadow-foreground/20"
                    draggable={false}
                  />
                </span>
              )}
            </div>
            <span
              className={cn(
                "absolute -top-1 -right-1 z-20 grid h-4 min-w-4 place-items-center rounded-full border bg-background px-0.5 text-[9px] font-semibold",
                current ? "border-primary text-primary" : "border-input text-secondary-foreground",
              )}
              aria-label={`Seat ${toRoman(number)}`}
            >
              {toRoman(number)}
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-start justify-center gap-1" data-seat-details>
            <strong
              className={cn(
                "line-clamp-3 max-w-full font-semibold [overflow-wrap:anywhere]",
                you
                  ? "text-sm text-primary"
                  : "text-2xs leading-[11px] @min-xs/board:text-xs @min-xs/board:leading-[14px]",
              )}
              title={player.name}
              aria-label={you ? "You" : player.name}
            >
              {you ? "You" : player.name}
            </strong>
            <div
              className={cn(
                "flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 @min-xs/board:text-xs @min-xs/board:leading-[14px]",
                player.lives <= 0 && "invisible",
              )}
              aria-hidden={player.lives <= 0 || undefined}
              data-seat-stats
            >
              <LifeCount n={player.lives} />
              <Score taken={player.taken} bid={player.bid} />
            </div>
          </div>
        </div>
      </div>
      {!handInTray && (
        <div
          className={cn(
            "relative h-full w-full",
            side === "bottom" ? "row-start-1" : "row-start-2",
          )}
          data-seat-hand
          data-revealed={revealed || undefined}
          role="group"
          aria-label={`${player.name}: ${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`}
        >
          <div
            className={cn("absolute top-1/2 left-1/2", !revealed && "rotate-(--seat-fan-rotation)")}
          >
            {player.hand.map((card, i) => {
              const offset = i - (player.hand.length - 1) / 2;
              return (
                <div
                  className={cn(
                    "absolute top-[calc(50%+var(--fan-curve))] left-[calc(50%+var(--fan-offset)*2px)] origin-bottom -translate-x-1/2 -translate-y-1/2 rotate-(--fan-angle)",
                    card === null ? "w-7" : "w-(--opponent-card-width)",
                  )}
                  key={card ?? i}
                  style={
                    {
                      "--fan-offset": offset,
                      "--fan-angle": `${offset * 3}deg`,
                      "--fan-curve": `${offset ** 2 * 0.4}px`,
                    } as CSSProperties
                  }
                >
                  <PlayingCard
                    card={card}
                    className={cn(
                      "border border-card",
                      card === null && "rounded-[.2rem]",
                      activeTurn && "turn-glow",
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function Score({ taken, bid }: { taken: number; bid: number | null }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 border-l border-foreground/10 pl-1 font-semibold whitespace-nowrap text-foreground tabular-nums"
      aria-label={`${taken} tricks won, ${bid ?? "no"} predicted`}
    >
      <span
        className={cn(
          "inline-block min-w-[1ch]",
          bid != null && taken !== bid && "text-destructive",
        )}
      >
        {taken}
      </span>
      <span className="font-normal text-muted-foreground/70" aria-hidden="true">
        /
      </span>
      <span className="inline-block min-w-[1ch]">{bid ?? "–"}</span>
    </span>
  );
}

export function TurnRing({
  remaining,
  duration,
  loop = false,
}: {
  remaining: number;
  duration: number;
  loop?: boolean;
}) {
  return (
    <svg
      className="seat-timer pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90 -scale-y-100 overflow-visible"
      data-loop={loop || undefined}
      aria-hidden="true"
      style={
        { "--timer-remaining": remaining, "--timer-duration": `${duration}ms` } as CSSProperties
      }
    >
      <circle
        fill="none"
        className="stroke-primary stroke-[5]"
        cx="50%"
        cy="50%"
        r="calc(50% - 2.5px)"
        pathLength="100"
      />
    </svg>
  );
}
