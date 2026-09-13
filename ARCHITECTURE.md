# Architecture

Design for mobile first. Only portrait layouts are supported. During play, keep
the table, hand, and controls within the viewport.

Keep table and seat geometry fixed across rounds, hand sizes, and player statuses.
Only notification bubbles may clip.

Use Tailwind for layout and component styles. Reserve shared CSS for theme tokens,
reusable utilities, paint, and animations.

Player stats aggregate finalized won/lost match results in D1 for the existing
hashed guest identity. Active and abandoned matches and spectators do not count.
Public and private matches count equally. XP = 10 × matches + 20 × wins;
level = 1 + floor(XP / 100), with no maximum. The all-time leaderboard shows the top
20 by wins, then XP, then player ID for stable ties. History
outbox delivery can briefly delay stats; no separate counters or backfill are needed.

Names and avatar choices live in D1 players and load when joining a table. Profile
edits apply to future joins; lobby renames also update D1. History delivery only
updates last-seen time for existing players, so old matches cannot undo edits.

Always play animations regardless of the system's reduced-motion preference.
Do not add reduced-motion overrides or gate animations behind `motion-safe`.

## Emotes

Match the cartoon style of `public/emotes/chicken.webp` and
`public/emotes/perso.webp`: berry pink, dark plum shadows, cream highlights, and
thick outlines. Use readable silhouettes and connected cursive lettering over a
white, dark-outlined speech bubble. Keep the tail visible and check legibility at
the displayed size.

Keep active motion around 1.5 seconds, with an entrance, reaction, and still hold.
Use short drops, staggered reveals, squash, and damped wobble without distorting
lettering. Keep bubble recoil and impact accents brief; avoid continuous idle
effects.

Present alternatives together with replay, slow motion, scrubbing, and previews
at the displayed size. Get user review before exporting or replacing game assets.
