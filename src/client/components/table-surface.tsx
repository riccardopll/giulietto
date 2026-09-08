import { useId } from "react";

// Mirrored shoulders with shallow recesses for the two center seats.
const contour =
  "M .02 .5 C .02 .2 .16 .02 .32 .02 C .40 .02 .43 .032 .5 .032 C .57 .032 .60 .02 .68 .02 C .84 .02 .98 .2 .98 .5 C .98 .8 .84 .98 .68 .98 C .60 .98 .57 .968 .5 .968 C .43 .968 .40 .98 .32 .98 C .16 .98 .02 .8 .02 .5 Z";

export function TableSurface() {
  const id = useId();
  const clip = `${id}-felt`;
  return (
    <div className="table-surface" aria-hidden="true">
      <div className="table-felt" style={{ clipPath: `url(#${clip})` }} />
      <svg className="table-contour" viewBox="0 0 1 1" preserveAspectRatio="none">
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
