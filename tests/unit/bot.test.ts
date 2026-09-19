import { describe, expect, test } from "vitest";
import { botMove, decode, legalActions, type BotWeights } from "../../src/shared/bot";
import shippedWeights from "../../public/bot/weights.json";
import { bid, deal, findPlayer, legalBids, play, tick, view } from "../../src/shared/game";
import { lobbyFixture, seedRandom } from "./helpers";

const shipped = shippedWeights as BotWeights;

describe("moves", () => {
  test("decodes cards, the low ace, and bids", () => {
    expect(decode(0)).toEqual({ action: "play", card: 1 });
    expect(decode(30)).toEqual({ action: "play", card: 31, mode: "high" });
    expect(decode(40)).toEqual({ action: "play", card: 31, mode: "low" });
    expect(decode(41)).toEqual({ action: "bid", bid: 0 });
    expect(decode(47)).toEqual({ action: "bid", bid: 6 });
  });

  test("samples only legal moves", () => {
    seedRandom(3);
    const game = lobbyFixture(4);
    deal(game, 100);
    while (game.phase === "bidding") bid(game, game.order[game.turn], legalBids(game)[0], 100);
    const playing = view(game, game.order[game.turn]);
    const legal = legalActions(playing);
    for (const r of [0, 0.5, 0.999]) {
      const move = botMove(playing, shipped, () => r)!;
      expect(move.action).toBe("play");
      expect(legal.map(decode)).toContainEqual(move);
    }
  });
});

describe("shipped weights", () => {
  test("play full matches through the rules and beat the naive policy", () => {
    let wins = 0;
    const matches = 200;
    for (let i = 0; i < matches; i++) {
      seedRandom(100_000 + i);
      const game = lobbyFixture(4);
      deal(game, 100);
      const bot = game.players[i % 4].id;
      while (game.phase !== "finished") {
        const id = game.order[game.turn];
        if (id === bot) {
          const move = botMove(view(game, id), shipped)!;
          if (move.action === "bid") bid(game, id, move.bid, 100);
          else play(game, id, move.card ?? findPlayer(game, id)!.hand[0], move.mode, 100);
        } else if (game.phase === "bidding") {
          const choices = legalBids(game);
          const share = Math.round(game.count / game.order.length);
          bid(game, id, choices.includes(share) ? share : choices[0], 100);
        } else play(game, id, findPlayer(game, id)!.hand[0], "high", 100);
        while (game.phase === "trick" || game.phase === "results") tick(game, game.deadline);
      }
      if (game.winner === bot) wins++;
    }
    expect(wins / matches).toBeGreaterThan(0.4);
  });
});
