import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import { BLIND_PLAY_MS, type Game } from "../../src/shared/game";
import { api, guest } from "./helpers";

const DAY = 86_400_000;

afterEach(() => vi.useRealTimers());

async function alarmAt(code: string, time: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
  return runDurableObjectAlarm(env.ROOMS.getByName(code));
}

test("expired turns are played automatically and recorded as timeouts", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  await expect
    .poll(() =>
      env.DB.prepare("SELECT status FROM matches WHERE id=?").bind(started.matchId!).first(),
    )
    .toEqual({ status: "active" });

  expect(await alarmAt(code, started.deadline + 1)).toBe(true);
  const oneBid = await api.state(host, { action: "join", code });
  expect(oneBid).toMatchObject({ phase: "bidding", turn: 1 });
  expect(await alarmAt(code, oneBid.deadline + 1)).toBe(true);
  const playing = await api.state(host, { action: "join", code });
  expect(playing.phase).toBe("playing");
  expect(playing.players.map((player) => player.bid)).toEqual([0, 0]);

  expect(await alarmAt(code, playing.deadline - 1)).toBe(true);
  const events = await env.DB.prepare(
    "SELECT player_id, source FROM match_events WHERE match_id=? AND type='bid' ORDER BY sequence",
  )
    .bind(started.matchId!)
    .all<{ player_id: string; source: string }>();
  expect(events.results).toEqual(
    started.order.map((player_id) => ({ player_id, source: "timeout" })),
  );
});

test("blind cards are played by the table and recorded as system plays", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  const joined = await api.state(other, { action: "join", code });
  const started = await api.state(host, { action: "start", code });
  const guests = new Map([
    [started.you, host],
    [joined.you, other],
  ]);
  const stub = env.ROOMS.getByName(code);
  await runInDurableObject(stub, (_instance, ctx) => {
    const room = ctx.storage.kv.get("room") as { game: Game };
    room.game.count = 1;
    room.game.players.forEach((player, seat) => {
      player.hand = [seat + 1];
    });
    ctx.storage.kv.put("room", room);
  });
  let state = started;
  for (const id of started.order)
    state = await api.state(guests.get(id)!, { action: "bid", bid: 0, code });
  expect(state).toMatchObject({ phase: "playing", turnMs: BLIND_PLAY_MS });
  await expect
    .poll(() =>
      env.DB.prepare("SELECT COUNT(*) AS n FROM match_events WHERE match_id=? AND type='bid'")
        .bind(started.matchId!)
        .first(),
    )
    .toEqual({ n: 2 });

  expect(await alarmAt(code, state.deadline)).toBe(true);
  state = await api.state(host, { action: "join", code });
  expect(state.trick).toHaveLength(1);
  expect(state.deadline).toBe(Date.now() + BLIND_PLAY_MS);
  expect(await alarmAt(code, state.deadline)).toBe(true);
  expect((await api.state(host, { action: "join", code })).phase).toBe("trick");
  const plays = await runInDurableObject(stub, (_instance, ctx) =>
    ctx.storage.sql
      .exec("SELECT player_id, source FROM game_events WHERE type='play' ORDER BY sequence")
      .toArray(),
  );
  expect(plays).toEqual(started.order.map((player_id) => ({ player_id, source: "system" })));
});

test("lobby seats expire while disconnected and the host role moves on", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  await api.state(other, { action: "join", code });
  const socket = await api.connect(other, code);
  const start = Date.now();
  expect(await alarmAt(code, start + 120_001)).toBe(true);
  await expect
    .poll(() => socket.latest()?.players.map((player) => player.id))
    .toEqual([socket.latest()!.you]);
  expect(socket.latest()!.host).toBe(socket.latest()!.you);
  vi.useRealTimers();
  expect((await api.get(host, code)).status).toBe(400);
  const rejoined = await api.state(host, { action: "join", code });
  expect(rejoined.players).toHaveLength(2);
  expect(rejoined.host).toBe(socket.latest()!.you);
});

test("idle tables expire after a day and close their connections", async () => {
  const host = guest(1);
  const { code } = await api.state(host, { action: "create" });
  const socket = await api.connect(host, code);
  expect(await alarmAt(code, Date.now() + DAY + 1)).toBe(true);
  expect(await socket.closed).toEqual({ code: 4001, reason: "tableExpired" });
  vi.useRealTimers();
  const response = await api.get(host, code);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "tableNotFound",
  });
  expect((await api.post(host, { action: "join", code })).status).toBe(400);
});
