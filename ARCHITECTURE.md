# Architecture

Design for mobile first. Only portrait layouts are supported. During play, keep
the table, hand, and controls within the viewport.

Keep table and seat geometry fixed across rounds, hand sizes, and player statuses.
Only notification bubbles may clip.

Use Tailwind for layout and component styles. Reserve shared CSS for theme tokens,
reusable utilities, paint, and animations.

Always play animations regardless of the system's reduced-motion preference.
Do not add reduced-motion overrides or gate animations behind `motion-safe`.
