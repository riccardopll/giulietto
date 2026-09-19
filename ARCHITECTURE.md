# Architecture

Mobile first, portrait only. During play, keep the table, hand, and controls
within the viewport.

Keep table and seat geometry fixed across rounds, hand sizes, and player
statuses. Only notification bubbles may clip.

Use Tailwind for layout and component styles. Reserve shared CSS for theme
tokens, reusable utilities, paint, and animations. Every colour comes from the
token block in `src/client/globals.css`; add a token only when no existing one
is close.

Show all errors in the shared toast notifications, with retry actions inside the
notification. Errors must never shift the page or dialog layout.

Always play animations; ignore the reduced-motion preference.

Read player statistics and rankings from `player_stats`, never from history
scans. Update totals and `matches.stats_counted` in the same finalization batch
so a retry cannot count a match twice. Keep timing totals and sample counts
separate. Matches with bots do not contribute to player statistics or rankings.

Deploy workers before applying remote migrations. Worker changes must run against the
previous schema until migrations finish. This keeps old finalizers from restoring
bot-match totals after the statistics rebuild.

## Emotes

Keep thick outlines and readable silhouettes at the displayed size. Drawn
emotes should lean on the palette of `public/emotes/chicken.webp` and
`public/emotes/perso.webp`; imported artwork such as `public/emotes/goblin.webp`
keeps its own colours.

Active motion lasts about 1.5 seconds: entrance, reaction, still hold. No
continuous idle effects. Do not distort lettering.

Show alternatives at the displayed size and get user review before replacing
game assets.
