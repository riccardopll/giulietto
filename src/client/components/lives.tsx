import { Heart } from "lucide-react";
import { cn } from "../utils";

export function Lives({ n }: { n: number }) {
  return (
    <span
      className="inline-flex min-h-[27px] w-[42px] shrink-0 flex-col items-center justify-center gap-[3px] align-middle text-destructive"
      aria-label={`${n} ${n === 1 ? "life" : "lives"}`}
    >
      {Array.from({ length: Math.ceil(n / 3) }, (_, row) => (
        <span className="flex justify-center gap-[inherit]" key={row} aria-hidden="true">
          {Array.from({ length: Math.min(3, n - row * 3) }, (_, heart) => (
            <Heart key={heart} size={12} fill="currentColor" />
          ))}
        </span>
      ))}
    </span>
  );
}

export function LifeCount({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-semibold tabular-nums",
        className,
      )}
      aria-label={`${n} ${n === 1 ? "life" : "lives"}`}
    >
      <Heart
        className="size-[1em] shrink-0 text-destructive"
        fill="currentColor"
        aria-hidden="true"
      />
      <span className="inline-block min-w-[1ch]">{n}</span>
    </span>
  );
}
