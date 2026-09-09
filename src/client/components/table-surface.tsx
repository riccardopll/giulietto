import { useId } from "react";

// Mirrored shoulders with shallow recesses for the two center seats.
const contour =
  "M .02 .5 C .02 .20 .16 .025 .28 .025 C .38 .025 .40 .05 .5 .05 C .60 .05 .62 .025 .72 .025 C .84 .025 .98 .20 .98 .5 C .98 .80 .84 .975 .72 .975 C .62 .975 .60 .95 .5 .95 C .40 .95 .38 .975 .28 .975 C .16 .975 .02 .80 .02 .5 Z";

export function TableSurface() {
  const id = useId();
  const clip = `${id}-felt`;
  return (
    <div className="table-surface pointer-events-none absolute -z-1" aria-hidden="true">
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
        <path className="table-rail-edge" d={contour} vectorEffect="non-scaling-stroke" />
        <path className="table-rail" d={contour} vectorEffect="non-scaling-stroke" />
        <path className="table-rail-highlight" d={contour} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
