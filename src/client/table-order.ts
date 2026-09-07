import type { view } from "../shared/game.ts";

type State = ReturnType<typeof view>;

export function tableOrder(game: State) {
  const takingTurn = game.phase === "bidding" || game.phase === "playing";
  const current = takingTurn ? game.order[game.turn] : null;
  const nextTrick = game.phase === "trick" && game.players.some((p) => p.hand.length > 0);
  const leader =
    game.phase === "bidding"
      ? game.order[0]
      : nextTrick
        ? game.lastWinner
        : (game.trick[0]?.player ?? current);
  const start = Math.max(0, game.order.indexOf(leader ?? ""));
  const order = [...game.order.slice(start), ...game.order.slice(0, start)];
  const currentIndex = order.indexOf(current ?? "");
  return {
    current,
    order,
    nextTrick,
    next: takingTurn ? (order[currentIndex + 1] ?? null) : nextTrick ? game.lastWinner : null,
  };
}
