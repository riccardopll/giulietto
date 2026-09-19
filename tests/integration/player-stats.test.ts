import { SELF, env } from "cloudflare:test";
import { expect, test } from "vitest";
import { api, guest } from "./helpers";
import { gameFixture } from "../unit/helpers";
import { historyStatements } from "../../src/server/match-history";
import type { StatsResponse } from "../../src/shared/player-stats";
import { eventStatements, type GameEvent } from "../../src/server/game-events";
import { playerStats } from "../../src/server/player-stats";

const db = env.DB;
const migration = (name: string) =>
  env.TEST_MIGRATIONS.find((entry) => entry.name === name)!.queries;

test.each([false, true])(
  "records bot participation from identity, not display names (%s)",
  async (bot) => {
    const game = gameFixture();
    game.players[1].name = "BOT Tutorial";
    game.players[1].bot = bot;
    await db.batch(eventStatements(db, game, []));
    expect(
      await db.prepare("SELECT has_bots FROM matches WHERE id=?").bind(game.matchId!).first(),
    ).toEqual({ has_bots: Number(bot) });
    game.phase = "finished";
    game.finishedAt = 200;
    game.winner = "p0";
    game.revision++;
    await db.batch(historyStatements(db, game, 0));
    await db.batch(historyStatements(db, game, 0));
    expect((await playerStats(db, "p0")).player).toMatchObject({ matches: 1, wins: 1 });
    expect((await playerStats(db, "p0")).leaders).toHaveLength(bot ? 2 : 3);
    expect(
      await db.prepare("SELECT has_bots FROM matches WHERE id=?").bind(game.matchId!).first(),
    ).toEqual({ has_bots: Number(bot) });
  },
);

test("stats use finalized history once, preserve identity, and rank players by wins", async () => {
  const host = guest(1);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(host.token));
  const id = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
  const read = async (token = host.token) => {
    const response = await SELF.fetch("http://game.test/api/stats", {
      headers: { "x-player-token": token },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return (await response.json()) as StatsResponse;
  };
  expect(await read()).toMatchObject({
    player: { matches: 0, wins: 0, level: 1, xp: 0 },
    leaders: [],
  });
  const game = gameFixture();
  game.players[0].id = id;
  const hostPlayer = game.players[0];
  const deliver = () => db.batch(historyStatements(db, game, 0));
  await deliver();
  expect((await read()).player.matches).toBe(0);
  game.phase = "finished";
  game.finishedAt = 200;
  game.winner = id;
  game.revision++;
  await deliver();
  await deliver();
  expect((await read()).player).toEqual({
    matches: 1,
    wins: 1,
    xp: 30,
    level: 1,
    acesOfCoinsPlayed: null,
    averagePrediction: null,
    averageDecisionMs: null,
  });
  game.matchId = "abandoned";
  game.winner = null;
  await deliver();
  expect((await read()).player.matches).toBe(1);
  for (let i = 0; i < 4; i++) {
    game.matchId = `next-${i}`;
    game.players = game.players.filter((p) => p.id !== id);
    game.winner = game.players[i % 2].id;
    await deliver();
  }
  const opponents = [...game.players];
  for (const opponent of opponents) {
    game.matchId = `host-wins-${opponent.id}`;
    game.players = [hostPlayer, opponent];
    game.winner = id;
    await deliver();
  }
  const result = await read();
  expect(result.leaders[0]).toMatchObject({ wins: 3, xp: 90, you: true });
  expect(result.leaders.find((p) => p.you)).toMatchObject({ name: "bot_1", matches: 3 });
  expect((await read(guest(4).token)).player.matches).toBe(0);
  expect(JSON.stringify(result)).not.toContain(id);
  expect(JSON.stringify(result)).not.toContain(host.token);
});

test("decision stats combine completed-match samples, omit missing timing, and survive replay", async () => {
  const read = async () => (await playerStats(db, "p0")).player;
  const make = (matchId: string, status: "completed" | "active" | "abandoned" = "completed") => {
    const game = gameFixture();
    game.matchId = matchId;
    game.revision = 10;
    if (status !== "active") {
      game.phase = "finished";
      game.finishedAt = 200;
      game.winner = status === "completed" ? "p0" : null;
    }
    return game;
  };
  const deliver = async (
    game: ReturnType<typeof make>,
    moves: { type: string; payload: object; source?: GameEvent["source"] }[],
  ) => {
    const events: GameEvent[] = moves.map((move, i) => ({
      sequence: i + 1,
      match_id: game.matchId!,
      revision: game.revision,
      round: 1,
      type: move.type,
      player_id: "p0",
      source: move.source ?? "player",
      command_id: `command-${i}`,
      occurred_at: 200,
      payload: JSON.stringify(move.payload),
    }));
    await db.batch([
      ...eventStatements(db, game, events),
      ...historyStatements(db, game, events.length),
    ]);
  };
  const first = make("timed-1");
  const moves = [
    { type: "bid", payload: { bid: 2, elapsedMs: 1000 } },
    { type: "play", payload: { card: 31, elapsedMs: 3000 } },
    { type: "play", payload: { card: 1, elapsedMs: 0 } },
    { type: "play", payload: { card: 31, elapsedMs: 40000 }, source: "timeout" as const },
    { type: "bid", payload: { bid: 0, elapsedMs: 40000 }, source: "timeout" as const },
  ];
  await deliver(first, moves);
  await deliver(make("timed-2"), [{ type: "bid", payload: { bid: 4, elapsedMs: 5000 } }]);
  const older = make("older");
  await deliver(older, [
    { type: "bid", payload: { bid: 0 } },
    { type: "play", payload: { card: 31 } },
  ]);
  // Simulate the pre-migration summaries, then backfill the counts from old events.
  await db
    .prepare(
      "UPDATE match_results SET aces_of_coins_played=NULL, prediction_total=NULL, prediction_count=NULL WHERE match_id='older'",
    )
    .run();
  await db.prepare(migration("0007_player_decision_stats.sql").at(-1)!).run();
  const expected = {
    matches: 3,
    acesOfCoinsPlayed: 3,
    averagePrediction: 1.5,
    averageDecisionMs: 2250,
  };
  expect(await read()).toMatchObject(expected);
  const stored = await db
    .prepare(
      "SELECT play_time_ms, timed_plays, prediction_time_ms, timed_predictions FROM match_results WHERE match_id=? AND player_id='p0'",
    )
    .bind(first.matchId!)
    .first();
  expect(stored).toEqual({
    play_time_ms: 3000,
    timed_plays: 2,
    prediction_time_ms: 1000,
    timed_predictions: 1,
  });
  for (const status of ["active", "abandoned"] as const) {
    await deliver(make(status, status), moves);
    expect(await read()).toMatchObject(expected);
  }
  await deliver(first, moves);
  first.revision--;
  await db.batch(historyStatements(db, first, 0));
  expect(await read()).toMatchObject(expected);
  expect((await playerStats(db, "unknown")).player).toMatchObject({
    acesOfCoinsPlayed: 0,
    averagePrediction: null,
    averageDecisionMs: null,
  });
});

test("stats API requires a guest token and rejects writes and foreign origins", async () => {
  for (const [init, status] of [
    [{}, 400],
    [{ method: "POST" }, 405],
    [{ headers: { Origin: "https://foreign.test" } }, 403],
  ] as const) {
    expect((await SELF.fetch("http://game.test/api/stats", init)).status).toBe(status);
  }
});

test("profile edits persist, reach tables, and survive older match history", async () => {
  const host = guest(1);
  const save = (value: unknown) =>
    SELF.fetch("http://game.test/api/profile", {
      method: "POST",
      headers: { "x-player-token": host.token },
      body: JSON.stringify(value),
    });
  for (const value of [
    null,
    { name: "", avatar: "king-cups" },
    { name: "x".repeat(21), avatar: "king-cups" },
    { name: "bot_1", avatar: "../../secret" },
  ])
    expect((await save(value)).status).toBe(400);
  const profile = { name: "bot_1", avatar: "queen-coins" };
  expect(await (await save(profile)).json()).toEqual(profile);
  const created = await api.state(host, { action: "create", name: "stale cookie" });
  expect(created.players[0]).toMatchObject({ name: "bot_1", avatar: "queen-coins" });
  const renamed = { name: "bot_2", avatar: "knight-swords" };
  expect((await save(renamed)).status).toBe(200);
  const old = gameFixture();
  old.players[0].id = created.you;
  await db.batch(historyStatements(db, old, 0));
  const read = await SELF.fetch("http://game.test/api/stats", {
    headers: { "x-player-token": host.token },
  });
  expect(await read.json()).toMatchObject({ profile: renamed });
  const rejoined = await api.state(host, {
    action: "join",
    code: created.code,
    name: "stale cookie",
  });
  expect(rejoined.players[0]).toMatchObject(renamed);
  await api.state(host, { action: "rename", code: created.code, name: "bot_1" });
  const updated = await SELF.fetch("http://game.test/api/stats", {
    headers: { "x-player-token": host.token },
  });
  expect(await updated.json()).toMatchObject({
    profile: { name: "bot_1", avatar: "knight-swords" },
  });
});

test("aggregate migration preserves historical samples and retries count each completed match once", async () => {
  const games = ["completed", "completed", "active", "abandoned"].map((status, i) => {
    const game = gameFixture();
    game.matchId = `backfill-${i}`;
    game.revision = 10;
    if (status !== "active") {
      game.phase = "finished";
      game.finishedAt = 200;
      game.winner = status === "completed" ? `p${i}` : null;
    }
    return game;
  });
  for (const game of games) await db.batch(historyStatements(db, game, 0));
  await db
    .prepare(`UPDATE match_results SET aces_of_coins_played=2,
    prediction_total=6,prediction_count=3,play_time_ms=4000,timed_plays=2,
    prediction_time_ms=2000,timed_predictions=1
    WHERE match_id='backfill-0' AND player_id='p0'`)
    .run();
  // Recreate the pre-migration schema in this isolated test database.
  await db.batch([
    db.prepare("DROP TABLE player_stats"),
    db.prepare("ALTER TABLE matches DROP COLUMN stats_counted"),
  ]);
  await db.batch(migration("0008_player_stats.sql").map((sql) => db.prepare(sql)));
  const read = async () => (await playerStats(db, "p0")).player;
  const expected = {
    matches: 2,
    wins: 1,
    xp: 40,
    level: 1,
    acesOfCoinsPlayed: 2,
    averagePrediction: 2,
    averageDecisionMs: 2000,
  };
  expect(await read()).toEqual(expected);
  for (const game of games) await db.batch(historyStatements(db, game, 0));
  expect(await read()).toEqual(expected);

  const next = structuredClone(games[0]);
  next.matchId = "atomic-finalization";
  await expect(
    db.batch([
      ...historyStatements(db, next, 0),
      db.prepare("INSERT INTO player_stats(player_id) VALUES('p0')"),
    ]),
  ).rejects.toThrow();
  expect(await read()).toEqual(expected);
  expect(
    await db.prepare("SELECT id FROM matches WHERE id=?").bind(next.matchId).first(),
  ).toBeNull();
  await Promise.all([
    db.batch(historyStatements(db, next, 0)),
    db.batch(historyStatements(db, next, 0)),
  ]);
  expect(await read()).toEqual({ ...expected, matches: 3, wins: 2, xp: 70 });
  const plan = await db
    .prepare(`EXPLAIN QUERY PLAN SELECT p.id FROM player_stats s
    JOIN players p ON p.id=s.player_id
    ORDER BY s.wins DESC,s.xp DESC,s.player_id ASC LIMIT 20`)
    .all<{ detail: string }>();
  expect(plan.results.some((row) => row.detail.includes("player_stats_ranking"))).toBe(true);
  expect(plan.results.some((row) => row.detail.includes("TEMP B-TREE"))).toBe(false);
});
