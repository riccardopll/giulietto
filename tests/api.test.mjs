import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { build } from "rolldown";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
const sqlDb = new DatabaseSync(":memory:");
const db = {
  failHistoryOnce: false,
  prepare(sql) {
    let values = [];
    const query = {
      bind(...v) {
        values = v;
        return query;
      },
      async first() {
        return sqlDb.prepare(sql).get(...values) || null;
      },
      async all() {
        return { results: sqlDb.prepare(sql).all(...values) };
      },
      _run() {
        if (db.failHistoryOnce && sql.includes("INSERT INTO matches")) {
          db.failHistoryOnce = false;
          throw Error("Simulated history write failure");
        }
        const r = sqlDb.prepare(sql).run(...values);
        return { meta: { changes: Number(r.changes) } };
      },
      async run() {
        return query._run();
      },
    };
    return query;
  },
  async batch(statements) {
    sqlDb.exec("BEGIN");
    try {
      const results = statements.map((s) => s._run());
      sqlDb.exec("COMMIT");
      return results;
    } catch (e) {
      sqlDb.exec("ROLLBACK");
      throw e;
    }
  },
};
sqlDb.exec("PRAGMA foreign_keys=ON");
globalThis.testEnv = { DB: db };
const buildResult = await build({
  input: "worker/index.ts",
  write: false,
  output: { format: "esm" },
  resolve: { alias: { "@": process.cwd() } },
  plugins: [
    {
      name: "test-env",
      resolveId(id) {
        if (id === "cloudflare:workers") return "\0test-env";
      },
      load(id) {
        if (id === "\0test-env") return "export const env=globalThis.testEnv;";
      },
    },
  ],
});
const handler = (
  await import(
    "data:text/javascript;base64," + Buffer.from(buildResult.output[0].code).toString("base64")
  )
).default;
const mf = {
  dispatchFetch(url, options) {
    return handler.fetch(new Request(url, options));
  },
};
for (const file of (await readdir("drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
  const migration = await readFile("drizzle/" + file, "utf8");
  sqlDb.exec(migration);
}
const tokens = Array.from({ length: 7 }, () => crypto.randomUUID());
async function post(i, body) {
  const r = await mf.dispatchFetch("http://game.test/api/game", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-player-token": tokens[i],
      Origin: "http://game.test",
    },
    body: JSON.stringify({ name: "Player " + i, ...body }),
  });
  return { status: r.status, body: await r.json() };
}
async function get(i, code) {
  const r = await mf.dispatchFetch("http://game.test/api/game?code=" + code, {
    headers: { "x-player-token": tokens[i] },
  });
  return { status: r.status, body: await r.json() };
}
try {
  await test("fresh migration creates the four application tables", () => {
    const tables = sqlDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name)
      .sort();
    assert.deepEqual(tables, ["match_results", "matches", "players", "rooms"]);
    for (const name of tables)
      assert.equal(sqlDb.prepare("SELECT count(*) AS n FROM " + name).get().n, 0);
  });
  await test("private invite joins, capacity, permissions, concurrent updates and real shared state", async () => {
    const created = await post(0, { action: "create" });
    assert.equal(created.status, 200);
    const code = created.body.code;
    const joins = await Promise.all(
      Array.from({ length: 5 }, (_, i) => post(i + 1, { action: "join", code })),
    );
    assert.ok(joins.every((r) => r.status === 200));
    const full = await get(0, code);
    assert.equal(full.body.players.length, 6);
    assert.equal((await post(6, { action: "join", code })).status, 400);
    assert.equal((await post(1, { action: "start", code })).status, 400);
    const started = await post(0, { action: "start", code });
    assert.equal(started.status, 200);
    assert.equal(started.body.phase, "bidding");
    assert.equal(started.body.players[0].hand.filter((n) => n !== null).length, 6);
    assert.ok(started.body.players.slice(1).every((p) => p.hand.every((n) => n === null)));
    assert.equal((await get(6, code)).status, 400);
    const order = started.body.order;
    for (const id of order) {
      const p = started.body.players.find((p) => p.id === id);
      const i = Number(p.name.split(" ")[1]);
      assert.equal((await post(i, { action: "bid", code, bid: 0 })).status, 200);
    }
    let state = (await get(0, code)).body;
    assert.equal(state.phase, "playing");
    for (const id of order) {
      const p = state.players.find((p) => p.id === id);
      const i = Number(p.name.split(" ")[1]);
      const own = (await get(i, code)).body;
      const card = own.players.find((p) => p.id === own.you).hand[0];
      const result = await post(i, { action: "play", code, card, mode: "high" });
      assert.equal(result.status, 200);
      state = result.body;
    }
    assert.equal(state.phase, "trick");
    assert.equal(state.trick.length, 6);
    assert.equal(
      state.players.reduce((n, p) => n + p.taken, 0),
      1,
    );
    assert.equal((await get(1, code)).body.lastWinner, state.lastWinner);
  });
  await test("public matchmaking seats strangers at the same public table", async () => {
    const a = await post(0, { action: "match" });
    const b = await post(1, { action: "match" });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.code, b.body.code);
    assert.equal(b.body.public, true);
    assert.equal(b.body.players.length, 2);
    assert.ok(b.body.startAt > Date.now());
  });
  await test("blind API accepts a hidden-card move without exposing own card", async () => {
    const created = await post(0, { action: "create" });
    const code = created.body.code;
    await post(1, { action: "join", code });
    await post(0, { action: "start", code });
    const row = await db.prepare("SELECT state FROM rooms WHERE code=?").bind(code).first();
    const g = JSON.parse(row.state);
    g.phase = "playing";
    g.count = 1;
    g.players[0].hand = [31];
    g.players[1].hand = [40];
    g.players.forEach((p) => (p.bid = 0));
    g.turn = 0;
    await db.prepare("UPDATE rooms SET state=? WHERE code=?").bind(JSON.stringify(g), code).run();
    const before = (await get(0, code)).body;
    assert.deepEqual(before.players[0].hand, [null]);
    assert.deepEqual(before.players[1].hand, [40]);
    const a = await post(0, { action: "play", code, card: -1, mode: "low" });
    assert.equal(a.status, 200);
    assert.equal(a.body.trick[0].card, 31);
    assert.equal(a.body.trick[0].mode, "low");
    const b = await post(1, { action: "play", code, card: -1, mode: "high" });
    assert.equal(b.body.lastWinner, g.players[1].id);
  });
  await test("match completion is atomic, retry-safe, and preserves totals and outcomes", async () => {
    const created = await post(0, { action: "create" });
    const code = created.body.code;
    await post(1, { action: "join", code });
    const started = await post(0, { action: "start", code });
    assert.equal(started.status, 200);
    const id = started.body.matchId;
    assert.ok(id);
    assert.equal(
      sqlDb.prepare("SELECT count(*) AS n FROM match_results WHERE match_id=?").get(id).n,
      2,
    );
    const row = sqlDb.prepare("SELECT * FROM rooms WHERE code=?").get(code);
    const g = JSON.parse(row.state);
    g.phase = "trick";
    g.count = 1;
    g.deadline = Date.now() - 1;
    g.players.forEach((p) => {
      p.lives = 1;
      p.hand = [];
      p.bid = 1;
      p.taken = 0;
    });
    g.players[0].taken = 1;
    sqlDb.prepare("UPDATE rooms SET state=? WHERE code=?").run(JSON.stringify(g), code);
    db.failHistoryOnce = true;
    const log = mock.method(console, "error", () => {});
    const failed = await get(0, code);
    log.mock.restore();
    assert.equal(failed.status, 503);
    assert.doesNotMatch(failed.body.error, /Simulated|INSERT|matches/);
    assert.equal(
      JSON.parse(sqlDb.prepare("SELECT state FROM rooms WHERE code=?").get(code).state).phase,
      "trick",
    );
    assert.equal(sqlDb.prepare("SELECT status FROM matches WHERE id=?").get(id).status, "active");
    const finished = await Promise.all([get(0, code), get(1, code)]);
    assert.ok(finished.every((r) => r.status === 200 && r.body.phase === "finished"));
    const m = sqlDb.prepare("SELECT * FROM matches WHERE id=?").get(id);
    assert.equal(m.status, "completed");
    assert.equal(m.winner_id, g.players[0].id);
    assert.ok(m.completed_at >= m.started_at);
    const results = sqlDb
      .prepare("SELECT * FROM match_results WHERE match_id=? ORDER BY player_id")
      .all(id);
    assert.equal(results.length, 2);
    const win = results.find((r) => r.outcome === "won");
    const lose = results.find((r) => r.outcome === "lost");
    assert.equal(win.tricks_won, 1);
    assert.equal(win.exact_predictions, 1);
    assert.equal(win.rounds_played, 1);
    assert.equal(lose.prediction_error, 1);
    assert.equal(lose.lives, 0);
    await get(0, code);
    await post(0, { action: "leave", code });
    assert.deepEqual(
      sqlDb.prepare("SELECT * FROM match_results WHERE match_id=? ORDER BY player_id").all(id),
      results,
    );
    // Profiles persist across rooms and update display names without changing historical names.
    await post(0, { action: "create", name: "New display name" });
    assert.equal(
      sqlDb.prepare("SELECT display_name FROM players WHERE id=?").get(g.players[0].id)
        .display_name,
      "New display name",
    );
    assert.equal(
      sqlDb
        .prepare("SELECT display_name FROM match_results WHERE match_id=? AND player_id=?")
        .get(id, g.players[0].id).display_name,
      "Player 0",
    );
  });
  await test("rejects malformed input, foreign origins, and unsupported methods", async () => {
    const send = (body, extra = {}) =>
      handler.fetch(
        new Request("http://game.test/api/game", {
          method: "POST",
          headers: { "x-player-token": tokens[0], ...extra },
          body,
        }),
      );
    for (const body of ["null", "[]", "{", "42"]) assert.equal((await send(body)).status, 400);
    assert.equal(
      (await send(JSON.stringify({ action: "create" }), { Origin: "https://foreign.test" })).status,
      403,
    );
    assert.equal(
      (await handler.fetch(new Request("http://game.test/api/game", { method: "DELETE" }))).status,
      405,
    );
    assert.equal((await handler.fetch(new Request("http://game.test/api/missing"))).status, 404);
    assert.equal((await handler.fetch(new Request("http://game.test/api/game"))).status, 400);
    assert.equal((await post(0, { action: "bid", code: "ABCDEFGH", bid: null })).status, 400);
  });
  await test("forfeited players cannot bid and their hands stay hidden", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    await post(0, { action: "start", code });
    await post(0, { action: "leave", code });
    const attempt = await post(0, { action: "bid", code, bid: 0 });
    assert.equal(attempt.status, 400);
    assert.match(attempt.body.error, /left the game/);
    const state = (await get(0, code)).body;
    assert.ok(state.players.every((p) => p.hand.every((card) => card === null)));
  });
} finally {
  sqlDb.close();
}
