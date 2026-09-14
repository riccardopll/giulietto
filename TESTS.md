# Testing

Run UI tests locally after changes to player flows, layout, or the UI tests
themselves. After layout changes, inspect the screenshots and open `/preview`
for the user to review.

UI coverage is one complete three-player game, reload and resume during play,
and one dense mobile layout check. Rules and event generation belong in unit
tests; API, WebSocket, and persistence behavior in integration tests. Do not
add preview permutations.

Integration tests run inside the Workers runtime through
`@cloudflare/vitest-pool-workers`. Reach the worker with `SELF` and bindings with
`env` from `cloudflare:test`; storage resets before each test.

Name automated players in live test matches `bot_1` through `bot_6`.

Keep completed live test matches, events, players, and player stats in D1
unless the user asks to delete them.
