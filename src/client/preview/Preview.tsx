import { useEffect, useEffectEvent, useState, type ComponentProps } from "react";
import { Settings2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import App from "../App";
import { AceSelection } from "../components/ace-selection";
import type { TableCommand } from "../../shared/commands";
import { chatOpen, sendChat } from "../../shared/chat";
import { sendEmote, type Emote } from "../../shared/emotes";
import { Button } from "../components/ui/button";
import { bid, deal, play, view, type Game } from "../../shared/game";
import type { BotWeights } from "../../shared/bot";
import {
  advancePreview,
  makePreview,
  normalizePreview,
  type PreviewOptions,
  type PreviewPhase,
  type PreviewSeatState,
} from "./games";

type Entry = { options: Required<PreviewOptions>; game: Game; reset: number };
type Option = { value: string | number; label?: string; disabled?: boolean };
const counts = [2, 3, 4, 5, 6];
const scenarios: { value: PreviewPhase; label: string }[] = [
  { value: "lobby", label: "Lobby" },
  { value: "playing", label: "Playing" },
  { value: "bidding", label: "Predictions" },
  { value: "trick", label: "Trick won" },
  { value: "results", label: "Round results" },
  { value: "finished", label: "Winner podium" },
  { value: "blind", label: "Blind round" },
];
const seatStates: { value: PreviewSeatState; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "eliminated", label: "Eliminated" },
];
const range = (length: number, start = 0, label = (value: number) => String(value)): Option[] =>
  Array.from({ length }, (_, i) => ({ value: i + start, label: label(i + start) }));

function Field({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string | number;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
      {label}
      <select
        className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label ?? option.value}
          </option>
        ))}
      </select>
    </label>
  );
}

function readSettings() {
  const query = new URLSearchParams(window.location.search);
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(query.get(key) ?? fallback);
    return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  const people = number("people", 6, 2, 6);
  const phase = query.get("phase") as PreviewPhase;
  return {
    viewer: number("viewer", 0, -1, people - 1),
    options: normalizePreview({
      people,
      cards: number("cards", 6, 1, 6),
      played: number("played", 0, 0, people),
      phase: scenarios.some((scenario) => scenario.value === phase) ? phase : "playing",
      seatStates: query
        .get("seats")
        ?.split(",")
        .map((state) => (state === "eliminated" ? "eliminated" : "active")),
      startingLives: number("startingLives", 5, 1, 5),
      completedTricks: number("completedTricks", 0, 0, 5),
      bids: number("bids", 0, 0, people - 1),
      cycle: number("cycle", 0, 0, 4),
      longNames: query.get("longNames") === "1",
    }),
  };
}

function nextEntry(old: Entry, weights: BotWeights): Entry {
  const finished = old.game.phase === "finished";
  return {
    ...old,
    game: finished ? makePreview(old.options, weights) : advancePreview(old.game, weights),
    reset: old.reset + Number(finished),
  };
}

/** Every seat but the viewer's is played by the bot; autoplay lets it play the viewer's too. */
export function Preview({ weights }: { weights: BotWeights }) {
  const [initial] = useState(readSettings);
  const [people, setPeople] = useState(initial.options.people);
  const [viewer, setViewer] = useState(initial.viewer);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [aceOpen, setAceOpen] = useState(false);
  const [eliminationSeat, setEliminationSeat] = useState(0);
  const [spectatorEmote, setSpectatorEmote] = useState<Emote>();
  const [tables, setTables] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      counts.map((people) => {
        const options = normalizePreview({ ...initial.options, people });
        return [people, { options, game: makePreview(options, weights), reset: 0 }];
      }),
    ),
  );
  const entry = tables[people];
  const { options } = entry;
  const active = options.seatStates.filter((state) => state === "active").length;
  const eliminationTarget =
    options.seatStates[eliminationSeat] === "active"
      ? eliminationSeat
      : options.seatStates.indexOf("active");
  const lobby = options.phase === "lobby";
  const hasTrick = options.phase === "playing" || options.phase === "blind";

  function configure(patch: Partial<PreviewOptions> = {}) {
    setTables((tables) => {
      const old = tables[people];
      const options = normalizePreview({ ...old.options, ...patch });
      return {
        ...tables,
        [people]: { options, game: makePreview(options, weights), reset: old.reset + 1 },
      };
    });
  }

  function step() {
    setTables((tables) => ({ ...tables, [people]: nextEntry(tables[people], weights) }));
  }

  const shortcuts = useEffectEvent((key: string) => {
    if (key === "n") step();
    else configure();
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (
        (key !== "n" && key !== "r") ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [role='dialog'], [role='alertdialog']"))
      )
        return;
      event.preventDefault();
      shortcuts(key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Bot seats move on their own; the viewer's seat waits for the controls.
  useEffect(() => {
    const game = entry.game;
    if (game.phase === "lobby" || game.phase === "finished") return;
    const acting = game.phase === "bidding" || game.phase === "playing";
    const viewerId = viewer === -1 ? null : game.players[viewer]?.id;
    if (acting && game.order[game.turn] === viewerId) return;
    const delay = game.phase === "trick" ? 1500 : game.phase === "results" ? 3000 : 900;
    const timer = setTimeout(() => {
      setTables((tables) => ({ ...tables, [people]: nextEntry(tables[people], weights) }));
    }, delay);
    return () => clearTimeout(timer);
  }, [entry.game, viewer, people, weights]);

  const navigate = useEffectEvent(() => {
    const { options, viewer } = readSettings();
    setPeople(options.people);
    setViewer(viewer);
    setTables((tables) => ({
      ...tables,
      [options.people]: {
        options,
        game: makePreview(options, weights),
        reset: tables[options.people].reset + 1,
      },
    }));
  });
  useEffect(() => {
    const onPopState = () => navigate();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({
      people: String(people),
      cards: String(options.cards),
      phase: options.phase,
      played: String(options.played),
      viewer: String(viewer),
      longNames: options.longNames ? "1" : "0",
      seats: options.seatStates.join(","),
      startingLives: String(options.startingLives),
      completedTricks: String(options.completedTricks),
      bids: String(options.bids),
      cycle: String(options.cycle),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [people, viewer, options]);

  const spectator = { id: "preview-spectator", name: "Spectator", seen: 0, emote: spectatorEmote };
  const snapshot = view(
    { ...entry.game, spectators: [spectator] },
    viewer === -1 ? spectator.id : entry.game.players[viewer].id,
  );
  snapshot.deadline =
    snapshot.serverTime +
    (snapshot.phase === "results" ? 12000 : snapshot.phase === "trick" ? 2600 : 40000);

  function command(input: TableCommand) {
    const now = Date.now();
    const game = structuredClone(entry.game);
    if (viewer === -1) {
      const watcher = { ...spectator };
      game.spectators = [watcher];
      if (input.action === "emote") {
        sendEmote(game, watcher.id, input.emote, now);
        setSpectatorEmote(watcher.emote);
        return;
      }
      if (input.action !== "chat") return;
      sendChat(game, watcher.id, input.text, now);
      delete game.spectators;
    } else {
      const id = game.players[viewer].id;
      if (input.action === "rename" && game.phase === "lobby")
        game.players[viewer].name = input.name.trim().slice(0, 20);
      else if (input.action === "settings" && game.phase === "lobby") {
        game.startingLives = input.startingLives;
        for (const player of game.players) player.lives = input.startingLives;
      } else if (input.action === "start" && game.phase === "lobby") deal(game, now);
      else if (input.action === "emote") sendEmote(game, id, input.emote, now);
      else if (input.action === "chat") sendChat(game, id, input.text, now);
      else if (input.action === "bid") bid(game, id, input.bid, now);
      else if (input.action === "play") {
        const card = input.card ?? -1;
        play(game, id, card === -1 ? game.players[viewer].hand[0] : card, input.mode, now);
      } else return;
    }
    game.revision++;
    setTables((tables) => ({ ...tables, [people]: { ...tables[people], game } }));
  }

  const botLines = [
    "Anyone else holding nothing but coins?",
    "That prediction was brave.",
    "gg, one more after this?",
    "The ace decides it again.",
  ];
  function sendBotMessage() {
    const game = structuredClone(entry.game);
    const sender = game.players.find((_, index) => index !== viewer)!;
    sendChat(game, sender.id, botLines[(game.chat?.length ?? 0) % botLines.length], Date.now());
    game.revision++;
    setTables((tables) => ({ ...tables, [people]: { ...tables[people], game } }));
    setControlsOpen(false);
  }

  function show(patch: Partial<PreviewOptions>) {
    configure(patch);
    setControlsOpen(false);
  }
  const set =
    (key: "cycle" | "cards" | "played" | "startingLives" | "completedTricks" | "bids") =>
    (value: string) =>
      configure({ [key]: Number(value) });

  const controls: ComponentProps<typeof Field>[] = [
    {
      label: "Players",
      value: people,
      options: counts.map((count) => ({ value: count, label: `${count} players` })),
      onChange: (value) => {
        setPeople(Number(value));
        setViewer(0);
      },
    },
    {
      label: "Scenario",
      value: options.phase,
      options: scenarios,
      onChange: (value) => configure({ phase: value as PreviewPhase }),
    },
    {
      label: "Cycle",
      value: options.cycle,
      disabled: lobby,
      options: range(5, 0, (cycle) => String(cycle + 1)),
      onChange: set("cycle"),
    },
    {
      label: "Cards each",
      value: options.phase === "blind" ? 1 : options.cards,
      disabled: options.phase === "blind" || lobby,
      options: range(6, 1),
      onChange: set("cards"),
    },
    {
      label: "Cards played",
      value: hasTrick ? options.played : options.phase === "trick" ? active : 0,
      disabled: !hasTrick,
      options: range(active + 1),
      onChange: set("played"),
    },
    {
      label: "View as",
      value: viewer,
      options: [
        { value: -1, label: "Spectator" },
        ...entry.game.players.map((player, index) => ({ value: index, label: player.name })),
      ],
      onChange: (value) => {
        setViewer(Number(value));
      },
    },
    {
      label: "Starting lives",
      value: options.startingLives,
      options: range(5, 1),
      onChange: set("startingLives"),
    },
    {
      label: "Completed tricks",
      value: options.completedTricks,
      disabled: !hasTrick && options.phase !== "trick",
      options: range(options.cards),
      onChange: set("completedTricks"),
    },
    {
      label: "Predictions made",
      value: options.bids,
      disabled: options.phase !== "bidding",
      options: range(active),
      onChange: set("bids"),
    },
  ];

  const exitControl = (
    <Dialog.Trigger asChild>
      <Button
        variant="ghost"
        className="size-11 rounded-lg p-0 text-muted-foreground hover:bg-transparent"
        aria-label="Preview settings"
      >
        <Settings2 className="size-5" />
      </Button>
    </Dialog.Trigger>
  );

  return (
    <Dialog.Root modal={false} open={controlsOpen} onOpenChange={setControlsOpen}>
      <App
        key={`${people}-${entry.reset}-${viewer}`}
        preview={{ state: snapshot, command, reset: () => configure(), exitControl }}
      />
      <AceSelection open={aceOpen} onOpenChange={setAceOpen} onSelect={() => setAceOpen(false)} />
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 h-dvh w-80 max-w-[calc(100vw-1rem)] space-y-4 overflow-y-auto overscroll-contain border-l bg-background pl-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] text-foreground shadow-xl outline-none"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background py-2">
            <Dialog.Title className="text-sm font-semibold">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="ml-auto size-11 p-0"
                aria-label="Close preview settings"
              >
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => {
              setViewer(0);
              show({ phase: "lobby" });
            }}
          >
            Show lobby
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => show({ phase: "finished" })}
          >
            Show winning screen
          </Button>
          <div className="grid grid-cols-2 gap-3">
            {controls.map((control) => (
              <Field key={control.label} {...control} />
            ))}
          </div>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-xs text-muted-foreground">Seats</legend>
            {options.seatStates.map((state, index) => (
              <Field
                key={index}
                label={`Seat ${index + 1}`}
                value={state}
                options={seatStates}
                disabled={lobby}
                onChange={(value) =>
                  configure({
                    seatStates: options.seatStates.map((current, seat) =>
                      seat === index ? (value as PreviewSeatState) : current,
                    ),
                  })
                }
              />
            ))}
          </fieldset>
          <div className="space-y-2">
            <Field
              label="Player to eliminate"
              value={eliminationTarget}
              options={options.seatStates.map((state, index) => ({
                value: index,
                label: `Seat ${index + 1}: ${entry.game.players[index].name}`,
                disabled: state === "eliminated",
              }))}
              onChange={(value) => setEliminationSeat(Number(value))}
            />
            <Button
              variant="outline"
              className="h-11 w-full"
              disabled={active <= 2}
              onClick={() =>
                show({
                  phase: "bidding",
                  bids: 0,
                  seatStates: options.seatStates.map((state, index) =>
                    index === eliminationTarget ? "eliminated" : state,
                  ),
                })
              }
            >
              Eliminate player
            </Button>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              checked={options.longNames}
              onChange={(event) => configure({ longNames: event.target.checked })}
            />
            Long names
          </label>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              setControlsOpen(false);
              setAceOpen(true);
            }}
          >
            Test ace selection
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={!chatOpen(entry.game)}
            onClick={sendBotMessage}
          >
            Send message
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-11 gap-1 px-2 text-xs"
              onClick={step}
              disabled={entry.game.phase === "lobby"}
              aria-keyshortcuts="n"
              title="Next move (N)"
            >
              Next move
              <kbd aria-hidden="true" className="font-mono text-[10px] text-muted-foreground">
                N
              </kbd>
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-1 px-2 text-xs"
              onClick={() => configure()}
              aria-keyshortcuts="r"
              title="Reset table (R)"
            >
              Reset table
              <kbd aria-hidden="true" className="font-mono text-[10px] text-muted-foreground">
                R
              </kbd>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
