# Architecture

Design for mobile first. Only portrait layouts are supported. During play, keep
the table, hand, and controls within the viewport.

Keep table and seat geometry fixed across rounds, hand sizes, and player statuses.
Only notification bubbles may clip.

Use Tailwind for layout and component styles. Reserve shared CSS for theme tokens,
reusable utilities, paint, and animations.

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
