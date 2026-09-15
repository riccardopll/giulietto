import { makeGame, makePlayer, type Game } from "../../src/shared/game";

export function lobbyFixture(people = 3): Game {
  const players = Array.from({ length: people }, (_, i) =>
    makePlayer(`p${i}`, `bot_${i + 1}`, 100),
  );
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
  game.players.forEach((player, i) => {
    player.hand = [...hands[i]];
  });
  return {
    ...game,
    matchId: "match-1",
    startedAt: 100,
    round: 1,
    count: hands[0].length,
    phase: "bidding",
    order: game.players.map((player) => player.id),
    deadline: 40_100,
  };
}
