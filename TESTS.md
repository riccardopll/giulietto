# Testing

Run full layout sweeps (`npm run test:layout`) only when explicitly requested,
never in CI.

After layout changes, inspect screenshots and open `/preview` locally for the user
to review.

In live test matches, name automated players `bot_1` through `bot_6`, consecutively
from 1.

Keep completed live test matches, events, players, and player stats in D1 unless
the user explicitly asks to delete them.
