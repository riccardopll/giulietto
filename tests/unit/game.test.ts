import { describe, expect, it } from "vitest";
import {
  bid,
  deal,
  legalBids,
  MAX_STARTING_LIVES,
  play,
  score,
  strength,
  tick,
  view,
} from "../../src/shared/game.ts";
import { gameFixture, lobbyFixture } from "./helpers.ts";

describe("rounds", () => {
  it("deals six unique cards per player using the selected starting lives", () => {
    const game = lobbyFixture(6);
    expect(game.startingLives).toBe(3);
    game.startingLives = MAX_STARTING_LIVES;
    deal(game, 100);

    expect(game.phase).toBe("bidding");
    expect(game.host).toBe("p0");
    expect(game.players.map((p) => p.lives)).toEqual(Array(6).fill(MAX_STARTING_LIVES));
    expect(game.players.map((p) => p.hand.length)).toEqual(Array(6).fill(6));
    expect(new Set(game.players.flatMap((p) => p.hand)).size).toBe(36);
  });

  it("cycles from six cards to one while rotating the first bidder", () => {
    const game = lobbyFixture();
    deal(game, 100);
    const seats = game.players.map((p) => p.id);
    const counts = [game.count];
    for (let round = 2; round <= 7; round++) {
      deal(game, round * 100);
      counts.push(game.count);
      expect(game.order[0]).toBe(seats[(round - 1) % seats.length]);
    }
    expect(counts).toEqual([6, 5, 4, 3, 2, 1, 6]);
    expect(game.cycle).toBe(2);
    expect(game.players.map((p) => p.id)).toEqual(seats);
  });

  it("preserves remaining lives and skips inactive players on later deals", () => {
    const game = gameFixture([[1], [2], [3], [4]]);
    game.players[0].lives = 2;
    game.players[1].lives = 0;
    game.players[2].left = true;
    deal(game, 200);

    expect(game.order).toEqual(["p3", "p0"]);
    expect(game.players[0].lives).toBe(2);
    expect(game.players[1].hand).toEqual([]);
    expect(game.players[2].hand).toEqual([]);
  });

  it("starts public tables after the countdown or immediately when full", () => {
    const waiting = lobbyFixture(2);
    waiting.public = true;
    tick(waiting, 100);
    expect(waiting.phase).toBe("lobby");
    expect(waiting.startAt).toBe(20_100);
    tick(waiting, 20_100);
    expect(waiting.phase).toBe("bidding");

    const full = lobbyFixture(6);
    full.public = true;
    tick(full, 100);
    expect(full.phase).toBe("bidding");
  });
});

describe("turns and tricks", () => {
  it("accepts predictions in turn and excludes a final total equal to the trick count", () => {
    const game = gameFixture();
    expect(() => bid(game, "p1", 0, 100)).toThrow("Wait for your bidding turn");
    expect(() => bid(game, "p0", 0.5, 100)).toThrow();
    bid(game, "p0", 1, 100);
    bid(game, "p1", 0, 100);
    expect(legalBids(game)).toEqual([0, 2]);
    expect(() => bid(game, "p2", 1, 100)).toThrow();
    bid(game, "p2", 0, 100);
    expect(game.phase).toBe("playing");
    expect(game.order[game.turn]).toBe("p0");
  });

  it("requires an owned card in turn and lets the highest card lead the next trick", () => {
    const game = gameFixture([
      [2, 3],
      [40, 39],
      [10, 9],
    ]);
    for (const id of game.order) bid(game, id, 0, 100);
    expect(() => play(game, "p1", 40, undefined, 100)).toThrow("Wait for your turn");
    expect(() => play(game, "p0", 40, undefined, 100)).toThrow("not in your hand");
    play(game, "p0", 2, undefined, 100);
    play(game, "p1", 40, undefined, 100);
    play(game, "p2", 10, undefined, 100);

    expect(game.phase).toBe("trick");
    expect(game.lastWinner).toBe("p1");
    expect(game.players[1].taken).toBe(1);
    tick(game, game.deadline);
    expect(game.phase).toBe("playing");
    expect(game.order[game.turn]).toBe("p1");
    expect(game.trick).toEqual([]);
  });

  it.each(["low", "high"] as const)("requires an explicit %s choice for a blind Ace", (mode) => {
    const game = gameFixture([[31], [40]]);
    expect(view(game, "p0").canChooseAce).toBe(false);
    for (const id of game.order) bid(game, id, 0, 100);
    expect(view(game, "p0").players[0].hand).toEqual([null]);
    expect(view(game, "p0").canChooseAce).toBe(true);
    expect(view(game, "p1").canChooseAce).toBe(false);
    expect(() => play(game, "p0", 31, undefined, 100)).toThrow("Choose high or low");
    play(game, "p0", 31, mode, 100);
    play(game, "p1", 40, undefined, 100);

    expect(strength({ player: "p0", card: 31, mode })).toBe(mode === "low" ? 0 : 41);
    expect(game.lastWinner).toBe(mode === "low" ? "p1" : "p0");
    expect(view(game, "p0").canChooseAce).toBe(false);
  });

  it("uses a legal prediction and card when a turn expires", () => {
    const game = gameFixture([[31], [40]]);
    tick(game, game.deadline - 1);
    expect(game.players[0].bid).toBeNull();
    tick(game, game.deadline);
    expect(game.players[0].bid).toBe(0);
    tick(game, game.deadline);
    expect(game.phase).toBe("playing");
    tick(game, game.deadline);
    expect(game.trick).toEqual([{ player: "p0", card: 31, mode: "high" }]);
  });
});

describe("scoring", () => {
  it("subtracts the absolute prediction error and records round statistics", () => {
    const game = gameFixture([
      [1, 2, 3],
      [11, 12, 13],
      [21, 22, 23],
    ]);
    Object.assign(game.players[0], { bid: 0, taken: 2 });
    Object.assign(game.players[1], { bid: 1, taken: 1 });
    Object.assign(game.players[2], { bid: 3, taken: 0 });
    score(game, 200);

    expect(game.players.map((p) => p.lives)).toEqual([1, 3, 0]);
    expect(game.results.map((result) => result.lost)).toEqual([2, 0, 3]);
    expect(game.players[0].stats).toEqual({
      roundsPlayed: 1,
      tricksWon: 2,
      exactPredictions: 0,
      predictionError: 2,
    });
    expect(game.players[1].stats.exactPredictions).toBe(1);
    expect(game.phase).toBe("results");
  });

  it("finishes with the last surviving player", () => {
    const game = gameFixture([[1], [2]]);
    Object.assign(game.players[0], { lives: 1, bid: 0, taken: 1 });
    Object.assign(game.players[1], { lives: 1, bid: 0, taken: 0 });
    score(game, 200);
    expect(game).toMatchObject({ phase: "finished", winner: "p1", finishedAt: 200, deadline: 0 });
  });

  it("revives every remaining participant to one life when everyone is eliminated", () => {
    const game = gameFixture([[1, 2], [3, 4], [], []]);
    game.order = ["p0", "p1"];
    Object.assign(game.players[0], { lives: 1, bid: 0, taken: 1 });
    Object.assign(game.players[1], { lives: 1, bid: 0, taken: 1 });
    game.players[2].lives = 0;
    Object.assign(game.players[3], { lives: 0, left: true });
    score(game, 200);

    expect(game.players.map((p) => p.lives)).toEqual([1, 1, 1, 0]);
    expect(game).toMatchObject({ phase: "results", tie: true });
    tick(game, game.deadline);
    expect(game.order).toHaveLength(3);
  });
});

describe("hand privacy", () => {
  it.each([
    { name: "normal", hands: [[31, 2], [40, 3], []], visible: [[31, 2], [null, null], []] },
    { name: "blind", hands: [[31], [40], []], visible: [[null], [40], []] },
  ])("exposes only allowed cards in a $name round", ({ hands, visible }) => {
    const game = gameFixture(hands);
    game.players[2].lives = 0;
    game.order = ["p0", "p1"];
    for (const id of game.order) bid(game, id, 0, 100);

    expect(view(game, "p0").players.map((p) => p.hand)).toEqual(visible);
    expect(view(game, "p2").players.map((p) => p.hand)).toEqual(
      hands.map((hand) => hand.map(() => null)),
    );
    play(game, "p0", 31, "low", 100);
    for (const id of ["p0", "p1", "p2"]) {
      expect(view(game, id).trick).toEqual([{ player: "p0", card: 31, mode: "low" }]);
    }
  });
});
