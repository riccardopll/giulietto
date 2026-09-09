import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Trophy } from "lucide-react";
import type { view } from "../../shared/game";
import { matchEvents, type MatchEvent } from "../match-events";
import { PlayingCard, cardLabel } from "./playing-card";

type State = ReturnType<typeof view>;
type VisibleEvent = MatchEvent & { expiresAt: number };
const EVENT_DURATION = 5000;

function description(event: MatchEvent, you: string) {
  const name = event.player === you ? "You" : event.name;
  if (event.type === "prediction") return `${name} predicted ${event.bid}`;
  const action = event.type === "play" ? "played" : "won the trick with";
  return `${name} ${action} ${cardLabel(event.card)}${event.mode ? `, ${event.mode}` : ""}`;
}

export function MatchEventFeed({ game }: { game: State }) {
  const previous = useRef<State | null>(null);
  const [events, setEvents] = useState<VisibleEvent[]>([]);

  useEffect(() => {
    const before = previous.current;
    // Repeated acknowledgements must not restart an event's lifetime.
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
      className="match-events pointer-events-none relative min-h-0 min-w-0 overflow-hidden"
      role="log"
      aria-label="Game events"
      aria-relevant="additions"
    >
      {events.map((event, index) => (
        <div
          className="match-event-slot absolute inset-x-0 bottom-0 flex h-11 justify-center -translate-y-[calc(var(--event-position)*2.75rem)] transition-transform duration-200"
          key={event.id}
          style={{ "--event-position": events.length - index - 1 } as CSSProperties}
        >
          <div
            className="match-event grid max-w-full animate-[match-event-rise_var(--event-duration)_ease-out_both] items-center px-2 py-0.5 text-xs leading-tight text-muted-foreground"
            data-event-type={event.type}
            style={{ "--event-duration": `${EVENT_DURATION}ms` } as CSSProperties}
          >
            <span className="sr-only">{description(event, game.you)}</span>
            <div
              className="match-event-content flex min-w-0 items-center justify-center gap-1.5"
              aria-hidden="true"
            >
              {event.type === "trick-won" && (
                <Trophy className="event-trophy size-3.5 shrink-0 text-primary" />
              )}
              <span className="match-event-copy min-w-0">
                <strong
                  className="match-event-name inline-block max-w-32 truncate align-bottom text-foreground"
                  title={event.name}
                >
                  {event.player === game.you ? "You" : event.name}
                </strong>{" "}
                {event.type === "prediction"
                  ? "predicted"
                  : event.type === "play"
                    ? "played"
                    : "won the trick with"}
              </span>
              {event.type === "prediction" ? (
                <strong>{event.bid}</strong>
              ) : (
                <>
                  <span className="match-event-card w-6 shrink-0">
                    <PlayingCard card={event.card} className="rounded-[.2rem]" />
                  </span>
                  {event.mode && (
                    <span className="match-event-mode text-[10px] capitalize">{event.mode}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
