import type { ReactNode } from "react";
import { EMOTE_DURATION_MS } from "@/shared/emotes";

export function BubbleArtwork({ children, tail = false }: { children: ReactNode; tail?: boolean }) {
  const base = tail
    ? "M1.25 32.5Q1.25 43.75 12.5 43.75L10 52L23 43.75H47.5Q58.75 43.75 58.75 32.5"
    : "M1.25 32.5Q1.25 43.75 12.5 43.75H47.5Q58.75 43.75 58.75 32.5";
  const outline = `${base}V16.5Q58.75 5.25 47.5 5.25H12.5Q1.25 5.25 1.25 16.5Z`;
  return (
    <span className="emote-artwork relative block h-[45px] w-[60px] origin-bottom scale-90 shrink-0">
      <svg
        className="absolute inset-0 size-full overflow-visible"
        viewBox="0 0 60 45"
        aria-hidden="true"
      >
        <path
          d={outline}
          fill="#111111"
          stroke="#111111"
          strokeWidth="2.5"
          strokeLinejoin="round"
          transform="translate(0 2.5)"
        />
        <path d={outline} fill="white" stroke="#111111" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      {children}
      <svg
        className="absolute inset-0 size-full overflow-visible"
        viewBox="0 0 60 45"
        fill="none"
        aria-hidden="true"
      >
        <path d={base} stroke="#111111" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Bubble({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="seat-bubble pointer-events-none block origin-bottom shrink-0 overflow-visible pb-2.5 animate-[emote-bubble_ease-out_both]"
      style={{ animationDuration: `${EMOTE_DURATION_MS}ms` }}
    >
      <BubbleArtwork tail>{children}</BubbleArtwork>
    </span>
  );
}
