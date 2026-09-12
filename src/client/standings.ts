import type { Player } from "../shared/game";

export function standings<T extends Pick<Player, "id" | "eliminatedRound">>(
  players: T[],
  winner: string,
) {
  const remaining = players
    .filter((player) => player.id !== winner)
    .sort((a, b) => (b.eliminatedRound ?? -1) - (a.eliminatedRound ?? -1));
  const groups = [{ place: 1, players: players.filter((player) => player.id === winner) }];
  for (let i = 0; i < remaining.length;) {
    const round = remaining[i].eliminatedRound;
    const tied = remaining.slice(i).filter((player) => player.eliminatedRound === round);
    groups.push({ place: i + 2, players: tied });
    i += tied.length;
  }
  return groups;
}
