import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGame, player, deal, bid, play, tick, view } from "../src/shared/game.ts";
import { tableOrder } from "../src/client/table-order.ts";

function setup() {
  const game = makeGame("ABCDEFGH", player("p0", "bot_1", 0), false);
  for (let i = 1; i < 4; i++) game.players.push(player(`p${i}`, `bot_${i + 1}`, 0));
  deal(game, 100);
  return game;
}

function orderFor(game) {
  return tableOrder(view(game, game.players[0].id));
}

test("round rotation changes prediction order without changing numbered seats", () => {
  const game = setup();
  const seats = game.players.map((p) => p.id);
  game.players[1].lives = 0;
  game.players[2].left = true;
  deal(game, 200);
  const order = orderFor(game);
  assert.deepEqual(
    game.players.map((p) => p.id),
    seats,
  );
  assert.deepEqual(order.order, [seats[3], seats[0]]);
  assert.equal(order.current, seats[3]);
  assert.equal(order.next, seats[0]);
  bid(game, seats[3], 0, 300);
  assert.equal(orderFor(game).next, null);
  bid(game, seats[0], 0, 400);
  assert.equal(orderFor(game).current, seats[3]);
});

test("trick order starts at the leader and remains fixed while the turn wraps", () => {
  const game = setup();
  for (const id of game.order) bid(game, id, 0, 200);
  const seats = [...game.order];
  game.players.forEach((p, i) => {
    p.hand = [i + 1, i + 11];
  });
  for (let i = 0; i < 4; i++) play(game, seats[i], i + 1, null, 300);
  assert.equal(orderFor(game).current, null);
  assert.equal(orderFor(game).next, seats[3]);
  assert.equal(orderFor(game).nextTrick, true);
  const nextOrder = [seats[3], ...seats.slice(0, 3)];
  assert.deepEqual(orderFor(game).order, nextOrder);
  tick(game, game.deadline);
  assert.equal(orderFor(game).current, seats[3]);
  play(game, seats[3], 14, null, 4000);
  assert.equal(orderFor(game).current, seats[0]);
  assert.equal(orderFor(game).next, seats[1]);
  assert.deepEqual(orderFor(game).order, nextOrder);
  for (let i = 0; i < 3; i++) play(game, seats[i], i + 11, null, 4100);
  assert.equal(orderFor(game).current, null);
  assert.equal(orderFor(game).next, null);
  assert.equal(orderFor(game).nextTrick, false);
  assert.deepEqual(orderFor(game).order, nextOrder);
});

test("seat order is identical for each viewer without exposing hidden hands", () => {
  const game = setup();
  const seats = game.players.map((p) => p.id);
  for (const id of seats) {
    const state = view(game, id);
    assert.deepEqual(tableOrder(state).order, seats);
    for (const p of state.players) {
      assert.equal(
        p.hand.every((card) => card === null),
        p.id !== id,
      );
    }
  }
  game.round = 5;
  deal(game, 200);
  for (const id of seats) {
    const state = view(game, id);
    assert.deepEqual(tableOrder(state).order, game.order);
    for (const p of state.players) {
      assert.equal(p.hand[0] === null, p.id === id);
    }
  }
  game.players[0].left = true;
  assert.ok(view(game, seats[0]).players.every((p) => p.hand.every((card) => card === null)));
});

test("seats keep clockwise order from each viewer, including inactive players", () => {
  for (let count = 2; count <= 6; count++) {
    const game = makeGame("ABCDEFGH", player("p0", "bot_1", 0), false);
    for (let i = 1; i < count; i++) game.players.push(player(`p${i}`, `bot_${i + 1}`, 0));
    deal(game, 100);
    const seats = game.players.map((p) => p.id);
    for (const id of seats) {
      const before = tableOrder(view(game, id)).seats;
      assert.equal(before[0], id);
      assert.equal(new Set(before).size, count);
      const start = seats.indexOf(id);
      assert.deepEqual(before, [...seats.slice(start), ...seats.slice(0, start)]);
      game.players[0].lives = 0;
      game.players[1].left = true;
      assert.deepEqual(tableOrder(view(game, id)).seats, before);
      assert.deepEqual(
        game.players.map((p) => p.id),
        seats,
      );
    }
  }
});
