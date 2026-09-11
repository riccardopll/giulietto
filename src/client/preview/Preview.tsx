import { useEffect, useEffectEvent, useState } from "react";
import { Settings2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import App from "../App";
import { AceSelection } from "../components/ace-selection";
import { sendEmote } from "@/shared/emotes";
import { Button } from "../components/ui/button";
import { bid, play, view, type Game } from "../../shared/game";
import {
  advancePreview,
  makePreview,
  normalizePreview,
  type PreviewOptions,
  type PreviewPhase,
  type PreviewSeatState,
} from "./games";

type Entry = { options: Required<PreviewOptions>; game: Game; reset: number };
const counts = [2, 3, 4, 5, 6];
const phases: PreviewPhase[] = ["playing", "bidding", "trick", "results", "blind"];
const seatStates: PreviewSeatState[] = ["active", "eliminated"];
const selectClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none disabled:opacity-50";
const labelClass = "grid min-w-0 gap-1 text-xs text-muted-foreground";

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
      phase: phases.includes(phase) ? phase : "playing",
      seatStates: query
        .get("seats")
        ?.split(",")
        .map((state) =>
          seatStates.includes(state as PreviewSeatState) ? (state as PreviewSeatState) : "active",
        ),
      startingLives: number("startingLives", 5, 1, 5),
      completedTricks: number("completedTricks", 0, 0, 5),
      bids: number("bids", 0, 0, people - 1),
      cycle: number("cycle", 0, 0, 4),
      longNames: query.get("longNames") === "1",
    }),
  };
}

function nextEntry(old: Entry): Entry {
  const finished = old.game.phase === "finished";
  return {
    ...old,
    game: finished ? makePreview(old.options) : advancePreview(old.game),
    reset: old.reset + Number(finished),
  };
}

export function Preview() {
  const [initial] = useState(readSettings);
  const [people, setPeople] = useState(initial.options.people);
  const [viewer, setViewer] = useState(initial.viewer);
  const [running, setRunning] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [aceOpen, setAceOpen] = useState(false);
  const [tables, setTables] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      counts.map((people) => {
        const options = normalizePreview({ ...initial.options, people });
        return [people, { options, game: makePreview(options), reset: 0 }];
      }),
    ),
  );
  const entry = tables[people];
  const active = entry.options.seatStates.filter((state) => state === "active").length;
  const hasTrick = ["playing", "blind"].includes(entry.options.phase);

  function configure(patch: Partial<PreviewOptions> = {}) {
    setRunning(false);
    setTables((tables) => {
      const old = tables[people];
      const options = normalizePreview({ ...old.options, ...patch });
      return { ...tables, [people]: { options, game: makePreview(options), reset: old.reset + 1 } };
    });
  }

  function step() {
    setRunning(false);
    setTables((tables) => ({ ...tables, [people]: nextEntry(tables[people]) }));
  }

  const nextMove = useEffectEvent(step);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "n" ||
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
          target.closest(
            "input, textarea, select, [data-slot='dialog-content'], [data-slot='alert-dialog-content']",
          ))
      )
        return;
      event.preventDefault();
      nextMove();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTables((tables) => ({ ...tables, [people]: nextEntry(tables[people]) }));
    }, 1800);
    return () => clearInterval(timer);
  }, [running, people]);

  const navigate = useEffectEvent(() => {
    const { options, viewer } = readSettings();
    setPeople(options.people);
    setViewer(viewer);
    setRunning(false);
    setTables((tables) => ({
      ...tables,
      [options.people]: {
        options,
        game: makePreview(options),
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
      cards: String(entry.options.cards),
      phase: entry.options.phase,
      played: String(entry.options.played),
      viewer: String(viewer),
      longNames: entry.options.longNames ? "1" : "0",
      seats: entry.options.seatStates.join(","),
      startingLives: String(entry.options.startingLives),
      completedTricks: String(entry.options.completedTricks),
      bids: String(entry.options.bids),
      cycle: String(entry.options.cycle),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [people, viewer, entry.options]);

  const snapshot = view(
    { ...entry.game, spectators: [{ id: "preview-spectator", name: "Spectator", seen: 0 }] },
    viewer === -1 ? "preview-spectator" : entry.game.players[viewer].id,
  );
  // Keep the countdown frozen between moves, like the rest of the preview.
  snapshot.deadline =
    snapshot.serverTime +
    (snapshot.phase === "results" ? 12000 : snapshot.phase === "trick" ? 2600 : 40000);

  function command(action: string, extra: Record<string, unknown>) {
    if (viewer === -1) return;
    const game = structuredClone(entry.game);
    const id = game.players[viewer].id;
    if (action === "emote") sendEmote(game, id, extra.emote, Date.now());
    else if (action === "bid") bid(game, id, Number(extra.bid), Date.now());
    else if (action === "play") {
      const card = Number(extra.card);
      play(game, id, card === -1 ? game.players[viewer].hand[0] : card, extra.mode, Date.now());
    } else return;
    game.revision++;
    setTables((tables) => ({ ...tables, [people]: { ...tables[people], game } }));
  }

  const exitControl = (
    <Dialog.Trigger asChild>
      <Button
        variant="ghost"
        className="size-11 rounded-lg p-0 text-muted-foreground"
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
            <Dialog.Title className="text-sm font-semibold">Local preview</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" className="size-11 p-0" aria-label="Close preview settings">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Players
              <select
                className={selectClass}
                value={people}
                onChange={(e) => {
                  setPeople(Number(e.target.value));
                  setViewer(0);
                  setRunning(false);
                }}
              >
                {counts.map((count) => (
                  <option key={count} value={count}>
                    {count} players
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Scenario
              <select
                className={selectClass}
                value={entry.options.phase}
                onChange={(e) => configure({ phase: e.target.value as PreviewPhase })}
              >
                <option value="playing">Playing</option>
                <option value="bidding">Predictions</option>
                <option value="trick">Trick won</option>
                <option value="results">Round results</option>
                <option value="blind">Blind round</option>
              </select>
            </label>
            <label className={labelClass}>
              Cycle
              <select
                className={selectClass}
                value={entry.options.cycle}
                onChange={(e) => configure({ cycle: Number(e.target.value) })}
              >
                {[0, 1, 2, 3, 4].map((cycle) => (
                  <option value={cycle} key={cycle}>
                    {cycle + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Cards each
              <select
                className={selectClass}
                disabled={entry.options.phase === "blind"}
                value={entry.options.phase === "blind" ? 1 : entry.options.cards}
                onChange={(e) => configure({ cards: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Cards played
              <select
                className={selectClass}
                disabled={!hasTrick}
                value={
                  hasTrick ? entry.options.played : entry.options.phase === "trick" ? active : 0
                }
                onChange={(e) => configure({ played: Number(e.target.value) })}
              >
                {Array.from({ length: active + 1 }, (_, n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              View as
              <select
                className={selectClass}
                value={viewer}
                onChange={(e) => {
                  setViewer(Number(e.target.value));
                  setRunning(false);
                }}
              >
                <option value={-1}>Spectator</option>
                {entry.game.players.map((p, i) => (
                  <option value={i} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Starting lives
              <select
                className={selectClass}
                value={entry.options.startingLives}
                onChange={(e) => configure({ startingLives: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Completed tricks
              <select
                className={selectClass}
                disabled={!hasTrick && entry.options.phase !== "trick"}
                value={entry.options.completedTricks}
                onChange={(e) => configure({ completedTricks: Number(e.target.value) })}
              >
                {Array.from({ length: entry.options.cards }, (_, n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Predictions made
              <select
                className={selectClass}
                disabled={entry.options.phase !== "bidding"}
                value={entry.options.bids}
                onChange={(e) => configure({ bids: Number(e.target.value) })}
              >
                {Array.from({ length: active }, (_, n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-xs text-muted-foreground">Seats</legend>
            {entry.options.seatStates.map((state, index) => (
              <label key={index} className={labelClass}>
                Seat {index + 1}
                <select
                  className={selectClass}
                  value={state}
                  onChange={(e) =>
                    configure({
                      seatStates: entry.options.seatStates.map((value, seat) =>
                        seat === index ? (e.target.value as PreviewSeatState) : value,
                      ),
                    })
                  }
                >
                  <option value="active">Active</option>
                  <option value="eliminated">Eliminated</option>
                </select>
              </label>
            ))}
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              checked={entry.options.longNames}
              onChange={(e) => configure({ longNames: e.target.checked })}
            />
            Long names
          </label>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() => {
              setRunning(false);
              setControlsOpen(false);
              setAceOpen(true);
            }}
          >
            Test ace selection
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button
              className="h-11 px-2 text-xs"
              onClick={() => setRunning(!running)}
              aria-pressed={running}
            >
              {running ? "Pause" : "Autoplay"}
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-1 px-2 text-xs"
              onClick={step}
              aria-keyshortcuts="n"
              title="Next move (N)"
            >
              Next move
              <kbd aria-hidden="true" className="font-mono text-[10px] text-muted-foreground">
                N
              </kbd>
            </Button>
            <Button variant="outline" className="h-11 px-2 text-xs" onClick={() => configure()}>
              Reset table
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
