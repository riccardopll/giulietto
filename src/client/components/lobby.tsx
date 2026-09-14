import { Avatar } from "./avatar";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowRight, Check, Link, Pencil } from "lucide-react";
import { MAX_STARTING_LIVES, MIN_STARTING_LIVES, type view } from "../../shared/game";
import { cn } from "../utils";
import { Lives } from "./lives";
import { Button } from "./ui/button";
import { NameChangeInput } from "./ui/name-change-input";
import { ActionDialog } from "./ui/action-dialog";

type State = ReturnType<typeof view>;

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
        className="m-0 h-12 w-full cursor-pointer appearance-none rounded bg-transparent accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-60 [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-border [&::-webkit-slider-thumb]:-mt-2.5 [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-border [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary"
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
  onRename,
}: {
  game: State;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onStart: () => void;
  onSettings: (startingLives: number) => Promise<void>;
  onRename: (name: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  return (
    <section className="mx-auto w-full max-w-xl py-3 sm:py-5">
      <ActionDialog
        open={editing}
        onOpenChange={setEditing}
        title="Edit your name"
        hideTitle
        actionLabel={busy ? "Saving…" : "Save"}
        busy={busy}
        actionDisabled={!draftName.trim()}
        onSubmit={async () => {
          if (await onRename(draftName)) setEditing(false);
        }}
      >
        <NameChangeInput value={draftName} disabled={busy} onChange={setDraftName} />
      </ActionDialog>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{game.public ? "Matchmaking" : "Players"}</h1>
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
                  <Avatar avatar={player.avatar} id={player.id} className="size-9" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong className="text-sm wrap-anywhere text-foreground">
                      {player.name}
                      {player.id === game.you ? " (you)" : ""}
                    </strong>
                    {player.id === game.host && <span className="text-xs">Host</span>}
                  </div>
                  {player.id === game.you && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label="Edit your name"
                      disabled={busy}
                      onClick={() => {
                        setDraftName("");
                        setEditing(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
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
