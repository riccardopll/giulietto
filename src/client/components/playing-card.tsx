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

function CardFace({ card }: { card: number | null }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <span
        className="card-fallback absolute inset-0 flex size-full flex-col items-center justify-center gap-1 p-0.5 text-center text-[10px] leading-3 text-foreground [overflow-wrap:anywhere]"
        aria-hidden="true"
        style={{ visibility: loaded ? "hidden" : "visible" }}
      >
        <span>{card === null ? "Hidden card" : cardLabel(card)}</span>
        {card !== null && (
          <span className="text-sm font-semibold">{card === 31 ? "0 / 41" : card}</span>
        )}
      </span>
      <img
        className="card-art pointer-events-none absolute inset-0 block size-full rounded-[inherit] object-contain"
        src={`/cards/neapolitan/${card ?? "back"}.webp`}
        alt=""
        draggable={false}
        width={300}
        height={480}
        style={{ visibility: loaded ? "visible" : "hidden" }}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
    </>
  );
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
  const aceMode = card === 31 && (mode === "low" || mode === "high") ? mode : undefined;
  const label = card
    ? `${cardLabel(card)}, ${card === 31 ? (aceMode ? `${aceMode}, value ${aceMode === "low" ? 0 : 41}` : "lowest or highest") : `value ${card}`}`
    : "Hidden card";
  const content = (
    <>
      <CardFace key={card ?? "back"} card={card} />
      {aceMode && (
        <span
          className={cn(
            "ace-mode pointer-events-none absolute inset-0 grid place-items-center text-center",
            aceMode === "low" ? "text-blue-600" : "text-orange-600",
          )}
          aria-hidden="true"
        >
          <span className="ace-stamp relative grid h-[56cqw] w-[84cqw] -rotate-6 place-items-center rounded-[50%] bg-[#fff8e7] p-[2cqw]">
            <span className="ace-stamp-ink absolute inset-[1cqw] rounded-[50%] border-[1.1cqw] border-current before:absolute before:inset-[1.2cqw] before:rounded-[50%] before:border-[0.5cqw] before:border-current" />
            <span className="ace-stamp-ink scale-x-[0.85] font-[AceStamp,Georgia,serif] text-[34cqw] leading-none tracking-[-0.04em]">
              {aceMode}
            </span>
          </span>
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
    "playing-card @container relative isolate block aspect-[5/8] w-full shrink-0 rounded-md border-0 bg-white p-0 shadow-[0_2px_3px_#1b294126,0_7px_14px_#1b29410d] select-none",
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
