import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { toRoman } from "@/client/utils";
import { Check, Copy, Eye, LogOut } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/client/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/client/components/ui/alert-dialog";
import type { view } from "@/shared/game";
import { GameConnection } from "./game-connection";
import {
  cookieError,
  readStored,
  restorePlayer,
  savePlayerName,
  storeRoom,
} from "./player-session";
import { MatchBoard } from "./components/match-board";
import { Home } from "./components/home";
import { Lobby } from "./components/lobby";
import { ResultsPanel } from "./components/results-panel";
type State = ReturnType<typeof view>;

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Could not complete that action.");
  return data;
}

function restoreSession() {
  try {
    const player = restorePlayer();
    const invite = new URLSearchParams(location.search).get("table")?.toUpperCase() || "";
    const saved = readStored("giulietto-room");
    return {
      ...player,
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
      error: cookieError,
    };
  }
}

export type PreviewSession = {
  state: State;
  exitControl?: ReactNode;
  command: (action: string, extra: Record<string, unknown>) => void;
  reset: () => void;
};

export default function App({ preview }: { preview?: PreviewSession }) {
  const isPreview = !!preview;
  const [session] = useState(() =>
    preview ? { name: "bot_1", code: "", saved: null, token: "", error: "" } : restoreSession(),
  );
  const [name, setName] = useState(session.name);
  const [code, setCode] = useState(session.code);
  const [liveGame, setGame] = useState<State | null>(null);
  const game = preview?.state ?? liveGame;
  const [busy, setBusy] = useState(!!session.saved);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [connection, setConnection] = useState("");
  const [copied, setCopied] = useState(false);
  const [liveNow, setNow] = useState(Date.now());
  const now = preview?.state.serverTime ?? liveNow;
  const [ace, setAce] = useState<number | null>(null);
  const ready = !session.error;
  const [pendingCard, setPendingCard] = useState<number | null>(null);
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
    const previous = gameRef.current;
    if (previous && previous.code === s.code && s.revision < previous.revision) return;
    clockOffset.current = s.serverTime - Date.now();
    if (!previous || previous.code !== s.code) {
      const playerName = s.viewerName;
      setName(playerName);
      try {
        savePlayerName(playerName);
      } catch {
        setError(cookieError);
      }
    }
    gameRef.current = s;
    if (!previous && history.state?.giuliettoTable !== s.code) {
      // Keep a dashboard entry below the table, including direct invite links.
      history.replaceState({ ...history.state, giuliettoTable: null }, "", location.pathname);
      history.pushState({ ...history.state, giuliettoTable: s.code }, "", `?table=${s.code}`);
    }
    setGame(s);
    storeRoom(s.code);
  };
  useEffect(() => {
    if (isPreview) return;
    if (session.error) setError(session.error);
    if (session.saved) {
      fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-player-token": token.current },
        body: JSON.stringify({
          action: "join",
          commandId: crypto.randomUUID(),
          code: session.saved,
          name: session.name,
        }),
      })
        .then(readResponse<State>)
        .then(accept)
        .catch(() => storeRoom(null))
        .finally(() => {
          setBusy(false);
          busyRef.current = false;
        });
    }
    const timer = setInterval(() => setNow(Date.now() + clockOffset.current), 500);
    return () => clearInterval(timer);
  }, [session, isPreview]);
  const receiveState = useEffectEvent((s: State) => accept(s));
  useEffect(() => {
    if (isPreview || !game?.code) return;
    const connection = new GameConnection(game.code, token.current, receiveState, setConnection);
    transport.current = connection;
    return () => {
      transport.current = null;
      connection.stop();
    };
  }, [game?.code, isPreview]);
  useEffect(() => {
    if (connection) toast.error(connection, { id: "connection-error", duration: 4500 });
    else toast.dismiss("connection-error");
  }, [connection]);
  useEffect(() => {
    if (isPreview) return;
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
  }, [isPreview]);
  useEffect(() => {
    if (!game?.code) return;
    for (let i = 0; i <= 40; i++) {
      const img = new Image();
      img.src = `/cards/neapolitan/${i || "back"}.webp`;
    }
  }, [game?.code]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (preview) {
      try {
        if (action === "leave") {
          setLeaveOpen(false);
          preview.reset();
        } else preview.command(action, extra);
        setAce(null);
      } catch (error) {
        setError((error as Error).message);
      }
      return;
    }
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    if (action === "play") setPendingCard(Number(extra.card));
    try {
      let s: State;
      if (
        gameRef.current &&
        transport.current &&
        ["settings", "start", "bid", "play", "leave"].includes(action)
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
    if (preview) {
      preview.reset();
      return;
    }
    gameRef.current = null;
    setGame(null);
    setCode("");
    setError("");
    setConnection("");
    setAce(null);
    setPendingCard(null);
    storeRoom(null);
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
  const seconds = Math.max(0, Math.ceil(((game?.deadline || 0) - now) / 1000));
  const phase = game?.phase;
  const waiting = phase === "lobby";
  const result = phase === "results" || phase === "finished";

  return (
    <>
      <div
        className={
          game && !waiting
            ? "match-screen safe-area mx-auto grid h-dvh max-w-6xl grid-rows-[auto_minmax(0,1fr)]"
            : "safe-area mx-auto min-h-svh max-w-6xl [--page-bottom:1rem] [--page-gutter:1rem] sm:[--page-gutter:2rem]"
        }
      >
        <header className="site-header grid min-h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 py-1 sm:min-h-16">
          <div
            className={`row-start-1 flex flex-col items-start sm:flex-row sm:items-center sm:gap-3 ${game ? "col-start-1 justify-self-start" : "col-span-3 justify-self-center"}`}
          >
            <a
              href="/"
              className={`wordmark text-primary ${game ? "text-xl sm:text-3xl" : "text-3xl"}`}
              onClick={(e) => {
                if (game) e.preventDefault();
              }}
              aria-label="Giulietto home"
            >
              Giulietto
            </a>
            {game && !waiting && (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums"
                role="status"
                aria-label={`${game.spectatorCount} ${game.spectatorCount === 1 ? "spectator" : "spectators"}`}
                title={`${game.spectatorCount} ${game.spectatorCount === 1 ? "spectator" : "spectators"}`}
              >
                <Eye className="size-3.5" aria-hidden="true" />
                <span aria-hidden="true">{game.spectatorCount}</span>
              </span>
            )}
          </div>
          {game && !waiting && (
            <h2 className="col-start-2 row-start-1 max-w-18 text-center text-sm leading-tight font-semibold min-[360px]:max-w-none sm:text-xl">
              Round {toRoman(game.round)}
            </h2>
          )}
          {game && (
            <div className="col-start-3 row-start-1 flex items-center justify-self-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-auto flex-nowrap gap-1 rounded-lg p-0 text-muted-foreground sm:gap-2 sm:px-3"
                onClick={copy}
                aria-label="Copy lobby invite"
              >
                <span className="font-mono text-[10px] leading-none sm:text-xs sm:tracking-wide">
                  {game.code}
                </span>
                {copied ? <Check /> : <Copy />}
              </Button>
              {preview?.exitControl ?? (
                <Button
                  variant="ghost"
                  className="size-11 rounded-lg p-0 text-muted-foreground"
                  aria-label="Leave table"
                  onClick={() => setLeaveOpen(true)}
                >
                  <LogOut size={18} />
                </Button>
              )}
            </div>
          )}
        </header>
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
                {waiting || game?.spectating || phase === "finished"
                  ? "You can rejoin using the invite code."
                  : "Your seat keeps playing automatically. Rejoin with the invite code to resume."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11" disabled={busy}>
                Stay
              </AlertDialogCancel>
              <AlertDialogAction
                className="min-h-11"
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
          <Home
            name={name}
            code={code}
            ready={ready}
            busy={busy}
            onNameChange={setName}
            onCodeChange={setCode}
            onAction={act}
          />
        ) : (
          <main
            className={
              waiting
                ? "pb-6"
                : result
                  ? "min-h-0 overflow-y-auto px-1"
                  : "flex min-h-0 items-start"
            }
          >
            {waiting ? (
              <Lobby
                game={game}
                busy={busy}
                copied={copied}
                onCopy={copy}
                onStart={() => void act("start")}
                onSettings={(startingLives) => act("settings", { startingLives })}
              />
            ) : result ? (
              <ResultsPanel game={game} seconds={seconds} onReset={reset} />
            ) : (
              <MatchBoard
                game={game}
                busy={busy}
                pendingCard={pendingCard}
                preview={isPreview}
                onBid={(bid) => void act("bid", { bid })}
                onPlay={(card) => {
                  if (game.canChooseAce && (card === null || card === 31)) setAce(card ?? -1);
                  else void act("play", { card: card ?? -1 });
                }}
              />
            )}
          </main>
        )}
        <Dialog
          open={ace !== null && !!game?.canChooseAce}
          onOpenChange={(open) => {
            if (!open) setAce(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ace of Coins</DialogTitle>
              <DialogDescription>Choose its value before playing.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 [&>button]:h-12 [&>button]:min-w-0 [&>button]:flex-1">
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
      <Toaster
        position="top-center"
        theme="light"
        closeButton
        duration={4500}
        offset="max(16px, env(safe-area-inset-top))"
        mobileOffset="max(16px, env(safe-area-inset-top))"
      />
    </>
  );
}
