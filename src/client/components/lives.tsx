import { Heart } from "lucide-react";
import { cn } from "../utils";

export function Lives({
  n,
  total = n,
  compact = false,
}: {
  n: number;
  total?: number;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "lives inline-flex shrink-0 flex-col items-center justify-center align-middle text-[#ca687c]",
        compact ? "min-h-[21px] w-8 gap-px" : "min-h-[27px] w-[42px] gap-[3px]",
      )}
      aria-label={`${n} ${n === 1 ? "life" : "lives"}${total > n ? `, ${total - n} lost` : ""}`}
    >
      {Array.from({ length: Math.ceil(total / 3) }, (_, row) => (
        <span className="lives-row flex justify-center gap-[inherit]" key={row} aria-hidden="true">
          {Array.from({ length: Math.min(3, total - row * 3) }, (_, heart) => (
            <Heart
              key={heart}
              size={compact ? 10 : 12}
              fill={row * 3 + heart < n ? "currentColor" : "none"}
            />
          ))}
        </span>
      ))}
    </span>
  );
}
