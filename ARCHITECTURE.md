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
level = 1 + floor(XP / 100), with no maximum. All-time leaderboards show the top
20 by XP or wins, then the other score, then player ID for stable ties. History
outbox delivery can briefly delay stats; no separate counters or backfill are needed.
