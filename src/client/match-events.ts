import { findPlayer, type GameView } from "../shared/game";

type Actor = { id: string; player: string; name: string };
export type MatchEvent = Actor &
  (
    | { type: "left" }
    | { type: "rejoined" }
    | { type: "prediction"; bid: number }
    | { type: "play"; card: number; mode?: "high" | "low" }
    | { type: "trick-won"; card: number; mode?: "high" | "low" }
  );

function context(state: GameView) {
  return JSON.stringify([state.code, state.matchId, state.you]);
}

function completedTricks(state: GameView) {
  return state.players.reduce((sum, player) => sum + player.taken, 0);
}

function actor(state: GameView, player: string, action: string): Actor {
  return {
    id: `${context(state)}:${state.round}:${action}:${player}`,
    player,
    name: findPlayer(state, player)?.name ?? player,
  };
}

export function matchEvents(before: GameView | null, after: GameView): MatchEvent[] {
  const sameContext = before !== null && context(before) === context(after);
  if (sameContext && after.revision < before.revision) return [];
  const events: MatchEvent[] = [];
  if (sameContext && after.revision <= before.revision + 1) {
    for (const player of after.players) {
      const previous = findPlayer(before, player.id);
      if (!previous || previous.connected === player.connected) continue;
      const type = player.connected ? "rejoined" : "left";
      events.push({
        ...actor(after, player.id, `${type}:${after.revision}:${after.serverTime}`),
        type,
      });
    }
  }
  if (sameContext && before.round === after.round && after.revision === before.revision + 1) {
    if (before.phase === "bidding" && ["bidding", "playing"].includes(after.phase)) {
      const id = before.order[before.turn];
      const player = findPlayer(before, id);
      const predicted = findPlayer(after, id);
      if (player?.bid === null && predicted && predicted.bid !== null)
        events.push({
          ...actor(after, predicted.id, "prediction"),
          type: "prediction",
          bid: predicted.bid,
        });
    }

    const completed = completedTricks(before);
    if (
      before.phase === "playing" &&
      ["playing", "trick"].includes(after.phase) &&
      completedTricks(after) === completed + (after.phase === "trick" ? 1 : 0) &&
      after.trick.length === before.trick.length + 1 &&
      before.trick.every((move, index) => {
        const next = after.trick[index];
        return move.player === next.player && move.card === next.card && move.mode === next.mode;
      })
    ) {
      const move = after.trick.at(-1)!;
      if (move.player === before.order[before.turn]) {
        events.push({
          ...actor(after, move.player, `play:${completed + 1}`),
          type: "play",
          ...move,
        });
        const winning = after.trick.find((play) => play.player === after.lastWinner);
        if (after.phase === "trick" && winning)
          events.push({
            ...actor(after, winning.player, `trick-won:${completed + 1}`),
            type: "trick-won",
            ...winning,
          });
      }
    }
  }

  return events;
}
