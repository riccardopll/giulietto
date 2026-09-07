import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGame, player, deal, bid, play, tick } from "../src/shared/game.ts";
import { gameEvents } from "../src/server/game-events.ts";

test("human bids and low Ace plays retain actor, command, legal choices and order", () => {
  const g = makeGame("ABCDEFGH", player("p0", "One", 100), false);
  g.players.push(player("p1", "Two", 100));
  deal(g, 100);
  const [firstId, secondId] = g.order;
  g.players[0].hand = [31, 40];
  g.players[1].hand = [1, 2];
  const record = (action, commandId) => {
    const before = structuredClone(g);
    action();
    g.revision++;
    return gameEvents(before, g, { source: "player", commandId }, 200);
  };
  const [first] = record(() => bid(g, firstId, 0, 200), "bid-0");
  assert.equal(first.player_id, firstId);
  assert.equal(first.command_id, "bid-0");
  assert.deepEqual(JSON.parse(first.payload).legalBids, [0, 1, 2, 3, 4, 5, 6]);
  const [last] = record(() => bid(g, secondId, 0, 200), "bid-1");
  assert.equal(last.type, "bid");
  assert.equal(JSON.parse(last.payload).position, 2);
  assert.ok(!JSON.parse(last.payload).legalBids.includes(6));
  const [ace] = record(() => play(g, firstId, 31, "low", 200), "play-0");
  assert.equal(ace.source, "player");
  assert.deepEqual(JSON.parse(ace.payload), {
    card: 31,
    mode: "low",
    trick: 1,
    position: 1,
    handBefore: [31, 40],
  });
  const [second, winner] = record(() => play(g, secondId, 1, null, 200), "play-1");
  assert.equal(JSON.parse(second.payload).position, 2);
  assert.equal(winner.type, "trick_won");
  assert.equal(winner.player_id, secondId);
  tick(g, g.deadline);
  const [lead] = record(() => play(g, secondId, 2, null, 3000), "play-2");
  assert.equal(JSON.parse(lead.payload).trick, 2);
  assert.equal(JSON.parse(lead.payload).position, 1);
});
