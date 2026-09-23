import { Clock3 } from "lucide-react";
import { cn } from "../../utils";

/** A labelled countdown with a depleting bar; the round pause and invite notifications share it. */
export function Countdown({
  label,
  remaining,
  total,
  className,
  barClassName,
  textClassName,
}: {
  label: string;
  remaining: number;
  total: number;
  className?: string;
  barClassName?: string;
  textClassName?: string;
}) {
  return (
    <div className={className}>
      <p
        className={cn(
          "flex flex-wrap items-center gap-2 text-sm text-muted-foreground",
          textClassName,
        )}
      >
        <Clock3 className="size-4" aria-hidden="true" />
        {label} {Math.ceil(remaining / 1000)}s
      </p>
      <div
        className={cn("h-1.5 overflow-hidden rounded-full bg-primary/10", barClassName)}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${(Math.max(0, remaining) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
