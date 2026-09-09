import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import type { view } from "@/shared/game";
import { tableOrder } from "../table-order";
import { PlayerSeat } from "./player-seat";
import { PlayingCard } from "./playing-card";
import { TableSurface } from "./table-surface";
import { Button } from "./ui/button";

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
  const opponents = seating.seats.slice(1);
  const hasSides = opponents.length > 2;
  const topSeats = hasSides ? opponents.slice(1, -1) : opponents;
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
    const animations = Array.from(
      board.current!.querySelectorAll<HTMLElement>(".trick-cards .playing-card"),
    ).map((card, i) => {
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
    });
    return () => animations.forEach((animation) => animation.cancel());
  });
  useEffect(() => animateTrick(), [game.phase, game.round, game.lastWinner, trickNumber]);

  function seat(id: string) {
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
      <PlayerSeat
        key={id}
        player={player}
        number={number}
        you={id === game.you}
        current={seating.current === id}
        deadline={game.deadline}
        serverTime={game.serverTime}
        round={game.round}
        startingLives={game.startingLives}
        status={status}
      />
    );
  }

  return (
    <div ref={board} className="match-board grid h-full min-h-0 gap-2" data-phase={game.phase}>
      <section className="table-arena relative isolate grid min-h-0" aria-label="Game table">
        <TableSurface />
        <div className="opponents-top flex items-start justify-evenly gap-2">
          {topSeats.map(seat)}
        </div>
        <div className="opponent-left flex items-center justify-center">
          {hasSides && seat(opponents[0])}
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
              className="trick-cards grid place-content-center gap-2"
              key={`${game.round}-${trickNumber}`}
              style={
                {
                  "--trick-count": Math.max(1, game.trick.length),
                  "--compact-columns": Math.max(1, Math.min(3, game.trick.length)),
                  "--compact-rows": Math.max(1, Math.ceil(game.trick.length / 3)),
                } as CSSProperties
              }
            >
              {game.trick.map((play) => (
                <div
                  className={`played-card ${game.phase === "trick" && play.player === game.lastWinner ? "winner-card" : ""}`}
                  key={play.card}
                >
                  <PlayingCard card={play.card} mode={play.mode} />
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="opponent-right flex items-center justify-center">
          {hasSides && seat(opponents.at(-1)!)}
        </div>
      </section>
      <section
        className="hand-area flex min-w-0 flex-col items-center gap-2"
        aria-label="Your hand"
      >
        {me && seat(me.id)}
        <div
          className="hand flex items-start justify-center gap-1.5"
          key={`hand-${game.round}`}
          data-empty-spectator={(!active && !me?.hand.length) || undefined}
          style={
            {
              "--hand-columns": Math.max(1, Math.min(3, me?.hand.length ?? 0)),
              "--hand-rows": Math.ceil(game.count / 3),
            } as CSSProperties
          }
        >
          {me?.hand.map((card, i) => (
            <div className="hand-card relative min-w-0" key={card ?? i}>
              <PlayingCard
                card={card}
                delay={i * 40}
                disabled={!myTurn || game.phase !== "playing" || busy}
                pending={pendingCard === (card ?? -1)}
                onClick={() => onPlay(card)}
              />
            </div>
          ))}
        </div>
        {!active && (
          <p className="text-center text-xs text-muted-foreground">
            Watching · you return if everyone is out
          </p>
        )}
      </section>
    </div>
  );
}
