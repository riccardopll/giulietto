import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast, Toaster } from "sonner";
import { PredictionEmote } from "@/components/prediction-emote";
import { PlayingCard as Card } from "@/components/playing-card";
import {
  ArrowRight,
  Heart,
  Users,
  Link as LinkIcon,
  Check,
  Copy,
  Globe2,
  EyeOff,
  Trophy,
  Clock3,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { view } from "@/lib/game";
import { GameConnection } from "./game-connection";
type State = ReturnType<typeof view>;

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Could not complete that action.");
  return data;
}

function restoreSession() {
  try {
    const token =
      localStorage.getItem("giulietto-token") ||
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
    localStorage.setItem("giulietto-token", token);
    const invite = new URLSearchParams(location.search).get("table")?.toUpperCase() || "";
    const saved = localStorage.getItem("giulietto-room");
    return {
      token,
      name: localStorage.getItem("giulietto-name") || "",
      code: invite,
      saved: saved && (!invite || saved === invite) ? saved : null,
      error: "",
    };
  } catch {
    return {
      token: "",
      name: "",
      code: "",
      saved: null,
      error: "Allow browser storage to keep your guest seat when you reconnect.",
    };
  }
}

function Lives({ n }: { n: number }) {
  return (
    <span className="lives" aria-label={`${n} ${n === 1 ? "life" : "lives"}`}>
      {[0, 1, 2].map((i) => (
        <Heart
          key={i}
          size={14}
          fill={i < n ? "currentColor" : "none"}
          className={i < n ? "" : "empty-heart"}
        />
      ))}
    </span>
  );
}
export default function App() {
  const [session] = useState(restoreSession);
  const [name, setName] = useState(session.name);
  const [code, setCode] = useState(session.code);
  const [game, setGame] = useState<State | null>(null);
  const [busy, setBusy] = useState(!!session.saved);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [connection, setConnection] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [ace, setAce] = useState<number | null>(null);
  const ready = !session.error;
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  const transition = useRef<ViewTransition | null>(null);
  const token = useRef(session.token);
  const transport = useRef<GameConnection | null>(null);
  const gameRef = useRef<State | null>(null);
  const busyRef = useRef(!!session.saved);
  const clockOffset = useRef(0);
  function setError(message: string) {
    if (message) toast.error(message, { id: "game-error", duration: 4500 });
    else toast.dismiss("game-error");
  }
  const accept = (s: State) => {
    clockOffset.current = s.serverTime - Date.now();
    const previous = gameRef.current;
    if (previous && previous.code === s.code && s.revision < previous.revision) return;
    const changed =
      previous &&
      previous.code === s.code &&
      (previous.round !== s.round ||
        previous.phase !== s.phase ||
        JSON.stringify(previous.trick) !== JSON.stringify(s.trick));
    gameRef.current = s;
    if (!previous && history.state?.giuliettoTable !== s.code) {
      // Keep a dashboard entry below the table, including direct invite links.
      history.replaceState({ ...history.state, giuliettoTable: null }, "", location.pathname);
      history.pushState({ ...history.state, giuliettoTable: s.code }, "", `?table=${s.code}`);
    }
    const commit = () => {
      if (gameRef.current === s) flushSync(() => setGame(s));
    };
    if (
      changed &&
      document.startViewTransition &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      transition.current?.skipTransition();
      transition.current = document.startViewTransition(commit);
      void transition.current.finished.catch(() => {});
    } else setGame(s);
    localStorage.setItem("giulietto-room", s.code);
  };
  useEffect(() => {
    if (session.error) setError(session.error);
    if (session.saved) {
      fetch(`/api/game?code=${encodeURIComponent(session.saved)}`, {
        headers: { "x-player-token": token.current },
      })
        .then(readResponse<State>)
        .then(accept)
        .catch(() => localStorage.removeItem("giulietto-room"))
        .finally(() => {
          setBusy(false);
          busyRef.current = false;
        });
    }
    const timer = setInterval(() => setNow(Date.now() + clockOffset.current), 500);
    return () => clearInterval(timer);
  }, [session]);
  const receiveState = useEffectEvent((s: State) => accept(s));
  useEffect(() => {
    if (!game?.code) return;
    const connection = new GameConnection(game.code, token.current, receiveState, setConnection);
    transport.current = connection;
    return () => {
      transport.current = null;
      connection.stop();
    };
  }, [game?.code]);
  useEffect(() => {
    if (connection) toast.error(connection, { id: "connection-error", duration: 4500 });
    else toast.dismiss("connection-error");
  }, [connection]);
  useEffect(() => {
    const onBack = () => {
      const current = gameRef.current;
      if (!current) return;
      // popstate cannot be cancelled. Restore the table entry before asking.
      history.pushState(
        { ...history.state, giuliettoTable: current.code },
        "",
        `?table=${current.code}`,
      );
      setAce(null);
      setLeaveOpen(true);
    };
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!gameRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("popstate", onBack);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("popstate", onBack);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
  useEffect(() => {
    if (!game?.code) return;
    for (let i = 0; i <= 40; i++) {
      const img = new Image();
      img.src = `/cards/neapolitan/${i || "back"}.webp`;
    }
  }, [game?.code]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    if (action === "play") setPendingCard(Number(extra.card));
    try {
      localStorage.setItem("giulietto-name", name);
      let s: State;
      if (
        gameRef.current &&
        transport.current &&
        ["start", "bid", "play", "leave"].includes(action)
      ) {
        s = await transport.current.command(action, extra);
      } else {
        const r = await fetch("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-player-token": token.current },
          body: JSON.stringify({
            action,
            commandId: crypto.randomUUID(),
            name,
            code: gameRef.current?.code || code,
            ...extra,
          }),
        });
        s = await readResponse<State>(r);
      }
      if (action === "leave") {
        reset();
      } else {
        accept(s);
      }
      setAce(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
      setPendingCard(null);
    }
  }
  function reset() {
    gameRef.current = null;
    setGame(null);
    setCode("");
    setError("");
    setConnection("");
    setAce(null);
    setPendingCard(null);
    localStorage.removeItem("giulietto-room");
    setLeaveOpen(false);
    if (history.state?.giuliettoTable) history.back();
    else history.replaceState({ ...history.state, giuliettoTable: null }, "", location.pathname);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?table=${game!.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(`Copy this invite link: ${location.origin}/?table=${game!.code}`);
    }
  }
  const me = game?.players.find((p) => p.id === game.you);
  const myTurn = !!game && game.order[game.turn] === game.you && !me?.left;
  const turnPlayer = game?.players.find((p) => p.id === game.order[game.turn]);
  const seconds = Math.max(0, Math.ceil(((game?.deadline || 0) - now) / 1000));
  const blind = game?.count === 1;
  const active = !!me && me.lives > 0 && !me.left;
  const phase = game?.phase;
  const waiting = phase === "lobby";
  const result = phase === "results" || phase === "finished";
  const turnText =
    phase === "bidding"
      ? myTurn
        ? "Your prediction"
        : `${turnPlayer?.name}'s prediction`
      : phase === "playing"
        ? myTurn
          ? "Your turn"
          : `${turnPlayer?.name}'s turn`
        : phase === "trick"
          ? `${game?.players.find((p) => p.id === game.lastWinner)?.name} takes the trick`
          : "";
  const trickNumber = game
    ? game.count -
      (game.players.find((p) => p.id === game.order[0])?.hand.length ?? 0) +
      (game.trick.some((p) => p.player === game.order[0]) ? 0 : 1)
    : 0;
  const opponents = game?.players.filter((p) => p.id !== game.you) ?? [];
  const animateTrick = useEffectEvent(() => {
    if (!game || game.phase !== "trick" || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const anchor = document.querySelector(`[data-seat="${game.lastWinner}"]`);
    if (!anchor) return;
    const target = anchor.getBoundingClientRect();
    const animations = Array.from(
      document.querySelectorAll<HTMLElement>(".trick-cards .playing-card"),
    ).map((card, i) => {
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
    });
    return () => animations.forEach((a) => a.cancel());
  });
  useEffect(() => animateTrick(), [phase, game?.round, game?.lastWinner, trickNumber]);

  return (
    <div className={`site-shell ${game && !waiting ? "match-screen" : ""}`}>
      <header className="site-header">
        <a
          href="/"
          className="wordmark"
          onClick={(e) => {
            if (game) e.preventDefault();
          }}
          aria-label="Giulietto home"
        >
          Giulietto
        </a>
        {game && (
          <div className="header-right">
            <button className="code-button" onClick={copy} aria-label="Copy lobby invite">
              {game.code}
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <Button
              variant="ghost"
              className="leave-button"
              aria-label="Leave table"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut size={18} />
            </Button>
          </div>
        )}
      </header>
      <Toaster
        position="top-center"
        theme="light"
        closeButton
        duration={4500}
        offset="max(16px, env(safe-area-inset-top))"
        mobileOffset="max(16px, env(safe-area-inset-top))"
        toastOptions={{ className: "game-toast" }}
      />
      <AlertDialog
        open={leaveOpen}
        onOpenChange={(open) => {
          if (!busy) setLeaveOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this table?</AlertDialogTitle>
            <AlertDialogDescription>
              {waiting
                ? "You can rejoin using the invite code."
                : "Leaving forfeits your place in this game."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Stay</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void act("leave");
              }}
            >
              {busy ? "Leaving…" : "Leave table"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!game ? (
        <main className="home">
          <div className="entry-form">
            <label htmlFor="name">Display name</label>
            <Input
              id="name"
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="nickname"
            />
            <Button
              className="primary-action"
              disabled={!ready || busy || !name.trim()}
              onClick={() => act("match")}
            >
              {busy ? <Loader2 className="spin" /> : <Globe2 size={19} />}Find matchmaking
            </Button>
            <Button
              variant="outline"
              className="secondary-action"
              disabled={!ready || busy || !name.trim()}
              onClick={() => act("create")}
            >
              <Users size={19} />
              Create private lobby
            </Button>
            <form
              className="join-section"
              onSubmit={(e) => {
                e.preventDefault();
                act("join");
              }}
            >
              <label htmlFor="lobby-code">Lobby code</label>
              <div className="join-form">
                <Input
                  id="lobby-code"
                  placeholder="Enter code"
                  maxLength={8}
                  value={code}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || !name.trim() || code.length !== 8}
                >
                  Join
                </Button>
              </div>
            </form>
          </div>
        </main>
      ) : (
        <main className={`game-main ${waiting ? "" : "in-game"}`}>
          <div className="match-meta">
            <span>
              {waiting ? (game.public ? "Public lobby" : "Private lobby") : `Round ${game.round}`}
            </span>
            <span>
              {waiting
                ? `${game.players.length} / 6 players`
                : `${game.count} ${game.count === 1 ? "card" : "cards"} each`}
            </span>
          </div>
          {waiting ? (
            <section className="lobby">
              <div className="lobby-heading">
                <h1>{game.public ? "Matchmaking" : "Players"}</h1>
                <p>
                  {game.public
                    ? game.startAt
                      ? `Starting in ${Math.max(0, Math.ceil((game.startAt - now) / 1000))}s`
                      : "Waiting for another player…"
                    : "Start when everyone is here."}
                </p>
              </div>
              <div className="seats">
                {Array.from({ length: 6 }, (_, i) => {
                  const p = game.players[i];
                  return (
                    <div className={`seat ${p ? "occupied" : ""}`} key={p?.id ?? i}>
                      {p ? (
                        <>
                          <div className={`avatar avatar-${i}`}>
                            {p.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="seat-label">
                            <strong>
                              {p.name}
                              {p.id === game.you ? " (you)" : ""}
                            </strong>
                            <span>{p.id === game.host ? "Host" : "Ready"}</span>
                          </div>
                          <Lives n={3} />
                        </>
                      ) : (
                        <>
                          <div className="empty-avatar">+</div>
                          <span>Open seat</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="lobby-actions">
                <Button variant="outline" className="secondary-action" onClick={copy}>
                  {copied ? <Check /> : <LinkIcon />}
                  {copied ? "Copied" : "Copy invite link"}
                </Button>
                {game.host === game.you && (
                  <Button
                    className="primary-action"
                    onClick={() => act("start")}
                    disabled={busy || game.players.length < 2}
                  >
                    Start game
                    <ArrowRight />
                  </Button>
                )}
              </div>
              {game.players.length < 2 && (
                <p className="muted lobby-hint">At least 2 players needed.</p>
              )}
            </section>
          ) : (
            <>
              {result ? (
                <section className="results-panel" key={`results-${game.round}`}>
                  <span className="eyebrow">
                    {phase === "finished" ? "Game over" : `Round ${game.round} complete`}
                  </span>
                  {phase === "finished" ? (
                    <>
                      <Trophy className="trophy" size={36} />
                      <h1>
                        {game.winner === game.you
                          ? "You win"
                          : game.winner
                            ? `${game.players.find((p) => p.id === game.winner)?.name} wins`
                            : "Table closed"}
                      </h1>
                    </>
                  ) : (
                    <h1>{game.tie ? "Everyone returns" : "Round results"}</h1>
                  )}
                  {game.tie && <p className="revival-note">All players return with one life.</p>}
                  <Table className="score-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>Bid</TableHead>
                        <TableHead>Won</TableHead>
                        <TableHead>Lost</TableHead>
                        <TableHead>Lives</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {game.players.map((p) => {
                        const r = game.results.find((r) => r.id === p.id);
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              {p.name}
                              {p.id === game.you ? " (you)" : ""}
                            </TableCell>
                            <TableCell>{r?.bid ?? "–"}</TableCell>
                            <TableCell>{r?.taken ?? "–"}</TableCell>
                            <TableCell className={r?.lost ? "loss" : "exact"}>
                              {r ? (r.lost ? `−${r.lost}` : "✓") : "–"}
                            </TableCell>
                            <TableCell>
                              <Lives n={p.lives} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {phase === "finished" ? (
                    <Button className="primary-action" onClick={reset}>
                      Back to tables
                    </Button>
                  ) : (
                    <p className="next-round">
                      <Clock3 size={15} />
                      Next round in {seconds}s
                    </p>
                  )}
                </section>
              ) : (
                <div className="match-board">
                  <div className={`opponents ${blind ? "blind-opponents" : ""}`}>
                    {opponents.map((p) => {
                      const i = game.players.indexOf(p);
                      return (
                        <div
                          data-seat={p.id}
                          key={p.id}
                          className={`opponent ${game.order[game.turn] === p.id && ["bidding", "playing"].includes(phase!) ? "current-player" : ""} ${p.lives <= 0 || p.left ? "eliminated" : ""}`}
                        >
                          <PredictionEmote
                            key={`${game.round}-${p.id}`}
                            bid={p.bid}
                            name={p.name}
                          />
                          <div className={`avatar avatar-${i}`}>
                            {p.name.slice(0, 1).toUpperCase()}
                          </div>
                          <strong title={p.name}>{p.name}</strong>
                          <Lives n={p.lives} />
                          <span className="player-score">
                            {p.left
                              ? "Left"
                              : p.lives <= 0
                                ? "Out"
                                : `${p.taken} / ${p.bid ?? "–"}`}
                          </span>
                          {blind && p.hand[0] != null && <Card card={p.hand[0]} small />}
                        </div>
                      );
                    })}
                  </div>
                  <section className="play-table">
                    <div className="table-status">
                      <span className="eyebrow">
                        {phase === "bidding"
                          ? "Predictions"
                          : phase === "trick"
                            ? "Trick won"
                            : `Trick ${trickNumber}`}
                      </span>
                      <div className="turn-line">
                        <h1 key={turnText}>{turnText}</h1>
                        {["bidding", "playing"].includes(phase!) && (
                          <span className={`timer ${seconds < 10 ? "urgent" : ""}`}>
                            <Clock3 size={14} />
                            {seconds}s
                          </span>
                        )}
                      </div>
                    </div>
                    {phase === "bidding" ? (
                      <div className="bidding-area">
                        <div className="bid-options">
                          {Array.from({ length: game.count + 1 }, (_, i) => i).map((n) => (
                            <Button
                              key={n}
                              variant="outline"
                              disabled={!myTurn || !active || busy || !game.legalBids.includes(n)}
                              className="bid-button"
                              aria-label={`Predict ${n} ${n === 1 ? "trick" : "tricks"}`}
                              onClick={() => act("bid", { bid: n })}
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                        <p className="bid-total">
                          {game.players.reduce((n, p) => n + (p.bid ?? 0), 0)} predicted ·{" "}
                          {game.count} available
                        </p>
                        {game.turn === game.order.length - 1 && (
                          <p className="last-bid-note">The total cannot equal {game.count}.</p>
                        )}
                      </div>
                    ) : (
                      <div className="trick-cards" key={`${game.round}-${trickNumber}`}>
                        {game.trick.length ? (
                          game.trick.map((p) => (
                            <div
                              className={`played-card ${phase === "trick" && p.player === game.lastWinner ? "winner-card" : ""}`}
                              key={p.card}
                            >
                              <Card card={p.card} mode={p.mode} />
                              <span>
                                {p.player === game.you
                                  ? "You"
                                  : game.players.find((x) => x.id === p.player)?.name}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="empty-trick">
                            {myTurn ? "Choose a card" : "Waiting for a card…"}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                  <section className={`hand-area ${myTurn && active ? "your-turn" : ""}`}>
                    <div className="self-player" data-seat={game.you}>
                      <div className="self-name">
                        <strong>You</strong>
                        <Lives n={me?.lives ?? 0} />
                      </div>
                      <span className="self-score">
                        {me?.taken} / {me?.bid ?? "–"} tricks
                      </span>
                    </div>
                    <div className="hand" key={`hand-${game.round}`}>
                      {me?.hand.map((card, i) => (
                        <Card
                          key={card ?? i}
                          card={card}
                          delay={i * 40}
                          disabled={!active || !myTurn || phase !== "playing" || busy}
                          pending={pendingCard === (card ?? -1)}
                          onClick={() => {
                            if (blind || card === 31) setAce(card ?? -1);
                            else act("play", { card });
                          }}
                        />
                      ))}
                    </div>
                    <div className="hand-hint">
                      {!active ? (
                        "Watching · you return if everyone is out"
                      ) : blind ? (
                        <>
                          <EyeOff size={14} />
                          Your card stays hidden until played
                        </>
                      ) : phase === "bidding" ? (
                        "Predict your tricks"
                      ) : myTurn ? (
                        "Choose a card to play"
                      ) : (
                        "Waiting for your turn"
                      )}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      )}
      <Dialog
        open={ace !== null}
        onOpenChange={(open) => {
          if (!open) setAce(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blind ? "High or low?" : "Ace of Coins"}</DialogTitle>
            <DialogDescription>
              {blind
                ? "This choice applies only if your hidden card is the Ace of Coins."
                : "Choose its value before playing."}
            </DialogDescription>
          </DialogHeader>
          <div className="ace-choices">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => act("play", { card: ace, mode: "low" })}
            >
              Low · 0
            </Button>
            <Button disabled={busy} onClick={() => act("play", { card: ace, mode: "high" })}>
              High · 41
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
