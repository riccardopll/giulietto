import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import type { view } from "@/shared/game";
import { tableOrder } from "../table-order";
import { PlayerSeat } from "./player-seat";
import { PlayingCard } from "./playing-card";
import { TableSurface } from "./table-surface";
import { Button } from "./ui/button";
import { MatchEventFeed } from "./match-event-feed";

type State = ReturnType<typeof view>;

export function MatchBoard({
  game,
  busy,
  pendingCard,
  preview,
  onBid,
  onPlay,
}: {
  game: State;
  busy: boolean;
  pendingCard: number | null;
  preview: boolean;
  onBid: (bid: number) => void;
  onPlay: (card: number | null) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const seating = tableOrder(game);
  const me = game.players.find((p) => p.id === game.you);
  const active = !!me && me.lives > 0 && !me.left;
  const myTurn = seating.current === game.you && active;
  const canPlay = myTurn && game.phase === "playing" && !busy;
  const opponents = seating.seats.slice(1);
  const hasBottomNeighbors = opponents.length > 3;
  const topSeats = hasBottomNeighbors ? opponents.slice(1, -1) : opponents;
  const positions = new Map<string, { side: "top" | "bottom"; column: number }>([
    ...topSeats.map(
      (id, index) =>
        [id, { side: "top" as const, column: 4 - topSeats.length + index * 2 }] as const,
    ),
    ...(hasBottomNeighbors
      ? [
          [opponents[0], { side: "bottom" as const, column: 1 }] as const,
          [opponents.at(-1)!, { side: "bottom" as const, column: 5 }] as const,
        ]
      : []),
    [game.you, { side: "bottom" as const, column: 3 }] as const,
  ]);
  const trickNumber =
    game.count -
    (game.players.find((p) => p.id === game.order[0])?.hand.length ?? 0) +
    (game.trick.some((p) => p.player === game.order[0]) ? 0 : 1);

  const animateTrick = useEffectEvent(() => {
    if (preview || game.phase !== "trick" || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const anchor = board.current?.querySelector(`[data-seat="${game.lastWinner}"] .seat-avatar`);
    if (!anchor) return;
    const target = anchor.getBoundingClientRect();
    const animations = Array.from(board.current!.querySelectorAll<HTMLElement>(".played-card")).map(
      (card, i) => {
        const rect = card.getBoundingClientRect();
        return card.animate(
          [
            { transform: "translate(0,0) scale(1)", opacity: 1 },
            {
              transform: `translate(${target.x + target.width / 2 - rect.x - rect.width / 2}px,${target.y + target.height / 2 - rect.y - rect.height / 2}px) scale(.22)`,
              opacity: 0,
            },
          ],
          {
            duration: 380,
            delay: Math.max(0, game.deadline - game.serverTime - 520) + i * 18,
            easing: "cubic-bezier(.4,0,.2,1)",
            fill: "forwards",
          },
        );
      },
    );
    return () => animations.forEach((animation) => animation.cancel());
  });
  useEffect(() => animateTrick(), [game.phase, game.round, game.lastWinner, trickNumber]);

  function seat(id: string) {
    const position = positions.get(id)!;
    const number = game.players.findIndex((p) => p.id === id) + 1;
    const player = game.players[number - 1];
    const status = player.left
      ? game.order.includes(id)
        ? "Left · auto play"
        : "Left"
      : player.lives <= 0
        ? "Out"
        : seating.current === id
          ? game.phase === "bidding"
            ? "Predicting now"
            : "Playing now"
          : game.phase === "trick" && game.lastWinner === id
            ? "Trick winner"
            : seating.next === id
              ? "Up next"
              : game.trick.some((play) => play.player === id)
                ? "Played"
                : game.phase === "bidding" && player.bid !== null
                  ? "Predicted"
                  : "Waiting";
    return (
      <div
        key={id}
        className="seat-slot min-w-0"
        data-center={position.column === 3 || undefined}
        style={
          {
            gridColumn: `${position.column} / span 2`,
            gridRow: position.side === "top" ? 1 : 3,
            "--seat-progress": `${(seating.seats.indexOf(id) / seating.seats.length) * 100}%`,
          } as CSSProperties
        }
      >
        <PlayerSeat
          player={player}
          number={number}
          you={id === game.you}
          current={seating.current === id}
          deadline={game.deadline}
          serverTime={game.serverTime}
          round={game.round}
          startingLives={game.startingLives}
          status={status}
          side={position.side}
        />
      </div>
    );
  }

  return (
    <div
      ref={board}
      className="match-board grid h-full min-h-0"
      data-phase={game.phase}
      data-blind={game.count === 1 || undefined}
      style={
        {
          "--trick-players": game.order.length,
          "--trick-columns": Math.min(3, game.order.length),
          "--trick-rows": Math.ceil(game.order.length / 3),
        } as CSSProperties
      }
    >
      <MatchEventFeed key={`${game.code}-${game.matchId}-${game.you}`} game={game} />
      <section className="table-arena relative isolate grid min-h-0 w-full" aria-label="Game table">
        <TableSurface />
        <div className="seats pointer-events-none absolute inset-0 grid grid-cols-6">
          {seating.seats.map(seat)}
        </div>
        <section
          className="play-table grid min-h-0 min-w-0 place-items-center"
          aria-label={game.phase === "bidding" ? "Predictions" : "Current trick"}
        >
          {game.phase === "bidding" ? (
            <div className="bid-options flex flex-wrap justify-center gap-2">
              {Array.from({ length: game.count + 1 }, (_, n) => (
                <Button
                  key={n}
                  variant="outline"
                  className="size-11 rounded-lg bg-white p-0 text-lg font-semibold"
                  disabled={!myTurn || busy || !game.legalBids.includes(n)}
                  aria-label={`Predict ${n} ${n === 1 ? "trick" : "tricks"}`}
                  onClick={() => onBid(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          ) : (
            <div
              className="trick-cards flex flex-wrap items-center justify-center"
              key={`${game.round}-${trickNumber}`}
            >
              {game.trick.map((play) => (
                <div className="played-card" key={play.card} data-owner={play.player}>
                  <PlayingCard card={play.card} mode={play.mode} />
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
      <section className="hand-area flex min-w-0 flex-col items-center" aria-label="Your hand">
        <div
          className="hand flex items-start justify-center gap-1.5"
          key={`hand-${game.round}`}
          data-active-turn={(canPlay && !!me?.hand.length) || undefined}
          style={
            {
              "--hand-columns": Math.max(1, Math.min(3, me?.hand.length ?? 0)),
            } as CSSProperties
          }
        >
          {me?.hand.map((card, i) => {
            const half = (me.hand.length - 1) / 2;
            const offset = i - half;
            const columns = Math.min(3, me.hand.length);
            const rowCards = Math.min(columns, me.hand.length - Math.floor(i / 3) * 3);
            const rowHalf = (rowCards - 1) / 2;
            const rowOffset = (i % 3) - rowHalf;
            return (
              <div
                className="hand-card relative min-w-0"
                key={card ?? i}
                style={
                  {
                    "--hand-offset": offset,
                    "--hand-lift": offset ** 2 - half ** 2,
                    "--hand-row-offset": rowOffset,
                    "--hand-row-lift": rowOffset ** 2 - rowHalf ** 2,
                    "--hand-row-shift": (columns - rowCards) / 2,
                  } as CSSProperties
                }
              >
                <PlayingCard
                  card={card}
                  delay={i * 40}
                  disabled={!canPlay}
                  pending={pendingCard === (card ?? -1)}
                  onClick={() => onPlay(card)}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
