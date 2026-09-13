import type { ComponentProps } from "react";

export function TrophyIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M6 3h12v5a6 6 0 0 1-5 5.92V18h3v3H8v-3h3v-4.08A6 6 0 0 1 6 8V3Z" />
      <path
        d="M6 5H3v2a5 5 0 0 0 5 5m10-7h3v2a5 5 0 0 1-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
