import { expect, test } from "vitest";
import { sendEmote } from "../../src/shared/emotes";
import { gameFixture } from "./helpers";

test.each(["chicken", "perso"] as const)(
  "%s preserves play state and enforces a per-player cooldown",
  (id) => {
    const game = gameFixture();
    const before = structuredClone(game);
    sendEmote(game, "p0", id, 1000);
    expect(game.players[0].emote).toEqual({ id, sentAt: 1000 });
    const withoutEmote = structuredClone(game);
    delete withoutEmote.players[0].emote;
    expect(withoutEmote).toEqual(before);
    expect(() => sendEmote(game, "p0", "chicken", 3999)).toThrow("Wait");
    sendEmote(game, "p1", "chicken", 1001);
    sendEmote(game, "p0", "chicken", 4000);
    expect(game.players[0].emote?.sentAt).toBe(4000);
  },
);

test("only active players can send the supported emote during play", () => {
  const game = gameFixture();
  expect(() => sendEmote(game, "outsider", "chicken", 1000)).toThrow("Only players");
  expect(() => sendEmote(game, "p0", "unknown", 1000)).toThrow("Unknown emote");
  game.players[0].lives = 0;
  expect(() => sendEmote(game, "p0", "chicken", 1000)).toThrow("Only players");
  for (const phase of ["lobby", "results", "finished"] as const) {
    game.phase = phase;
    expect(() => sendEmote(game, "p1", "chicken", 1000)).toThrow("during play");
  }
});
