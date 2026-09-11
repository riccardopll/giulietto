import type { CSSProperties } from "react";
import { EmoteBubble } from "./emotes";
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
  emoteMenuOpen,
  player,
  number,
  you,
  current,
  activeTurn,
  deadline,
  serverTime,
  round,
  startingLives,
  status,
  side,
}: {
  emoteMenuOpen: boolean;
  player: SeatPlayer;
  number: number;
  you: boolean;
  current: boolean;
  activeTurn: boolean;
  deadline: number;
  serverTime: number;
  round: number;
  startingLives: number;
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
        <div className="seat-profile relative flex min-w-0 max-w-full items-center gap-1.5">
          <div className="seat-bubble-slot pointer-events-none absolute bottom-[calc(100%+.375rem)] left-0 z-30 flex w-full items-end justify-center gap-1">
            <EmoteBubble emote={player.emote} serverTime={serverTime} name={player.name} />
            <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
          </div>
          <div className="seat-avatar-wrap relative shrink-0">
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
                "seat-avatar relative grid place-items-center rounded-full border-2 font-semibold",
                you
                  ? "size-9 text-lg @min-2xl/board:size-12 @min-2xl/board:text-2xl"
                  : "size-7 text-sm @min-2xl/board:size-10 @min-2xl/board:text-xl",
                player.lives <= 0
                  ? "border-transparent"
                  : "border-background bg-[hsl(var(--avatar-hue)_45%_84%)] text-[#493642] shadow-[0_0_0_1px_#6f4a5e12]",
              )}
              style={{ "--avatar-hue": avatarHue(player.id) } as CSSProperties}
              aria-hidden="true"
            >
              {player.lives > 0 && <span>{Array.from(player.name)[0]?.toLocaleUpperCase()}</span>}
              {player.lives <= 0 && (
                <span
                  key={round}
                  className="seat-elimination pointer-events-none absolute -inset-1.5 z-10 grid place-items-center animate-[seat-elimination_.8s_cubic-bezier(.2,.8,.2,1)_both]"
                >
                  <img
                    src="/skull.png"
                    alt=""
                    className="size-full object-contain drop-shadow-[0_2px_1px_#302a3026]"
                    draggable={false}
                  />
                </span>
              )}
            </div>
            <span
              className={cn(
                "seat-number absolute -top-1 -right-1 z-20 grid h-4 min-w-4 place-items-center rounded-full border bg-[#fff8fb] px-0.5 text-[9px] font-semibold sm:h-5 sm:min-w-5 sm:text-[10px]",
                current ? "border-primary text-primary" : "border-[#dcb8c9] text-[#653248]",
              )}
              aria-label={`Seat ${toRoman(number)}`}
            >
              {toRoman(number)}
            </span>
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
            <div
              className={cn(
                "seat-stats flex shrink-0 items-center gap-1",
                player.lives <= 0 && "invisible",
              )}
              aria-hidden={player.lives <= 0 || undefined}
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
      </div>
      {!you && (
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
                      "border border-[#fffaf6]",
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
