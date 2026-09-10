# Testing

Run unit, integration, and UI tests in CI before deployment. Run UI tests locally
after changes to player flows, layout, or the UI tests.

Keep UI coverage to a complete three-player game, reload/resume during play, and
one dense mobile layout check. Test rule combinations and event generation in unit
tests; test API, WebSocket, and persistence behavior in integration tests. Avoid
exhaustive preview permutations and coverage for removed features.

After layout changes, inspect screenshots and open `/preview` locally for the user
to review.

In live test matches, name automated players `bot_1` through `bot_6`, consecutively
from 1.

Keep completed live test matches, events, players, and player stats in D1 unless
the user explicitly asks to delete them.
