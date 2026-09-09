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
}) {
  const remaining = Math.max(0, Math.min(TURN_MS, deadline - serverTime));
  return (
    <section
      data-seat={player.id}
      aria-label={`Seat ${toRoman(number)}: ${player.name}${you ? " (you)" : ""}. ${status}`}
      aria-current={current ? "true" : undefined}
      className={cn("table-seat flex min-w-0 flex-col items-center text-center text-xs", {
        "current-player": current,
        eliminated: player.lives <= 0 || player.left,
      })}
    >
      <div className="seat-identity relative flex w-full min-w-0 flex-col items-center gap-0.5">
        <div className="seat-bubble-slot absolute bottom-[calc(100%+.5rem)] left-0 flex w-full justify-center">
          <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
        </div>
        <div className="seat-avatar-wrap relative mx-1.5 mb-1">
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
              "seat-avatar grid size-(--seat-avatar-size) place-items-center rounded-full border-3 border-background font-semibold shadow-[0_0_0_1px_#6f4a5e12]",
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
              "seat-number absolute -top-0.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full border bg-[#fff8fb] text-[10px] font-semibold",
              current ? "border-primary text-primary" : "border-[#dcb8c9] text-[#653248]",
            )}
            aria-label={`Seat ${toRoman(number)}`}
          >
            {toRoman(number)}
          </span>
        </div>
        <div className="seat-details flex min-w-0 max-w-full flex-col items-center">
          <strong
            className="seat-name block max-w-full truncate leading-[1.4] font-semibold"
            title={player.name}
            aria-label={you ? "You" : player.name}
          >
            {you ? "You" : player.name}
          </strong>
          <div className="seat-stats flex items-center justify-center gap-1.5">
            <Lives n={player.lives} total={startingLives} compact />
            <span
              className="player-score font-bold whitespace-nowrap text-[#63414f] tabular-nums"
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
          {(player.left || player.lives <= 0) && (
            <span className="seat-status text-xs text-muted-foreground">
              {player.left ? "Left" : "Out"}
            </span>
          )}
        </div>
      </div>
      {!you && (
        <div
          className="seat-hand relative mt-1.5 w-full"
          data-revealed={player.hand.some((card) => card !== null) || undefined}
          role="group"
          aria-label={`${player.name}: ${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`}
        >
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
      )}
    </section>
  );
}
