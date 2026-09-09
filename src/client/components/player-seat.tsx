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
      className={cn("table-seat min-w-0", you ? "text-xs sm:text-sm" : "text-[11px] sm:text-xs")}
    >
      <div
        className="seat-identity pointer-events-auto relative flex min-w-0 max-w-full items-center justify-center gap-1.5"
        data-seat-identity
      >
        <div className="seat-bubble-slot absolute bottom-[calc(100%+.5rem)] left-0 z-30 flex w-full justify-center">
          <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
        </div>
        <div className="seat-avatar-wrap relative shrink-0">
          {current && (
            <svg
              key={`${deadline}-${serverTime}`}
              className="seat-timer pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90 overflow-visible"
              aria-hidden="true"
              style={
                {
                  "--timer-offset": -100 * (1 - remaining / TURN_MS),
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
              "seat-avatar grid size-(--seat-avatar-size) place-items-center rounded-full border-2 border-background font-semibold shadow-[0_0_0_1px_#6f4a5e12]",
              "text-[length:calc(var(--seat-avatar-size)/2)]",
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
        </div>
        <div className="seat-details flex min-w-0 flex-col items-start gap-0.5">
          <div className="flex w-full min-w-0 items-baseline gap-1">
            <strong
              className={cn(
                "seat-name block truncate leading-tight font-semibold",
                you && "text-sm text-primary",
              )}
              title={player.name}
              aria-label={you ? "You" : player.name}
            >
              {you ? "You" : player.name}
            </strong>
            {(player.left || player.lives <= 0) && (
              <span className="seat-status shrink-0 text-[10px] leading-none text-muted-foreground">
                {player.left ? "Left" : "Out"}
              </span>
            )}
          </div>
          <div
            className={cn("seat-stats flex shrink-0 items-center", you ? "flex-col" : "gap-1")}
            data-seat-stats
          >
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
          className="seat-hand relative w-full"
          data-revealed={player.hand.some((card) => card !== null) || undefined}
          role="group"
          aria-label={`${player.name}: ${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`}
        >
          <div className="seat-fan-orientation absolute inset-0">
            {player.hand.map((card, i) => {
              const offset = i - (player.hand.length - 1) / 2;
              return (
                <div
                  className="seat-fan-card absolute top-1/2"
                  key={card ?? i}
                  style={
                    {
                      "--fan-offset": offset,
                      "--fan-angle": `${offset * 7}deg`,
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
