import { useId } from "react";

// Mirrored shoulders with shallow recesses for the two center seats.
const contour =
  "M .02 .5 C .02 .2 .16 .02 .32 .02 C .40 .02 .43 .055 .5 .055 C .57 .055 .60 .02 .68 .02 C .84 .02 .98 .2 .98 .5 C .98 .8 .84 .98 .68 .98 C .60 .98 .57 .945 .5 .945 C .43 .945 .40 .98 .32 .98 C .16 .98 .02 .8 .02 .5 Z";

export function TableSurface() {
  const id = useId();
  const clip = `${id}-felt`;
  const rail = `${id}-rail`;
  return (
    <div className="table-surface" aria-hidden="true">
      <div className="table-felt" style={{ clipPath: `url(#${clip})` }} />
      <svg className="table-contour" viewBox="0 0 1 1" preserveAspectRatio="none">
        <defs>
          <clipPath id={clip} clipPathUnits="objectBoundingBox">
            <path d={contour} />
          </clipPath>
          <linearGradient id={rail} x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="#f4d3dc" />
            <stop offset="0.45" stopColor="#d09aa9" />
            <stop offset="1" stopColor="#b7798c" />
          </linearGradient>
        </defs>
        <path className="table-rail-edge" d={contour} vectorEffect="non-scaling-stroke" />
        <path
          className="table-rail"
          d={contour}
          stroke={`url(#${rail})`}
          vectorEffect="non-scaling-stroke"
        />
        <path className="table-rail-highlight" d={contour} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
