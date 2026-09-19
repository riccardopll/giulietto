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
import fixture from "./.generated/bot.json";
import shippedWeights from "../../public/bot/weights.json";
import shippedText from "../../public/bot/weights.json?raw";
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

describe("shipped weights match Python", () => {
  test("match the Python inference fixture", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(shippedText));
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(hash).toBe(fixture.shipped.sha256);
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const expected = fixture.shipped.cases[i];
      const result = infer(shipped, encode(c.view), c.legal);
      for (const action of c.legal)
        expect(result.logits[action]).toBeCloseTo(expected.logits[action], 3);
      expect(result.value).toBeCloseTo(expected.value, 3);
      if (expected.action !== null)
        expect(botMove(c.view, shipped)).toEqual(decode(expected.action));
    }
  });
});
