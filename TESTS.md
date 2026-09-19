# Testing

Install Node and uv. `npm run check` and the unit-test commands generate Python
parity fixtures in `tests/unit/.generated/`; do not commit these files.
Run `uv run --directory training --frozen poe check` for the training tests.

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
