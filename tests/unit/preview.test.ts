import { describe, expect, it } from "vitest";
import {
  advancePreview,
  makePreview,
  normalizePreview,
  type PreviewOptions,
} from "../../src/client/preview/games";

const scenarios = [
  { people: 2, cards: 6, phase: "bidding", longNames: false },
  { people: 3, cards: 4, phase: "playing", played: 1, longNames: false },
  { people: 4, cards: 3, phase: "trick", longNames: false },
  { people: 5, cards: 2, phase: "results", longNames: false },
  { people: 6, cards: 1, phase: "blind", played: 0, longNames: false },
] satisfies PreviewOptions[];

describe("preview fixtures", () => {
  it.each(scenarios)("builds the $phase scenario for $people players", (options) => {
    const game = makePreview(options);
    expect(game.code).toBe(`PREVIEW${options.people}`);
    expect(game.phase).toBe(options.phase === "blind" ? "playing" : options.phase);
    expect(game.count).toBe(options.cards);
    expect(game.players.map((player) => player.name)).toEqual(
      Array.from({ length: options.people }, (_, index) => `bot_${index + 1}`),
    );
  });

  it.each([0, 3, 6])("creates a trick with %i played cards", (played) => {
    const game = makePreview({
      people: 6,
      cards: 6,
      phase: "playing",
      played,
      longNames: true,
    });
    expect(game.trick).toHaveLength(played);
    expect(game.phase).toBe(played === 6 ? "trick" : "playing");
    if (played < 6) expect(game.order[game.turn]).toBe(game.players[0].id);
    expect(game.players.every((player) => Array.from(player.name).length === 20)).toBe(true);
  });

  it.each(["eliminated", "left"] as const)(
    "keeps an %s seat available for spectator previews",
    (state) => {
      const game = makePreview({
        people: 4,
        cards: 6,
        phase: "playing",
        played: 4,
        longNames: false,
        seatStates: ["active", "active", "active", state],
      });
      const spectator = game.players.at(-1)!;
      expect(spectator).toMatchObject({
        lives: 0,
        left: state === "left",
        hand: [],
      });
      expect(game.order).not.toContain(spectator.id);
      expect(game.trick).toHaveLength(3);
      expect(game.phase).toBe("trick");
    },
  );

  it("keeps players who leave during a round in the turn order until scoring", () => {
    const game = makePreview({
      people: 5,
      cards: 4,
      phase: "playing",
      longNames: false,
      startingLives: 2,
      seatStates: ["eliminated", "active", "left", "leaving", "active"],
      played: 3,
    });
    expect(game.order).toEqual([game.players[1].id, game.players[3].id, game.players[4].id]);
    expect(game.players.map((player) => player.hand.length)).toEqual([0, 3, 0, 3, 3]);
    expect(game.players[3]).toMatchObject({ left: true, lives: 2 });
    expect(game.trick.map((play) => play.player)).toContain(game.players[3].id);
  });

  it("builds later tricks by playing the preceding tricks through the game rules", () => {
    const game = makePreview({
      people: 4,
      cards: 6,
      phase: "playing",
      longNames: false,
      completedTricks: 4,
      played: 2,
    });
    expect(game.phase).toBe("playing");
    expect(game.players.reduce((total, player) => total + player.taken, 0)).toBe(4);
    expect(game.players.map((player) => player.hand.length).sort()).toEqual([1, 1, 2, 2]);
    expect(game.trick).toHaveLength(2);
    expect(game.trick[0].player).toBe(game.lastWinner);
  });

  it("shows each bidding turn with only the preceding predictions filled", () => {
    const game = makePreview({
      people: 4,
      cards: 3,
      phase: "bidding",
      longNames: false,
      bids: 2,
    });
    expect(game.phase).toBe("bidding");
    expect(game.turn).toBe(2);
    expect(game.players.map((player) => player.bid)).toEqual([1, 1, null, null]);
  });

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
      seatStates: ["eliminated", "left", "left", "active"],
    });
    expect(options).toMatchObject({
      startingLives: 5,
      completedTricks: 2,
      played: 2,
      bids: 1,
      seatStates: ["active", "left", "left", "active"],
    });
  });

  it.each([
    { cycle: 0, cards: 6, round: 1 },
    { cycle: 0, cards: 1, round: 6 },
    { cycle: 1, cards: 6, round: 7 },
    { cycle: 3, cards: 2, round: 23 },
    { cycle: 4, cards: 2, round: 29 },
  ])("keeps round $round consistent with its cycle and card count", ({ cycle, cards, round }) => {
    const game = makePreview({ people: 3, phase: "playing", longNames: false, cycle, cards });
    expect(game.round).toBe(round);
    expect(game.cycle).toBe(cycle + 1);
    expect(game.count).toBe(cards);
    expect(game.players.every((player) => player.hand.length === cards)).toBe(true);
  });

  it("uses the real finished outcome when a one-life blind round decides a two-player match", () => {
    const game = makePreview({
      people: 2,
      cards: 1,
      phase: "results",
      longNames: false,
      startingLives: 1,
    });
    expect(game.phase).toBe("finished");
    expect(game.results).toHaveLength(2);
    expect(game.players.filter((player) => player.lives > 0).map((player) => player.id)).toEqual([
      game.winner,
    ]);
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
