import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowRight, Check, Link } from "lucide-react";
import { MAX_STARTING_LIVES, MIN_STARTING_LIVES, type view } from "../../shared/game";
import { cn } from "../utils";
import { Lives } from "./lives";
import { Button } from "./ui/button";

type State = ReturnType<typeof view>;

const avatarColors = [
  "bg-[#efcedc] text-[#923f60]",
  "bg-[#e7dcf6] text-[#7850a1]",
  "bg-[#fce2da] text-[#af6952]",
  "bg-[#d7ecf2] text-[#427e91]",
  "bg-[#f4e7c7] text-[#917139]",
  "bg-[#e3e7ec] text-[#617086]",
];

function LobbyOptions({
  lives,
  host,
  busy,
  save,
}: {
  lives: number;
  host: boolean;
  busy: boolean;
  save: (lives: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const saving = useRef(false);
  const selected = draft ?? lives;
  const persist = useEffectEvent(async (value: number) => {
    if (saving.current) return;
    saving.current = true;
    try {
      if (value !== lives) await save(value);
    } finally {
      setDraft((current) => (current === value ? null : current));
      setQueued((current) => (current === value ? null : current));
      saving.current = false;
    }
  });
  useEffect(() => {
    if (host && !busy && queued !== null) void persist(queued);
  }, [host, busy, queued]);
  function commit() {
    if (host && draft !== null) setQueued(draft);
  }
  return (
    <section
      className="mt-5 rounded-xl border border-border bg-card p-4 text-sm sm:px-5"
      aria-labelledby="lobby-options-heading"
    >
      <h2 id="lobby-options-heading" className="mb-3 text-xs font-semibold text-muted-foreground">
        Lobby options
      </h2>
      <div className="mb-1 flex min-h-8 items-center justify-between gap-3">
        <label htmlFor="starting-lives">Starting lives</label>
        <output htmlFor="starting-lives" aria-live="polite" className="inline-flex items-center">
          <Lives n={selected} />
        </output>
      </div>
      <input
        id="starting-lives"
        type="range"
        min={MIN_STARTING_LIVES}
        max={MAX_STARTING_LIVES}
        step={1}
        value={selected}
        className="m-0 h-8 w-full cursor-pointer rounded accent-primary disabled:cursor-default disabled:opacity-60"
        aria-valuetext={`${selected} ${selected === 1 ? "life" : "lives"}`}
        disabled={!host}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerUp={commit}
        onPointerCancel={() => setDraft(null)}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="flex justify-between px-1 text-xs text-muted-foreground" aria-hidden="true">
        {Array.from({ length: MAX_STARTING_LIVES - MIN_STARTING_LIVES + 1 }, (_, i) => (
          <span key={i}>{i + MIN_STARTING_LIVES}</span>
        ))}
      </div>
    </section>
  );
}

export function Lobby({
  game,
  busy,
  copied,
  onCopy,
  onStart,
  onSettings,
}: {
  game: State;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onStart: () => void;
  onSettings: (startingLives: number) => Promise<void>;
}) {
  return (
    <section className="mx-auto w-full max-w-xl py-3 sm:py-5">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{game.public ? "Matchmaking" : "Players"}</h1>
        {game.host !== game.you && (
          <p className="mt-2 text-sm text-muted-foreground">
            Waiting for the host to start the game.
          </p>
        )}
      </div>
      <ul className="grid gap-2" aria-label="Players">
        {Array.from({ length: 6 }, (_, i) => {
          const player = game.players[i];
          return (
            <li
              className={cn(
                "flex min-h-16 min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-muted-foreground",
                player ? "border-border bg-card" : "border-dashed border-input",
              )}
              key={player?.id ?? i}
            >
              {player ? (
                <>
                  <div
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
                      avatarColors[i],
                    )}
                    aria-hidden="true"
                  >
                    {Array.from(player.name)[0]?.toLocaleUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-sm wrap-anywhere text-foreground">
                      {player.name}
                      {player.id === game.you ? " (you)" : ""}
                    </strong>
                    <span className="text-xs">{player.id === game.host ? "Host" : "Ready"}</span>
                  </div>
                  <Lives n={game.startingLives} />
                </>
              ) : (
                <>
                  <div
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-input text-xl"
                    aria-hidden="true"
                  >
                    +
                  </div>
                  <span className="text-sm">Open seat</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <LobbyOptions
        lives={game.startingLives}
        host={game.host === game.you}
        busy={busy}
        save={onSettings}
      />
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-auto min-h-12 whitespace-normal rounded-xl bg-card px-4 py-3"
          onClick={onCopy}
        >
          {copied ? <Check /> : <Link />}
          {copied ? "Copied" : "Copy invite link"}
        </Button>
        {game.host === game.you && (
          <Button
            className="h-auto min-h-12 whitespace-normal rounded-xl px-4 py-3"
            onClick={onStart}
            disabled={busy || game.players.length < 2}
          >
            Start game
            <ArrowRight />
          </Button>
        )}
      </div>
    </section>
  );
}
