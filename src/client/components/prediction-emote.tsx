import { useEffect, useId, useRef, useState } from "react";
import { EMOTE_DURATION_MS } from "@/shared/emotes";
import { Bubble } from "./bubble";

const digits = [
  "M16 0C4 0 0 8 0 22S4 44 16 44S32 36 32 22S28 0 16 0ZM16 10C20 10 21 14 21 22S20 34 16 34S11 30 11 22S12 10 16 10Z",
  "M4 8L16 0H26V34H32V44H5V34H14V13L8 17Z",
  "M1 12C1 3 8 0 17 0C27 0 32 5 32 13C32 21 25 25 13 34H32V44H0V35C0 29 8 23 16 17C20 14 21 13 21 11C21 8 12 7 12 14Z",
  "M1 9C5 2 10 0 18 0C27 0 32 5 32 12C32 17 30 20 26 22C31 24 33 27 33 32C33 40 26 44 17 44C8 44 2 41 0 35L9 29C11 33 14 35 18 35C22 35 23 33 23 31C23 28 20 27 13 27V18C19 18 22 17 22 14C22 11 20 10 17 10C14 10 12 11 10 15Z",
  "M17 0H29V26H34V36H29V44H18V36H0V26ZM10 26H18V12Z",
  "M3 0H31V10H13L12 17C26 13 33 21 33 30C33 39 26 44 16 44C8 44 2 41 0 35L9 28C11 32 14 34 17 34C21 34 23 32 23 29C23 24 16 22 11 27L1 23Z",
  "M29 4L24 13C14 7 10 14 10 20C22 12 33 20 33 30C33 39 27 44 17 44C5 44 0 36 0 23C0 8 7 0 18 0C23 0 26 1 29 4ZM17 25C9 25 10 35 17 35S24 25 17 25Z",
];

export function PredictionEmote({ bid, name }: { bid: number | null; name: string }) {
  const gradient = useId();
  const previous = useRef(bid);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const changed = previous.current === null && bid !== null;
    previous.current = bid;
    if (!changed) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), EMOTE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [bid]);
  return visible && bid !== null ? (
    <Bubble label={`${name} predicts ${bid} ${bid === 1 ? "trick" : "tricks"}`}>
      <svg
        className="prediction-digit absolute bottom-1 left-1/2 h-14 w-12 -translate-x-1/2 overflow-visible"
        viewBox="0 0 48 56"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff6b0" />
            <stop offset="0.45" stopColor="#ffd34d" />
            <stop offset="1" stopColor="#f59818" />
          </linearGradient>
        </defs>
        <g transform="translate(7 4) rotate(-7 17 22)" fillRule="evenodd" strokeLinejoin="round">
          <path
            d={digits[bid]}
            transform="translate(1.5 4)"
            fill="#ad531a"
            stroke="#291b24"
            strokeWidth="4"
          />
          <path d={digits[bid]} fill={`url(#${gradient})`} stroke="#291b24" strokeWidth="4" />
          <path d={digits[bid]} fill="none" stroke="#fff0a2" strokeWidth="1" />
        </g>
      </svg>
    </Bubble>
  ) : null;
}
