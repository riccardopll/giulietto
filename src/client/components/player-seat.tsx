import type { CSSProperties } from "react";
import type { view } from "../../shared/game.ts";
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
  next,
  round,
  status,
}: {
  player: SeatPlayer;
  number: number;
  you: boolean;
  current: boolean;
  next: boolean;
  round: number;
  status: string;
}) {
  return (
    <section
      data-seat={player.id}
      aria-label={`Seat ${number}: ${player.name}${you ? " (you)" : ""}. ${status}`}
      aria-current={current ? "true" : undefined}
      className={`table-seat table-seat-${number} ${current ? "current-player" : ""} ${you ? "your-seat" : ""} ${player.lives <= 0 || player.left ? "eliminated" : ""}`}
    >
      <div className="seat-identity">
        <div className="seat-bubble-slot">
          <PredictionEmote
            key={`${round}-${player.id}`}
            bid={player.bid}
            name={player.name}
            next={next}
          />
        </div>
        <div className="seat-avatar-wrap">
          <div
            className="seat-avatar"
            style={{ "--avatar-hue": avatarHue(player.id) } as CSSProperties}
            aria-hidden="true"
          >
            {Array.from(player.name)[0]?.toLocaleUpperCase()}
          </div>
          <span className="seat-number" aria-label={`Seat ${number}`}>
            {number}
          </span>
        </div>
        <strong className="seat-name" title={player.name}>
          {you ? "You" : player.name}
        </strong>
        <Lives n={player.lives} />
        <span
          className="player-score"
          aria-label={`${player.taken} tricks won, ${player.bid ?? "no"} predicted`}
        >
          {player.taken} / {player.bid ?? "–"}
        </span>
        {(player.left || player.lives <= 0) && (
          <span className="seat-status">{player.left ? "Left" : "Out"}</span>
        )}
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
                    "--fan-rise": `${Math.abs(offset) * 2}px`,
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
