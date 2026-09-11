import { expect } from "vitest";
import { test, guest } from "./worker";
import { gameFixture } from "../unit/helpers";
import { historyStatements } from "../../src/server/match-history";
import type { StatsResponse } from "../../src/shared/player-stats";

test("stats use finalized history once, preserve identity, and order both leaderboards", async ({
  api,
}) => {
  const host = guest(1);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(host.token));
  const id = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
  const read = async (token = host.token) => {
    const response = await api.runtime.dispatchFetch("http://game.test/api/stats", {
      headers: { "x-player-token": token },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return (await response.json()) as StatsResponse;
  };
  expect(await read()).toMatchObject({
    player: { matches: 0, wins: 0, level: 1, xp: 0 },
    experience: [],
    wins: [],
  });
  const db = await api.runtime.getD1Database("DB");
  const game = gameFixture();
  game.players[0].id = id;
  game.players[0].stats = {
    roundsPlayed: 2,
    tricksWon: 3,
    exactPredictions: 1,
    predictionError: 2,
  };
  const hostPlayer = game.players[0];
  const deliver = () =>
    db.batch(
      historyStatements(db as unknown as D1Database, game, {
        eventCount: 0,
      }) as unknown as Parameters<typeof db.batch>[0],
    );
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
    rounds: 2,
    tricks: 3,
    exactPredictions: 1,
    predictionError: 2,
    xp: 30,
    level: 1,
  });
  // An abandoned match adds no participation or win credit.
  game.matchId = "abandoned";
  game.winner = null;
  await deliver();
  expect((await read()).player.matches).toBe(1);
  // Participation can lead XP while another player leads wins.
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
  expect(result.experience[0]).toMatchObject({ xp: 100, wins: 2, level: 2 });
  expect(result.wins[0]).toMatchObject({ wins: 3, xp: 90, you: true });
  expect(result.experience.find((p) => p.you)).toMatchObject({ name: "bot_1", matches: 3 });
  expect((await read(guest(4).token)).player.matches).toBe(0);
  expect(JSON.stringify(result)).not.toContain(id);
  expect(JSON.stringify(result)).not.toContain(host.token);
});

test("stats API requires a guest token and rejects writes and foreign origins", async ({ api }) => {
  for (const [init, status] of [
    [{}, 400],
    [{ method: "POST" }, 405],
    [{ headers: { Origin: "https://foreign.test" } }, 403],
  ] as const) {
    expect((await api.runtime.dispatchFetch("http://game.test/api/stats", init)).status).toBe(
      status,
    );
  }
});
