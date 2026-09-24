import { expect, test } from "vitest";
import { sendEmote } from "../../src/shared/emotes";
import { gameFixture } from "./helpers";

test.each(["chicken", "perso", "goblin", "princess"] as const)(
  "%s preserves play state and enforces a per-player cooldown",
  (id) => {
    const game = gameFixture();
    const before = structuredClone(game);
    sendEmote(game, "p0", id, 1000);
    expect(game.players[0].emote).toEqual({ id, sentAt: 1000 });
    const withoutEmote = structuredClone(game);
    delete withoutEmote.players[0].emote;
    expect(withoutEmote).toEqual(before);
    expect(() => sendEmote(game, "p0", "chicken", 2499)).toThrow("Wait");
    sendEmote(game, "p1", "chicken", 1001);
    sendEmote(game, "p0", "chicken", 2500);
    expect(game.players[0].emote?.sentAt).toBe(2500);
  },
);

test("anyone at the table reacts during play; an id that never joined cannot", () => {
  const game = gameFixture();
  game.spectators = [{ id: "watcher", name: "Observer", seen: 0 }];
  expect(() => sendEmote(game, "never-joined", "chicken", 1000)).toThrow("Join this table");
  game.players[0].lives = 0;
  sendEmote(game, "p0", "chicken", 1000);
  sendEmote(game, "watcher", "perso", 1000);
  expect(game.players[0].emote).toEqual({ id: "chicken", sentAt: 1000 });
  expect(game.spectators[0].emote).toEqual({ id: "perso", sentAt: 1000 });
  expect(() => sendEmote(game, "watcher", "chicken", 2499)).toThrow("Wait");
  for (const phase of ["lobby", "results", "finished"] as const) {
    game.phase = phase;
    expect(() => sendEmote(game, "p1", "chicken", 1000)).toThrow("during play");
    expect(() => sendEmote(game, "watcher", "chicken", 5000)).toThrow("during play");
  }
});
