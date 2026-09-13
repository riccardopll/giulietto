import { cn } from "../../utils";

export function PlacementMedal({ place, className }: { place: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 80"
      className={cn(
        className,
        place === 1 ? "text-[#dfb64d]" : place === 2 ? "text-[#c6cbd1]" : "text-[#c68c65]",
      )}
    >
      <path d="M14 45 7 77 21 70 30 79 34 48M30 48 34 79 43 70 57 77 50 45" fill="#674653" />
      <circle cx="32" cy="31" r="29" fill="currentColor" />
      <circle
        cx="32"
        cy="31"
        r="23"
        fill="none"
        stroke="#302a30"
        strokeOpacity=".25"
        strokeWidth="2"
      />
      <text x="32" y="42" textAnchor="middle" fill="#302a30" className="text-[32px] font-bold">
        {place}
      </text>
    </svg>
  );
}
