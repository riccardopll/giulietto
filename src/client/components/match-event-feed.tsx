import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Trophy } from "lucide-react";
import type { GameView } from "../../shared/game";
import { matchEvents, type MatchEvent } from "../match-events";
import { cardLabel, t } from "../i18n";
import { PlayingCard } from "./playing-card";

type VisibleEvent = MatchEvent & { expiresAt: number };
const EVENT_DURATION = 5000;

function action(event: MatchEvent, self: boolean) {
  if (event.type === "left") return t.events.left(self);
  if (event.type === "rejoined") return t.events.rejoined(self);
  if (event.type === "prediction") return t.events.predicted(self);
  if (event.type === "play") return t.events.played(self);
  return t.events.wonTrick(self);
}

function description(event: MatchEvent, you: string) {
  const self = event.player === you;
  const text = `${self ? t.events.you : event.name} ${action(event, self)}`;
  if (event.type === "prediction") return `${text} ${event.bid}`;
  if (event.type === "left" || event.type === "rejoined") return text;
  return `${text} ${cardLabel(event.card)}${event.mode ? `, ${t.cards[event.mode]}` : ""}`;
}

export function MatchEventFeed({ game }: { game: GameView }) {
  const previous = useRef<GameView | null>(null);
  const [events, setEvents] = useState<VisibleEvent[]>([]);

  useEffect(() => {
    const before = previous.current;
    if (before && before.revision > game.revision) return;
    previous.current = game;
    const additions = matchEvents(before, game);
    const now = Date.now();
    setEvents((current) => {
      const remaining = current.filter((event) => event.expiresAt > now);
      const fresh = additions
        .filter((event) => !remaining.some((old) => old.id === event.id))
        .map((event) => ({ ...event, expiresAt: now + EVENT_DURATION }));
      if (!fresh.length && remaining.length === current.length) return current;
      return [...remaining, ...fresh].slice(-3);
    });
  }, [game]);

  useEffect(() => {
    if (!events.length) return;
    const timer = setTimeout(
      () => {
        setEvents((current) => current.filter((event) => event.expiresAt > Date.now()));
      },
      Math.max(0, Math.min(...events.map((event) => event.expiresAt)) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [events]);

  return (
    <div
      className="pointer-events-none relative min-h-0 min-w-0 overflow-hidden"
      role="log"
      aria-label={t.events.log}
      aria-relevant="additions"
    >
      {events.map((event, index) => (
        <div
          className="absolute inset-x-0 bottom-0 flex h-11 justify-center -translate-y-[calc(var(--event-position)*2.75rem)] transition-transform duration-200"
          key={event.id}
          style={{ "--event-position": events.length - index - 1 } as CSSProperties}
        >
          <div
            className="grid max-w-full animate-[match-event-rise_var(--event-duration)_ease-out_both] items-center px-2 py-0.5 text-xs leading-tight text-muted-foreground"
            data-event-type={event.type}
            style={{ "--event-duration": `${EVENT_DURATION}ms` } as CSSProperties}
          >
            <span className="sr-only">{description(event, game.you)}</span>
            <div className="flex min-w-0 items-center justify-center gap-1.5" aria-hidden="true">
              {event.type === "trick-won" && <Trophy className="size-3.5 shrink-0 text-primary" />}
              <span className="min-w-0">
                <strong
                  className="inline-block max-w-32 truncate align-bottom text-foreground"
                  title={event.name}
                >
                  {event.player === game.you ? t.events.you : event.name}
                </strong>{" "}
                {action(event, event.player === game.you)}
              </span>
              {event.type === "prediction" ? (
                <strong>{event.bid}</strong>
              ) : event.type === "play" || event.type === "trick-won" ? (
                <>
                  <span className="w-6 shrink-0">
                    <PlayingCard card={event.card} className="rounded-[.2rem]" />
                  </span>
                  {event.mode && <span className="text-2xs capitalize">{t.cards[event.mode]}</span>}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
