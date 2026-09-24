import type { CSSProperties, ReactNode } from "react";
import { EMOTE_DURATION_MS } from "../../shared/emotes";
import { cn } from "../utils";

export type Side = "left" | "right";
type Tail = "bottom" | Side;

const BODY =
  "M12.5 5.25H47.5Q58.75 5.25 58.75 16.5V32.5Q58.75 43.75 47.5 43.75H12.5Q1.25 43.75 1.25 32.5V16.5Q1.25 5.25 12.5 5.25Z";
const BOTTOM_TAIL = "M13.6 40L10 52L28.9 40Z";
const SIDE_TAIL = "M1.25 32.5C1.25 39 -3 45 -11 49C0 46.5 10 44.5 26 43.75L26 36L8 32.5Z";

function bubbleArtwork(children: ReactNode, tail: Tail | undefined, className: string) {
  const shapes = tail ? [tail === "bottom" ? BOTTOM_TAIL : SIDE_TAIL, BODY] : [BODY];
  return (
    <span className={cn("relative block h-[45px] w-[60px] shrink-0", className)}>
      <svg
        className={cn(
          "absolute inset-0 size-full overflow-visible stroke-foreground",
          tail === "right" && "-scale-x-100",
        )}
        viewBox="0 0 60 45"
        strokeWidth="2.5"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <g className="fill-foreground" transform="translate(0 2.5)">
          {shapes.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g className="fill-card">
          {shapes.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
      {children}
    </span>
  );
}

export function MenuBubble({ children }: { children: ReactNode }) {
  return bubbleArtwork(children, undefined, "origin-bottom scale-90");
}

export function Bubble({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="pointer-events-none block origin-bottom shrink-0 overflow-visible pb-2.5 animate-[emote-bubble_var(--emote-duration)_ease-out_both]"
      style={{ "--emote-duration": `${EMOTE_DURATION_MS}ms` } as CSSProperties}
    >
      {bubbleArtwork(children, "bottom", "origin-bottom scale-90")}
    </span>
  );
}

export function SideBubble({
  children,
  label,
  side,
  top,
}: {
  children: ReactNode;
  label: string;
  side: Side;
  top: number;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "pointer-events-none absolute top-(--bubble-top) block h-[27px] w-[36px] animate-[reaction-slide_var(--emote-duration)_ease-out_both]",
        side === "left"
          ? "left-2 origin-left [--slide-from:-1]"
          : "right-2 origin-right [--slide-from:1]",
      )}
      style={
        { "--bubble-top": `${top}%`, "--emote-duration": `${EMOTE_DURATION_MS}ms` } as CSSProperties
      }
    >
      {bubbleArtwork(children, side, "absolute bottom-0 left-0 origin-bottom-left scale-[.6]")}
    </span>
  );
}
