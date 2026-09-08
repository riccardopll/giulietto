import { Heart } from "lucide-react";

export function Lives({ n }: { n: number }) {
  return (
    <span className="lives" aria-label={`${n} ${n === 1 ? "life" : "lives"}`}>
      {Array.from({ length: Math.ceil(n / 3) }, (_, row) => (
        <span className="lives-row" key={row} aria-hidden="true">
          {Array.from({ length: Math.min(3, n - row * 3) }, (_, heart) => (
            <Heart key={heart} size={14} fill="currentColor" />
          ))}
        </span>
      ))}
    </span>
  );
}
