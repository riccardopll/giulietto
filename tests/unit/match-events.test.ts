import { describe, expect, it } from "vitest";
import { matchEvents } from "../../src/client/match-events.ts";
import { bid, play, view, type Game } from "../../src/shared/game.ts";
import { gameFixture } from "./helpers.ts";

function observe(game: Game, action: () => void, you = "p0") {
  const before = view(structuredClone(game), you);
  action();
  game.revision++;
  return matchEvents(before, view(game, you));
}

function playing(
  hands = [
    [1, 2],
    [31, 40],
  ],
) {
  const game = gameFixture(hands);
  for (const id of game.order) bid(game, id, 0, 100);
  return game;
}

describe("in-game match events", () => {
  it("does not replay a partially played table on opening", () => {
    const game = playing();
    play(game, "p0", 1, undefined, 100);

    expect(matchEvents(null, view(game, "p0"))).toEqual([]);
    expect(matchEvents(null, view(game, "p1"))).toEqual([]);
  });

  it("announces a prediction", () => {
    const game = gameFixture();
    const events = observe(game, () => bid(game, "p0", 1, 100), "p1");

    expect(events).toEqual([
      expect.objectContaining({ type: "prediction", player: "p0", name: "bot_1", bid: 1 }),
    ]);
  });

  it("announces the final prediction before the first playing turn", () => {
    const game = gameFixture([[1], [2]]);
    bid(game, "p0", 0, 100);

    expect(observe(game, () => bid(game, "p1", 0, 100)).map((event) => event.type)).toEqual([
      "prediction",
    ]);
  });

  it("embeds only publicly played cards and preserves the ace choice on a win", () => {
    const game = playing();
    const first = observe(game, () => play(game, "p0", 1, undefined, 100), "p1");
    expect(first).toEqual([expect.objectContaining({ type: "play", player: "p0", card: 1 })]);
    const final = observe(game, () => play(game, "p1", 31, "high", 100));
    expect(final).toEqual([
      expect.objectContaining({ type: "play", player: "p1", card: 31, mode: "high" }),
      expect.objectContaining({ type: "trick-won", player: "p1", card: 31, mode: "high" }),
    ]);
  });

  it("uses the winner's card even when the winner played before the final player", () => {
    const game = playing([[31], [40]]);
    play(game, "p0", 31, "high", 100);

    expect(observe(game, () => play(game, "p1", 40, undefined, 100))).toEqual([
      expect.objectContaining({ type: "play", player: "p1", card: 40 }),
      expect.objectContaining({ type: "trick-won", player: "p0", card: 31, mode: "high" }),
    ]);
  });

  it.each([0, -1])("ignores unchanged and stale snapshots (revision offset %i)", (offset) => {
    const game = playing();
    const before = view(structuredClone(game), "p1");
    play(game, "p0", 1, undefined, 100);
    game.revision += offset;

    expect(matchEvents(before, view(game, "p1"))).toEqual([]);
  });

  it("uses stable IDs and ignores unrelated updates", () => {
    const game = gameFixture();
    const before = view(structuredClone(game), "p1");
    bid(game, "p0", 1, 100);
    game.revision++;
    const after = view(game, "p1");
    const events = matchEvents(before, after);

    expect(matchEvents(before, structuredClone(after))).toEqual(events);
    expect(matchEvents(after, { ...after, revision: after.revision + 1 })).toEqual([]);
  });

  it("does not replay actions missed across reconnect revisions", () => {
    const game = playing();
    const before = view(structuredClone(game), "p1");
    play(game, "p0", 1, undefined, 100);
    game.revision += 3;

    expect(matchEvents(before, view(game, "p1"))).toEqual([]);
  });

  it.each(["matchId", "code", "you", "round"] as const)(
    "treats a changed %s as a fresh context without replaying actions",
    (field) => {
      const game = gameFixture();
      const before = view(structuredClone(game), "p0");
      bid(game, "p0", 1, 100);
      game.revision++;
      const after = view(game, "p1");
      const baseline = { ...before, you: "p1" };
      if (field === "round") after.round++;
      else if (field === "you") baseline.you = "p0";
      else after[field] = "different";

      expect(matchEvents(baseline, after)).toEqual([]);
    },
  );

  it("ignores replaced trick cards instead of treating a reset as new plays", () => {
    const game = playing([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    play(game, "p0", 1, undefined, 100);
    const before = view(structuredClone(game), "p2");
    play(game, "p1", 3, undefined, 100);
    game.trick[0].card = 2;
    game.revision++;

    expect(matchEvents(before, view(game, "p2"))).toEqual([]);
  });
});

describe("player presence events", () => {
  it("announces leaving and rejoining without a game revision change", () => {
    const game = playing();
    const before = view(game, "p0", new Set(["p0", "p1"]));
    const away = view(game, "p0", new Set(["p0"]));
    expect(matchEvents(before, away)).toEqual([
      expect.objectContaining({ type: "left", player: "p1", name: "bot_2" }),
    ]);
    expect(matchEvents(away, before)).toEqual([
      expect.objectContaining({ type: "rejoined", player: "p1", name: "bot_2" }),
    ]);
    expect(matchEvents(away, structuredClone(away))).toEqual([]);
    expect(matchEvents(null, away)).toEqual([]);
  });

  it("does not replay presence changes missed during a reconnect", () => {
    const game = playing();
    const before = view(game, "p0", new Set(["p0", "p1"]));
    game.revision += 3;
    expect(matchEvents(before, view(game, "p0", new Set(["p0"])))).toEqual([]);
  });
});
