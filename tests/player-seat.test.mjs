import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "rolldown";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeGame, player, deal, view } from "../src/shared/game.ts";

const built = await build({
  input: "src/client/components/player-seat.tsx",
  write: false,
  external: ["react", "react/jsx-runtime", "lucide-react"],
  output: { format: "cjs" },
});
const component = { exports: {} };
new Function("require", "module", "exports", built.output[0].code)(
  createRequire(import.meta.url),
  component,
  component.exports,
);
const { PlayerSeat } = component.exports;

function renderSeats(state) {
  return state.players.map((p, i) => {
    const html = renderToStaticMarkup(
      createElement(PlayerSeat, {
        player: p,
        number: i + 1,
        position: i / state.players.length,
        you: p.id === state.you,
        current: p.id === state.order[state.turn],
        round: state.round,
        startingLives: state.startingLives,
        status: "Waiting",
      }),
    );
    return {
      html,
      cards: [...html.matchAll(/<img[^>]+src="\/cards\/neapolitan\/(back|\d+)\.webp"/g)].map(
        (match) => match[1],
      ),
    };
  });
}

test("seat fans render only the cards allowed by each player's snapshot", () => {
  for (const blind of [false, true]) {
    const game = makeGame("ABCDEFGH", player("p0", "bot_1", 0), false);
    game.players.push(player("p1", "bot_2", 0), player("p2", "bot_3", 0));
    deal(game, 100);
    if (blind) {
      game.round = 5;
      deal(game, 200);
    }
    for (const viewer of game.players) {
      const state = view(game, viewer.id);
      const rendered = renderSeats(state);
      state.players.forEach((p, i) => {
        assert.deepEqual(
          rendered[i].cards,
          p.id === viewer.id ? [] : p.hand.map((card) => (card === null ? "back" : String(card))),
        );
        if (p.id !== viewer.id && !blind)
          assert.ok(rendered[i].cards.every((card) => card === "back"));
      });
    }
    const spectator = game.players[0];
    spectator.left = true;
    const rendered = renderSeats(view(game, spectator.id));
    assert.ok(rendered.every((seat) => seat.cards.every((card) => card === "back")));
  }
});

test("empty hands render no card backs and active seats retain accessible state", () => {
  const game = makeGame("ABCDEFGH", player("p0", "bot_1", 0), false);
  game.players.push(player("p1", "bot_2", 0));
  deal(game, 100);
  game.players.forEach((p) => (p.hand = []));
  const rendered = renderSeats(view(game, game.players[1].id));
  assert.ok(rendered.every((seat) => seat.cards.length === 0));
  assert.match(rendered[0].html, /aria-current="true"/);
  assert.match(rendered[0].html, /aria-label="0 tricks won, no predicted"/);
});
