import { describe, expect, it } from "vitest";
import { advancePreview, makePreview, normalizePreview } from "../../src/client/preview/games";

describe("preview fixtures", () => {
  it("normalizes preview controls to a playable round", () => {
    const options = normalizePreview({
      people: 4,
      cards: 3,
      phase: "playing",
      longNames: false,
      startingLives: 9,
      completedTricks: 9,
      played: 9,
      bids: 9,
      seatStates: ["eliminated", "eliminated", "eliminated", "active"],
    });
    expect(options).toMatchObject({
      startingLives: 5,
      completedTricks: 2,
      played: 2,
      bids: 1,
      seatStates: ["active", "eliminated", "eliminated", "active"],
    });
  });

  it("advances one move without changing the source fixture", () => {
    const game = makePreview({
      people: 4,
      cards: 6,
      phase: "playing",
      played: 0,
      longNames: false,
    });
    const original = structuredClone(game);
    const next = advancePreview(game);
    expect(game).toEqual(original);
    expect(next.trick).toHaveLength(1);
    expect(next.revision).toBe(game.revision + 1);
  });
});
