import { useEffect, useState } from "react";
import App from "../App";
import { bid, play, view, type Game } from "../../shared/game";
import { advancePreview, makePreview, type PreviewOptions, type PreviewPhase } from "./games";
import "./preview.css";

type Entry = { options: PreviewOptions; game: Game; reset: number };
const counts = [6, 5, 4, 3, 2];

export function Preview() {
  const [people, setPeople] = useState(6);
  const [viewer, setViewer] = useState(0);
  const [running, setRunning] = useState(false);
  const [tables, setTables] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      counts.map((people) => {
        const options: PreviewOptions = { people, cards: 6, phase: "playing", longNames: false };
        return [people, { options, game: makePreview(options), reset: 0 }];
      }),
    ),
  );
  const entry = tables[people];
  function configure(patch: Partial<PreviewOptions> = {}) {
    setRunning(false);
    setTables((tables) => {
      const old = tables[people];
      const options = { ...old.options, ...patch };
      return { ...tables, [people]: { options, game: makePreview(options), reset: old.reset + 1 } };
    });
  }
  function step() {
    setTables((tables) => {
      const old = tables[people];
      const finished = old.game.phase === "finished";
      return {
        ...tables,
        [people]: {
          ...old,
          game: finished ? makePreview(old.options) : advancePreview(old.game),
          reset: old.reset + Number(finished),
        },
      };
    });
  }
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTables((tables) => {
        const old = tables[people];
        const finished = old.game.phase === "finished";
        return {
          ...tables,
          [people]: {
            ...old,
            game: finished ? makePreview(old.options) : advancePreview(old.game),
            reset: old.reset + Number(finished),
          },
        };
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [running, people]);
  const snapshot = view(entry.game, entry.game.players[viewer].id);
  // Keep the countdown frozen between moves, like the rest of the preview.
  snapshot.deadline = snapshot.serverTime + (snapshot.phase === "results" ? 12000 : 40000);
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
  return (
    <>
      <aside className="preview-controls" aria-label="Local preview controls">
        <div className="preview-heading">
          <strong>Local preview</strong>
        </div>
        <div className="preview-player-counts" role="group" aria-label="Player count">
          {counts.map((count) => (
            <button
              key={count}
              aria-pressed={people === count}
              onClick={() => {
                setPeople(count);
                setViewer(0);
                setRunning(false);
              }}
            >
              {count} players
            </button>
          ))}
        </div>
        <div className="preview-settings">
          <label>
            Scenario
            <select
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
          <label>
            Cards each
            <select
              disabled={entry.options.phase === "blind"}
              value={entry.options.phase === "blind" ? 1 : entry.options.cards}
              onChange={(e) => configure({ cards: Number(e.target.value) })}
            >
              {[6, 5, 4, 3, 2, 1].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            View as
            <select
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
          <label className="preview-checkbox">
            <input
              type="checkbox"
              checked={entry.options.longNames}
              onChange={(e) => configure({ longNames: e.target.checked })}
            />
            Long names
          </label>
        </div>
        <div className="preview-actions">
          <button onClick={() => setRunning(!running)} aria-pressed={running}>
            {running ? "Pause" : "Autoplay"}
          </button>
          <button onClick={step}>Next move</button>
          <button onClick={() => configure()}>Reset table</button>
        </div>
      </aside>
      <App
        key={`${people}-${entry.reset}-${viewer}`}
        preview={{ state: snapshot, command, reset: () => configure() }}
      />
    </>
  );
}
