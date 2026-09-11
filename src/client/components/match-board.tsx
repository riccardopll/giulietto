import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import type { view } from "@/shared/game";
import { tableOrder } from "../table-order";
import { EmotePicker } from "./emotes";
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
  onEmote,
  onBid,
  onPlay,
}: {
  game: State;
  busy: boolean;
  pendingCard: number | null;
  preview: boolean;
  onEmote: () => void;
  onBid: (bid: number) => void;
  onPlay: (card: number | null) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [emoteMenuOpen, setEmoteMenuOpen] = useState(false);
  const seating = tableOrder(game);
  const me = game.players.find((p) => p.id === game.you);
  const active = !!me && me.lives > 0;
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
    [seating.seats[0], { side: "bottom" as const, column: 3 }] as const,
  ]);
  const trickNumber =
    game.count -
    (game.players.find((p) => p.id === game.order[0])?.hand.length ?? 0) +
    (game.trick.some((p) => p.player === game.order[0]) ? 0 : 1);

  const animateTrick = useEffectEvent(() => {
    if (preview || game.phase !== "trick") return;
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
    const status =
      player.lives <= 0
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
        className="seat-slot grid min-w-0 grid-rows-subgrid"
        data-center={position.column === 3 || undefined}
        style={
          {
            gridColumn: `${position.column} / span 2`,
            gridRow: `${position.side === "top" ? 1 : 4} / span 2`,
            "--seat-fan-rotation": `${position.side === "top" ? 180 + (position.column - 3) * 15 : (3 - position.column) * 15}deg`,
          } as CSSProperties
        }
      >
        <PlayerSeat
          emoteMenuOpen={emoteMenuOpen}
          player={player}
          number={number}
          you={id === game.you}
          current={seating.current === id}
          activeTurn={game.phase === "playing" && seating.current === id && player.lives > 0}
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
      className="match-board @container/board mx-auto grid size-full max-h-[58rem] max-w-5xl grid-rows-[clamp(2.25rem,calc(50dvh-19.5rem),8.25rem)_minmax(0,1fr)_auto] gap-1.5
        [--opponent-card-width:clamp(2.5rem,7dvh,4rem)] [--opponent-hand-height:calc(var(--opponent-card-width)*1.6)]"
      data-phase={game.phase}
      data-blind={game.count === 1 || undefined}
    >
      <MatchEventFeed key={`${game.code}-${game.matchId}-${game.you}`} game={game} />
      <section
        className="table-arena relative isolate grid min-h-0 w-full grid-cols-6 gap-x-2 grid-rows-[4.5rem_var(--opponent-hand-height)_minmax(0,1fr)_var(--opponent-hand-height)_4.5rem]
          @min-2xl/board:grid-rows-[5.5rem_var(--opponent-hand-height)_minmax(0,1fr)_var(--opponent-hand-height)_5.5rem]"
        aria-label="Game table"
      >
        <TableSurface />
        <div className="seats contents">{seating.seats.map(seat)}</div>
        <section
          className="play-table @container/play col-span-full row-start-3 grid min-h-0 min-w-0 place-items-center [container-type:size]"
          aria-label={game.phase === "bidding" ? "Predictions" : "Current trick"}
        >
          {game.phase === "bidding" ? (
            <div className="bid-options flex max-w-[90%] flex-col items-center justify-center gap-3 short-trick:gap-1.5 @min-2xl/board:flex-row">
              {[0, 3]
                .filter((start) => start <= game.count)
                .map((start) => (
                  <div key={start} className="flex justify-center gap-3">
                    {Array.from(
                      { length: Math.min(start === 0 ? 3 : 4, game.count - start + 1) },
                      (_, i) => {
                        const n = start + i;
                        return (
                          <Button
                            key={n}
                            variant="outline"
                            className="size-14 rounded-lg bg-white p-0 text-xl font-semibold short-trick:size-11"
                            disabled={!myTurn || busy || !game.legalBids.includes(n)}
                            aria-label={`Predict ${n} ${n === 1 ? "trick" : "tricks"}`}
                            onClick={() => onBid(n)}
                          >
                            {n}
                          </Button>
                        );
                      },
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div
              className="trick-cards trick-grid short-trick:[--trick-columns:var(--trick-players)] short-trick:[--trick-rows:1] @min-2xl/board:[--trick-columns:var(--trick-players)] @min-2xl/board:[--trick-rows:1] @min-2xl/board:[--played-card-max-width:5.5rem]"
              style={
                {
                  "--trick-players": game.order.length,
                  "--default-trick-columns": Math.min(3, game.order.length),
                  "--default-trick-rows": Math.ceil(game.order.length / 3),
                } as CSSProperties
              }
              key={`${game.round}-${trickNumber}`}
            >
              {game.trick.map((play) => (
                <div
                  className="played-card min-w-0 animate-[card-land_.24s_ease-out_both]"
                  key={play.card}
                  data-owner={play.player}
                >
                  <PlayingCard card={play.card} mode={play.mode} />
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
      <div className="@container/hand relative mx-auto grid w-full max-w-[36rem] min-w-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center pt-2">
        <section
          className="hand-area col-start-2 row-start-1 min-w-0 [--hand-card-limit:4.75rem] @min-2xl/board:[--hand-card-limit:6rem] [--hand-card-width:min(var(--hand-card-limit),calc((100cqw+1.5rem)/6),12dvh)] [--hand-card-gap:min(.5rem,calc((100cqw-4rem-var(--hand-count)*var(--hand-card-width))/max(1,var(--hand-count)-1)))]"
          style={{ "--hand-count": me?.hand.length ?? 0 } as CSSProperties}
          aria-label={game.spectating ? "Spectator mode" : "Your hand"}
        >
          <div
            className="hand flex min-h-[calc(var(--hand-card-width)*1.6)] items-center justify-center"
            key={`hand-${game.round}`}
            data-active-turn={(canPlay && !!me?.hand.length) || undefined}
          >
            {game.spectating && (
              <p className="text-sm text-muted-foreground">You are spectating.</p>
            )}
            {!game.spectating &&
              me?.hand.map((card, i) => {
                const middle = (me.hand.length - 1) / 2;
                const position = middle ? (i - middle) / middle : 0;
                return (
                  <div
                    className="hand-card relative ml-(--hand-card-gap) first:ml-0 w-(--hand-card-width) min-w-0 origin-bottom translate-y-(--hand-lift) rotate-(--hand-angle)"
                    key={card ?? i}
                    style={
                      {
                        "--hand-angle": `${position * 3}deg`,
                        "--hand-lift": `${middle ? (position ** 2 - 1) * 4 : 0}px`,
                      } as CSSProperties
                    }
                  >
                    <PlayingCard
                      card={card}
                      className={canPlay ? "turn-glow" : undefined}
                      disabled={!canPlay}
                      pending={pendingCard === (card ?? -1)}
                      onClick={() => onPlay(card)}
                    />
                  </div>
                );
              })}
          </div>
        </section>
        <EmotePicker
          open={emoteMenuOpen}
          onOpenChange={setEmoteMenuOpen}
          disabled={busy || !active}
          emote={me?.emote}
          serverTime={game.serverTime}
          onSend={onEmote}
        />
      </div>
    </div>
  );
}
