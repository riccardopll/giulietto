import { describe, expect, test } from "vitest";
import { createBot } from "../../src/shared/bot";
import shippedWeights from "../../public/bot/weights.json";
import { bid, deal, findPlayer, legalBids, play, tick, view } from "../../src/shared/game";
import { gameFixture, lobbyFixture, seedRandom } from "./helpers";

const bot = createBot(shippedWeights);

test("waits outside the bot's turn", () => {
  const game = gameFixture();
  expect(bot(view(game, "p1"))).toBeNull();
  game.phase = "results";
  expect(bot(view(game, "p0"))).toBeNull();
});

test("plays a hidden card and chooses a mode for the blind ace", () => {
  const game = gameFixture([[7], [31], [12]]);
  game.phase = "playing";
  expect(bot(view(game, "p0"))).toEqual({ action: "play" });
  game.turn = 1;
  expect([
    { action: "play", card: 31, mode: "high" },
    { action: "play", card: 31, mode: "low" },
  ]).toContainEqual(bot(view(game, "p1")));
});

describe("shipped weights", () => {
  test("play full matches through the rules and beat the naive policy", () => {
    let wins = 0;
    const matches = 200;
    for (let i = 0; i < matches; i++) {
      seedRandom(100_000 + i);
      const game = lobbyFixture(4);
      deal(game, 100);
      const botId = game.players[i % 4].id;
      while (game.phase !== "finished") {
        const id = game.order[game.turn];
        if (id === botId) {
          const move = bot(view(game, id))!;
          if (move.action === "bid") bid(game, id, move.bid, 100);
          else play(game, id, move.card ?? findPlayer(game, id)!.hand[0], move.mode, 100);
        } else if (game.phase === "bidding") {
          const choices = legalBids(game);
          const share = Math.round(game.count / game.order.length);
          bid(game, id, choices.includes(share) ? share : choices[0], 100);
        } else play(game, id, findPlayer(game, id)!.hand[0], "high", 100);
        while (game.phase === "trick" || game.phase === "results") tick(game, game.deadline);
      }
      if (game.winner === botId) wins++;
    }
    expect(wins / matches).toBeGreaterThan(0.4);
  });
});
