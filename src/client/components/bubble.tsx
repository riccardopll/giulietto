import type { ReactNode } from "react";
import { EMOTE_DURATION_MS } from "../../shared/emotes";
import { cn } from "../utils";

export type Side = "left" | "right";
type Tail = "bottom" | Side;

/** `front` artwork overlaps the bottom edge instead of sitting behind it. */
function bubbleArtwork(
  children: ReactNode,
  tail: Tail | undefined,
  className: string,
  front = false,
) {
  const bottom =
    tail === "bottom"
      ? "M1.25 32.5Q1.25 43.75 12.5 43.75L10 52L23 43.75H47.5Q58.75 43.75 58.75 32.5"
      : tail
        ? "M1.25 32.5C1.25 39 -3 45 -11 49C0 46.5 10 44.5 26 43.75H47.5Q58.75 43.75 58.75 32.5"
        : "M1.25 32.5Q1.25 43.75 12.5 43.75H47.5Q58.75 43.75 58.75 32.5";
  const outline = `${bottom}V16.5Q58.75 5.25 47.5 5.25H12.5Q1.25 5.25 1.25 16.5Z`;
  const svgClass = cn(
    "absolute inset-0 size-full overflow-visible",
    tail === "right" && "-scale-x-100",
  );
  return (
    <span className={cn("emote-artwork relative block h-[45px] w-[60px] shrink-0", className)}>
      <svg className={svgClass} viewBox="0 0 60 45" aria-hidden="true">
        <path
          d={outline}
          className="fill-foreground stroke-foreground"
          strokeWidth="2.5"
          strokeLinejoin="round"
          transform="translate(0 2.5)"
        />
        <path
          d={outline}
          className="fill-card stroke-foreground"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {front &&
          tail === "bottom" && (
            // Artwork resting on the edge needs a line under it where the tail opens.
            <path d="M12.5 43.75H23" className="stroke-foreground" strokeWidth="2.5" />
          )}
      </svg>
      {children}
      {tail &&
        !front && (
          // The tailed bottom edge is redrawn over the artwork so the emote sits inside the bubble.
          <svg className={svgClass} viewBox="0 0 60 45" fill="none" aria-hidden="true">
            <path
              d={bottom}
              className="stroke-foreground"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
    </span>
  );
}

export function MenuBubble({ children }: { children: ReactNode }) {
  return bubbleArtwork(children, undefined, "origin-bottom scale-90");
}

export function Bubble({
  children,
  label,
  front,
}: {
  children: ReactNode;
  label: string;
  front?: boolean;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className="seat-bubble pointer-events-none block origin-bottom shrink-0 overflow-visible pb-2.5 animate-[emote-bubble_ease-out_both]"
      style={{ animationDuration: `${EMOTE_DURATION_MS}ms` }}
    >
      {bubbleArtwork(children, "bottom", "origin-bottom scale-90", front)}
    </span>
  );
}

export function SideBubble({
  children,
  label,
  side,
  top,
  front,
}: {
  children: ReactNode;
  label: string;
  side: Side;
  front?: boolean;
  /** Resting height as a percentage of the rail. */
  top: number;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "side-bubble pointer-events-none absolute block h-[27px] w-[36px] animate-[reaction-slide_ease-out_both]",
        side === "left"
          ? "left-2 origin-left [--slide-from:-1]"
          : "right-2 origin-right [--slide-from:1]",
      )}
      style={{ top: `${top}%`, animationDuration: `${EMOTE_DURATION_MS}ms` }}
    >
      {bubbleArtwork(
        children,
        side,
        "absolute bottom-0 left-0 origin-bottom-left scale-[.6]",
        front,
      )}
    </span>
  );
}
