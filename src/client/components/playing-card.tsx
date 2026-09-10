import { useState } from "react";
import { cn } from "../utils";

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
  className,
  onClick,
  disabled = false,
  mode,
  pending = false,
}: {
  card: number | null;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  mode?: string;
  pending?: boolean;
}) {
  const [failedCard, setFailedCard] = useState<number | null | undefined>(undefined);
  const label = card
    ? `${cardLabel(card)}, ${card === 31 ? "lowest or highest" : `value ${card}`}`
    : "Hidden card";
  const content = (
    <>
      <span
        className={cn(
          "card-fallback absolute inset-0 flex size-full items-center justify-center p-0.5 text-center text-[10px] leading-3 text-foreground [overflow-wrap:anywhere]",
          mode && "pb-6",
        )}
        aria-hidden="true"
        style={{ visibility: failedCard === card ? "visible" : "hidden" }}
      >
        {card === null ? "Hidden card" : cardLabel(card)}
      </span>
      <img
        key={card ?? "back"}
        className="card-art pointer-events-none absolute inset-0 block size-full rounded-[inherit] object-contain"
        src={`/cards/neapolitan/${card ?? "back"}.webp`}
        alt=""
        draggable={false}
        width={300}
        height={480}
        onError={(event) => {
          setFailedCard(card);
          event.currentTarget.style.visibility = "hidden";
        }}
      />
      {mode && (
        <span className="played-mode absolute bottom-[.35rem] left-1/2 -translate-x-1/2 rounded-full bg-[#202b45eb] px-2 py-0.5 text-xs text-white capitalize">
          {mode}
        </span>
      )}
      {pending && (
        <span
          className="card-pending absolute inset-0 animate-[pending-pulse_.8s_ease-in-out_infinite_alternate] rounded-[inherit] bg-primary/10"
          aria-hidden="true"
        />
      )}
    </>
  );
  const cardClassName = cn(
    "playing-card relative isolate block aspect-[5/8] w-full shrink-0 rounded-md border-0 bg-white p-0 shadow-[0_2px_3px_#1b294126,0_7px_14px_#1b29410d] select-none",
    onClick &&
      "outline-2 outline-offset-2 outline-transparent transition-transform enabled:hover:-translate-y-1 enabled:hover:outline-ring disabled:cursor-default",
    { playable: !!onClick, "pending-card outline-ring": pending },
    className,
  );
  return onClick ? (
    <button
      type="button"
      className={cardClassName}
      aria-label={`Play ${label}`}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <div className={cardClassName} role="img" aria-label={label}>
      {content}
    </div>
  );
}
