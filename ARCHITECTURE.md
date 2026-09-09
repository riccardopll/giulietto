# Architecture

React and TypeScript render the client. Tailwind handles layout and component
styles; Radix supplies accessible dialogs. The shared game engine owns rules and
player views. Cloudflare Durable Objects own live matches; D1 stores history.

Design for mobile first. During play, keep the table, hand, and controls within
the viewport.

- The board owns one viewport grid. Reserve the same identity, opponent-hand,
  play, and local-hand tracks throughout a match. Empty hands, revealed cards,
  eliminated players, and round changes replace content without resizing the table.
- Let available width and height choose the layout. Short landscape screens place
  the local hand beside the table. Cap the desktop board and align it below the
  header; notifications must not consume spare page height.
- Keep layout in Tailwind. Use shared CSS only for theme tokens, reusable utilities,
  paint, and keyframes. Keep sizing calculations with the container that owns the
  space; avoid state-specific overrides and overlapping positioning systems.
- Cards keep their 5:8 ratio, names wrap, and controls have 44px touch targets.
  Only notification bubbles may clip during play. Do not hide layout overflow.
- Preview uses the real game engine and public URL controls. Validate rendered
  geometry, interactions, and responsive boundaries in Chromium and WebKit.
  Assertions must fail when required elements are missing.
  Follow [TESTS.md](TESTS.md), including the layout sweep after layout changes.

Remove unused abstractions and compatibility paths. Keep applied migrations and
stored match history.
