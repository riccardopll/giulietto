# Testing

After visual changes, open `/preview` locally for the user to review. Check mobile
first, then larger screens, varying player counts, cards, and game phases.

Run `npm run check` for lint, formatting, TypeScript, unit/integration tests, and
the production build. Run `npm run test:ui` for browser checks in Chromium and
WebKit. The browser suite starts the local preview server when needed.

After layout changes, also run `npm run test:layout`. Its 162,016 rendered
configurations cover these finite dimensions in both browsers:

- Rounds: 2–6 players, 1–6 dealt cards, every completed-trick count, and every
  bidding and played-card prefix, at eight phone, tablet, and desktop sizes.
- Identities: every viewer, 1–5 starting lives, short and maximum-length Latin/CJK
  names, and normal/blind rounds, at the same eight sizes.
- Seats: all 4,692 valid arrangements of active, eliminated, departed, and
  departing players, with a full normal trick and every blind-round play prefix,
  in portrait, short landscape, and desktop layouts.

The sweep exhausts each listed dimension; it does not multiply every dimension
together or enumerate card shuffles, arbitrary names, and continuous viewport
sizes. Cards share one frame. Separate browser checks exercise responsive
thresholds on both sides, viewport resizing, later round labels, results and
game-over panels, notifications, keyboard controls, and reduced motion.

Geometry checks assert stable table/seat positions, visible cards and text,
reachable controls, containment within the curved felt, and no unintended overlap
or page overflow. Required elements must exist for their checks to pass. Only
notification bubbles may clip. Inspect screenshots as well; geometry alone does
not establish visual quality. Failures retain the fixture and screenshot.

To rerun one sweep, use
`LAYOUT_SWEEP=rounds npm run test:ui -- tests/browser/layout.spec.ts --grep sweep`,
replacing `rounds` with `identities` or `seats` as needed. CI runs the regular suite;
the larger sweep is an explicit layout check.

In live test matches, name automated players `bot_1` through `bot_6`, consecutively
from 1.

Keep completed live test matches, events, players, and player stats in D1 unless
the user explicitly asks to delete them.
