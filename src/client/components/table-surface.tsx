import { useId } from "react";

// Mirrored shoulders with shallow recesses for the two center seats.
const contour =
  "M .02 .5 C .02 .20 .16 .025 .28 .025 C .38 .025 .40 .05 .5 .05 C .60 .05 .62 .025 .72 .025 C .84 .025 .98 .20 .98 .5 C .98 .80 .84 .975 .72 .975 C .62 .975 .60 .95 .5 .95 C .40 .95 .38 .975 .28 .975 C .16 .975 .02 .80 .02 .5 Z";

export function TableSurface() {
  const id = useId();
  const clip = `${id}-felt`;
  return (
    <div
      className="table-surface pointer-events-none relative -z-1 col-span-full row-start-2 row-end-5 drop-shadow-[0_4px_6px] drop-shadow-foreground/30"
      aria-hidden="true"
    >
      <div
        className="table-felt absolute inset-0 size-full"
        style={{ clipPath: `url(#${clip})` }}
      />
      <svg
        className="table-contour absolute inset-0 size-full overflow-visible fill-none"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <defs>
          <clipPath id={clip} clipPathUnits="objectBoundingBox">
            <path d={contour} />
          </clipPath>
        </defs>
        <path
          className="stroke-secondary-foreground stroke-[6]"
          d={contour}
          vectorEffect="non-scaling-stroke"
        />
        <path className="stroke-felt stroke-[4]" d={contour} vectorEffect="non-scaling-stroke" />
        <path
          className="stroke-accent/50 stroke-[1.5]"
          d={contour}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
