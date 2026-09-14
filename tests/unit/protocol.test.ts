import { expect, test } from "vitest";
import { apply, command, join } from "../../src/server/protocol";
import { deal, score, tick, view } from "../../src/shared/game";
import { tableOrder } from "../../src/client/table-order";
import { gameFixture, lobbyFixture } from "./helpers";

test("lets a timed-out lobby player join again", () => {
  const game = lobbyFixture();
  tick(game, 120_100);
  join(game, "p0", "bot_1", 120_200);
  expect(game.players.map((p) => p.id)).toEqual(["p0"]);
  expect(game.host).toBe("p0");
});

test("preserves a reconnecting player's seat, hand, and progress", () => {
  const game = gameFixture();
  game.players[0].bid = 1;
  const before = structuredClone(game.players[0]);
  join(game, "p0", "Changed name", 200);
  expect(game.players).toHaveLength(3);
  expect(game.players[0]).toEqual({ ...before, seen: 200 });
  expect(view(game, "p0").spectating).toBe(false);
});

test("keeps a quitting player's seat active and lets them resume after an automatic turn", () => {
  const game = gameFixture();
  const before = structuredClone(game.players[0]);
  apply(game, "p0", { action: "leave", commandId: crypto.randomUUID() }, 200);
  expect(game.players[0]).toEqual({ ...before, seen: 200 });
  tick(game, game.deadline);
  expect(game.players[0].bid).toBe(0);
  const progress = structuredClone(game.players[0]);
  join(game, "p0", "bot_1", 50_000);
  expect(game.players).toHaveLength(3);
  expect(game.players[0]).toEqual({ ...progress, seen: 50_000 });
  expect(view(game, "p0").spectating).toBe(false);
  apply(game, "p1", { action: "bid", bid: 0, commandId: crypto.randomUUID() }, 50_001);
  apply(game, "p2", { action: "bid", bid: 0, commandId: crypto.randomUUID() }, 50_002);
  apply(
    game,
    "p0",
    { action: "play", card: before.hand[0], commandId: crypto.randomUUID() },
    50_003,
  );
  expect(game.trick[0]).toEqual({ player: "p0", card: before.hand[0] });
});

test("does not revive a player eliminated while away", () => {
  const game = gameFixture();
  apply(game, "p0", { action: "leave", commandId: crypto.randomUUID() }, 200);
  game.players[0].lives = 1;
  game.players.forEach((p) => {
    p.bid = 1;
    p.taken = 0;
  });
  score(game, 300);
  join(game, "p0", "bot_1", 400);
  expect(game.players[0].lives).toBe(0);
  expect(view(game, "p0").spectating).toBe(true);
});

test.each(["bidding", "playing", "trick", "results", "finished"] as const)(
  "allows spectators during %s without revealing hands or adding seats",
  (phase) => {
    const game = gameFixture([[31], [2], [3], [4], [5], [6]]);
    game.phase = phase;
    join(game, "watcher", "Observer", 200);
    join(game, "watcher", "Observer", 300);
    const state = view(game, "watcher");
    expect(state).toMatchObject({
      spectating: true,
      viewerName: "Observer",
      legalBids: [],
      canChooseAce: false,
    });
    expect(state.players).toHaveLength(6);
    expect(state.players.every((p) => p.hand.every((card) => card === null))).toBe(true);
    expect(game.spectators).toHaveLength(1);
    expect(tableOrder(state).seats).toEqual(game.players.map((p) => p.id));
    for (const input of [
      { action: "bid", bid: 0 },
      { action: "play", card: 2 },
      { action: "start" },
      { action: "settings", startingLives: 3 },
    ] as const) {
      expect(() =>
        apply(game, "watcher", { ...input, commandId: crypto.randomUUID() }, 400),
      ).toThrow("Spectators cannot");
    }
    apply(game, "watcher", { action: "leave", commandId: crypto.randomUUID() }, 500);
    expect(() => view(game, "watcher")).toThrow();
  },
);

test("keeps spectators out of tie revival and subsequent rounds", () => {
  const game = gameFixture();
  join(game, "watcher", "Observer", 200);
  for (const p of game.players) {
    p.lives = 1;
    p.bid = 1;
    p.taken = 0;
  }
  score(game, 300);
  expect(game.tie).toBe(true);
  expect(game.results.map((p) => p.id)).not.toContain("watcher");
  deal(game, 400);
  expect(game.order).not.toContain("watcher");
  expect(view(game, "watcher").spectating).toBe(true);
});

test("counts only connected spectators and eliminated players", () => {
  const game = gameFixture();
  game.players[1].lives = 0;
  game.order = ["p0", "p2"];
  join(game, "watcher", "Observer", 200);
  expect(view(game, "p0", new Set(["p0", "p1", "watcher"])).spectatorCount).toBe(2);
  expect(view(game, "p0", new Set(["p0", "watcher"])).spectatorCount).toBe(1);
  expect(view(game, "p0", new Set(["p0", "p2"])).spectatorCount).toBe(0);
});

test("resumes an owned seat on a matchmaking retry but rejects new spectators", () => {
  const game = gameFixture();
  join(game, "p0", "bot_1", 200, true);
  expect(game.players[0].seen).toBe(200);
  expect(() => join(game, "watcher", "Observer", 200, true)).toThrow("no longer available");
  expect(game.spectators).toBeUndefined();
});

test.each(["playing", "finished"] as const)(
  "expires disconnected spectators during %s",
  (phase) => {
    const game = gameFixture();
    game.phase = phase;
    game.deadline = 0;
    join(game, "watcher", "Observer", 100);
    join(game, "connected", "Observer", 100);
    tick(game, 120_100, new Set(["connected"]));
    expect(game.spectators?.map((p) => p.id)).toEqual(["connected"]);
    expect(game.players).toHaveLength(3);
    join(game, "watcher", "Observer", 120_200);
    expect(view(game, "watcher").spectating).toBe(true);
  },
);

test.each([
  [{ action: "bid", bid: 1.5 }, "Enter a valid prediction."],
  [{ action: "play", card: "31" }, "Choose a valid card."],
  [{ action: "settings", startingLives: 9 }, "Choose a whole number"],
  [{ action: "rename" }, "Enter a display name."],
  [{ action: "emote", emote: "unknown" }, "Unknown emote."],
  [{ action: "cheat" }, "Unknown action."],
  [{ action: "start", commandId: "nope" }, "Invalid command ID."],
])("rejects %o with a readable error", (input, message) => {
  expect(() => command({ commandId: crypto.randomUUID(), ...input })).toThrow(message);
});

test("normalizes accepted commands and drops unknown fields", () => {
  const commandId = crypto.randomUUID();
  expect(command({ action: "rename", name: "  bot_1  ", commandId, extra: 1 })).toEqual({
    action: "rename",
    name: "bot_1",
    commandId,
  });
  expect(command({ action: "play", card: 31, mode: "low", code: "ABCDEFGH", commandId })).toEqual({
    action: "play",
    card: 31,
    mode: "low",
    code: "ABCDEFGH",
    commandId,
  });
  expect(command({ action: "join", name: "bot_2", avatar: "king-cups", commandId })).toEqual({
    action: "join",
    name: "bot_2",
    avatar: "king-cups",
    matchmaking: false,
    commandId,
  });
});
