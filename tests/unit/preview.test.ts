import { describe, expect, it } from "vitest";
import { advancePreview, makePreview, type PreviewOptions } from "../../src/client/preview/games";

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
    expect(game.players[0].name).toBe("Player_1_Long_Name");
  });

  it.each(["eliminated", "left"] as const)(
    "keeps an %s seat available for spectator previews",
    (inactive) => {
      const game = makePreview({
        people: 4,
        cards: 6,
        phase: "playing",
        played: 4,
        longNames: false,
        inactive,
      });
      const spectator = game.players.at(-1)!;
      expect(spectator).toMatchObject({
        lives: 0,
        left: inactive === "left",
        hand: [],
      });
      expect(game.order).not.toContain(spectator.id);
      expect(game.trick).toHaveLength(3);
      expect(game.phase).toBe("trick");
    },
  );

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
