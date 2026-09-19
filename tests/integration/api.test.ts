import { findPlayer, type Game, type GameView } from "../../src/shared/game";
import { SELF, env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import { api, captureLogs, guest } from "./helpers";

test("public matchmaking fills a lobby that waits for its host to start", async () => {
  const players = Array.from({ length: 6 }, (_, index) => guest(index + 1));
  const created = await api.state(players[0], { action: "match" });
  const joined = await Promise.all(
    players.slice(1).map((player) => api.state(player, { action: "match" })),
  );
  const codes = new Set(joined.map((state) => state.code));
  expect(codes).toEqual(new Set([created.code]));
  expect(joined.every((state) => state.phase === "lobby")).toBe(true);
  const response = await api.get(players[0], created.code);
  const state = (await response.json()) as GameView;
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
  test(`a ${visibility} lobby lets only its host configure lives and move time and start the game`, async () => {
    const host = guest(1);
    const other = guest(2);
    const created = await api.state(host, { action });
    const { code } = created;
    expect(created).toMatchObject({
      phase: "lobby",
      startingLives: 3,
      turnSeconds: 30,
      host: created.you,
    });
    expect((await api.post(host, { action: "start", code })).status).toBe(400);
    await api.state(other, { action: "join", code });

    for (const action of ["settings", "start"]) {
      expect(
        (await api.post(other, { action, code, startingLives: 5, turnSeconds: 20 })).status,
      ).toBe(400);
    }
    for (const startingLives of [0, 6, 1.5, "5"]) {
      expect(
        (await api.post(host, { action: "settings", turnSeconds: 30, code, startingLives })).status,
      ).toBe(400);
    }
    for (const turnSeconds of [0, 4, 61, 5.5, "35", null]) {
      expect(
        (await api.post(host, { action: "settings", code, startingLives: 5, turnSeconds })).status,
      ).toBe(400);
    }
    const configured = await api.state(host, {
      action: "settings",
      turnSeconds: 20,
      code,
      startingLives: 5,
    });
    expect(configured.startingLives).toBe(5);
    expect(configured.turnSeconds).toBe(20);
    const joined = await api.state(guest(3), { action: "join", code });
    expect(joined.players.map((player) => player.lives)).toEqual([5, 5, 5]);

    const started = await api.state(host, { action: "start", code });
    expect(started.phase).toBe("bidding");
    expect(started.turnSeconds).toBe(20);
    expect(started.deadline).toBe(started.startedAt! + 20000);
    expect(started.players.every((player) => player.lives === 5 && player.hand.length === 6)).toBe(
      true,
    );
    expect(
      (await api.post(host, { action: "settings", turnSeconds: 30, code, startingLives: 1 }))
        .status,
    ).toBe(400);
  });
}

test("players rename only themselves in the lobby and keep the name on reconnect", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code, you: hostId } = await api.state(host, { action: "create" });
  const joined = await api.state(other, { action: "join", code });
  const observer = await api.connect(host, code);
  const socket = await api.connect(other, code);
  for (const name of ["", "   ", null, 42]) {
    expect((await socket.command({ action: "rename", name })).type).toBe("error");
  }
  expect((await api.post(guest(3), { action: "rename", code, name: "bot_3" })).status).toBe(400);
  expect((await socket.command({ action: "rename", name: "  bot_3  ", id: hostId })).type).toBe(
    "ack",
  );
  await expect
    .poll(() => observer.latest()?.players.map((player) => player.name))
    .toEqual(["bot_1", "bot_3"]);
  socket.close();
  const resumed = await api.state(other, { action: "join", code });
  expect(resumed).toMatchObject({ you: joined.you, viewerName: "bot_3" });
  const renamed = await api.state(other, { action: "rename", code, name: "bot_2" });
  expect(renamed.viewerName).toBe("bot_2");
  await api.state(host, { action: "start", code });
  expect((await api.post(other, { action: "rename", code, name: "bot_3" })).status).toBe(400);
  const spectator = guest(3);
  await api.state(spectator, { action: "join", code });
  expect((await api.post(spectator, { action: "rename", code, name: "bot_4" })).status).toBe(400);
});

test("WebSockets send each player their own hand and broadcast accepted moves", async () => {
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
    const own = findPlayer(state, state.you)!;
    const opponent = state.players.find((player) => player.id !== state.you)!;
    expect(own.hand).toHaveLength(6);
    expect(own.hand.every((card) => typeof card === "number")).toBe(true);
    expect(opponent.hand).toEqual(Array(6).fill(null));
  }
  const beforeEmote = sockets[0].latest()!;
  const commandId = crypto.randomUUID();
  const emoteRequest = { action: "emote", emote: "chicken", code, commandId };
  const sent = await api.state(host, emoteRequest);
  await expect
    .poll(() => sockets[1].latest()?.players.find((p) => p.id === sent.you)?.emote)
    .toEqual({ id: "chicken", sentAt: expect.any(Number) });
  expect(sent.turn).toBe(beforeEmote.turn);
  expect(sent.deadline).toBe(beforeEmote.deadline);
  expect((await api.state(host, emoteRequest)).revision).toBe(sent.revision);
  expect((await sockets[0].command({ action: "emote", emote: "chicken" })).type).toBe("error");
  expect((await sockets[1].command({ action: "emote", emote: "perso" })).type).toBe("ack");
  const spectator = guest(3);
  await api.state(spectator, { action: "join", code });
  const reacted = await api.state(spectator, { action: "emote", emote: "chicken", code });
  expect(reacted.spectators?.find((watcher) => watcher.id === reacted.you)?.emote).toEqual({
    id: "chicken",
    sentAt: expect.any(Number),
  });
  await expect.poll(() => sockets[1].latest()?.spectators?.[0]?.emote?.id).toBe("chicken");
  const beforeChat = sockets[1].latest()!;
  expect((await sockets[0].command({ action: "chat", text: " hello  table " })).type).toBe("ack");
  const chatted = await api.state(spectator, { action: "chat", text: "hi from the stands", code });
  expect(chatted.chat).toEqual([
    {
      id: 1,
      sender: sockets[0].latest()!.you,
      name: "bot_1",
      text: "hello table",
      sentAt: expect.any(Number),
    },
    {
      id: 2,
      sender: chatted.you,
      name: "bot_3",
      text: "hi from the stands",
      sentAt: expect.any(Number),
    },
  ]);
  expect(chatted.turn).toBe(beforeChat.turn);
  expect(chatted.deadline).toBe(beforeChat.deadline);
  await expect
    .poll(() => sockets[1].latest()?.chat?.map((message) => message.text))
    .toEqual(["hello table", "hi from the stands"]);
  expect((await sockets[1].command({ action: "chat", text: "   " })).type).toBe("error");

  const byId = new Map(sockets.map((socket) => [socket.latest()!.you, socket]));
  for (const id of sockets[0].latest()!.order) {
    expect((await byId.get(id)!.command({ action: "bid", bid: 0 })).type).toBe("ack");
  }
  await expect
    .poll(() => sockets.every((socket) => socket.latest()?.phase === "playing"))
    .toBe(true);
  const playing = sockets[0].latest()!;
  const current = byId.get(playing.order[playing.turn])!;
  const currentGameView = current.latest()!;
  const card = findPlayer(currentGameView, currentGameView.you)!.hand[0];
  expect((await current.command({ action: "play", card, mode: "high" })).type).toBe("ack");
  for (const socket of sockets) {
    await expect
      .poll(() => socket.latest()?.trick)
      .toEqual([{ player: currentGameView.you, card, ...(card === 31 ? { mode: "high" } : {}) }]);
  }
});

test("started matches and player commands are recorded in D1", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  const joined = await api.state(other, { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  const first = started.order[0] === started.you ? host : other;
  const commandId = crypto.randomUUID();
  await api.state(first, { action: "bid", code, bid: 0, commandId });
  await expect
    .poll(() =>
      env.DB.prepare("SELECT status, player_count FROM matches WHERE id=?")
        .bind(started.matchId!)
        .first(),
    )
    .toEqual({ status: "active", player_count: 2 });
  await expect
    .poll(() =>
      env.DB.prepare("SELECT type, player_id FROM match_events WHERE command_id=? AND type='bid'")
        .bind(commandId)
        .first(),
    )
    .toEqual({ type: "bid", player_id: first === host ? started.you : joined.you });
});

test("the API rejects malformed commands, foreign origins, and players outside the game", async () => {
  const host = guest(1);
  for (const body of ["null", "[]", "{", JSON.stringify({ action: "create" })]) {
    const response = await SELF.fetch("http://game.test/api/game", {
      method: "POST",
      headers: { "x-player-token": host.token },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  }
  const foreign = await SELF.fetch("http://game.test/api/game/socket?code=ABCDEFGH", {
    headers: { Upgrade: "websocket", Origin: "https://foreign.test" },
  });
  expect(foreign.status).toBe(403);
  expect((await SELF.fetch("http://game.test/api/game")).status).toBe(400);

  const { code } = await api.state(host, { action: "create" });
  const other = guest(2);
  await api.state(other, { action: "join", code });
  await api.state(host, { action: "start", code });
  expect((await api.get(guest(3), code)).status).toBe(400);
});

test("reconnected players resume and late spectators receive live updates", async () => {
  const host = guest(1);
  const other = guest(2);
  const watcher = guest(3);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const logs = captureLogs();
  const connection = await api.connect(host, code);
  const start = { action: "start", commandId: crypto.randomUUID() };
  await connection.command(start);
  const before = connection.latest()!;
  const opened = () => logs.find((log) => log.event === "opened" && log.playerId === before.you);
  await expect.poll(opened).toBeDefined();
  const { connectionId } = opened()!;
  connection.close();
  await expect
    .poll(() =>
      logs.some(
        (log) =>
          log.event === "closed" &&
          log.connectionId === connectionId &&
          log.playerId === before.you &&
          log.roomCode === code,
      ),
    )
    .toBe(true);
  const resumed = await api.state(host, { action: "join", code });
  expect(resumed.you).toBe(before.you);
  expect(resumed.players).toEqual(
    before.players.map((p) => ({ ...p, seen: expect.any(Number), connected: expect.any(Boolean) })),
  );
  const reconnected = await api.connect(host, code);
  expect(reconnected.latest()!.spectating).toBe(false);
  expect(await reconnected.command(start)).toMatchObject({
    type: "ack",
    state: { revision: resumed.revision },
  });
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
  await expect
    .poll(() =>
      logs.some(
        (log) =>
          log.event === "request_failed" &&
          log.playerId === watching.you &&
          log.roomCode === code &&
          log.reason === "Join this table first.",
      ),
    )
    .toBe(true);
  expect((await api.state(watcher, { action: "join", code })).spectating).toBe(true);
  const restored = await api.connect(watcher, code);
  expect(restored.latest()!.spectating).toBe(true);
  expect(restored.latest()!.players).toHaveLength(2);
  expect(JSON.stringify(logs)).not.toContain(watcher.token);
});

test("matchmaking skips games that have started", async () => {
  const host = guest(1);
  const { code } = await api.state(host, { action: "match" });
  await api.state(guest(2), { action: "match" });
  await api.state(host, { action: "start", code });
  const next = await api.state(guest(3), { action: "match" });
  expect(next.code).not.toBe(code);
  expect(next.phase).toBe("lobby");
  expect(next.spectating).toBe(false);
});

test("quitting a started game preserves the seat and rejoining restores play", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  const first = started.order[0] === started.you ? host : other;
  const socket = await api.connect(first, code);
  const observer = await api.connect(first === host ? other : host, code);
  const own = socket.latest()!.players.find((p) => p.id === socket.latest()!.you)!;
  expect((await socket.command({ action: "leave" })).type).toBe("ack");
  socket.close();
  await expect
    .poll(() => observer.latest()?.players.find((p) => p.id === own.id)?.connected)
    .toBe(false);
  const resumed = await api.state(first, { action: "join", code });
  expect(resumed.spectating).toBe(false);
  expect(resumed.players).toHaveLength(2);
  expect(findPlayer(resumed, resumed.you)).toEqual({
    ...own,
    seen: expect.any(Number),
    connected: false,
  });
  const reconnected = await api.connect(first, code);
  await expect
    .poll(() => observer.latest()?.players.find((p) => p.id === own.id)?.connected)
    .toBe(true);
  expect((await reconnected.command({ action: "bid", bid: 0 })).type).toBe("ack");
});

test("sockets close on floods, oversized messages, and a fourth tab", async () => {
  const [host, second, third] = [guest(1), guest(2), guest(3)];
  const { code } = await api.state(host, { action: "create" });
  await api.state(second, { action: "join", code });
  await api.state(third, { action: "join", code });
  const flooded = await api.connect(host, code);
  for (let i = 0; i < 11; i++) flooded.send(JSON.stringify({ action: "rename", name: "bot_1" }));
  expect(await flooded.closed).toMatchObject({ code: 1008 });

  const oversized = await api.connect(second, code);
  oversized.send("x".repeat(2049));
  expect(await oversized.closed).toMatchObject({ code: 1009 });

  const first = await api.connect(third, code);
  await api.connect(third, code);
  await api.connect(third, code);
  const latest = await api.connect(third, code);
  expect(await first.closed).toMatchObject({ code: 4002 });
  expect((await latest.command({ action: "rename", name: "bot_3" })).type).toBe("ack");
});

test.each([undefined, 20])("restores saved tables with move time %s", async (turnSeconds) => {
  const host = guest(1);
  const { code } = await api.state(host, { action: "create" });
  const stub = env.ROOMS.getByName(code);
  await runInDurableObject(stub, (_instance, ctx) => {
    const room = ctx.storage.kv.get("room") as { game: Game };
    if (turnSeconds === undefined) Reflect.deleteProperty(room.game, "turnSeconds");
    else room.game.turnSeconds = turnSeconds;
    ctx.storage.kv.put("room", room);
  });
  await evictDurableObject(stub);
  const restored = await api.state(host, { action: "join", code });
  expect(restored.turnSeconds).toBe(turnSeconds ?? 30);
  await api.state(guest(2), { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  expect(started.deadline).toBe(started.startedAt! + (turnSeconds ?? 30) * 1000);
});
