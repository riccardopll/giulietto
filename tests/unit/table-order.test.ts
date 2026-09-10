import { describe, expect, it } from "vitest";
import { tableOrder } from "../../src/client/table-order.ts";
import { view } from "../../src/shared/game.ts";
import { gameFixture } from "./helpers.ts";

describe("table order", () => {
  it("rotates clockwise seats around each viewer and retains inactive seats", () => {
    const game = gameFixture([[1], [2], [3], [4], [5], [6]]);
    game.players[1].lives = 0;
    game.players[2].lives = 0;
    game.order = ["p0", "p3", "p4", "p5"];
    const seats = game.players.map((p) => p.id);

    for (const [index, id] of seats.entries()) {
      const order = tableOrder(view(game, id));
      expect(order.seats).toEqual([...seats.slice(index), ...seats.slice(0, index)]);
      expect(order.order).toEqual(game.order);
    }
  });

  it("shows the remaining bidders without wrapping after the final bidder", () => {
    const game = gameFixture();
    game.order = ["p1", "p2", "p0"];
    expect(tableOrder(view(game, "p0"))).toMatchObject({ current: "p1", next: "p2" });
    game.turn = 2;
    expect(tableOrder(view(game, "p0"))).toMatchObject({
      current: "p0",
      next: null,
      order: ["p1", "p2", "p0"],
    });
  });

  it("keeps the trick leader first through wrapped turns and previews the next leader", () => {
    const game = gameFixture();
    game.phase = "playing";
    game.trick = [{ player: "p2", card: 21 }];
    game.turn = 0;
    expect(tableOrder(view(game, "p0"))).toMatchObject({
      order: ["p2", "p0", "p1"],
      current: "p0",
      next: "p1",
      nextTrick: false,
    });

    game.phase = "trick";
    game.lastWinner = "p1";
    expect(tableOrder(view(game, "p0"))).toMatchObject({
      order: ["p1", "p2", "p0"],
      current: null,
      next: "p1",
      nextTrick: true,
    });
    game.players.forEach((p) => {
      p.hand = [];
    });
    expect(tableOrder(view(game, "p0"))).toMatchObject({
      current: null,
      next: null,
      nextTrick: false,
    });
  });
});
