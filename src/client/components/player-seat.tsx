import { Avatar } from "./avatar";
import type { CSSProperties } from "react";
import { EmoteBubble } from "./emotes";
import { TURN_MS, type GameView } from "../../shared/game";
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
  serverTime: number;
  round: number;
  status: string;
  side: "top" | "bottom";
}) {
  const revealed = player.hand.some((card) => card !== null);
  const remaining = Math.max(0, Math.min(TURN_MS, deadline - serverTime));
  return (
    <section
      data-seat={player.id}
      data-side={side}
      data-you={you || undefined}
      aria-label={`Seat ${toRoman(number)}: ${player.name}${you ? " (you)" : ""}. ${status}`}
      aria-current={current ? "true" : undefined}
      className="table-seat row-span-2 grid min-w-0 grid-rows-subgrid text-[10px] leading-3 @min-2xl/board:text-sm @min-2xl/board:leading-4"
    >
      <div
        className={cn(
          "seat-identity relative flex size-full min-w-0 items-center justify-center px-1",
          side === "bottom" ? "row-start-2" : "row-start-1",
          emoteMenuOpen && (you ? "invisible" : side === "bottom" && "@max-2xl/board:invisible"),
        )}
        data-seat-identity
      >
        <div className="seat-profile relative flex min-w-0 max-w-full items-center gap-2">
          <div className="seat-bubble-slot pointer-events-none absolute bottom-[calc(100%+.375rem)] left-0 z-30 flex w-full items-end justify-center gap-1">
            <EmoteBubble emote={player.emote} serverTime={serverTime} name={player.name} />
            <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
          </div>
          <div className="seat-avatar-wrap relative size-10 shrink-0 @min-2xl/board:size-13">
            {current && player.lives > 0 && (
              <svg
                key={`${deadline}-${serverTime}`}
                className="seat-timer pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90 -scale-y-100 overflow-visible"
                aria-hidden="true"
                style={
                  {
                    "--timer-remaining": 100 * (remaining / TURN_MS),
                    "--timer-duration": `${remaining}ms`,
                  } as CSSProperties
                }
              >
                <circle
                  className="fill-none stroke-primary stroke-[5]"
                  cx="50%"
                  cy="50%"
                  r="calc(50% - 2.5px)"
                  pathLength="100"
                />
              </svg>
            )}
            <div
              className={cn(
                "seat-avatar relative grid size-full place-items-center rounded-full border-2 font-semibold",
                player.lives <= 0
                  ? "border-transparent"
                  : "border-background bg-card shadow-[0_0_0_1px] shadow-plum/7",
              )}
              aria-hidden="true"
            >
              {player.lives > 0 && (
                <Avatar avatar={player.avatar} id={player.id} className="size-full border-0" />
              )}
              {player.lives <= 0 && (
                <span
                  key={round}
                  className="seat-elimination pointer-events-none absolute -inset-1 z-10 grid place-items-center animate-[seat-elimination_.8s_cubic-bezier(.2,.8,.2,1)_both]"
                >
                  <img
                    src="/skull-giulietto.webp"
                    alt=""
                    className="size-full object-contain drop-shadow-[0_1px_1px,0_3px_3px] drop-shadow-plum/20"
                    draggable={false}
                  />
                </span>
              )}
            </div>
            <span
              className={cn(
                "seat-number absolute -top-1 -right-1 z-20 grid h-4 min-w-4 place-items-center rounded-full border bg-background px-0.5 text-[9px] font-semibold sm:h-[18px] sm:min-w-[18px] sm:text-[10px]",
                current ? "border-primary text-primary" : "border-input text-secondary-foreground",
              )}
              aria-label={`Seat ${toRoman(number)}`}
            >
              {toRoman(number)}
            </span>
          </div>
          <div className="seat-details flex min-w-0 flex-col items-start justify-center gap-1">
            <strong
              className={cn(
                "seat-name line-clamp-3 max-w-full font-semibold [overflow-wrap:anywhere]",
                you
                  ? "text-sm text-primary @min-2xl/board:text-lg"
                  : "text-[10px] leading-[11px] @min-xs/board:text-xs @min-xs/board:leading-[14px] @min-2xl/board:text-sm @min-2xl/board:leading-4",
              )}
              title={player.name}
              aria-label={you ? "You" : player.name}
            >
              {you ? "You" : player.name}
            </strong>
            <div
              className={cn(
                "seat-stats flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 @min-xs/board:text-xs @min-xs/board:leading-[14px] @min-2xl/board:text-sm",
                player.lives <= 0 && "invisible",
              )}
              aria-hidden={player.lives <= 0 || undefined}
              data-seat-stats
            >
              <LifeCount n={player.lives} />
              <span
                className="player-score inline-flex shrink-0 items-center gap-0.5 border-l border-foreground/10 pl-1 font-semibold whitespace-nowrap text-foreground tabular-nums"
                aria-label={`${player.taken} tricks won, ${player.bid ?? "no"} predicted`}
              >
                <span
                  className={cn(
                    "inline-block min-w-[1ch]",
                    player.bid != null && player.taken !== player.bid && "text-destructive",
                  )}
                >
                  {player.taken}
                </span>
                <span className="font-normal text-muted-foreground/70" aria-hidden="true">
                  /
                </span>
                <span className="inline-block min-w-[1ch]">{player.bid ?? "–"}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      {!handInTray && (
        <div
          className={cn(
            "seat-hand relative h-full w-full",
            side === "bottom" ? "row-start-1" : "row-start-2",
          )}
          data-revealed={revealed || undefined}
          role="group"
          aria-label={`${player.name}: ${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`}
        >
          <div
            className={cn(
              "seat-fan-orientation absolute top-1/2 left-1/2",
              !revealed && "rotate-(--seat-fan-rotation)",
            )}
          >
            {player.hand.map((card, i) => {
              const offset = i - (player.hand.length - 1) / 2;
              return (
                <div
                  className={cn(
                    "seat-fan-card absolute top-[calc(50%+var(--fan-curve))] left-[calc(50%+var(--fan-offset)*2px)] origin-bottom -translate-x-1/2 -translate-y-1/2 rotate-(--fan-angle)",
                    card === null ? "w-7 @min-xl/board:w-11" : "w-(--opponent-card-width)",
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
                      "border border-parchment",
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
