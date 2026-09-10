import { expect } from "vitest";
import { guest, test, type State } from "./worker";

test("public matchmaking fills a lobby that waits for its host to start", async ({ api }) => {
  const players = Array.from({ length: 6 }, (_, index) => guest(index + 1));
  const created = await api.state(players[0], { action: "match" });
  const joined = await Promise.all(
    players.slice(1).map((player) => api.state(player, { action: "match" })),
  );
  const codes = new Set(joined.map((state) => state.code));
  expect(codes).toEqual(new Set([created.code]));
  expect(joined.every((state) => state.phase === "lobby")).toBe(true);
  const response = await api.get(players[0], created.code);
  const state = (await response.json()) as State;
  expect(state.phase).toBe("lobby");
  expect(state.players).toHaveLength(6);
  expect(new Set(state.players.map((player) => player.id)).size).toBe(6);
  const next = await api.state(guest(1), { action: "match" });
  expect(codes.has(next.code)).toBe(false);
  expect(next.phase).toBe("lobby");
  expect((await api.post(players[1], { action: "start", code: created.code })).status).toBe(400);
  const started = await api.state(players[0], { action: "start", code: created.code });
  expect(started.phase).toBe("bidding");
  expect(started.players.every((player) => player.hand.length === 6)).toBe(true);
});

for (const { visibility, action } of [
  { visibility: "private", action: "create" },
  { visibility: "public", action: "match" },
]) {
  test(`a ${visibility} lobby lets only its host configure lives and start the game`, async ({
    api,
  }) => {
    const host = guest(1);
    const other = guest(2);
    const created = await api.state(host, { action });
    const { code } = created;
    expect(created).toMatchObject({ phase: "lobby", startingLives: 3, host: created.you });
    expect((await api.post(host, { action: "start", code })).status).toBe(400);
    await api.state(other, { action: "join", code });

    for (const action of ["settings", "start"]) {
      expect((await api.post(other, { action, code, startingLives: 5 })).status).toBe(400);
    }
    for (const startingLives of [0, 6, 1.5, "5"]) {
      expect((await api.post(host, { action: "settings", code, startingLives })).status).toBe(400);
    }
    const configured = await api.state(host, { action: "settings", code, startingLives: 5 });
    expect(configured.startingLives).toBe(5);
    const joined = await api.state(guest(3), { action: "join", code });
    expect(joined.players.map((player) => player.lives)).toEqual([5, 5, 5]);

    const started = await api.state(host, { action: "start", code });
    expect(started.phase).toBe("bidding");
    expect(started.players.every((player) => player.lives === 5 && player.hand.length === 6)).toBe(
      true,
    );
    expect((await api.post(host, { action: "settings", code, startingLives: 1 })).status).toBe(400);
  });
}

test("WebSockets send each player their own hand and broadcast accepted moves", async ({ api }) => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const sockets = [await api.connect(host, code), await api.connect(other, code)];
  const started = await sockets[0].command({ action: "start" });
  expect(started.type).toBe("ack");
  await expect
    .poll(() => sockets.every((socket) => socket.latest()?.phase === "bidding"))
    .toBe(true);

  for (const socket of sockets) {
    const state = socket.latest()!;
    const own = state.players.find((player) => player.id === state.you)!;
    const opponent = state.players.find((player) => player.id !== state.you)!;
    expect(own.hand).toHaveLength(6);
    expect(own.hand.every((card) => typeof card === "number")).toBe(true);
    expect(opponent.hand).toEqual(Array(6).fill(null));
  }
  const byId = new Map(sockets.map((socket) => [socket.latest()!.you, socket]));
  for (const id of sockets[0].latest()!.order) {
    expect((await byId.get(id)!.command({ action: "bid", bid: 0 })).type).toBe("ack");
  }
  await expect
    .poll(() => sockets.every((socket) => socket.latest()?.phase === "playing"))
    .toBe(true);
  const playing = sockets[0].latest()!;
  const current = byId.get(playing.order[playing.turn])!;
  const currentState = current.latest()!;
  const card = currentState.players.find((player) => player.id === currentState.you)!.hand[0];
  expect((await current.command({ action: "play", card, mode: "high" })).type).toBe("ack");
  for (const socket of sockets) {
    await expect
      .poll(() => socket.latest()?.trick)
      .toEqual([{ player: currentState.you, card, ...(card === 31 ? { mode: "high" } : {}) }]);
  }
});

test("started matches and player commands are recorded in D1", async ({ api }) => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  const joined = await api.state(other, { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  const first = started.order[0] === started.you ? host : other;
  const commandId = crypto.randomUUID();
  await api.state(first, { action: "bid", code, bid: 0, commandId });
  const db = await api.runtime.getD1Database("DB");
  await expect
    .poll(() =>
      db
        .prepare("SELECT status, player_count FROM matches WHERE id=?")
        .bind(started.matchId!)
        .first(),
    )
    .toEqual({ status: "active", player_count: 2 });
  await expect
    .poll(() =>
      db
        .prepare("SELECT type, player_id FROM match_events WHERE command_id=? AND type='bid'")
        .bind(commandId)
        .first(),
    )
    .toEqual({ type: "bid", player_id: first === host ? started.you : joined.you });
});

test("the API rejects malformed commands, foreign origins, and players outside the game", async ({
  api,
}) => {
  const host = guest(1);
  for (const body of ["null", "[]", "{", JSON.stringify({ action: "create" })]) {
    const response = await api.runtime.dispatchFetch("http://game.test/api/game", {
      method: "POST",
      headers: { "x-player-token": host.token },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  }
  const foreign = await api.runtime.dispatchFetch(
    "http://game.test/api/game/socket?code=ABCDEFGH",
    {
      headers: { Upgrade: "websocket", Origin: "https://foreign.test" },
    },
  );
  expect(foreign.status).toBe(403);
  expect((await api.runtime.dispatchFetch("http://game.test/api/game")).status).toBe(400);

  const { code } = await api.state(host, { action: "create" });
  const other = guest(2);
  await api.state(other, { action: "join", code });
  await api.state(host, { action: "start", code });
  expect((await api.get(guest(3), code)).status).toBe(400);
});

test("reconnected players resume and late spectators receive live updates", async ({ api }) => {
  const host = guest(1);
  const other = guest(2);
  const watcher = guest(3);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const connection = await api.connect(host, code);
  await connection.command({ action: "start" });
  const before = connection.latest()!;
  connection.close();
  const resumed = await api.state(host, { action: "join", code });
  expect(resumed.you).toBe(before.you);
  expect(resumed.players).toEqual(before.players.map((p) => ({ ...p, seen: expect.any(Number) })));
  const reconnected = await api.connect(host, code);
  expect(reconnected.latest()!.spectating).toBe(false);
  const watching = await api.state(watcher, { action: "join", code });
  expect(watching.spectating).toBe(true);
  expect(watching.players).toHaveLength(2);
  const spectator = await api.connect(watcher, code);
  await expect.poll(() => reconnected.latest()?.spectatorCount).toBe(1);
  const secondTab = await api.connect(watcher, code);
  expect(secondTab.latest()!.spectatorCount).toBe(1);
  secondTab.close();
  spectator.close();
  await expect.poll(() => reconnected.latest()?.spectatorCount).toBe(0);
  const watchingAgain = await api.connect(watcher, code);
  await expect.poll(() => reconnected.latest()?.spectatorCount).toBe(1);
  expect((await watchingAgain.command({ action: "bid", bid: 0 })).type).toBe("error");
  const first = resumed.order[0] === resumed.you ? host : other;
  await api.state(first, { action: "bid", bid: 0, code });
  await expect
    .poll(() => watchingAgain.latest()?.players.find((p) => p.id === resumed.order[0])?.bid)
    .toBe(0);
  expect(watchingAgain.latest()!.players.every((p) => p.hand.every((card) => card === null))).toBe(
    true,
  );
  expect((await api.get(watcher, code)).status).toBe(200);
  await watchingAgain.command({ action: "leave" });
  await expect.poll(() => reconnected.latest()?.spectatorCount).toBe(0);
  expect((await api.get(watcher, code)).status).toBe(400);
  expect((await api.state(watcher, { action: "join", code })).spectating).toBe(true);
});

test("matchmaking skips games that have started", async ({ api }) => {
  const host = guest(1);
  const { code } = await api.state(host, { action: "match" });
  await api.state(guest(2), { action: "match" });
  await api.state(host, { action: "start", code });
  const next = await api.state(guest(3), { action: "match" });
  expect(next.code).not.toBe(code);
  expect(next.phase).toBe("lobby");
  expect(next.spectating).toBe(false);
});

test("quitting a started game preserves the seat and rejoining restores play", async ({ api }) => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  const first = started.order[0] === started.you ? host : other;
  const socket = await api.connect(first, code);
  const own = socket.latest()!.players.find((p) => p.id === socket.latest()!.you)!;
  expect((await socket.command({ action: "leave" })).type).toBe("ack");
  socket.close();
  const resumed = await api.state(first, { action: "join", code });
  expect(resumed.spectating).toBe(false);
  expect(resumed.players).toHaveLength(2);
  expect(resumed.players.find((p) => p.id === resumed.you)).toEqual({
    ...own,
    seen: expect.any(Number),
  });
  const reconnected = await api.connect(first, code);
  expect((await reconnected.command({ action: "bid", bid: 0 })).type).toBe("ack");
});
