import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import type { Game } from "../../src/shared/game";
import { REMATCH_INVITE_MS } from "../../src/shared/rematch";
import { api, guest } from "./helpers";

afterEach(() => vi.useRealTimers());

async function finishedTable(players: ReturnType<typeof guest>[]) {
  const { code } = await api.state(players[0], { action: "create" });
  for (const player of players.slice(1)) await api.state(player, { action: "join", code });
  const started = await api.state(players[0], { action: "start", code });
  await runInDurableObject(env.ROOMS.getByName(code), (_instance, ctx) => {
    const room = ctx.storage.kv.get("room") as { game: Game };
    room.game.phase = "finished";
    room.game.deadline = 0;
    room.game.winner = started.you;
    room.game.finishedAt = Date.now();
    ctx.storage.kv.put("room", room);
  });
  return code;
}

test("a rematch opens one private lobby that invited players can join until it expires", async () => {
  const players = [guest(1), guest(2), guest(3)];
  const code = await finishedTable(players);
  const host = await api.connect(players[0], code);
  const other = await api.connect(players[1], code);
  const spectator = guest(4);
  await api.state(spectator, { action: "join", code });
  expect((await api.post(spectator, { action: "rematch", code })).status).toBe(400);

  const commandId = crypto.randomUUID();
  const reply = await host.command({ action: "rematch", commandId });
  expect(reply.type).toBe("ack");
  const state = (reply as { state: Game }).state;
  const invite = state.rematch!;
  expect(invite).toMatchObject({
    by: state.host,
    code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{8}$/),
  });
  expect(invite.code).not.toBe(code);
  expect(invite.expiresAt - REMATCH_INVITE_MS).toBeLessThanOrEqual(Date.now());
  await expect.poll(() => other.latest()?.rematch).toEqual(invite);
  const refused = await other.command({ action: "rematch" });
  expect(refused).toMatchObject({
    type: "error",
    error: "bot_1 already invited everyone to a rematch.",
  });
  expect((await host.command({ action: "rematch", commandId })).type).toBe("ack");

  const lobby = await api.state(players[1], { action: "join", code: invite.code });
  expect(lobby).toMatchObject({ phase: "lobby", public: false, host: state.host });
  expect(lobby.players.map((player) => player.name)).toEqual(["bot_1", "bot_2"]);
  expect(lobby.players[0].avatar).toBe(state.players.find((p) => p.id === state.host)!.avatar);

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(invite.expiresAt);
  expect(await runDurableObjectAlarm(env.ROOMS.getByName(code))).toBe(true);
  await expect.poll(() => other.latest()?.revision).toBeGreaterThan(state.revision);
  expect(other.latest()?.rematch).toBeUndefined();
  const reopened = await api.state(players[2], { action: "rematch", code });
  expect(reopened.rematch).toMatchObject({ by: reopened.you });
  expect(reopened.rematch!.code).not.toBe(invite.code);
  vi.useRealTimers();
  const second = await api.state(players[2], { action: "join", code: reopened.rematch!.code });
  expect(second.players.map((player) => player.name)).toEqual(["bot_3"]);
  host.close();
  other.close();
  await Promise.all([host.closed, other.closed]);
});
