import { expect, it } from "vitest";
import { apply, join } from "../../src/server/protocol.ts";
import { deal, score, tick, view } from "../../src/shared/game.ts";
import { tableOrder } from "../../src/client/table-order.ts";
import { gameFixture, lobbyFixture } from "./helpers.ts";

it("lets a timed-out lobby player join again", () => {
  const game = lobbyFixture();
  tick(game, 120_100);
  join(game, "p0", "bot_1", 120_200);
  expect(game.players.map((p) => p.id)).toEqual(["p0"]);
  expect(game.host).toBe("p0");
});

it("preserves a reconnecting player's seat, hand, and progress", () => {
  const game = gameFixture();
  game.players[0].bid = 1;
  const before = structuredClone(game.players[0]);
  join(game, "p0", "Changed name", 200);
  expect(game.players).toHaveLength(3);
  expect(game.players[0]).toEqual({ ...before, seen: 200 });
  expect(view(game, "p0").spectating).toBe(false);
});

it("keeps a quitting player's seat active and lets them resume after an automatic turn", () => {
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

it("does not revive a player eliminated while away", () => {
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

it.each(["bidding", "playing", "trick", "results", "finished"] as const)(
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
    for (const action of ["bid", "play", "start", "settings"]) {
      expect(() => apply(game, "watcher", { action, commandId: crypto.randomUUID() }, 400)).toThrow(
        "Spectators cannot",
      );
    }
    apply(game, "watcher", { action: "leave", commandId: crypto.randomUUID() }, 500);
    expect(() => view(game, "watcher")).toThrow();
  },
);

it("keeps spectators out of tie revival and subsequent rounds", () => {
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

it("counts only connected spectators and eliminated players", () => {
  const game = gameFixture();
  game.players[1].lives = 0;
  game.order = ["p0", "p2"];
  join(game, "watcher", "Observer", 200);
  expect(view(game, "p0", new Set(["p0", "p1", "watcher"])).spectatorCount).toBe(2);
  expect(view(game, "p0", new Set(["p0", "watcher"])).spectatorCount).toBe(1);
  expect(view(game, "p0", new Set(["p0", "p2"])).spectatorCount).toBe(0);
});

it("resumes an owned seat on a matchmaking retry but rejects new spectators", () => {
  const game = gameFixture();
  join(game, "p0", "bot_1", 200, true);
  expect(game.players[0].seen).toBe(200);
  expect(() => join(game, "watcher", "Observer", 200, true)).toThrow("no longer available");
  expect(game.spectators).toBeUndefined();
});

it.each(["playing", "finished"] as const)("expires disconnected spectators during %s", (phase) => {
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
});
