import { Clock3 } from "lucide-react";
import { cn } from "../../utils";

export function Countdown({
  label,
  remaining,
  className,
}: {
  label: string;
  remaining: number;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Clock3 className="size-4" aria-hidden="true" />
      {label} {Math.ceil(remaining / 1000)}s
    </p>
  );
}

export function CountdownBar({
  remaining,
  total,
  className,
}: {
  remaining: number;
  total: number;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-primary/10", className)}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full bg-primary/60"
        style={{ width: `${(Math.max(0, remaining) / total) * 100}%` }}
      />
    </div>
  );
}
