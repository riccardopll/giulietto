import { useEffect, useId, useRef, useState } from "react";
import { EMOTE_DURATION_MS } from "../../shared/emotes";
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

const depth = { x: 1.5, y: 4 };
const layers = [1, 0.75, 0.5, 0.25];

export function PredictionEmote({ bid, name }: { bid: number | null; name: string }) {
  const id = useId();
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
  if (!visible || bid === null) return null;
  const digit = digits[bid];
  const offset = (step: number) => `translate(${depth.x * step} ${depth.y * step})`;
  return (
    <Bubble label={`${name} predicts ${bid} ${bid === 1 ? "trick" : "tricks"}`}>
      <svg
        className="prediction-digit absolute bottom-1 left-1/2 h-[50px] w-12 origin-bottom -translate-x-1/2 overflow-visible animate-[digit-pop_.55s_cubic-bezier(.2,.8,.2,1)_both]"
        viewBox="0 0 48 56"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${id}-face`} x1=".15" y1="0" x2=".55" y2="1">
            <stop
              offset="0"
              style={{ stopColor: "color-mix(in oklab, var(--color-gold), var(--color-card) 60%)" }}
            />
            <stop offset=".4" style={{ stopColor: "var(--color-gold)" }} />
            <stop
              offset="1"
              style={{
                stopColor: "color-mix(in oklab, var(--color-gold), var(--color-bronze) 70%)",
              }}
            />
          </linearGradient>
          <clipPath id={`${id}-face-clip`} clipRule="evenodd">
            <path d={digit} />
          </clipPath>
        </defs>
        <g
          transform="translate(7 4) rotate(-7 17 22) translate(17 22) scale(.9) translate(-17 -22)"
          fillRule="evenodd"
          strokeLinejoin="round"
        >
          {[...layers, 0].map((step) => (
            <path
              key={`outline-${step}`}
              d={digit}
              transform={offset(step)}
              className="fill-foreground stroke-foreground"
              strokeWidth="5"
            />
          ))}
          {layers.map((step) => (
            <path
              key={`side-${step}`}
              d={digit}
              transform={offset(step)}
              style={{
                fill: "color-mix(in oklab, var(--color-bronze), var(--color-foreground) 45%)",
              }}
            />
          ))}
          <path
            d={digit}
            fill={`url(#${id}-face)`}
            className="stroke-foreground"
            strokeWidth="1.5"
          />
          <g clipPath={`url(#${id}-face-clip)`} className="fill-card" opacity=".85">
            <ellipse cx="9" cy="8" rx="4.5" ry="2.5" transform="rotate(-25 9 8)" />
            <ellipse cx="25" cy="5.5" rx="2.5" ry="1.6" transform="rotate(-25 25 5.5)" />
          </g>
        </g>
      </svg>
    </Bubble>
  );
}
