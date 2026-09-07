import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "rolldown";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
const built = await build({
  input: "tests/worker-fixture.ts",
  write: false,
  external: ["cloudflare:workers"],
  output: { format: "esm" },
});
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "test",
    modules: true,
    script: built.output[0].code,
    compatibilityDate: "2026-09-07",
    compatibilityFlags: ["nodejs_compat"],
    durableObjects: {
      ROOMS: { className: "TestGameRoom", useSQLite: true },
      MATCHMAKER: { className: "Matchmaker", useSQLite: true },
    },
    d1Databases: { DB: "test-db" },
    ratelimits: { REQUEST_LIMIT: { namespace_id: "1001", simple: { limit: 10000, period: 60 } } },
    unsafeInspectDurableObjects: true,
    log: new Log(LogLevel.ERROR),
  }),
);
const db = await mf.getD1Database("DB");
for (const file of (await readdir("drizzle")).filter((f) => f.endsWith(".sql")).sort()) {
  for (const sql of (await readFile("drizzle/" + file, "utf8")).split(";").filter((s) => s.trim()))
    await db.prepare(sql).run();
}
const ns = await mf.getDurableObjectNamespace("ROOMS");
const tokens = Array.from({ length: 8 }, () => crypto.randomUUID());
async function post(i, body) {
  const r = await mf.dispatchFetch("http://game.test/api/game", {
    method: "POST",
    headers: { "x-player-token": tokens[i], Origin: "http://game.test" },
    body: JSON.stringify({ name: "Player " + i, commandId: crypto.randomUUID(), ...body }),
  });
  return { status: r.status, body: await r.json() };
}
async function get(i, code) {
  const r = await mf.dispatchFetch("http://game.test/api/game?code=" + code, {
    headers: { "x-player-token": tokens[i] },
  });
  return { status: r.status, body: await r.json() };
}
const control = (code, path, body) =>
  ns
    .get(ns.idFromName(code))
    .fetch(
      "https://internal/__" + path,
      body ? { method: "POST", body: JSON.stringify(body) } : {},
    );
const waitFor = async (fn, timeout = 5000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw Error("Timed out waiting for condition");
};
async function socket(i, code) {
  const res = await mf.dispatchFetch("http://game.test/api/game/socket?code=" + code, {
    headers: {
      Upgrade: "websocket",
      "Sec-WebSocket-Protocol": "giulietto, " + tokens[i],
      Origin: "http://game.test",
    },
  });
  assert.equal(res.status, 101);
  const ws = res.webSocket,
    messages = [];
  ws.addEventListener("message", (e) =>
    messages.push(e.data === "pong" ? { type: "pong" } : JSON.parse(e.data)),
  );
  ws.accept();
  await waitFor(() => messages.some((m) => m.type === "state"));
  return {
    ws,
    messages,
    send: async (body) => {
      const commandId = body.commandId || crypto.randomUUID();
      const start = messages.length;
      ws.send(JSON.stringify({ ...body, commandId }));
      return waitFor(() => messages.slice(start).find((m) => m.commandId === commandId));
    },
  };
}
try {
  await test("concurrent matchmaking reserves six seats in one room without duplicates", async () => {
    const replies = await Promise.all(
      Array.from({ length: 6 }, (_, i) => post(i, { action: "match" })),
    );
    assert.ok(replies.every((r) => r.status === 200));
    assert.equal(new Set(replies.map((r) => r.body.code)).size, 1);
    const state = (await get(0, replies[0].body.code)).body;
    assert.equal(state.players.length, 6);
    assert.equal(state.phase, "bidding");
    const seventh = await post(6, { action: "match" });
    assert.notEqual(seventh.body.code, state.code);
  });
  await test("creation retries return the original table", async () => {
    const b = { action: "create", commandId: crypto.randomUUID() };
    const a = await post(0, b),
      retry = await post(0, b);
    assert.equal(retry.body.code, a.body.code);
    assert.equal(retry.body.players.length, 1);
  });
  await test("WebSocket broadcasts hide hands, deduplicate moves and restore after eviction", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    assert.equal((await post(1, { action: "start", code })).status, 400);
    const a = await socket(0, code),
      b = await socket(1, code);
    const started = await a.send({ action: "start" });
    assert.equal(started.type, "ack");
    const pushed = await waitFor(() => b.messages.find((m) => m.state?.phase === "bidding"));
    assert.ok(pushed.state.players[0].hand.every((c) => c === null));
    assert.ok(pushed.state.players[1].hand.every((c) => typeof c === "number"));
    const move = { action: "bid", bid: 0, commandId: crypto.randomUUID() };
    const ack = await a.send(move);
    const retry = await a.send(move);
    assert.equal(retry.state.turn, 1);
    assert.equal(retry.state.revision, ack.state.revision);
    a.ws.close();
    b.ws.close();
    await mf.unsafeEvictDurableObject("test", "TestGameRoom", { name: code });
    const reconnected = await socket(0, code);
    assert.equal(reconnected.messages[0].state.turn, 1);
    const retriedAfterRestart = await reconnected.send(move);
    assert.equal(retriedAfterRestart.type, "ack");
    assert.equal(retriedAfterRestart.state.turn, 1);
    reconnected.ws.send("ping");
    await waitFor(() => reconnected.messages.some((m) => m.type === "pong"));
    reconnected.ws.close();
  });
  await test("alarms advance a disconnected room without GET requests", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    await post(0, { action: "start", code });
    const r = await (await control(code, "read")).json();
    r.game.deadline = Date.now() + 100;
    await control(code, "seed", r);
    await waitFor(async () => (await (await control(code, "read")).json()).game.turn === 1);
    const current = await (await control(code, "read")).json();
    assert.equal(current.game.players[0].bid, 0);
    assert.ok(current.game.deadline > Date.now());
  });
  await test("D1 outage does not roll back the game; persisted outbox retries and ignores old history", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    const { body: started } = await post(0, { action: "start", code });
    await waitFor(async () => !(await (await control(code, "read")).json()).outbox);
    const r = await (await control(code, "read")).json();
    const oldGame = structuredClone(r.game);
    r.game.phase = "trick";
    r.game.count = 1;
    r.game.deadline = Date.now() + 100;
    r.game.players.forEach((p) => Object.assign(p, { hand: [], lives: 1, bid: 1, taken: 0 }));
    r.game.players[0].taken = 1;
    await db.prepare("ALTER TABLE matches RENAME TO unavailable_matches").run();
    await control(code, "seed", r);
    await waitFor(
      async () => (await (await control(code, "read")).json()).game.phase === "finished",
    );
    const pending = await (await control(code, "read")).json();
    assert.ok(pending.outbox);
    assert.equal(pending.game.winner, started.players[0].id);
    await db.prepare("ALTER TABLE unavailable_matches RENAME TO matches").run();
    await waitFor(async () => !(await (await control(code, "read")).json()).outbox, 10000);
    const history = await db
      .prepare("SELECT * FROM matches WHERE id=?")
      .bind(started.matchId)
      .first();
    assert.equal(history.status, "completed");
    const results = await db
      .prepare("SELECT * FROM match_results WHERE match_id=?")
      .bind(started.matchId)
      .all();
    assert.equal(results.results.length, 2);
    assert.equal(results.results.find((r) => r.outcome === "won").tricks_won, 1);
    const stale = await (await control(code, "read")).json();
    stale.outbox = oldGame;
    stale.retryAt = Date.now() - 1;
    await control(code, "seed", stale);
    await control(code, "alarm");
    assert.deepEqual(
      await db.prepare("SELECT * FROM matches WHERE id=?").bind(started.matchId).first(),
      history,
    );
    assert.deepEqual(
      (await db.prepare("SELECT * FROM match_results WHERE match_id=?").bind(started.matchId).all())
        .results,
      results.results,
    );
  });
  await test("legacy D1 rooms import once and then use Durable Object state", async () => {
    const { makeGame, player } = await import("../lib/game.ts");
    const id = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokens[0]))),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    const g = makeGame("LEGACY22", player(id, "Legacy", Date.now()), false);
    await db
      .prepare("INSERT INTO rooms(code,state,public,phase,updated) VALUES(?,?,0,'lobby',?)")
      .bind(g.code, JSON.stringify(g), Date.now())
      .run();
    assert.equal((await get(0, g.code)).body.players[0].name, "Legacy");
    await post(1, { action: "join", code: g.code });
    assert.equal((await get(0, g.code)).body.players.length, 2);
    assert.equal(
      JSON.parse(
        (await db.prepare("SELECT state FROM rooms WHERE code=?").bind(g.code).first()).state,
      ).players.length,
      1,
    );
  });
  await test("malformed requests, foreign origins, strangers and forfeited players are rejected", async () => {
    for (const body of ["null", "[]", "{", "42"])
      assert.equal(
        (
          await mf.dispatchFetch("http://game.test/api/game", {
            method: "POST",
            headers: { "x-player-token": tokens[0] },
            body,
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await mf.dispatchFetch("http://game.test/api/game/socket?code=ABCDEFGH", {
          headers: { Upgrade: "websocket", Origin: "https://foreign.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await mf.dispatchFetch("http://game.test/api/game", { method: "DELETE" })).status,
      405,
    );
    assert.equal((await mf.dispatchFetch("http://game.test/api/missing")).status, 404);
    assert.equal((await mf.dispatchFetch("http://game.test/api/game")).status, 400);
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    await post(0, { action: "start", code });
    assert.equal((await get(2, code)).status, 400);
    await post(0, { action: "leave", code });
    assert.equal((await post(0, { action: "bid", bid: 0, code })).status, 400);
    assert.ok((await get(0, code)).body.players.every((p) => p.hand.every((c) => c === null)));
  });
} finally {
  await mf.dispose();
}
