# Giulietto source export

Full tracked source from commit 229e3f4977b59aa70fae0c95e708d41f1eca7910, matching the latest published version. No overload-mitigation changes are included.

## Contents

Frontend, game engine, Worker API, database schema and migrations, tests, build configuration, dependency lockfile, all 40 Neapolitan card images and card back, font, and asset licenses.

This is source code, not a database backup. Live player/match records, credentials, installed dependencies, build output and local test databases are not included.

## Running and hosting

- Requires Node.js 22.13 or newer and npm.
- Install dependencies with `npm ci`.
- The app uses Vinext/Vite with Cloudflare Workers and a D1 binding named `DB`.
- `vite.config.ts` currently contains a placeholder D1 database ID for local development. Configure your own Cloudflare database and deployment settings before deploying.
- The `.openai/hosting.json` file records the original Sites project. It is not a credential and does not provision your own hosting.
- `npm run dev` starts the local Vite server. Apply the SQL migrations to your local D1 database before playing.
- `npx vinext build` builds without the original environment's GNU `timeout` wrapper. `npm run build` uses that wrapper and requires GNU `timeout`.
- Apply `drizzle/0000_common_lilandra.sql`, then `drizzle/0001_early_wonder_man.sql` to a NEW database. The second migration includes the previously requested deletion of old rooms; do not apply it to existing game data you want to retain.
- Game/API tests: `node --test tests/game.test.mjs tests/api.test.mjs`.

The original source is preserved unchanged. Hosting on a new account has not been configured or tested in this export. The reported D1 overload issue remains unresolved.
