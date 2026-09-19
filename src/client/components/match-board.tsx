import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { Target } from "lucide-react";
import { EMOTE_DURATION_MS, type Emote } from "../../shared/emotes";
import { findPlayer, type GameView } from "../../shared/game";
import { tableOrder } from "../table-order";
import { cn } from "../utils";
import { ChatButton, type ChatState } from "./chat";
import { EmotePicker, ReactionRail, useRecent } from "./emotes";
import { PlayerSeat } from "./player-seat";
import { PlayingCard } from "./playing-card";
import { TableSurface, tableOutline } from "./table-surface";
import { Button } from "./ui/button";
import { MatchEventFeed } from "./match-event-feed";

function PredictionTally({ game, emote }: { game: GameView; emote?: Emote }) {
  const emoting = useRecent(emote?.sentAt, game.serverTime, EMOTE_DURATION_MS);
  const predicted = game.players.reduce((total, player) => total + (player.bid ?? 0), 0);
  const delta = predicted - game.count;
  // The pill keeps its last value while it shrinks away at zero.
  const [pill, setPill] = useState(delta);
  if (delta !== 0 && delta !== pill) setPill(delta);
  const balance = delta > 0 ? `${delta} over` : delta < 0 ? `${-delta} under` : "even with";
  return (
    <div
      className={cn(
        "prediction-tally absolute bottom-[5%] left-1/2 flex -translate-x-1/2 items-center px-3 pt-1.5 pb-1 text-sm font-semibold tabular-nums drop-shadow-sm transition-opacity duration-300 ease-out @min-2xl/board:text-base",
        emoting && "opacity-0",
      )}
      role="status"
      aria-label={`${predicted} ${predicted === 1 ? "trick" : "tricks"} predicted, ${balance} the ${game.count} ${game.count === 1 ? "card" : "cards"}`}
    >
      {/* The outline's bottom centre is at 95% of the table height; the mask trims this to the rim's curve. */}
      <span
        className="table-edge absolute inset-x-0 top-0 -bottom-4 -z-1 rounded-t-xl bg-background [mask-position:left_50%_bottom_calc(16px_-_5cqh)]"
        aria-hidden="true"
      />
      <Target className="mr-1 size-5 text-foreground/60" strokeWidth={1.5} aria-hidden="true" />
      <span aria-hidden="true">{predicted}</span>
      <span
        className={cn(
          "grid transition-[grid-template-columns,opacity] duration-300 ease-out",
          delta ? "grid-cols-[1fr]" : "grid-cols-[0fr] opacity-0",
        )}
        aria-hidden="true"
      >
        <span className="min-w-0 overflow-hidden">
          <span
            className={cn(
              "ml-1 block rounded-full bg-destructive px-1.5 text-xs leading-5 whitespace-nowrap text-primary-foreground transition-[scale] duration-300 ease-out @min-2xl/board:text-sm",
              !delta && "scale-50",
            )}
          >
            {pill > 0 ? `+${pill}` : `−${-pill}`}
          </span>
        </span>
      </span>
    </div>
  );
}

export function MatchBoard({
  game,
  busy,
  pendingCard,
  preview,
  chat,
  onEmote,
  onBid,
  onPlay,
}: {
  game: GameView;
  busy: boolean;
  pendingCard: number | null;
  preview: boolean;
  chat: ChatState;
  onEmote: (emote: Emote["id"]) => void;
  onBid: (bid: number) => void;
  onPlay: (card: number | null) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [emoteMenuOpen, setEmoteMenuOpen] = useState(false);
  const seating = tableOrder(game);
  const me = findPlayer(game, game.you);
  const handPlayer = findPlayer(game, seating.seats[0]);
  const active = !!me && me.lives > 0;
  const myEmote =
    me?.emote ?? game.spectators?.find((spectator) => spectator.id === game.you)?.emote;
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
    (findPlayer(game, game.order[0])?.hand.length ?? 0) +
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
          handInTray={id === seating.seats[0]}
          current={seating.current === id}
          activeTurn={game.phase === "playing" && seating.current === id && player.lives > 0}
          deadline={game.deadline}
          turnSeconds={game.turnSeconds}
          serverTime={game.serverTime}
          round={game.round}
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
        style={{ "--table-outline": tableOutline } as CSSProperties}
        aria-label="Game table"
      >
        <TableSurface />
        <div className="pointer-events-none relative z-10 col-span-full row-start-2 row-end-5 min-h-0 [container-type:size]">
          <PredictionTally game={game} emote={handPlayer?.lives ? handPlayer.emote : undefined} />
        </div>
        <div className="pointer-events-none relative z-40 col-span-full row-start-2 row-end-5 min-h-0 [container-type:size]">
          <ChatButton
            edge
            className="pointer-events-auto absolute left-[2%] top-1/2 -translate-y-1/2"
            unread={chat.unread}
            onClick={() => chat.setOpen(true)}
          />
          <EmotePicker
            open={emoteMenuOpen}
            onOpenChange={setEmoteMenuOpen}
            disabled={busy}
            emote={myEmote}
            serverTime={game.serverTime}
            onSend={onEmote}
          />
        </div>
        <ReactionRail game={game} />
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
                            className="size-14 rounded-lg bg-card p-0 text-xl font-semibold short-trick:size-11"
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
              className="trick-cards trick-grid short-trick:[--trick-columns:var(--trick-players)] short-trick:[--trick-rows:1] @min-2xl/board:[--trick-columns:var(--trick-players)] @min-2xl/board:[--trick-rows:1] @min-2xl/board:[--played-card-max-width:5.5rem] @min-2xl/board:[--played-card-extra-height:0rem]"
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
          style={{ "--hand-count": handPlayer?.hand.length ?? 0 } as CSSProperties}
          aria-label={game.spectating ? "Spectator mode" : "Your hand"}
        >
          <div
            className="hand flex min-h-[calc(var(--hand-card-width)*1.6)] origin-bottom items-center justify-center has-[.hand-card]:scale-[1.08] transition-[filter] duration-300 ease-out data-[waiting]:brightness-[.8]"
            key={`hand-${game.round}`}
            data-waiting={
              ((game.phase === "playing" || game.phase === "trick") && !myTurn) || undefined
            }
            data-active-turn={(canPlay && !!me?.hand.length) || undefined}
          >
            {handPlayer?.hand.map((card, i) => {
              const middle = (handPlayer.hand.length - 1) / 2;
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
                    card={game.spectating ? null : card}
                    disabled={!canPlay}
                    pending={pendingCard === (card ?? -1)}
                    onClick={game.spectating ? undefined : () => onPlay(card)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
