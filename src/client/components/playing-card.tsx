import type { CSSProperties } from "react";

export function cardLabel(card: number) {
  const suits = ["Clubs", "Swords", "Cups", "Coins"];
  const rank = ((card - 1) % 10) + 1;
  const name =
    rank === 1
      ? "Ace"
      : rank === 8
        ? "Jack"
        : rank === 9
          ? "Knight"
          : rank === 10
            ? "King"
            : String(rank);
  return `${name} of ${suits[Math.floor((card - 1) / 10)]}`;
}

export function PlayingCard({
  card,
  small = false,
  onClick,
  disabled = false,
  mode,
  pending = false,
  delay = 0,
}: {
  card: number | null;
  small?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  mode?: string;
  pending?: boolean;
  delay?: number;
}) {
  const label = card
    ? `${cardLabel(card)}, ${card === 31 ? "lowest or highest" : `value ${card}`}`
    : "Hidden card";
  const style = {
    "--deal-delay": `${delay}ms`,
  } as CSSProperties;
  const content = (
    <>
      <span className="card-fallback" aria-hidden="true">
        {card === null ? "Hidden card" : cardLabel(card)}
      </span>
      <img
        key={card ?? "back"}
        className="card-art"
        src={`/cards/neapolitan/${card ?? "back"}.webp`}
        alt=""
        draggable={false}
        width={300}
        height={480}
        onError={(event) => {
          event.currentTarget.style.visibility = "hidden";
        }}
      />
      {mode && <span className="played-mode">{mode}</span>}
      {pending && <span className="card-pending" aria-hidden="true" />}
    </>
  );
  const className = `playing-card ${card === null ? "card-back" : ""} ${small ? "small" : ""} ${onClick ? "playable" : ""} ${pending ? "pending-card" : ""}`;
  return onClick ? (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={`Play ${label}`}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <div className={className} style={style} role="img" aria-label={label}>
      {content}
    </div>
  );
}
