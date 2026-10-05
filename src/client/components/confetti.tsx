import type { CSSProperties } from "react";
import { cn } from "../utils";

const colors = ["bg-primary", "bg-gold", "bg-felt", "bg-silver", "bg-bronze"];
const fraction = (n: number) => n - Math.floor(n);

export function Confetti({ pieces = 48 }: { pieces?: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const random = (salt: number) => fraction(Math.sin((i + 1) * salt) * 10000);
        return (
          <span
            key={i}
            className={cn(
              "absolute -top-4 left-(--x) h-3 w-1.5 animate-[confetti-fall_var(--duration)_cubic-bezier(.25,.6,.45,1)_var(--delay)_both] rounded-xs",
              colors[i % colors.length],
            )}
            style={
              {
                "--x": `${random(12.9898) * 100}%`,
                "--drift": `${(random(78.233) - 0.5) * 30}vw`,
                "--spin": `${(random(39.425) - 0.5) * 1440}deg`,
                "--delay": `${random(93.989) * 400}ms`,
                "--duration": `${1600 + random(17.137) * 900}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
