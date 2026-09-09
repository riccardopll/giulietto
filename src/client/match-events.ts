import type { view } from "../shared/game.ts";

type State = ReturnType<typeof view>;
type Actor = { id: string; player: string; name: string };
export type MatchEvent = Actor &
  (
    | { type: "prediction"; bid: number }
    | { type: "play"; card: number; mode?: "high" | "low" }
    | { type: "trick-won"; card: number; mode?: "high" | "low" }
  );

function context(state: State) {
  return JSON.stringify([state.code, state.matchId, state.you]);
}

function completedTricks(state: State) {
  return state.players.reduce((sum, player) => sum + player.taken, 0);
}

function actor(state: State, player: string, action: string): Actor {
  return {
    id: `${context(state)}:${state.round}:${action}:${player}`,
    player,
    name: state.players.find((person) => person.id === player)?.name ?? player,
  };
}

/** Announce observed actions only; reconnect snapshots do not replay old table activity. */
export function matchEvents(before: State | null, after: State): MatchEvent[] {
  const sameContext = before !== null && context(before) === context(after);
  if (sameContext && after.revision <= before.revision) return [];
  const events: MatchEvent[] = [];
  if (sameContext && before.round === after.round && after.revision === before.revision + 1) {
    if (before.phase === "bidding" && ["bidding", "playing"].includes(after.phase)) {
      const player = before.players.find((person) => person.id === before.order[before.turn]);
      const predicted = after.players.find((person) => person.id === player?.id);
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
