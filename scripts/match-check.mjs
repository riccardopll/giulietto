import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const base = process.argv[2] || "http://localhost:5173";
const count = Number(process.argv[3] || 3);
const clients = Array.from({ length: count }, (_, i) => ({
  token: crypto.randomUUID(),
  name: `Latency check ${i + 1}`,
  messages: [],
  state: null,
}));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(10);
  }
  throw Error("Timed out waiting for game update");
}
async function post(c, body) {
  const res = await fetch(base + "/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-player-token": c.token },
    body: JSON.stringify({ name: c.name, commandId: crypto.randomUUID(), ...body }),
  });
  const state = await res.json();
  assert.equal(res.status, 200, JSON.stringify(state));
  return state;
}
async function connect(c, code) {
  const ws = (c.ws = new WebSocket(base.replace(/^http/, "ws") + "/api/game/socket?code=" + code, [
    "giulietto",
    c.token,
  ]));
  const before = c.messages.length;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    c.messages.push({ ...message, received: performance.now() });
    if (message.type === "state") c.state = message.state;
  });
  await waitFor(() => c.messages.slice(before).some((m) => m.type === "state"));
}
async function send(c, body) {
  const commandId = body.commandId || crypto.randomUUID();
  const sent = performance.now();
  const start = c.messages.length;
  c.ws.send(JSON.stringify({ ...body, commandId }));
  const ack = await waitFor(() => c.messages.slice(start).find((m) => m.commandId === commandId));
  assert.equal(ack.type, "ack", JSON.stringify(ack));
  return { ...ack, sent, elapsed: ack.received - sent };
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50_ms: +sorted[Math.ceil(sorted.length * 0.5) - 1].toFixed(1),
    p95_ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1),
    max_ms: +sorted.at(-1).toFixed(1),
  };
}
const latencies = [],
  pushes = [],
  phases = new Set();
let code,
  reconnectChecked = false,
  duplicateChecked = false;
const startedAt = Date.now();
try {
  code = (await post(clients[0], { action: "create" })).code;
  for (const c of clients.slice(1)) await post(c, { action: "join", code });
  await Promise.all(clients.map((c) => connect(c, code)));
  await send(clients[0], { action: "start" });
  console.log(JSON.stringify({ event: "match_started", code, players: count }));
  let actions = 0;
  while (clients[0].state.phase !== "finished" && Date.now() - startedAt < 600000) {
    const state = clients[0].state;
    phases.add(state.phase);
    for (const c of clients) {
      if (c.state.revision !== state.revision) continue;
      const me = c.state.players.find((p) => p.id === c.state.you);
      const active = c.state.order.includes(me.id) && !me.left;
      const blind = state.count === 1 && ["bidding", "playing", "trick"].includes(state.phase);
      for (const p of c.state.players) {
        const visible = active && ((!blind && p.id === me.id) || (blind && p.id !== me.id));
        assert.ok(
          p.hand.every((card) => (visible ? typeof card === "number" : card === null)),
          "Private cards leaked",
        );
      }
    }
    if (state.phase === "trick" || state.phase === "results") {
      if (!reconnectChecked) {
        const c = clients[1];
        c.ws.close();
        await connect(c, code);
        assert.equal(c.state.code, code);
        assert.ok(c.state.revision >= state.revision);
        reconnectChecked = true;
      }
      // Only pushed snapshots advance the match; no polling or timer control endpoints.
      await waitFor(() => clients[0].state.revision > state.revision, 20000);
      continue;
    }
    assert.ok(["bidding", "playing"].includes(state.phase));
    const c = clients.find((c) => c.state.you === state.order[state.turn]);
    await waitFor(() => c.state.revision >= state.revision);
    const me = c.state.players.find((p) => p.id === c.state.you);
    const body =
      state.phase === "bidding"
        ? { action: "bid", bid: c.state.legalBids[0] }
        : { action: "play", card: me.hand[0] ?? -1, mode: "high" };
    body.commandId = crypto.randomUUID();
    const ack = await send(c, body);
    actions++;
    latencies.push(ack.elapsed);
    for (const other of clients.filter((p) => p !== c)) {
      const pushed = await waitFor(() =>
        other.messages.find((m) => m.type === "state" && m.state.revision === ack.state.revision),
      );
      pushes.push(pushed.received - ack.sent);
    }
    if (!duplicateChecked) {
      const duplicate = await send(c, body);
      assert.equal(duplicate.state.revision, ack.state.revision);
      duplicateChecked = true;
    }
    await waitFor(() => clients[0].state.revision >= ack.state.revision);
    if (actions % 20 === 0)
      console.log(JSON.stringify({ event: "progress", actions, round: ack.state.round }));
  }
  const state = clients[0].state;
  assert.equal(state.phase, "finished");
  await waitFor(() => clients.every((c) => c.state.phase === "finished"));
  assert.ok(
    clients.every((c) => c.state.winner === state.winner && c.state.matchId === state.matchId),
  );
  console.log(
    JSON.stringify(
      {
        event: "match_finished",
        code,
        matchId: state.matchId,
        players: count,
        rounds: state.round,
        actions,
        duration_seconds: +((Date.now() - startedAt) / 1000).toFixed(1),
        acknowledgement: stats(latencies),
        opponent_update: stats(pushes),
        reconnectChecked,
        duplicateChecked,
        phases: [...phases, "finished"],
        results: state.results,
      },
      null,
      2,
    ),
  );
} finally {
  for (const c of clients) c.ws?.close();
}
