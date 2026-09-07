# Giulietto

A free, anonymous multiplayer card game for 2–6 players. Create a private table and share its invite link, or join public matchmaking. Public tables start 20 seconds after a second player joins; the host may start sooner.

## Rules

- Fixed card order: Clubs, Swords, Cups, Coins, weakest to strongest. Within each suit: Ace, 2–7, Jack, Knight, King. Cards use values 1–40.
- The Ace of Coins is exceptional: its player chooses lowest (0) or highest (41) before playing.
- Deal 6, 5, 4, 3, 2, then 1 card per player. Repeat this cycle until only one player remains.
- Players predict tricks in order. The last prediction must not make the sum equal the number of tricks available that round.
- Any card may be played. Highest wins, and the trick winner leads next.
- Players begin with 3 lives. Lose the absolute difference between predicted and actual tricks.
- At zero lives, a player watches. If no one has lives after scoring a round, every player returns with 1 life, including those eliminated earlier. Players who deliberately left have forfeited and do not return.
- In the one-card round, you see other active players' cards, but cannot see your own until played. Everyone chooses high/low before playing the hidden card so the interface does not reveal whether it is the special ace.
- First bidder and initial leader rotate each round. Turns expire after 40 seconds: lowest legal prediction, or the first card (ace high). Round results display for 12 seconds. Tables expire after 24 hours of inactivity.

## Implementation

Vinext/React frontend and a Cloudflare Worker API with D1 storage. Room state is server-owned, and optimistic version checks prevent lost updates. Clients poll every 1.5 seconds. Anonymous credentials stay in browser storage; the server stores a SHA-256 digest, never the credential. Reopening in the same browser restores the seat. Other hands are removed from API responses, including your own hand during the blind round.

The supported deployment binding is `DB`; `.openai/hosting.json` declares it. Drizzle migrations are packaged with the app. No external authentication service or paid client subscription is required.

## Development and verification

Use the Sites installation/build helpers for this checkout. Generate schema migrations with `npm run db:generate`.

- `node --test tests/game.test.mjs`: game rules, visibility, revival, repeated full games.
- `node --test tests/api.test.mjs`: request handlers with an in-memory SQLite D1 adapter; simultaneous joins, permissions, matchmaking and blind-card play. These tests do not exercise the deployed Cloudflare runtime.
- `./node_modules/.bin/tsc --noEmit`: TypeScript checks.

Browser layout checks cover 320, 390, 480, 768, and 1280 pixel frames, plus 200% text on narrow screens. The minimal start screen, private lobby, six-player game, blind-card choice, and results were checked with local test data. Private lobby creation and blind-card play were exercised through the UI. These are Chromium viewport checks, not physical-device or Safari tests.

## Stored data

There are four application tables:

- `rooms`: current lobby and game state.
- `players`: guest identity and display name.
- `matches`: start/end time, participants count, winner and status.
- `match_results`: one row per player per match, with outcome, lives, rounds played, tricks won and prediction accuracy.

Match history is updated with room state in a single transaction. The match/player primary key prevents duplicate results, and completed results stay unchanged. Guest identities remain tied to browser storage. The migration adding these tables clears previous lobby data, as requested; tracking starts fresh.

## Card artwork

Authentic Neapolitan card scans by Despues, Wikimedia Commons, CC BY-SA 3.0. Faces were cropped, resized and converted to WebP; these adaptations retain the same license. The card back by Trocche100 is public domain. Full credits, source links and the card mapping are included in `public/cards/neapolitan/ATTRIBUTION.txt` and `manifest.json`.

The table uses a mobile-first neutral layout with mulberry accents with opponents above, the trick in the center, and your hand below. Dealing, playing and trick collection use brief animations and honor reduced-motion preferences. Card movement uses the browser View Transition API where available, with CSS entry animations as a fallback.

The Pacifico wordmark font is self-hosted and subset to the site name; its SIL Open Font License is included in `public/fonts`. Errors use top-center Sonner toasts that dismiss after 4.5 seconds without affecting document layout. New opponent predictions display a brief animated number bubble (including zero bids). Browser Back opens the same leave confirmation as the table control; cancelling keeps the seat, and confirming calls the leave endpoint before returning to the dashboard. Browser checks use Chromium; native iOS Safari gestures require device verification.
