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
  MIN_STARTING_LIVES,
  MAX_STARTING_LIVES,
} from "../src/shared/game.ts";
function setup(n = 3) {
  const g = makeGame("ABCDEFGH", player("p0", "P0", 100), false);
  for (let i = 1; i < n; i++) g.players.push(player("p" + i, "P" + i, 100));
  deal(g, 100);
  return g;
}
test("starting lives default to three and apply only on the first deal", () => {
  const g = makeGame("ABCDEFGH", player("p0", "P0", 100), false);
  assert.equal(g.startingLives, 3);
  g.players.push(player("p1", "P1", 100));
  g.startingLives = MAX_STARTING_LIVES;
  deal(g, 100);
  assert.ok(g.players.every((p) => p.lives === MAX_STARTING_LIVES));
  g.players[0].lives = 2;
  g.players[1].lives = 0;
  deal(g, 200);
  assert.deepEqual(
    g.players.map((p) => p.lives),
    [2, 0],
  );
});
test("public countdown and full-table starts use the selected starting lives", () => {
  for (const n of [2, 6]) {
    const g = makeGame("ABCDEFGH", player("p0", "P0", 100), true);
    g.startingLives = n === 2 ? MIN_STARTING_LIVES : MAX_STARTING_LIVES;
    for (let i = 1; i < n; i++) g.players.push(player("p" + i, "P" + i, 100));
    tick(g, 100);
    if (n === 2) {
      assert.equal(g.phase, "lobby");
      tick(g, g.startAt);
    }
    assert.equal(g.phase, "bidding");
    assert.ok(g.players.every((p) => p.lives === g.startingLives));
  }
});
test("initial seating can produce every order while preserving the host", (t) => {
  let draws;
  t.mock.method(crypto, "getRandomValues", (values) => {
    values[0] = draws.shift() ?? 0;
    return values;
  });
  const orders = new Set();
  for (let first = 0; first < 3; first++) {
    for (let second = 0; second < 2; second++) {
      draws = [first, second];
      const g = setup();
      orders.add(g.order.join(","));
      assert.equal(g.host, "p0");
      assert.equal(g.order[g.turn], g.players[0].id);
      assert.deepEqual([...g.order].sort(), ["p0", "p1", "p2"]);
    }
  }
  assert.equal(orders.size, 6);
});
test("later rounds retain shuffled seating and exclude eliminated or departed players", (t) => {
  t.mock.method(crypto, "getRandomValues", (values) => values.fill(0));
  const g = setup(4);
  const seats = [...g.players];
  assert.notEqual(g.order[0], g.host);
  g.players[1].lives = 0;
  g.players[2].left = true;
  deal(g, 200);
  assert.deepEqual(g.players, seats);
  assert.deepEqual(g.order, [seats[3].id, seats[0].id]);
  assert.deepEqual(g.players[1].hand, []);
  assert.deepEqual(g.players[2].hand, []);
});
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
  const [first, second, last] = g.order;
  assert.throws(() => bid(g, second, 1, 100));
  bid(g, first, 2, 100);
  bid(g, second, 3, 100);
  assert.ok(!legalBids(g).includes(1));
  assert.throws(() => bid(g, last, 1, 100));
  bid(g, last, 0, 100);
  assert.equal(g.phase, "playing");
});
test("highest card wins and that player leads the next trick", () => {
  const g = setup();
  for (const p of g.players) bid(g, p.id, 0, 100);
  g.players[0].hand = [2, 3];
  g.players[1].hand = [40, 39];
  g.players[2].hand = [10, 9];
  play(g, g.order[0], 2, null, 100);
  play(g, g.order[1], 40, null, 100);
  play(g, g.order[2], 10, null, 100);
  assert.equal(g.phase, "trick");
  assert.equal(g.lastWinner, g.players[1].id);
  assert.equal(g.players[1].taken, 1);
  tick(g, 2800);
  assert.equal(g.order[g.turn], g.players[1].id);
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
  g.order = [g.players[1].id];
  Object.assign(g.players[1], { bid: 0, taken: 0 });
  score(g, 200);
  assert.equal(g.winner, g.players[1].id);
});
test("all-out revival includes players eliminated in earlier rounds", () => {
  const g = setup(4);
  g.order = g.players.slice(0, 2).map((p) => p.id);
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
  const normal = view(g, g.players[0].id);
  assert.ok(normal.players[0].hand.every((n) => n !== null));
  assert.ok(normal.players[1].hand.every((n) => n === null));
  g.round = 5;
  deal(g, 100);
  assert.equal(g.count, 1);
  const blind = view(g, g.players[0].id);
  assert.deepEqual(blind.players[0].hand, [null]);
  assert.ok(blind.players[1].hand[0] !== null);
  g.players[2].lives = 0;
  g.order = g.players.slice(0, 2).map((p) => p.id);
  const spectator = view(g, g.players[2].id);
  assert.ok(spectator.players.every((p) => p.hand.every((n) => n === null)));
});
test("played cards are public for every viewer while unplayed cards retain their visibility", () => {
  for (const count of [2, 1]) {
    const g = setup();
    const [first, second, spectator] = g.players;
    g.count = count;
    g.order = [first.id, second.id];
    first.hand = count === 1 ? [31] : [31, 2];
    second.hand = count === 1 ? [40] : [40, 3];
    spectator.hand = [];
    spectator.lives = 0;
    for (const id of g.order) bid(g, id, 0, 100);

    const assertViews = () => {
      for (const viewer of g.players) {
        const snapshot = view(g, viewer.id);
        assert.deepEqual(snapshot.trick, g.trick);
        for (const p of g.players) {
          const visible = viewer !== spectator && (count === 1 ? p !== viewer : p === viewer);
          assert.deepEqual(
            snapshot.players.find((entry) => entry.id === p.id).hand,
            p.hand.map((card) => (visible ? card : null)),
          );
        }
      }
    };
    assertViews();
    play(g, first.id, 31, "low", 100);
    assert.equal(g.phase, "playing");
    assert.deepEqual(g.trick, [{ player: first.id, card: 31, mode: "low" }]);
    assertViews();
    play(g, second.id, 40, undefined, 100);
    assert.equal(g.phase, "trick");
    assertViews();
  }
});
test("blind ace choice is available only to its holder on their playing turn", (t) => {
  t.mock.method(crypto, "getRandomValues", (values) => values.fill(0));
  for (const n of [2, 3]) {
    const g = setup(n);
    const [first, second] = g.order;
    assert.notEqual(first, g.host);
    g.count = 1;
    for (let i = 0; i < n; i++) g.players[i].hand = [i === 1 ? 31 : 10 + i];
    for (const p of g.players) {
      assert.equal(view(g, p.id).canChooseAce, false);
      bid(g, p.id, 0, 100);
    }
    assert.equal(view(g, first).canChooseAce, false);
    assert.equal(view(g, second).canChooseAce, false);
    play(g, first, 10, undefined, 100);
    assert.deepEqual(g.trick[0], { player: first, card: 10 });
    const holder = view(g, second);
    assert.deepEqual(holder.players[1].hand, [null]);
    assert.equal(holder.canChooseAce, true);
    assert.equal(view(g, first).canChooseAce, false);
    assert.throws(() => play(g, second, 31, undefined, 100), /Choose high or low/);
    play(g, second, 31, "low", 100);
    assert.deepEqual(g.trick[1], { player: second, card: 31, mode: "low" });
    assert.equal(view(g, second).canChooseAce, false);
  }
});
test("normal ace choice requires the ace in the current player's hand", (t) => {
  t.mock.method(crypto, "getRandomValues", (values) => values.fill(0));
  const g = setup(2);
  const [first, second] = g.order;
  assert.notEqual(first, g.host);
  g.players[0].hand = [10, 31];
  g.players[1].hand = [20, 40];
  for (const p of g.players) bid(g, p.id, 0, 100);
  assert.equal(view(g, first).canChooseAce, true);
  assert.equal(view(g, second).canChooseAce, false);
  play(g, first, 10, undefined, 100);
  assert.equal(view(g, first).canChooseAce, false);
  assert.equal(view(g, second).canChooseAce, false);
  assert.throws(() => play(g, second, 31, "high", 100), /not in your hand/);
});
test("six rounds cycle from six to one then restart, with rotating first bidder", () => {
  const g = setup();
  const counts = [g.count];
  const seats = [...g.order];
  for (let i = 0; i < 6; i++) {
    deal(g, 100);
    counts.push(g.count);
    const offset = (i + 1) % seats.length;
    assert.deepEqual(g.order, [...seats.slice(offset), ...seats.slice(0, offset)]);
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
