import { useState } from "react";
import { cardLabel, t } from "../i18n";
import { cn } from "../utils";

function CardFace({ card }: { card: number | null }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <span
        className={cn(
          "absolute inset-0 flex size-full flex-col items-center justify-center gap-1 p-0.5 text-center text-2xs leading-3 text-foreground [overflow-wrap:anywhere]",
          loaded && "invisible",
        )}
        aria-hidden="true"
      >
        {card === null ? (
          <span className="text-lg font-semibold">?</span>
        ) : (
          <>
            <span>{cardLabel(card)}</span>
            <span className="text-sm font-semibold">{card === 31 ? "0 / 41" : card}</span>
          </>
        )}
      </span>
      <img
        className={cn(
          "pointer-events-none absolute inset-0 block size-full rounded-[inherit] object-contain",
          !loaded && "invisible",
        )}
        src={`/cards/neapolitan/${card ?? "back"}.webp`}
        alt=""
        draggable={false}
        width={300}
        height={480}
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
    ? `${cardLabel(card)}, ${card === 31 ? (aceMode ? `${t.cards[aceMode]}, ${t.cards.value(aceMode === "low" ? 0 : 41)}` : t.cards.lowOrHigh) : t.cards.value(card)}`
    : t.cards.hidden;
  const content = (
    <>
      <CardFace key={card ?? "back"} card={card} />
      {aceMode && (
        <span
          className={cn(
            "pointer-events-none absolute inset-0 grid place-items-center text-center",
            aceMode === "low" ? "text-ace-low" : "text-ace-high",
          )}
          data-ace-mode
          aria-hidden="true"
        >
          <span className="ace-stamp relative grid h-[56cqw] w-[84cqw] -rotate-6 place-items-center rounded-[50%] bg-background p-[2cqw]">
            <span className="ace-stamp-ink absolute inset-[1cqw] rounded-[50%] border-[1.1cqw] border-current before:absolute before:inset-[1.2cqw] before:rounded-[50%] before:border-[0.5cqw] before:border-current" />
            <span className="ace-stamp-ink scale-x-[0.85] font-[AceStamp,Georgia,serif] text-[34cqw] leading-none tracking-[-0.04em]">
              {aceMode}
            </span>
          </span>
        </span>
      )}
      {pending && (
        <span
          className="absolute inset-0 animate-[pending-pulse_.8s_ease-in-out_infinite_alternate] rounded-[inherit] bg-primary/10"
          aria-hidden="true"
        />
      )}
    </>
  );
  const cardClassName = cn(
    "@container relative isolate block aspect-[5/8] w-full shrink-0 rounded-md border-0 bg-card p-0 shadow-[0_2px_3px,0_7px_14px] shadow-foreground/10 select-none",
    onClick &&
      "outline-2 outline-offset-2 outline-transparent transition-transform enabled:hover:-translate-y-1 enabled:hover:outline-ring disabled:cursor-default",
    pending && "outline-ring",
    className,
  );
  return onClick ? (
    <button
      type="button"
      className={cardClassName}
      data-playing-card
      aria-label={t.cards.play(label)}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  ) : (
    <div className={cardClassName} data-playing-card role="img" aria-label={label}>
      {content}
    </div>
  );
}
