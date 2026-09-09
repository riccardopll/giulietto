import { useEffect, useState } from "react";
import { Settings2, X } from "lucide-react";
import { Popover } from "radix-ui";
import App from "../App";
import { Button } from "../components/ui/button";
import { bid, play, view, type Game } from "../../shared/game";
import {
  advancePreview,
  makePreview,
  type PreviewInactive,
  type PreviewOptions,
  type PreviewPhase,
} from "./games";

type Entry = { options: PreviewOptions; game: Game; reset: number };
const counts = [2, 3, 4, 5, 6];
const phases: PreviewPhase[] = ["playing", "bidding", "trick", "results", "blind"];
const inactiveStates: PreviewInactive[] = ["none", "eliminated", "left"];
const selectClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const labelClass = "grid min-w-0 gap-1 text-xs text-muted-foreground";

function initialSettings() {
  const query = new URLSearchParams(window.location.search);
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(query.get(key) ?? fallback);
    return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
  };
  const people = number("people", 6, 2, 6);
  const phase = query.get("phase") as PreviewPhase;
  const inactive = query.get("inactive") as PreviewInactive;
  return {
    people,
    viewer: number("viewer", 0, 0, people - 1),
    cards: number("cards", 6, 1, 6),
    played: number("played", 0, 0, people),
    phase: phases.includes(phase) ? phase : "playing",
    inactive: inactiveStates.includes(inactive) ? inactive : "none",
    longNames: query.get("longNames") === "1",
  } satisfies PreviewOptions & { viewer: number };
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
  const [initial] = useState(initialSettings);
  const [people, setPeople] = useState(initial.people);
  const [viewer, setViewer] = useState(initial.viewer);
  const [running, setRunning] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [tables, setTables] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      counts.map((people) => {
        const inactive = people > 2 ? initial.inactive : "none";
        const options: PreviewOptions = {
          people,
          cards: initial.cards,
          phase: initial.phase,
          longNames: initial.longNames,
          played: Math.min(initial.played, people - Number(inactive !== "none")),
          inactive,
        };
        return [people, { options, game: makePreview(options), reset: 0 }];
      }),
    ),
  );
  const entry = tables[people];
  const active = people - Number(people > 2 && entry.options.inactive !== "none");
  const hasTrick = ["playing", "blind"].includes(entry.options.phase);

  function configure(patch: Partial<PreviewOptions> = {}) {
    setRunning(false);
    setTables((tables) => {
      const old = tables[people];
      const options = { ...old.options, ...patch };
      const active = people - Number(people > 2 && options.inactive !== "none");
      options.played = Math.min(options.played ?? 0, active);
      return { ...tables, [people]: { options, game: makePreview(options), reset: old.reset + 1 } };
    });
  }

  function step() {
    setTables((tables) => ({ ...tables, [people]: nextEntry(tables[people]) }));
  }

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTables((tables) => ({ ...tables, [people]: nextEntry(tables[people]) }));
    }, 1800);
    return () => clearInterval(timer);
  }, [running, people]);

  useEffect(() => {
    const query = new URLSearchParams({
      people: String(people),
      cards: String(entry.options.cards),
      phase: entry.options.phase,
      played: String(entry.options.played ?? 0),
      viewer: String(viewer),
      longNames: entry.options.longNames ? "1" : "0",
      inactive: entry.options.inactive ?? "none",
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [people, viewer, entry.options]);

  const snapshot = view(entry.game, entry.game.players[viewer].id);
  // Keep the countdown frozen between moves, like the rest of the preview.
  snapshot.deadline =
    snapshot.serverTime +
    (snapshot.phase === "results" ? 12000 : snapshot.phase === "trick" ? 2600 : 40000);

  function command(action: string, extra: Record<string, unknown>) {
    const game = structuredClone(entry.game);
    const id = game.players[viewer].id;
    if (action === "bid") bid(game, id, Number(extra.bid), Date.now());
    else if (action === "play") {
      const card = Number(extra.card);
      play(game, id, card === -1 ? game.players[viewer].hand[0] : card, extra.mode, Date.now());
    } else return;
    game.revision++;
    setTables((tables) => ({ ...tables, [people]: { ...tables[people], game } }));
  }

  const controls = (
    <Popover.Root open={controlsOpen} onOpenChange={setControlsOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          className="h-11 min-w-11 rounded-lg px-2 text-muted-foreground sm:px-3"
          aria-label="Preview settings"
        >
          <span className="font-mono text-[10px] tracking-wide sm:text-xs">{entry.game.code}</span>
          <Settings2 className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-labelledby="preview-title"
          className="z-50 grid max-h-[calc(100dvh-5rem)] w-88 max-w-[calc(100vw-1rem)] gap-4 overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-xl outline-none"
        >
          <div className="flex items-center justify-between gap-2">
            <strong id="preview-title" className="text-sm">
              Local preview
            </strong>
            <Popover.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close preview settings">
                <X />
              </Button>
            </Popover.Close>
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
                {entry.game.players.map((p, i) => (
                  <option value={i} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Last player
              <select
                className={selectClass}
                disabled={people === 2}
                value={entry.options.inactive}
                onChange={(e) => configure({ inactive: e.target.value as PreviewInactive })}
              >
                <option value="none">Active</option>
                <option value="eliminated">Eliminated</option>
                <option value="left">Left table</option>
              </select>
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              checked={entry.options.longNames}
              onChange={(e) => configure({ longNames: e.target.checked })}
            />
            Long names
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Button
              className="h-11 px-2 text-xs"
              onClick={() => setRunning(!running)}
              aria-pressed={running}
            >
              {running ? "Pause" : "Autoplay"}
            </Button>
            <Button variant="outline" className="h-11 px-2 text-xs" onClick={step}>
              Next move
            </Button>
            <Button variant="outline" className="h-11 px-2 text-xs" onClick={() => configure()}>
              Reset table
            </Button>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {entry.game.phase} · {entry.game.trick.length} of {entry.game.order.length} cards on
            table
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  return (
    <App
      key={`${people}-${entry.reset}-${viewer}`}
      preview={{ state: snapshot, command, reset: () => configure(), controls }}
    />
  );
}
