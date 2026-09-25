# Project guidelines

Use plain, direct language. Do not write code comments.

Keep documentation minimal: record decisions and constraints, not what the code
already shows.

Prefer simpler architecture over backward compatibility. Remove obsolete code,
schemas, data, and tests. Do not keep tests only to record past bugs.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing the UI, game
architecture, emote artwork, or animation; [TESTS.md](TESTS.md) before testing;
[PR.md](PR.md) before opening, updating, or merging a pull request.

Read [BOT.md](BOT.md) before changing the bot, training, or benchmarks.

After making changes, run `npm run lint` and fix all errors.
