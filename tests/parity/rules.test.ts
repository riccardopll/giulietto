import { describe, expect, test } from "vitest";
import { bid, deal, play, tick, type Game } from "../../src/shared/game";
import { lobbyFixture, seedRandom } from "../unit/helpers";
import fixture from "./.generated/rules.json";

type Action = { bid?: number; card?: number; mode?: string };

function snapshot(game: Game) {
  return {
    phase: game.phase,
    round: game.round,
    count: game.count,
    cycle: game.cycle,
    turn: game.turn,
    order: game.order,
    players: game.players.map((p) => ({
      id: p.id,
      lives: p.lives,
      hand: p.hand,
      bid: p.bid,
      taken: p.taken,
    })),
    trick: game.trick.map((p) => ({
      player: p.player,
      card: p.card,
      ...(p.card === 31 ? { mode: p.mode } : {}),
    })),
    played: game.played,
    lastWinner: game.lastWinner,
    winner: game.winner,
    tie: game.tie,
  };
}

describe("rules match the Python port", () => {
  test.each(fixture.matches.map((m, i) => [i, m] as const))("match %i", (_, match) => {
    seedRandom(match.seed);
    const game = lobbyFixture(match.players);
    game.startingLives = match.startingLives;
    deal(game, 100);
    expect(snapshot(game)).toEqual(match.steps[0].state);
    for (const step of match.steps.slice(1)) {
      const action = step.action as Action;
      const actor = game.order[game.turn];
      if (action.bid !== undefined) bid(game, actor, action.bid, 100);
      else play(game, actor, action.card!, action.mode as "high" | "low" | undefined, 100);
      while (game.phase === "trick" || game.phase === "results") tick(game, game.deadline);
      expect(snapshot(game)).toEqual(step.state);
    }
  });
});
