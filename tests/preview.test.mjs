import { test } from "node:test";
import assert from "node:assert/strict";
import { makePreview, advancePreview } from "../src/client/preview/games.ts";
import { view } from "../src/shared/game.ts";

test("preview scenarios use valid 2–6 player games and preserve hidden hands", () => {
  for (let people = 2; people <= 6; people++) {
    for (const phase of ["playing", "bidding", "trick", "results", "blind"]) {
      for (const cards of [1, 2, 3, 4, 5, 6]) {
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

test("preview can show every partial and completed trick with one to six cards per player", () => {
  for (let people = 2; people <= 6; people++) {
    for (let cards = 1; cards <= 6; cards++) {
      for (let played = 0; played <= people; played++) {
        const game = makePreview({ people, cards, phase: "playing", played, longNames: true });
        assert.equal(game.trick.length, played);
        assert.equal(game.phase, played === people ? "trick" : "playing");
        assert.equal(new Set(game.trick.map((move) => move.player)).size, played);
        assert.equal(
          game.players.reduce((sum, p) => sum + p.hand.length, 0),
          people * cards - played,
        );
        if (played < people) {
          assert.equal(game.order[game.turn], game.players[0].id);
          assert.equal(advancePreview(game).trick.length, played + 1);
        }
        for (const viewer of game.players) {
          const snapshot = view(game, viewer.id);
          for (const p of snapshot.players) {
            const visible = cards === 1 ? p.id !== viewer.id : p.id === viewer.id;
            assert.ok(p.hand.every((card) => (visible ? card !== null : card === null)));
          }
        }
      }
    }
  }
});

test("inactive preview seats stay out of play and cannot see hidden cards", () => {
  for (let people = 3; people <= 6; people++) {
    for (const inactive of ["eliminated", "left"]) {
      for (const cards of [1, 6]) {
        for (const phase of ["playing", "bidding", "trick", "results", "blind"]) {
          const game = makePreview({ people, cards, phase, played: 0, longNames: false, inactive });
          const spectator = game.players.at(-1);
          assert.equal(spectator.lives, 0);
          assert.equal(spectator.left, inactive === "left");
          assert.deepEqual(spectator.hand, []);
          assert.ok(!game.order.includes(spectator.id));
          assert.equal(game.order.length, people - 1);
          const snapshot = view(game, spectator.id);
          assert.deepEqual(snapshot.legalBids, []);
          assert.equal(snapshot.canChooseAce, false);
          assert.ok(snapshot.players.every((p) => p.hand.every((card) => card === null)));
        }
      }
      const fullTrick = makePreview({
        people,
        cards: 6,
        phase: "playing",
        played: people,
        longNames: false,
        inactive,
      });
      assert.equal(fullTrick.trick.length, people - 1);
      assert.equal(fullTrick.phase, "trick");
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
