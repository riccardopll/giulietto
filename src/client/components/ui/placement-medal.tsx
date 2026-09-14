import { cn } from "../../utils";

export function PlacementMedal({ place, className }: { place: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 80"
      className={cn(
        className,
        place === 1 ? "text-gold" : place === 2 ? "text-silver" : "text-bronze",
      )}
    >
      <path
        d="M14 45 7 77 21 70 30 79 34 48M30 48 34 79 43 70 57 77 50 45"
        className="fill-secondary-foreground"
      />
      <circle cx="32" cy="31" r="29" fill="currentColor" />
      <circle
        cx="32"
        cy="31"
        r="23"
        fill="none"
        className="stroke-foreground"
        strokeOpacity=".25"
        strokeWidth="2"
      />
      <text x="32" y="42" textAnchor="middle" className="fill-foreground text-[32px] font-bold">
        {place}
      </text>
    </svg>
  );
}
