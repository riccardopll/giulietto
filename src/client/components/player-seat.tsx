import type { CSSProperties } from "react";
import type { view } from "../../shared/game.ts";
import { toRoman } from "../utils";
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
  position,
  you,
  current,
  round,
  startingLives,
  status,
}: {
  player: SeatPlayer;
  number: number;
  position: number;
  you: boolean;
  current: boolean;
  round: number;
  startingLives: number;
  status: string;
}) {
  const name = Array.from(player.name);
  const visibleName = name.length > 12 ? `${name.slice(0, 12).join("")}…` : player.name;
  const seatY = Math.cos(position * Math.PI * 2);
  return (
    <section
      data-seat={player.id}
      data-seat-edge={position === 0 ? "bottom" : position === 0.5 ? "top" : undefined}
      data-lower-side={position !== 0 && seatY > 0.001 ? true : undefined}
      data-bubble-side={you || position === 0.5 ? "left" : undefined}
      aria-label={`Seat ${toRoman(number)}: ${player.name}${you ? " (you)" : ""}. ${status}`}
      aria-current={current ? "true" : undefined}
      style={
        {
          "--seat-x": -Math.sin(position * Math.PI * 2),
          "--seat-y": seatY,
          "--mobile-seat-side": seatY > 0.001 ? 1 : -1,
          "--mobile-seat-arc": 1 - Math.abs(seatY),
        } as CSSProperties
      }
      className={`table-seat ${current ? "current-player" : ""} ${you ? "your-seat" : ""} ${player.lives <= 0 || player.left ? "eliminated" : ""}`}
    >
      <div className="seat-identity">
        <div className="seat-bubble-slot">
          <PredictionEmote key={`${round}-${player.id}`} bid={player.bid} name={player.name} />
        </div>
        <div className="seat-avatar-wrap">
          <div
            className="seat-avatar"
            style={{ "--avatar-hue": avatarHue(player.id) } as CSSProperties}
            aria-hidden="true"
          >
            {Array.from(player.name)[0]?.toLocaleUpperCase()}
          </div>
          <span className="seat-number" aria-label={`Seat ${toRoman(number)}`}>
            {toRoman(number)}
          </span>
        </div>
        <div className="seat-details">
          <strong className="seat-name" title={player.name} aria-label={you ? "You" : player.name}>
            {you ? "You" : visibleName}
          </strong>
          <div className="seat-stats">
            <Lives n={player.lives} total={startingLives} />
            <span
              className="player-score"
              aria-label={`${player.taken} tricks won, ${player.bid ?? "no"} predicted`}
            >
              {player.taken} / {player.bid ?? "–"}
            </span>
          </div>
          {(player.left || player.lives <= 0) && (
            <span className="seat-status">{player.left ? "Left" : "Out"}</span>
          )}
        </div>
      </div>
      {!you && (
        <div
          className="seat-hand"
          role="group"
          aria-label={`${player.name}: ${player.hand.length} ${player.hand.length === 1 ? "card" : "cards"}`}
        >
          {player.hand.map((card, i) => {
            const offset = i - (player.hand.length - 1) / 2;
            return (
              <div
                className="seat-fan-card"
                key={card ?? i}
                style={
                  {
                    "--fan-offset": offset,
                    "--fan-angle": `${offset * 7}deg`,
                  } as CSSProperties
                }
              >
                <PlayingCard card={card} small />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
