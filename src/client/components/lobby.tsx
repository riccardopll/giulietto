import { Avatar } from "./avatar";
import { useState } from "react";
import { ArrowRight, Check, Link, Minus, Pencil, Plus, User } from "lucide-react";
import {
  MAX_STARTING_LIVES,
  MIN_STARTING_LIVES,
  MIN_TURN_SECONDS,
  MAX_TURN_SECONDS,
  type GameView,
} from "../../shared/game";
import { cn } from "../utils";
import { Lives } from "./lives";
import { Button } from "./ui/button";
import { NameChangeInput } from "./ui/name-change-input";
import { ActionDialog } from "./ui/action-dialog";

const options = [
  {
    name: "startingLives",
    label: "Starting lives",
    min: MIN_STARTING_LIVES,
    max: MAX_STARTING_LIVES,
    step: 1,
  },
  {
    name: "turnSeconds",
    label: "Move time",
    min: MIN_TURN_SECONDS,
    max: MAX_TURN_SECONDS,
    step: 5,
  },
] as const;
type OptionName = (typeof options)[number]["name"];
type SaveSettings = (startingLives: number, turnSeconds: number) => Promise<unknown>;

function LobbyOptions({ game, busy, save }: { game: GameView; busy: boolean; save: SaveSettings }) {
  const [draft, setDraft] = useState<{ name: OptionName; value: number } | null>(null);
  const host = game.host === game.you;
  async function commit() {
    if (!host || busy || !draft) return;
    try {
      if (draft.value !== game[draft.name])
        await save(
          draft.name === "startingLives" ? draft.value : game.startingLives,
          draft.name === "turnSeconds" ? draft.value : game.turnSeconds,
        );
    } finally {
      setDraft(null);
    }
  }
  return (
    <section
      className="mt-5 rounded-xl border border-border bg-card p-4 text-sm sm:px-5"
      aria-labelledby="lobby-options-heading"
    >
      <h2 id="lobby-options-heading" className="mb-3 text-xs font-semibold text-muted-foreground">
        Lobby options
      </h2>
      <div className="grid gap-4">
        {options.map(({ name, label, min, max, step }) => {
          const selected = draft?.name === name ? draft.value : game[name];
          return (
            <div key={name}>
              <div className="mb-1 flex min-h-8 items-center justify-between gap-3">
                <label htmlFor={name}>{label}</label>
                <output htmlFor={name} aria-live="polite" className="inline-flex items-center">
                  {name === "startingLives" ? <Lives n={selected} /> : `${selected} sec`}
                </output>
              </div>
              <input
                id={name}
                type="range"
                min={min}
                max={max}
                step={step}
                value={selected}
                className="range-slider m-0 h-12 w-full rounded accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-valuetext={
                  name === "startingLives"
                    ? `${selected} ${selected === 1 ? "life" : "lives"}`
                    : `${selected} seconds`
                }
                disabled={!host || busy}
                onChange={(event) => setDraft({ name, value: Number(event.target.value) })}
                onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerUp={() => void commit()}
                onPointerCancel={() => setDraft(null)}
                onKeyUp={() => void commit()}
                onBlur={() => void commit()}
              />
              <div
                className="flex justify-between px-1 text-xs text-muted-foreground"
                aria-hidden="true"
              >
                {Array.from({ length: (max - min) / step + 1 }, (_, i) => (
                  <span key={i}>{min + i * step}</span>
                ))}
              </div>
            </div>
          );
        })}
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
  onAddBot,
  onRemoveBot,
}: {
  game: GameView;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onStart: () => void;
  onSettings: SaveSettings;
  onRename: (name: string) => Promise<boolean>;
  onAddBot?: () => void;
  onRemoveBot: (playerId: string) => void;
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
                  {player.bot && game.host === game.you ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="group relative -m-1 size-11 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label={`Remove ${player.name}`}
                      title={`Remove ${player.name}`}
                      disabled={busy}
                      onClick={() => onRemoveBot(player.id)}
                    >
                      <Avatar bot className="size-9 border-0 text-muted-foreground" />
                      <span className="absolute right-0 bottom-0 grid size-5 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90">
                        <Minus className="size-3" strokeWidth={3} />
                      </span>
                    </Button>
                  ) : (
                    <Avatar
                      avatar={player.avatar}
                      bot={player.bot}
                      id={player.id}
                      className="size-9"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-1">
                      <strong className="min-w-0 text-sm wrap-anywhere text-foreground">
                        {player.name}
                        {player.id === game.you ? " (you)" : ""}
                      </strong>
                      {player.id === game.you && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-my-3 size-11 shrink-0"
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
                    </div>
                    {player.id === game.host && <span className="text-xs">Host</span>}
                  </div>
                  <Lives n={game.startingLives} />
                </>
              ) : (
                <>
                  <div
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-input"
                    aria-hidden="true"
                  >
                    <User className="size-5" />
                  </div>
                  <span className="flex-1 text-sm">Open seat</span>
                  {game.host === game.you && (
                    <Button
                      variant="ghost"
                      className="min-h-11 font-semibold text-primary"
                      disabled={busy || !onAddBot}
                      onClick={onAddBot}
                    >
                      <Plus className="size-5" />
                      Add bot
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <LobbyOptions game={game} busy={busy} save={onSettings} />
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
