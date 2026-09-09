# Testing

After implementing a visual change requested by the user, open `/preview` on the
local development server to check the layout and let the user review it.

Check responsive changes in `/preview` at small and large phone sizes (320×568,
390×844), phone landscape (844×390), tablet (768×1024), and desktop (1366×768,
1920×1080). Cover 2–6 players, 1–6 cards each, and empty, partial, and complete
tricks. Include bidding, trick winners, round results, blind rounds, long names,
and inactive spectators. During play, the header, players, hand, and actions must
fit within the viewport without horizontal scrolling or clipped controls.

The Preview settings button in the header opens scenario controls without changing
the game layout. Scenarios can also be opened directly using query parameters:
`/preview?people=6&cards=6&phase=playing&played=3&viewer=0&longNames=1&inactive=none`.
`people` accepts 2–6, `cards` accepts 1–6, and `played` accepts 0 through the active
player count. A complete trick enters the trick-winner phase. `phase` accepts
`playing`, `bidding`, `trick`, `results`, or `blind`; `viewer` is a zero-based seat
index. `inactive=eliminated` or `inactive=left` makes the last seat inactive in
games with at least three players. Use that seat as the viewer to check spectator
layout and hidden cards.

Run `npm run check` for static checks, unit/integration tests, and the production build.
For responsive layout and browser interaction tests, install the test browsers with
`npx playwright install chromium webkit`, then run `npm run test:ui`. The suite
starts a local server on port 5174 and checks Chromium and WebKit. Failure
screenshots and traces are written to `test-results/`.

For live test matches, name automated players `bot_1` through `bot_6`, using
consecutive numbers starting at 1 for the number of players in the match.
For example, a five-player match uses `bot_1`, `bot_2`, `bot_3`, `bot_4`, and `bot_5`.

Keep completed live test matches, events, players, and player stats in D1 unless
the user explicitly asks to delete them. The `bot_` prefix identifies test players.
