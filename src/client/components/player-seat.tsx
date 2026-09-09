import type { CSSProperties } from "react";
import { TURN_MS, type view } from "../../shared/game.ts";
import { cn, toRoman } from "../utils";
import { Lives } from "./lives";
import { PlayingCard } from "./playing-card";
import { PredictionEmote } from "./prediction-emote";

type SeatPlayer = ReturnType<typeof view>["players"][number];

// Player IDs are random; deriving a hue keeps each pastel stable on reconnect.
function avatarHue(id: string) {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return ((hash % 360) + 360) % 360;
}

export function PlayerSeat({
  player,
  number,
  you,
  current,
  deadline,
  serverTime,
  round,
  startingLives,
  status,
  side,
}: {
  player: SeatPlayer;
  number: number;
  you: boolean;
  current: boolean;
  deadline: number;
  serverTime: number;
  round: number;
  startingLives: number;
  status: string;
  side: "top" | "bottom";
}) {
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
          "seat-identity relative flex size-full min-w-0 items-center justify-center gap-1.5 px-1",
          side === "bottom" ? "row-start-2" : "row-start-1",
        )}
        data-seat-identity
      >
        <div className="seat-bubble-slot pointer-events-none absolute bottom-[calc(100%+.25rem)] left-0 z-30 flex w-full justify-center">
          <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
        </div>
        <div className="seat-avatar-wrap relative shrink-0">
          {current && (
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
              "seat-avatar grid place-items-center rounded-full border-2 border-background font-semibold shadow-[0_0_0_1px_#6f4a5e12]",
              you
                ? "size-9 text-lg @min-2xl/board:size-12 @min-2xl/board:text-2xl"
                : "size-7 text-sm @min-2xl/board:size-10 @min-2xl/board:text-xl",
              player.lives <= 0 || player.left
                ? "bg-[#e6e0e3] text-[#80727b]"
                : "bg-[hsl(var(--avatar-hue)_45%_84%)] text-[#493642]",
            )}
            style={{ "--avatar-hue": avatarHue(player.id) } as CSSProperties}
            aria-hidden="true"
          >
            {Array.from(player.name)[0]?.toLocaleUpperCase()}
          </div>
          <span
            className={cn(
              "seat-number absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border bg-[#fff8fb] px-0.5 text-[9px] font-semibold sm:h-5 sm:min-w-5 sm:text-[10px]",
              current ? "border-primary text-primary" : "border-[#dcb8c9] text-[#653248]",
            )}
            aria-label={`Seat ${toRoman(number)}`}
          >
            {toRoman(number)}
          </span>
          {(player.left || player.lives <= 0) && (
            <span className="seat-status absolute top-full left-1/2 -translate-x-1/2 text-[9px] leading-3 whitespace-nowrap text-muted-foreground">
              {player.left ? "Left" : "Out"}
            </span>
          )}
        </div>
        <div className="seat-details flex min-w-0 flex-col items-start justify-center gap-0.5">
          <strong
            className={cn(
              "seat-name block max-w-full font-semibold [overflow-wrap:anywhere]",
              you
                ? "text-sm text-primary @min-2xl/board:text-lg"
                : "text-[10px] leading-[11px] @min-xs/board:text-[11px] @min-xs/board:leading-3 @min-2xl/board:text-sm @min-2xl/board:leading-4",
            )}
            title={player.name}
            aria-label={you ? "You" : player.name}
          >
            {you ? "You" : player.name}
          </strong>
          <div className="seat-stats flex shrink-0 items-center gap-1" data-seat-stats>
            <Lives n={player.lives} total={startingLives} compact />
            <span
              className="player-score font-semibold whitespace-nowrap text-[#63414f] tabular-nums"
              aria-label={`${player.taken} tricks won, ${player.bid ?? "no"} predicted`}
            >
              <span
                className={
                  player.bid != null && player.taken > player.bid ? "text-destructive" : undefined
                }
              >
                {player.taken}
              </span>{" "}
              / {player.bid ?? "–"}
            </span>
          </div>
        </div>
      </div>
      {!you && (
        <div
          className={cn(
            "seat-hand relative h-full w-full",
            side === "bottom" ? "row-start-1" : "row-start-2",
          )}
          data-revealed={player.hand.some((card) => card !== null) || undefined}
          role="group"
          aria-label={`${player.name}: ${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`}
        >
          <div className="seat-fan-orientation absolute inset-0">
            {player.hand.map((card, i) => {
              const offset = i - (player.hand.length - 1) / 2;
              return (
                <div
                  className={cn(
                    "seat-fan-card absolute top-1/2 left-[calc(50%+var(--fan-offset)*2px)] -translate-x-1/2 -translate-y-1/2",
                    card === null ? "w-7 @min-2xl/board:w-8" : "w-(--opponent-card-width)",
                  )}
                  key={card ?? i}
                  style={
                    {
                      "--fan-offset": offset,
                    } as CSSProperties
                  }
                >
                  <PlayingCard card={card} className="rounded-[.2rem] border border-[#fffaf6]" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
