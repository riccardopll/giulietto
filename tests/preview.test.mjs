import { test } from "node:test";
import assert from "node:assert/strict";
import { makePreview, advancePreview } from "../src/client/preview/games.ts";
import { view } from "../src/shared/game.ts";

test("preview scenarios use valid 2–6 player games and preserve hidden hands", () => {
  for (let people = 2; people <= 6; people++) {
    for (const phase of ["playing", "bidding", "trick", "results", "blind"]) {
      for (const cards of [1, 6]) {
        const game = makePreview({ people, cards, phase, longNames: false });
        assert.equal(game.players.length, people);
        assert.deepEqual(
          game.players.map((p) => p.name),
          Array.from({ length: people }, (_, i) => `bot_${i + 1}`),
        );
        assert.equal(game.count, phase === "blind" ? 1 : cards);
        assert.equal(game.phase, phase === "blind" ? "playing" : phase);
        const snapshot = view(game, game.players[0].id);
        if (phase === "playing" || phase === "blind") {
          assert.equal(game.order[game.turn], snapshot.you);
          assert.equal(game.trick.length, people - 1);
        }
        if (cards !== 1 && phase !== "blind") {
          assert.ok(snapshot.players.slice(1).every((p) => p.hand.every((card) => card === null)));
        } else if (["playing", "bidding", "blind"].includes(phase)) {
          assert.ok(snapshot.players[0].hand.every((card) => card === null));
        }
      }
    }
  }
});

test("preview stepping leaves other tables unchanged and advances complete games", () => {
  for (let people = 2; people <= 6; people++) {
    const source = makePreview({ people, cards: 6, phase: "bidding", longNames: false });
    const original = structuredClone(source);
    let game = source;
    for (let move = 0; move < 1000 && game.phase !== "finished"; move++)
      game = advancePreview(game);
    assert.deepEqual(source, original);
    assert.equal(game.phase, "finished");
    assert.ok(game.revision > 0);
  }
});
