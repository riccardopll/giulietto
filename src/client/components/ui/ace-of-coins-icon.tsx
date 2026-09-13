import type { SVGProps } from "react";

// The double-headed eagle surrounding the coin on the Neapolitan ace.
export function AceOfCoinsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="16" cy="17" r="7.5" />
      <path d="M13 10 11 6 7 5 4 5.5 6 3 10 2.5 14 5 16 9.5 18 5 22 2.5 26 3 28 5.5 25 5 21 6 19 10" />
      <path d="M9 12C5 6 2 8 3 14L5 22 9 25M23 12C27 6 30 8 29 14L27 22 23 25M5 12 7 16M4.5 17 7.5 20M27 12 25 16M27.5 17 24.5 20M11 23 8 28 5 30M21 23 24 28 27 30M13 24 11 29M19 24 21 29" />
    </svg>
  );
}
