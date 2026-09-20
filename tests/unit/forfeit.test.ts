import { expect, test } from "vitest";
import { bid, forfeit, play, score, tick } from "../../src/shared/game";
import { gameEvents } from "../../src/server/game-events";
import { gameFixture } from "./helpers";

test.each([0, 1, 2])("forfeiting bidding seat %i keeps the remaining turns playable", (index) => {
  const game = gameFixture();
  bid(game, "p0", 0, 200);
  const before = structuredClone(game);
  forfeit(game, `p${index}`, 300);
  expect(gameEvents(before, game, { source: "player" }, 300).map((event) => event.type)).toEqual([
    "forfeited",
  ]);
  while (game.phase === "bidding") bid(game, game.order[game.turn], 0, 400);
  expect(game.order).not.toContain(`p${index}`);
  expect(game.players[index]).toMatchObject({ lives: 0, hand: [], forfeited: true });
  expect(game.phase).toBe("playing");
});

test.each([0, 1, 2])("forfeiting playing seat %i completes the remaining trick", (index) => {
  const game = gameFixture();
  for (const id of game.order) bid(game, id, 0, 200);
  play(game, "p0", 1, undefined, 300);
  forfeit(game, `p${index}`, 400);
  while (game.phase === "playing") {
    const id = game.order[game.turn];
    play(game, id, game.players.find((player) => player.id === id)!.hand[0], undefined, 500);
  }
  expect(game.phase).toBe("trick");
  expect(game.trick).toHaveLength(2);
  tick(game, game.deadline);
  expect(game.phase).toBe("playing");
  expect(game.order[game.turn]).toBe(game.lastWinner);
});

test("forfeiting the last unplayed seat resolves the trick immediately", () => {
  const game = gameFixture();
  for (const id of game.order) bid(game, id, 0, 200);
  play(game, "p0", 1, undefined, 300);
  play(game, "p1", 11, undefined, 400);
  const before = structuredClone(game);
  forfeit(game, "p2", 500);
  expect(gameEvents(before, game, { source: "player" }, 500)).toEqual([
    expect.objectContaining({ type: "forfeited", player_id: "p2" }),
    expect.objectContaining({
      type: "trick_won",
      player_id: "p1",
      payload: JSON.stringify({ trick: 1, plays: game.trick }),
    }),
  ]);
  expect(game.phase).toBe("trick");
  expect(game.lastWinner).toBe("p1");
});

test("forfeiting during the trick pause awards the trick to a remaining player", () => {
  const game = gameFixture();
  for (const id of game.order) bid(game, id, 0, 200);
  for (const player of game.players) play(game, player.id, player.hand[0], undefined, 300);
  const before = structuredClone(game);
  forfeit(game, "p2", 400);
  expect(
    gameEvents(before, game, { source: "player" }, 400).map((event) => [
      event.type,
      event.player_id,
    ]),
  ).toEqual([
    ["forfeited", "p2"],
    ["trick_won", "p1"],
  ]);
  expect(game.lastWinner).toBe("p1");
  expect(game.players.map((player) => player.taken)).toEqual([0, 1, 0]);
  tick(game, game.deadline);
  expect(game.order[game.turn]).toBe("p1");
});

test("ties never revive forfeited players", () => {
  const game = gameFixture();
  forfeit(game, "p0", 200);
  for (const player of game.players.slice(1)) {
    player.lives = 1;
    player.bid = 1;
  }
  score(game, 300);
  expect(game.tie).toBe(true);
  expect(game.players.map((player) => player.lives)).toEqual([0, 1, 1]);
  tick(game, game.deadline);
  expect(game.order).toEqual(expect.arrayContaining(["p1", "p2"]));
  expect(game.order).not.toContain("p0");
});

test("leaving results ends the match when only one player remains", () => {
  const game = gameFixture();
  game.phase = "results";
  game.players[2].lives = 0;
  forfeit(game, "p0", 200);
  expect(game).toMatchObject({ phase: "finished", winner: "p1", finishedAt: 200, deadline: 0 });
});
