import {
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import { createBot } from "../../src/shared/bot";
import weights from "../../public/bot/weights.json";
import { findPlayer, TURN_MS, view, type Game } from "../../src/shared/game";
import { historyStatements } from "../../src/server/match-history";
import { playerStats } from "../../src/server/player-stats";
import { api, guest } from "./helpers";

afterEach(() => vi.useRealTimers());

const policy = createBot(weights);
const read = (code: string) =>
  runInDurableObject(env.ROOMS.getByName(code), (_instance, ctx) =>
    structuredClone((ctx.storage.kv.get("room") as { game: Game }).game),
  );

test("only the lobby host manages bots, with unique names, seat limits, and retry-safe commands", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  const joined = await api.state(other, { action: "join", code });
  const socket = await api.connect(host, code);
  expect((await api.post(other, { action: "addBot", code })).status).toBe(400);
  const input = { action: "addBot", commandId: crypto.randomUUID() };
  expect((await socket.command(input)).type).toBe("ack");
  expect((await socket.command(input)).type).toBe("ack");
  expect((await read(code)).players).toHaveLength(3);
  const first = (await read(code)).players.find((player) => player.bot)!;
  expect((await api.post(other, { action: "removeBot", playerId: first.id, code })).status).toBe(
    400,
  );
  expect((await api.post(host, { action: "removeBot", playerId: joined.you, code })).status).toBe(
    400,
  );
  await api.state(host, { action: "removeBot", playerId: first.id, code });
  for (let i = 0; i < 4; i++) await api.state(host, { action: "addBot", code });
  const game = await read(code);
  expect(game.players).toHaveLength(6);
  const bots = game.players.filter((player) => player.bot);
  expect(bots).toHaveLength(4);
  expect(new Set(bots.map((player) => player.name)).size).toBe(4);
  expect(bots.every((player) => player.name.startsWith("BOT: "))).toBe(true);
  expect((await api.post(host, { action: "addBot", code })).status).toBe(400);
  await api.state(host, { action: "start", code });
  expect((await api.post(host, { action: "addBot", code })).status).toBe(400);
  expect((await api.post(host, { action: "removeBot", playerId: bots[0].id, code })).status).toBe(
    400,
  );
});

test("bots survive lobby inactivity and never inherit the host role", async () => {
  const host = guest(1);
  const other = guest(2);
  const { code } = await api.state(host, { action: "create" });
  await api.state(host, { action: "addBot", code });
  const joined = await api.state(other, { action: "join", code });
  await api.connect(other, code);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 120_001);
  await runDurableObjectAlarm(env.ROOMS.getByName(code));
  const game = await read(code);
  expect(game.players).toHaveLength(2);
  expect(game.host).toBe(joined.you);
  expect(view(game, joined.you, new Set([joined.you])).players[0].connected).toBe(true);
  await api.state(other, { action: "leave", code });
  expect((await read(code)).host).toBe("");
  const rejoined = await api.state(host, { action: "join", code });
  expect(rejoined.host).toBe(rejoined.you);
});

test("server bots finish a match across eviction and persist bot identity without ranking bots", async () => {
  const host = guest(1);
  const { code, you } = await api.state(host, { action: "create" });
  await api.state(host, { action: "settings", startingLives: 1, code });
  await api.state(host, { action: "addBot", code });
  await api.state(host, { action: "addBot", code });
  await api.state(host, { action: "start", code });
  const stub = env.ROOMS.getByName(code);
  await evictDurableObject(stub);
  vi.useFakeTimers({ toFake: ["Date"] });
  let game = await read(code);
  let botMoves = 0;
  for (let step = 0; game.phase !== "finished" && step < 1000; step++) {
    if (game.phase === "bidding" || game.phase === "playing") {
      const id = game.order[game.turn];
      if (findPlayer(game, id)!.bot) {
        const move = policy(view(game, id))!;
        const alarm = await runInDurableObject(stub, (_instance, ctx) => ctx.storage.getAlarm());
        expect(alarm).not.toBeNull();
        expect(alarm!).toBeLessThanOrEqual(game.deadline - TURN_MS + 1000);
        vi.setSystemTime(alarm!);
        await runDurableObjectAlarm(stub);
        const next = await read(code);
        if (next.revision === game.revision) continue;
        if (move.action === "bid") expect(findPlayer(next, id)!.bid).toBe(move.bid);
        else
          expect(next.trick.at(-1)).toMatchObject({
            player: id,
            card: move.card ?? findPlayer(game, id)!.hand[0],
            ...(move.mode ? { mode: move.mode } : {}),
          });
        botMoves++;
      } else {
        const state = view(game, you);
        await api.state(host, {
          code,
          ...(game.phase === "bidding"
            ? { action: "bid", bid: state.legalBids[0] }
            : { action: "play", card: findPlayer(game, you)!.hand[0], mode: "high" }),
        });
      }
    } else {
      vi.setSystemTime(game.deadline);
      await runDurableObjectAlarm(stub);
    }
    game = await read(code);
  }
  expect(game.phase).toBe("finished");
  expect(botMoves).toBeGreaterThan(10);
  const finished = structuredClone(game);
  for (let i = 0; i < 10; i++) {
    vi.setSystemTime(Date.now() + 1000);
    await runDurableObjectAlarm(stub);
    const pending = await runInDurableObject(
      stub,
      (_instance, ctx) => !!(ctx.storage.kv.get("room") as { outbox?: Game }).outbox,
    );
    if (!pending) break;
  }
  expect(
    await env.DB.prepare("SELECT has_bots,stats_counted,status FROM matches WHERE id=?")
      .bind(game.matchId!)
      .first(),
  ).toEqual({ has_bots: 1, stats_counted: 1, status: "completed" });
  const bots = game.players.filter((player) => player.bot);
  for (const player of bots) {
    expect(
      await env.DB.prepare("SELECT is_bot FROM players WHERE id=?").bind(player.id).first(),
    ).toEqual({ is_bot: 1 });
    expect(
      await env.DB.prepare("SELECT * FROM player_stats WHERE player_id=?").bind(player.id).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM match_events WHERE player_id=? AND type IN ('bid','play') AND source!='system'",
      )
        .bind(player.id)
        .first(),
    ).toEqual({ n: 0 });
  }
  await env.DB.batch(historyStatements(env.DB, finished, 0));
  const stats = await playerStats(env.DB, you);
  expect(stats.player.matches).toBe(1);
  expect(stats.leaders).toHaveLength(1);
  expect(stats.leaders[0].you).toBe(true);
});

test.each([7, 31])("bots play the blind card %i without exposing it to inference", async (card) => {
  const host = guest(1);
  const { code, you } = await api.state(host, { action: "create" });
  const added = await api.state(host, { action: "addBot", code });
  const id = added.players.find((player) => player.bot)!.id;
  await api.state(host, { action: "start", code });
  const stub = env.ROOMS.getByName(code);
  await runInDurableObject(stub, (_instance, ctx) => {
    const room = ctx.storage.kv.get("room") as { game: Game };
    Object.assign(room.game, { phase: "playing", round: 6, count: 1, order: [id, you], turn: 0 });
    findPlayer(room.game, id)!.hand = [card];
    findPlayer(room.game, you)!.hand = [12];
    ctx.storage.kv.put("room", room);
  });
  const game = await read(code);
  const state = view(game, id);
  expect(findPlayer(state, id)!.hand).toEqual([null]);
  const move = policy(state)!;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(game.deadline + 1);
  await runDurableObjectAlarm(stub);
  expect((await read(code)).trick).toEqual([
    { player: id, card, ...(move.action === "play" && move.mode ? { mode: move.mode } : {}) },
  ]);
});
