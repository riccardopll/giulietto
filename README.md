# Giulietto

Multiplayer Giulietto with private lobbies, public matchmaking, two to six players, turn timers, and persistent match history.

React runs in the browser. A Cloudflare Worker handles `/api/game`; D1 stores room state, anonymous player profiles, matches, and results. Card images and fonts are included with their licenses in `public/`.

## Local development

```sh
fnm install
fnm use
npm ci
npm run db:migrate:local
npm run dev
```

Node is pinned in `.node-version` and `package.json`. Vite serves the UI and runs the API in Cloudflare's local Workers runtime. The local D1 database is separate from production.

```sh
npm run check        # Oxlint, Oxfmt, TypeScript, tests, production build
npm run fmt          # Format source
npm run preview      # Serve the production build locally
```

Vite and its React plugin use Oxc and Rolldown. Tests use Node's native TypeScript support and SQLite, with Rolldown bundling the Worker API against an in-memory database adapter.

## Deployment

- Site: https://giulietto.riccardo-palleschi-5e6.workers.dev
- Repository: https://github.com/riccardopll/giulietto
- Cloudflare Worker: `giulietto`
- D1 database: `giulietto-db`, bound as `DB`
- Configuration: `wrangler.jsonc`

Every push to `main` runs the checks, applies pending D1 migrations, and deploys the same build using GitHub Actions. A final smoke check verifies the live HTML, assets, API, and D1 connection. Pull requests run checks without deploying. Deployment runs are serialized so a migration or upload is not interrupted by a newer push.

The repository secret `CLOUDFLARE_API_TOKEN` must contain a Cloudflare token scoped to the Riccardo account with **Workers Scripts: Edit**, **D1: Edit**, and **Account Settings: Read**. Add it through GitHub's repository Actions secrets settings or `gh secret set CLOUDFLARE_API_TOKEN --repo riccardopll/giulietto`. Never commit tokens.

For a manual deployment after `wrangler login`:

```sh
npm run check
npm run db:migrate:remote
npx wrangler deploy
```

Add future schema changes as numbered SQL files in `drizzle/`. Keep migrations compatible with the currently running Worker: they are applied before the new Worker is deployed. Never edit a migration already applied to production.

## Source import

The original Sites export is preserved in the first Git commit. This checkout uses direct Cloudflare hosting. It removes the unused Sites/Next/Vinext scaffolding, starter catalog, ORM, and example routes. Only the UI primitives used by the game remain.

The archive contained source and assets, **not live database records**. This deployment starts with a new database. The initial migration contains the original table definitions without the old export's destructive room-reset statement.
