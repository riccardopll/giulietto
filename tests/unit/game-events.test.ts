import { expect, test } from "vitest";
import { gameEvents, type EventSource } from "../../src/server/game-events";
import { bid, donate, play, score, tick, type Game } from "../../src/shared/game";
import { gameFixture } from "./helpers";

function record(game: Game, action: () => void, origin: EventSource, now = 200) {
  const before = structuredClone(game);
  action();
  game.revision++;
  return gameEvents(before, game, origin, now);
}

test("records the actor, command and legal choices for a prediction", () => {
  const game = gameFixture([
    [1, 2],
    [3, 4],
  ]);
  bid(game, "p0", 1, 100);
  const [event] = record(game, () => bid(game, "p1", 0, 200), {
    source: "player",
    commandId: "bid-1",
  });

  expect(event).toMatchObject({
    match_id: "match-1",
    revision: 1,
    round: 1,
    type: "bid",
    player_id: "p1",
    source: "player",
    command_id: "bid-1",
    occurred_at: 200,
  });
  expect(JSON.parse(event.payload)).toEqual({
    bid: 0,
    elapsedMs: 100,
    position: 2,
    legalBids: [0, 2],
  });
});

test("records played cards and private training context before the trick winner", () => {
  const game = gameFixture([[31], [40]]);
  for (const id of game.order) bid(game, id, 0, 100);
  const [ace] = record(game, () => play(game, "p0", 31, "low", 200), { source: "player" });
  expect(JSON.parse(ace.payload)).toEqual({
    card: 31,
    elapsedMs: 100,
    mode: "low",
    trick: 1,
    position: 1,
    handBefore: [31],
  });
  const events = record(game, () => play(game, "p1", 40, undefined, 200), { source: "timeout" });
  expect(events.map((event) => event.type)).toEqual(["play", "trick_won"]);
  expect(events[1]).toMatchObject({ player_id: "p1", source: "timeout", command_id: null });
  expect(JSON.parse(events[1].payload)).toEqual({ trick: 1, plays: game.trick });
});

test.each([
  [10000 + 100, 0],
  [10000 - 1200, 1200],
  [0, 10000],
  [-100, 10000],
])("records elapsed turn time with %i ms remaining", (remaining, elapsedMs) => {
  const game = gameFixture();
  game.turnSeconds = 10;
  game.deadline = 200 + remaining;
  const [event] = record(game, () => bid(game, "p0", 0, 200), { source: "player" });
  expect(JSON.parse(event.payload).elapsedMs).toBe(elapsedMs);
});

test("starts play timing after the between-trick pause, even when the alarm is late", () => {
  const game = gameFixture([
    [1, 2],
    [11, 12],
  ]);
  bid(game, "p0", 0, 100);
  bid(game, "p1", 0, 100);
  play(game, "p0", 1, undefined, 200);
  play(game, "p1", 11, undefined, 300);
  tick(game, 5000);
  const [event] = record(
    game,
    () => play(game, "p1", 12, undefined, 7000),
    { source: "player" },
    7000,
  );
  expect(JSON.parse(event.payload).elapsedMs).toBe(2000);
});

test("records the final round before closing the match", () => {
  const game = gameFixture([[1], [2]]);
  game.phase = "trick";
  Object.assign(game.players[0], { lives: 1, bid: 0, taken: 1 });
  Object.assign(game.players[1], { lives: 1, bid: 0, taken: 0 });
  const events = record(game, () => score(game, 200), { source: "system" });

  expect(events.map((event) => event.type)).toEqual(["round_scored", "match_finished"]);
  expect(JSON.parse(events[0].payload)).toMatchObject({ results: game.results, tie: false });
  expect(events[1]).toMatchObject({ player_id: "p1", source: "system" });
  expect(JSON.parse(events[1].payload)).toEqual({ winner: "p1", finishedAt: 200 });
});

test("records a donated life", () => {
  const game = gameFixture([[1], [11], [21]]);
  game.lifeDonation = true;
  game.phase = "trick";
  game.players.forEach((player, i) => Object.assign(player, { lives: [4, 3, 1][i], bid: 0 }));
  game.players[2].taken = 1;
  score(game, 200);
  const [event] = record(game, () => donate(game, "p0", "p2"), {
    source: "player",
    commandId: "donate-1",
  });

  expect(event).toMatchObject({ type: "life_donated", player_id: "p0", command_id: "donate-1" });
  expect(JSON.parse(event.payload)).toEqual({ to: "p2", lives: 3 });
});
