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
      ROOMS: { className: "TestGameTable", useSQLite: true },
      MATCHMAKER: { className: "MatchQueue", useSQLite: true },
    },
    d1Databases: { DB: "test-db" },
    ratelimits: { REQUEST_LIMIT: { namespace_id: "1001", simple: { limit: 10000, period: 60 } } },
    unsafeInspectDurableObjects: true,
    log: new Log(LogLevel.ERROR),
  }),
);
const db = await mf.getD1Database("DB");
for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  for (const sql of (await readFile("migrations/" + file, "utf8"))
    .split(";")
    .filter((s) => s.trim()))
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
    assert.ok(
      pushed.state.players.find((p) => p.id !== pushed.state.you).hand.every((c) => c === null),
    );
    assert.ok(
      pushed.state.players
        .find((p) => p.id === pushed.state.you)
        .hand.every((c) => typeof c === "number"),
    );
    assert.equal(pushed.state.events, undefined);
    const move = { action: "bid", bid: 0, commandId: crypto.randomUUID() };
    const firstIndex = started.state.order[0] === started.state.you ? 0 : 1;
    const first = firstIndex === 0 ? a : b;
    const ack = await first.send(move);
    assert.equal(ack.type, "ack");
    const retry = await first.send(move);
    assert.equal(retry.state.turn, 1);
    assert.equal(retry.state.revision, ack.state.revision);
    a.ws.close();
    b.ws.close();
    await mf.unsafeEvictDurableObject("test", "TestGameTable", { name: code });
    const reconnected = await socket(firstIndex, code);
    assert.equal(reconnected.messages[0].state.turn, 1);
    const retriedAfterRestart = await reconnected.send(move);
    assert.equal(retriedAfterRestart.type, "ack");
    assert.equal(retriedAfterRestart.state.turn, 1);
    const events = await (await control(code, "events")).json();
    assert.equal(events.filter((e) => e.type === "bid").length, 1);
    assert.equal(events.find((e) => e.type === "bid").command_id, move.commandId);
    reconnected.ws.send("ping");
    await waitFor(() => reconnected.messages.some((m) => m.type === "pong"));
    reconnected.ws.close();
  });
  await test("emotes broadcast from the authenticated sender without changing play or recording game events", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create", name: "bot_1" });
    await post(1, { action: "join", code, name: "bot_2" });
    const a = await socket(0, code),
      b = await socket(1, code);
    const started = await a.send({ action: "start" });
    const before = await (await control(code, "read")).json();
    const events = await (await control(code, "events")).json();
    const move = { action: "emote", emote: "clap", playerId: b.messages[0].state.you };
    const ack = await a.send(move);
    assert.equal(ack.type, "ack");
    const sender = ack.state.players.find((p) => p.id === started.state.you);
    assert.equal(sender.emote.id, "clap");
    assert.equal(sender.emote.commandId, ack.commandId);
    assert.equal(ack.state.players.find((p) => p.id !== started.state.you).emote, undefined);
    const pushed = await waitFor(() =>
      b.messages.find((m) => m.type === "state" && m.state?.revision === ack.state.revision),
    );
    assert.deepEqual(pushed.state.players.find((p) => p.id === sender.id).emote, sender.emote);
    assert.ok(
      pushed.state.players.find((p) => p.id === sender.id).hand.every((card) => card === null),
    );
    const after = await (await control(code, "read")).json();
    const withoutEmotes = (game) => ({
      ...game,
      revision: 0,
      players: game.players.map(({ emote: _emote, seen: _seen, ...p }) => p),
    });
    assert.deepEqual(withoutEmotes(after.game), withoutEmotes(before.game));
    assert.deepEqual(await (await control(code, "events")).json(), events);
    const bidder = started.state.order[0] === started.state.you ? a : b;
    assert.equal((await bidder.send({ action: "bid", bid: 0 })).type, "ack");
    a.ws.close();
    b.ws.close();
  });
  await test("emote cooldown and retry receipts survive tabs, HTTP requests and room eviction", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create", name: "bot_1" });
    await post(1, { action: "join", code, name: "bot_2" });
    const a = await socket(0, code),
      secondTab = await socket(0, code);
    const move = { action: "emote", emote: "wave", commandId: crypto.randomUUID() };
    const first = await a.send(move);
    assert.equal(first.type, "ack");
    const retry = await a.send(move);
    assert.equal(retry.state.revision, first.state.revision);
    assert.deepEqual(retry.state.players[0].emote, first.state.players[0].emote);
    assert.equal(
      (await secondTab.send({ action: "emote", emote: "wow" })).error,
      "Wait three seconds between emotes.",
    );
    assert.equal((await post(0, { action: "emote", emote: "wow", code })).status, 400);
    assert.equal((await post(1, { action: "emote", emote: "luck", code })).status, 200);
    a.ws.close();
    secondTab.ws.close();
    await mf.unsafeEvictDurableObject("test", "TestGameTable", { name: code });
    const reconnected = await socket(0, code);
    const restored = await reconnected.send(move);
    assert.equal(restored.type, "ack");
    assert.deepEqual(restored.state.players[0].emote, first.state.players[0].emote);
    assert.equal((await reconnected.send({ action: "emote", emote: "oops" })).type, "error");
    const room = await (await control(code, "read")).json();
    room.game.players[0].emote.sentAt = Date.now() - 3000;
    await control(code, "seed", room);
    const next = await reconnected.send({ action: "emote", emote: "laugh" });
    assert.equal(next.type, "ack");
    assert.equal(next.state.players[0].emote.id, "laugh");
    const oldRetry = await reconnected.send(move);
    assert.equal(oldRetry.state.revision, next.state.revision);
    assert.deepEqual(oldRetry.state.players[0].emote, next.state.players[0].emote);
    reconnected.ws.close();
    const expired = await (await control(code, "read")).json();
    expired.game.players.forEach((p) => {
      p.emote.sentAt = Date.now() - 4000;
    });
    await control(code, "seed", expired);
    assert.ok((await get(0, code)).body.players.every((p) => p.emote === undefined));
    const fresh = await socket(0, code);
    assert.ok(fresh.messages[0].state.players.every((p) => p.emote === undefined));
    fresh.ws.close();
  });
  await test("emotes reject unknown payloads, strangers and players who have left", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create", name: "bot_1" });
    for (const emote of [undefined, null, 1, {}, ["wave"], "free text", "<script>"])
      assert.equal(
        (await post(0, { action: "emote", emote, code })).body.error,
        "Choose a valid emote.",
      );
    assert.equal(
      (await post(1, { action: "emote", emote: "wave", code })).body.error,
      "Join this table first.",
    );
    const a = await socket(0, code);
    assert.equal(
      (await a.send({ action: "emote", emote: "invalid" })).error,
      "Choose a valid emote.",
    );
    assert.equal((await a.send({ action: "emote", emote: "wave" })).type, "ack");
    await post(1, { action: "join", code, name: "bot_2" });
    await a.send({ action: "start" });
    await a.send({ action: "leave" });
    assert.equal(
      (await a.send({ action: "emote", emote: "wave" })).error,
      "You have left the game.",
    );
    assert.equal((await post(0, { action: "emote", emote: "wave", code })).status, 400);
    assert.equal((await get(1, code)).body.players.find((p) => p.left).emote, undefined);
    a.ws.close();
  });
  await test("hibernation restores socket identities and per-player snapshots", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    const a = await socket(0, code),
      b = await socket(1, code);
    const started = await a.send({ action: "start" });
    const first = started.state.order[0] === started.state.you ? a : b;
    await mf.unsafeEvictDurableObject("test", "TestGameTable", {
      name: code,
      webSockets: "hibernate",
    });
    const ack = await first.send({ action: "bid", bid: 0 });
    assert.equal(ack.type, "ack");
    const pushed = await waitFor(() =>
      b.messages.find((m) => m.state?.revision === ack.state.revision),
    );
    assert.equal(pushed.state.you, b.messages[0].state.you);
    assert.ok(
      pushed.state.players.find((p) => p.id !== pushed.state.you).hand.every((c) => c === null),
    );
    assert.ok(
      pushed.state.players
        .find((p) => p.id === pushed.state.you)
        .hand.every((c) => typeof c === "number"),
    );
    a.ws.close();
    b.ws.close();
  });
  await test("abnormal disconnects finish lobby cleanup and allow the player to reconnect", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    const a = await socket(0, code);
    const before = await (await control(code, "read")).json();
    const disconnected = await control(code, "disconnect");
    assert.equal(disconnected.status, 200);
    const after = await (await control(code, "read")).json();
    assert.ok(after.game.players[0].seen >= before.game.players[0].seen);
    const b = await socket(0, code);
    assert.equal(b.messages[0].state.you, a.messages[0].state.you);
    b.ws.close();
  });
  await test("normal WebSocket closure receives a close reply promptly", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    const a = await socket(0, code);
    const closed = new Promise((resolve) =>
      a.ws.addEventListener("close", resolve, { once: true }),
    );
    a.ws.close(1000);
    const event = await Promise.race([
      closed,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(Error("Close handshake timed out")), 2000);
        timer.unref();
      }),
    ]);
    assert.equal(event.code, 1000);
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
    assert.equal(current.game.players.find((p) => p.id === current.game.order[0]).bid, 0);
    assert.ok(current.game.deadline > Date.now());
  });
  await test("D1 outage does not roll back the game; persisted outbox retries and rejects stale snapshots", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await post(1, { action: "join", code });
    const { body: started } = await post(0, { action: "start", code });
    await waitFor(async () => !(await (await control(code, "read")).json()).outbox);
    const r = await (await control(code, "read")).json();
    const staleSnapshot = structuredClone(r.game);
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
    stale.outbox = staleSnapshot;
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
  await test("complete replay survives eviction and batch failure, then archives before room cleanup", async () => {
    const {
      body: { code },
    } = await post(0, { action: "create" });
    await control(code, "pause");
    await post(1, { action: "join", code });
    const lobby = await (await control(code, "read")).json();
    // Extra lives keep this fixture running through blind rounds and several delivery batches.
    lobby.game.players.forEach((p) => (p.lives = 100));
    await control(code, "seed", lobby);
    await post(0, { action: "start", code });
    let r = await (await control(code, "read")).json();
    while (r.game.round < 7) r = await (await control(code, "step")).json();
    await post(0, { action: "leave", code });
    await post(1, { action: "leave", code });
    for (let i = 0; i < 100 && r.game.phase !== "finished"; i++)
      r = await (await control(code, "step")).json();
    assert.equal(r.game.phase, "finished");
    assert.equal(r.game.winner, null);
    const events = await (await control(code, "events")).json();
    assert.ok(events.length > 100);
    assert.equal(events[0].type, "round_dealt");
    assert.equal(events.at(-1).type, "match_finished");
    assert.ok(events.some((e) => e.round === 6 && JSON.parse(e.payload).blind === true));
    assert.equal(events.filter((e) => e.type === "player_left").length, 2);
    const hands = new Map();
    const moves = [];
    for (const [i, e] of events.entries()) {
      assert.equal(e.sequence, i + 1);
      const data = JSON.parse(e.payload);
      if (e.type === "round_dealt") for (const p of data.players) hands.set(p.id, [...p.hand]);
      if (e.type === "play") {
        const hand = hands.get(e.player_id);
        assert.deepEqual(data.handBefore, hand);
        assert.ok(hand.includes(data.card));
        hand.splice(hand.indexOf(data.card), 1);
        assert.equal(e.source, "timeout");
        if (data.card === 31) assert.equal(data.mode, "high");
        moves.push({
          player: e.player_id,
          card: data.card,
          ...(data.mode ? { mode: data.mode } : {}),
        });
      }
      if (e.type === "trick_won") {
        assert.deepEqual(data.plays, moves.splice(0));
        const strength = (p) => (p.card === 31 ? (p.mode === "low" ? 0 : 41) : p.card);
        assert.equal(
          e.player_id,
          data.plays.reduce((a, b) => (strength(a) > strength(b) ? a : b)).player,
        );
      }
    }
    await mf.unsafeEvictDurableObject("test", "TestGameTable", { name: code });
    assert.deepEqual(await (await control(code, "events")).json(), events);
    const deliver = async () => {
      const pending = await (await control(code, "read")).json();
      pending.retryAt = Date.now() - 1;
      await control(code, "seed", pending);
      await control(code, "alarm");
      return (await control(code, "read")).json();
    };
    // A failed event insert must roll back the batch and retain the DO delivery cursor.
    await db
      .prepare(`CREATE TRIGGER reject_event BEFORE INSERT ON match_events
      BEGIN SELECT RAISE(ABORT, 'test outage'); END`)
      .run();
    r = await deliver();
    assert.equal(r.deliveredSequence, 0);
    assert.ok(r.outbox);
    assert.equal(
      await db
        .prepare("SELECT count(*) AS n FROM matches WHERE id=?")
        .bind(r.game.matchId)
        .first("n"),
      0,
    );
    await db.prepare("DROP TRIGGER reject_event").run();
    r = await deliver();
    assert.equal(r.deliveredSequence, 100);
    const partial = await db
      .prepare("SELECT * FROM matches WHERE id=?")
      .bind(r.game.matchId)
      .first();
    assert.equal(partial.status, "active");
    assert.equal(partial.completed_at, null);
    assert.equal(partial.history_revision, -1);
    assert.equal(partial.event_count, 0);
    assert.ok(r.outbox);
    // Simulate a crash after D1 commit but before the local cursor was acknowledged.
    r.deliveredSequence = 0;
    await control(code, "seed", r);
    for (let i = 0; i < 10 && r.outbox; i++) r = await deliver();
    assert.equal(r.outbox, undefined);
    const saved = (
      await db
        .prepare("SELECT * FROM match_events WHERE match_id=? ORDER BY sequence")
        .bind(r.game.matchId)
        .all()
    ).results;
    assert.deepEqual(saved, events);
    const match = await db.prepare("SELECT * FROM matches WHERE id=?").bind(r.game.matchId).first();
    assert.equal(match.status, "abandoned");
    assert.equal(match.history_revision, r.game.revision);
    assert.equal(match.event_count, events.length);
    const results = (
      await db.prepare("SELECT * FROM match_results WHERE match_id=?").bind(r.game.matchId).all()
    ).results;
    for (const p of r.game.players) {
      const result = results.find((v) => v.player_id === p.id);
      assert.equal(result.outcome, "forfeited");
      assert.equal(result.rounds_played, p.stats.roundsPlayed);
      assert.equal(result.tricks_won, p.stats.tricksWon);
      assert.equal(result.exact_predictions, p.stats.exactPredictions);
      assert.equal(result.prediction_error, p.stats.predictionError);
      assert.equal(result.finalized_at, r.game.finishedAt);
    }
    r.updated = Date.now() - 86400001;
    await control(code, "seed", r);
    await control(code, "alarm");
    assert.equal((await get(0, code)).status, 400);
    assert.equal(
      await db
        .prepare("SELECT count(*) AS n FROM match_events WHERE match_id=?")
        .bind(r.game.matchId)
        .first("n"),
      events.length,
    );
  });
  await test("malformed requests, foreign origins, strangers and forfeited players are rejected", async () => {
    const missingCommand = await mf.dispatchFetch("http://game.test/api/game", {
      method: "POST",
      headers: { "x-player-token": tokens[0] },
      body: JSON.stringify({ action: "create", name: "Player" }),
    });
    assert.equal(missingCommand.status, 400);
    assert.equal((await missingCommand.json()).error, "Invalid command ID.");
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
