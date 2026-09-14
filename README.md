# Giulietto

An online trick-taking card game for 2 to 6 players, played with a Neapolitan deck. Predict how many tricks you will win each round; every miss costs a life. Play at [giulietto.online](https://giulietto.online/).

## Stack

React 19 and Tailwind 4 on the client. A Cloudflare Worker with two Durable Objects (tables and matchmaking) and a D1 database on the server. Game rules live in `src/shared` and run on both sides. Vite builds and serves everything; oxlint and oxfmt keep it tidy.

## Develop

```bash
npm ci
npm run dev
```

The dev server includes `/preview`, a local harness for every table layout and phase.

```bash
npm run check      # lint, format check, typecheck, unit and integration tests, build
npm run test:ui    # Playwright, three real players in a game
npm run deploy     # build, migrate D1, deploy the worker
```

## Docs

[ARCHITECTURE.md](ARCHITECTURE.md) records design constraints. [TESTS.md](TESTS.md) says what each test layer covers. [PR.md](PR.md) is the pull request checklist. [AGENTS.md](AGENTS.md) is the entry point for coding agents.

## License

[Apache 2.0](LICENSE). Card, avatar and emote artwork and fonts carry their own notices in `public/`.
