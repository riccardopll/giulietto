import { describe, expect, test } from "vitest";
import {
  ACTIONS,
  OBS_SIZE,
  botMove,
  decode,
  encode,
  infer,
  legalActions,
  type BotMove,
  type BotView,
  type BotWeights,
} from "../../src/shared/bot";
import fixture from "./fixtures/bot.json";
import shippedWeights from "../../public/bot/weights.json";
import { bid, deal, findPlayer, legalBids, play, tick, view } from "../../src/shared/game";
import { lobbyFixture } from "./helpers";

const shipped = shippedWeights as BotWeights;

const weights = fixture.weights as BotWeights;
const cases = fixture.cases as {
  view: BotView;
  obs: number[];
  legal: number[];
  logits: number[];
  value: number;
  move: BotMove | null;
}[];

describe("bot encoding matches the training encoder", () => {
  test("fixture covers bids, plays, and blind rounds", () => {
    expect(cases.length).toBeGreaterThan(20);
    expect(cases.some((c) => c.view.phase === "bidding" && c.legal.length)).toBe(true);
    expect(cases.some((c) => c.view.phase === "playing" && c.legal.length)).toBe(true);
    expect(cases.some((c) => c.view.count === 1 && c.view.phase === "playing")).toBe(true);
    expect(cases.some((c) => c.view.count === 1 && c.view.canChooseAce)).toBe(true);
  });

  test.each(cases.map((c, i) => [i, c] as const))("case %i", (_, c) => {
    const obs = encode(c.view);
    expect(obs).toHaveLength(OBS_SIZE);
    expect(c.obs).toHaveLength(OBS_SIZE);
    for (let i = 0; i < OBS_SIZE; i++) expect(obs[i]).toBeCloseTo(c.obs[i], 5);
    const legal = legalActions(c.view);
    expect(legal).toEqual(c.legal);
    const { logits, value } = infer(weights, obs, legal);
    expect(logits).toHaveLength(ACTIONS);
    for (const a of legal) expect(logits[a]).toBeCloseTo(c.logits[a], 3);
    expect(value).toBeCloseTo(c.value, 3);
    const move = botMove(c.view, weights);
    expect(move).toEqual(c.move);
  });
});

describe("moves", () => {
  test("decodes cards, the low ace, and bids", () => {
    expect(decode(0)).toEqual({ action: "play", card: 1 });
    expect(decode(30)).toEqual({ action: "play", card: 31, mode: "high" });
    expect(decode(40)).toEqual({ action: "play", card: 31, mode: "low" });
    expect(decode(41)).toEqual({ action: "bid", bid: 0 });
    expect(decode(47)).toEqual({ action: "bid", bid: 6 });
  });

  test("samples only legal moves", () => {
    const playing = cases.find((c) => c.view.phase === "playing" && c.legal.length > 1)!;
    for (const r of [0, 0.5, 0.999]) {
      const move = botMove(playing.view, weights, () => r)!;
      expect(move.action).toBe("play");
      expect(playing.legal.map(decode)).toContainEqual(move);
    }
  });
});

describe("shipped weights", () => {
  test("play full matches through the rules and beat the naive policy", () => {
    let wins = 0;
    const matches = 200;
    for (let i = 0; i < matches; i++) {
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
