import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeGame,
  player,
  deal,
  bid,
  play,
  score,
  tick,
  view,
  legalBids,
  strength,
} from "../src/shared/game.ts";
function setup(n = 3) {
  const g = makeGame("ABCDEFGH", player("p0", "P0", 100), false);
  for (let i = 1; i < n; i++) g.players.push(player("p" + i, "P" + i, 100));
  deal(g, 100);
  return g;
}
test("40 unique cards can deal six hands; suit strength and ace extremes", () => {
  const g = setup(6);
  assert.equal(new Set(g.players.flatMap((p) => p.hand)).size, 36);
  assert.ok(g.players.every((p) => p.hand.length === 6));
  assert.equal(strength({ card: 31, mode: "low" }), 0);
  assert.equal(strength({ card: 31, mode: "high" }), 41);
  assert.equal(strength({ card: 40 }), 40);
  assert.ok(strength({ card: 11 }) > strength({ card: 10 }));
});
test("bidding is turn-based and final sum cannot equal available tricks", () => {
  const g = setup();
  assert.throws(() => bid(g, "p1", 1, 100));
  bid(g, "p0", 2, 100);
  bid(g, "p1", 3, 100);
  assert.ok(!legalBids(g).includes(1));
  assert.throws(() => bid(g, "p2", 1, 100));
  bid(g, "p2", 0, 100);
  assert.equal(g.phase, "playing");
});
test("highest card wins and that player leads the next trick", () => {
  const g = setup();
  for (const p of g.players) bid(g, p.id, 0, 100);
  g.players[0].hand = [2, 3];
  g.players[1].hand = [40, 39];
  g.players[2].hand = [10, 9];
  play(g, "p0", 2, null, 100);
  play(g, "p1", 40, null, 100);
  play(g, "p2", 10, null, 100);
  assert.equal(g.phase, "trick");
  assert.equal(g.lastWinner, "p1");
  assert.equal(g.players[1].taken, 1);
  tick(g, 2800);
  assert.equal(g.order[g.turn], "p1");
  assert.equal(g.phase, "playing");
});
test("prediction error costs one life per trick; one remaining player wins", () => {
  const g = setup();
  Object.assign(g.players[0], { bid: 2, taken: 4 });
  Object.assign(g.players[1], { bid: 0, taken: 0, lives: 1 });
  Object.assign(g.players[2], { bid: 0, taken: 2, lives: 1 });
  score(g, 100);
  assert.equal(g.players[0].lives, 1);
  assert.equal(g.players[1].lives, 1);
  assert.equal(g.players[2].lives, 0);
  assert.equal(g.phase, "results");
  g.players[0].lives = 0;
  g.order = ["p1"];
  Object.assign(g.players[1], { bid: 0, taken: 0 });
  score(g, 200);
  assert.equal(g.winner, "p1");
});
test("all-out revival includes players eliminated in earlier rounds", () => {
  const g = setup(4);
  g.order = ["p0", "p1"];
  Object.assign(g.players[0], { lives: 1, bid: 0, taken: 1 });
  Object.assign(g.players[1], { lives: 1, bid: 2, taken: 1 });
  g.players[2].lives = 0;
  g.players[3].lives = 0;
  score(g, 100);
  assert.deepEqual(
    g.players.map((p) => p.lives),
    [1, 1, 1, 1],
  );
  assert.equal(g.phase, "results");
  assert.equal(g.tie, true);
  tick(g, 12101);
  assert.equal(g.order.length, 4);
});
test("normal rounds reveal only your hand; blind rounds reveal only others", () => {
  const g = setup();
  const normal = view(g, "p0");
  assert.ok(normal.players[0].hand.every((n) => n !== null));
  assert.ok(normal.players[1].hand.every((n) => n === null));
  g.round = 5;
  deal(g, 100);
  assert.equal(g.count, 1);
  const blind = view(g, "p0");
  assert.deepEqual(blind.players[0].hand, [null]);
  assert.ok(blind.players[1].hand[0] !== null);
  g.players[2].lives = 0;
  g.order = ["p0", "p1"];
  const spectator = view(g, "p2");
  assert.ok(spectator.players.every((p) => p.hand.every((n) => n === null)));
});
test("blind ace choice is available only to its holder on their playing turn", () => {
  for (const n of [2, 3]) {
    const g = setup(n);
    g.count = 1;
    for (let i = 0; i < n; i++) g.players[i].hand = [i === 1 ? 31 : 10 + i];
    for (const p of g.players) {
      assert.equal(view(g, p.id).canChooseAce, false);
      bid(g, p.id, 0, 100);
    }
    assert.equal(view(g, "p0").canChooseAce, false);
    assert.equal(view(g, "p1").canChooseAce, false);
    play(g, "p0", 10, undefined, 100);
    assert.deepEqual(g.trick[0], { player: "p0", card: 10 });
    const holder = view(g, "p1");
    assert.deepEqual(holder.players[1].hand, [null]);
    assert.equal(holder.canChooseAce, true);
    assert.equal(view(g, "p0").canChooseAce, false);
    assert.throws(() => play(g, "p1", 31, undefined, 100), /Choose high or low/);
    play(g, "p1", 31, "low", 100);
    assert.deepEqual(g.trick[1], { player: "p1", card: 31, mode: "low" });
    assert.equal(view(g, "p1").canChooseAce, false);
  }
});
test("normal ace choice requires the ace in the current player's hand", () => {
  const g = setup(2);
  g.players[0].hand = [10, 31];
  g.players[1].hand = [20, 40];
  for (const p of g.players) bid(g, p.id, 0, 100);
  assert.equal(view(g, "p0").canChooseAce, true);
  assert.equal(view(g, "p1").canChooseAce, false);
  play(g, "p0", 10, undefined, 100);
  assert.equal(view(g, "p0").canChooseAce, false);
  assert.equal(view(g, "p1").canChooseAce, false);
  assert.throws(() => play(g, "p1", 31, "high", 100), /not in your hand/);
});
test("six rounds cycle from six to one then restart, with rotating first bidder", () => {
  const g = setup();
  const counts = [g.count];
  for (let i = 0; i < 6; i++) {
    deal(g, 100);
    counts.push(g.count);
  }
  assert.deepEqual(counts, [6, 5, 4, 3, 2, 1, 6]);
  assert.equal(g.cycle, 2);
});
test("automated legal play advances complete games without stuck turns", () => {
  for (let n = 2; n <= 6; n++) {
    const g = setup(n);
    let time = 100;
    let steps = 0;
    while (g.phase !== "finished" && steps++ < 15000) {
      time += 41000;
      tick(g, time);
      if (g.phase === "bidding") {
        assert.ok(legalBids(g).length > 0);
      }
      assert.ok(g.players.every((p) => p.lives >= 0 && p.lives <= 3));
    }
    assert.equal(g.phase, "finished");
    assert.ok(g.winner);
  }
});
