# Testing

`npm run check` requires Node only, as does CI.

For training changes, install uv and run
`uv run --directory training --frozen poe check` and `npm run test:parity` locally.
The parity command generates ignored fixtures in `tests/parity/.generated/`, then
checks Python/TypeScript rules, encoding, and inference. Run it after changing
shared rules, bot encoding, or release weights; do not commit the fixtures.

Run UI tests locally after changes to player flows, layout, or the UI tests
themselves. After layout changes, inspect the screenshots and open `/preview`
for the user to review.

UI coverage is one complete three-player game, entry retries, reload and resume
during play, profile editing with error recovery, and one dense mobile layout
check. Rules and event generation belong in unit
tests; API, WebSocket, and persistence behavior in integration tests. Do not
add preview permutations.

Integration tests run inside the Workers runtime through
`@cloudflare/vitest-pool-workers`. Reach the worker with `SELF` and bindings with
`env` from `cloudflare:test`; storage resets before each test.

Name automated players in live test matches `bot_1` through `bot_6`.

Keep completed live test matches, events, players, and player stats in D1
unless the user asks to delete them.
