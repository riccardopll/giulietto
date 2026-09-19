import { vi } from "vitest";
import { makeGame, makePlayer, type Game } from "../../src/shared/game";

export function seedRandom(seed: number) {
  let x = seed >>> 0 || 1;
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    (array as Uint32Array)[0] = x;
    return array;
  });
}

export function lobbyFixture(people = 3): Game {
  const players = Array.from({ length: people }, (_, i) =>
    makePlayer(`p${i}`, `bot_${i + 1}`, 100),
  );
  return { ...makeGame("ABCDEFGH", players[0], false), players };
}

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
    deadline: 100 + game.turnSeconds * 1000,
  };
}
