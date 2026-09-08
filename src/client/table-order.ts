import type { view } from "../shared/game.ts";

type State = ReturnType<typeof view>;

export function tableOrder(game: State) {
  const viewer = Math.max(
    0,
    game.players.findIndex((p) => p.id === game.you),
  );
  const slots =
    game.players.length === 2
      ? [4, 1]
      : game.players.length === 3
        ? [4, 6, 2]
        : game.players.length === 4
          ? [4, 6, 1, 2]
          : game.players.length === 5
            ? [4, 5, 6, 1, 2]
            : [4, 5, 6, 1, 2, 3];
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
    positions: Object.fromEntries(
      game.players.map((p, i) => [
        p.id,
        slots[(i - viewer + game.players.length) % game.players.length],
      ]),
    ),
    current,
    order,
    nextTrick,
    next: takingTurn ? (order[currentIndex + 1] ?? null) : nextTrick ? game.lastWinner : null,
  };
}
