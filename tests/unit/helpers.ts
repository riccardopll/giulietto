import { makeGame, player, type Game } from "../../src/shared/game.ts";

export function lobbyFixture(people = 3): Game {
  const players = Array.from({ length: people }, (_, i) => player(`p${i}`, `bot_${i + 1}`, 100));
  return { ...makeGame("ABCDEFGH", players[0], false), players };
}

/** Known hands and seats let rule tests avoid depending on a shuffled deal. */
export function gameFixture(
  hands: number[][] = [
    [1, 2],
    [11, 12],
    [21, 22],
  ],
): Game {
  const game = lobbyFixture(hands.length);
  game.players.forEach((p, i) => {
    p.hand = [...hands[i]];
  });
  return {
    ...game,
    matchId: "match-1",
    startedAt: 100,
    round: 1,
    count: hands[0].length,
    phase: "bidding",
    order: game.players.map((p) => p.id),
    deadline: 40_100,
  };
}
