import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { toRoman } from "@/client/utils";
import { Check, Copy, Eye, LogOut } from "lucide-react";
import { AceSelection } from "./components/ace-selection";
import { Button } from "@/client/components/ui/button";
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
import { GameRequestError, requestGame } from "./game-request";
import {
  cookieError,
  readStored,
  restoreSession,
  savePlayerName,
  storeRoom,
} from "./player-session";
import { MatchBoard } from "./components/match-board";
import { Home } from "./components/home";
import { Lobby } from "./components/lobby";
import { ResultsPanel } from "./components/results-panel";
type State = ReturnType<typeof view>;

export type PreviewSession = {
  state: State;
  exitControl?: ReactNode;
  command: (action: string, extra: Record<string, unknown>) => void;
  reset: () => void;
};

export default function App({ preview }: { preview?: PreviewSession }) {
  const isPreview = !!preview;
  const [session] = useState(() =>
    preview
      ? { name: preview.state.viewerName, code: "", joinCode: null, token: "", error: "" }
      : restoreSession(),
  );
  const [name, setName] = useState(session.name);
  const [code, setCode] = useState(session.code);
  const [liveGame, setGame] = useState<State | null>(null);
  const game = preview?.state ?? liveGame;
  const [busy, setBusy] = useState(!!session.joinCode);
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
  const httpAttempt = useRef<{ payload: string; commandId: string } | null>(null);
  const gameRef = useRef<State | null>(null);
  const busyRef = useRef(!!session.joinCode);
  const clockOffset = useRef(0);
  function setError(message: string) {
    if (message) toast.error(message, { id: "game-error", duration: 4500 });
    else toast.dismiss("game-error");
  }
  const accept = (s: State) => {
    const previous = gameRef.current;
    if (previous && previous.code === s.code && s.revision < previous.revision) return;
    clockOffset.current = s.serverTime - Date.now();
    if (!previous || previous.code !== s.code || previous.viewerName !== s.viewerName) {
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
    let disposed = false;
    const controller = new AbortController();
    if (session.joinCode) {
      requestGame(
        token.current,
        { action: "join", code: session.joinCode, name: session.name },
        controller,
      )
        .then((state) => {
          if (!disposed) accept(state);
        })
        .catch((error: Error) => {
          if (disposed) return;
          const rejected = error instanceof GameRequestError && !error.retryable;
          if (rejected && readStored("giulietto-room") === session.joinCode) storeRoom(null);
          if (session.code || !rejected) setError(error.message);
        })
        .finally(() => {
          if (disposed) return;
          setBusy(false);
          busyRef.current = false;
        });
    }
    const timer = setInterval(() => setNow(Date.now() + clockOffset.current), 500);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [session, isPreview]);
  const receiveState = useEffectEvent((s: State) => accept(s));
  useEffect(() => {
    if (isPreview || !game?.code) return;
    const connection = new GameConnection(
      game.code,
      token.current,
      gameRef.current!.viewerName,
      receiveState,
      setConnection,
    );
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
    // Warm the deck in the lobby and retry when a match starts, without delaying play.
    for (let i = 0; i <= 40; i++) {
      const img = new Image();
      img.fetchPriority = "low";
      img.src = `/cards/neapolitan/${i || "back"}.webp`;
    }
  }, [game?.code, game?.matchId]);
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
      if (action === "leave") transport.current?.stop();
      let s: State;
      if (
        gameRef.current &&
        transport.current &&
        ["rename", "settings", "start", "bid", "play", "emote"].includes(action)
      ) {
        s = await transport.current.command(action, extra);
      } else {
        const command = {
          action,
          name,
          code: gameRef.current?.code || code,
          ...extra,
        };
        const payload = JSON.stringify(command);
        // Reuse mutation IDs after failures; a fresh join must restore expired membership.
        if (action === "join" || httpAttempt.current?.payload !== payload)
          httpAttempt.current = { payload, commandId: crypto.randomUUID() };
        s = await requestGame(token.current, {
          ...command,
          commandId: httpAttempt.current.commandId,
        });
        httpAttempt.current = null;
      }
      if (action === "leave") {
        reset();
      } else {
        accept(s);
      }
      setAce(null);
    } catch (e) {
      if (e instanceof GameRequestError && !e.retryable) httpAttempt.current = null;
      if (action === "leave") reset();
      else setError((e as Error).message);
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
    httpAttempt.current = null;
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
        <header className="site-header grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 py-1 sm:min-h-20">
          <div
            className={`row-start-1 flex items-center gap-1 sm:gap-3 ${game ? "col-start-1 justify-self-start" : "col-span-3 justify-self-center"}`}
          >
            <a
              href="/"
              className={`wordmark text-primary ${game ? "text-2xl sm:text-4xl" : "text-4xl"}`}
              onClick={(e) => {
                if (game) e.preventDefault();
              }}
              aria-label="Giulietto home"
            >
              Giulietto
            </a>
            {game && !waiting && game.spectatorCount > 1 && (
              <span
                className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums"
                role="status"
                aria-label={`${game.spectatorCount} ${game.spectatorCount === 1 ? "spectator" : "spectators"}`}
                title={`${game.spectatorCount} ${game.spectatorCount === 1 ? "spectator" : "spectators"}`}
              >
                <Eye className="size-4" aria-hidden="true" />
                <span aria-hidden="true">{game.spectatorCount}</span>
              </span>
            )}
          </div>
          {game && !waiting && (
            <h2 className="col-start-2 row-start-1 max-w-18 text-center text-base leading-tight font-semibold min-[360px]:max-w-none sm:text-2xl">
              Round {toRoman(game.round)}
            </h2>
          )}
          {game && (
            <div className="col-start-3 row-start-1 flex items-center justify-self-end">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-auto flex-nowrap gap-1 rounded-lg p-0 text-muted-foreground hover:bg-transparent sm:gap-2 sm:px-3"
                onClick={copy}
                aria-label="Copy lobby invite"
              >
                <span className="font-mono text-xs leading-none sm:text-sm sm:tracking-wide">
                  {game.code}
                </span>
                {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
              </Button>
              {preview?.exitControl ?? (
                <Button
                  variant="ghost"
                  className="size-11 rounded-lg p-0 text-muted-foreground"
                  aria-label="Leave table"
                  onClick={() => setLeaveOpen(true)}
                >
                  <LogOut className="size-5" />
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
              {!waiting && !game?.spectating && phase !== "finished" && (
                <AlertDialogDescription>
                  Your seat keeps playing automatically. Rejoin with the invite code to resume.
                </AlertDialogDescription>
              )}
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
                onRename={async (name) => {
                  if (preview) {
                    preview.command("rename", { name });
                    return true;
                  }
                  await act("rename", { name });
                  return gameRef.current?.viewerName === name.trim();
                }}
              />
            ) : result ? (
              <ResultsPanel game={game} seconds={seconds} onReset={reset} />
            ) : (
              <MatchBoard
                game={game}
                busy={busy}
                pendingCard={pendingCard}
                preview={isPreview}
                onEmote={(emote) => void act("emote", { emote })}
                onBid={(bid) => void act("bid", { bid })}
                onPlay={(card) => {
                  if (game.canChooseAce && (card === null || card === 31)) setAce(card ?? -1);
                  else void act("play", { card: card ?? -1 });
                }}
              />
            )}
          </main>
        )}
        <AceSelection
          open={ace !== null && !!game?.canChooseAce}
          onOpenChange={(open) => {
            if (!open) setAce(null);
          }}
          disabled={busy}
          onSelect={(mode) => act("play", { card: ace, mode })}
        />
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
