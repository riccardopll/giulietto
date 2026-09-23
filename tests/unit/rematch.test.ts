import { expect, test } from "vitest";
import { apply, join } from "../../src/server/protocol";
import { tick, view } from "../../src/shared/game";
import { checkRematch, inviteRematch, REMATCH_INVITE_MS } from "../../src/shared/rematch";
import { gameFixture } from "./helpers";

function finishedFixture() {
  const game = gameFixture();
  game.phase = "finished";
  game.deadline = 0;
  game.winner = "p0";
  game.finishedAt = 100;
  game.players[2].forfeited = true;
  game.players[2].lives = 0;
  return game;
}

test("one live invite at a time, reopened after it expires", () => {
  const game = finishedFixture();
  inviteRematch(game, "p0", "NEWLOBBY", 1000);
  expect(game.rematch).toEqual({ code: "NEWLOBBY", by: "p0", expiresAt: 1000 + REMATCH_INVITE_MS });
  expect(() => checkRematch(game, "p1", 1000 + REMATCH_INVITE_MS - 1)).toThrow(
    "bot_1 already invited everyone to a rematch.",
  );
  tick(game, 1000 + REMATCH_INVITE_MS - 1);
  expect(game.rematch).toBeDefined();
  tick(game, 1000 + REMATCH_INVITE_MS);
  expect(game.rematch).toBeUndefined();
  inviteRematch(game, "p1", "NEXTCODE", 1000 + REMATCH_INVITE_MS);
  expect(game.rematch?.code).toBe("NEXTCODE");
});

test("only seated human players may open a rematch once the game is over", () => {
  const running = gameFixture();
  expect(() => checkRematch(running, "p0", 100)).toThrow("once the game is over");
  const game = finishedFixture();
  game.players[1].bot = true;
  expect(() => checkRematch(game, "p1", 100)).toThrow("Only players at this table");
  expect(() => checkRematch(game, "p2", 100)).toThrow("Only players at this table");
  expect(() => checkRematch(game, "watcher", 100)).toThrow("Only players at this table");
  checkRematch(game, "p0", 100);
});

test("the table assigns the lobby code and keeps spectators out", () => {
  const game = finishedFixture();
  join(game, "watcher", "Observer", 200);
  const commandId = crypto.randomUUID();
  expect(() =>
    apply(game, "watcher", { action: "rematch", code: "NEWLOBBY", commandId }, 300),
  ).toThrow("Spectators cannot");
  expect(() => apply(game, "p0", { action: "rematch", commandId }, 300)).toThrow(
    "Invalid request.",
  );
  apply(game, "p0", { action: "rematch", code: "NEWLOBBY", commandId }, 300);
  expect(game.rematch).toMatchObject({ code: "NEWLOBBY", by: "p0" });
  expect(view(game, "p1").rematch).toEqual(game.rematch);
  expect(view(game, "p2").rematch).toEqual(game.rematch);
  expect(view(game, "watcher").rematch).toBeUndefined();
});
