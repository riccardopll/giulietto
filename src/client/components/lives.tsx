import { Heart } from "lucide-react";

export function Lives({ n, total = n }: { n: number; total?: number }) {
  return (
    <span
      className="lives"
      aria-label={`${n} ${n === 1 ? "life" : "lives"}${total > n ? `, ${total - n} lost` : ""}`}
    >
      {Array.from({ length: Math.ceil(total / 3) }, (_, row) => (
        <span className="lives-row" key={row} aria-hidden="true">
          {Array.from({ length: Math.min(3, total - row * 3) }, (_, heart) => (
            <Heart key={heart} size={14} fill={row * 3 + heart < n ? "currentColor" : "none"} />
          ))}
        </span>
      ))}
    </span>
  );
}
