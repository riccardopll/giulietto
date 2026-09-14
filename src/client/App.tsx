import { usePlayerStats } from "./use-player-stats";
import { PageHeader } from "./components/ui/page-header";
import { PlayerPages } from "./components/player-pages";
import { Avatar } from "./components/avatar";
import { TABLE_ACTIONS } from "../shared/actions";
import { defaultAvatar } from "../shared/avatars";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { toRoman } from "./utils";
import { Check, Copy, LogOut } from "lucide-react";
import { AceSelection } from "./components/ace-selection";
import { Button } from "./components/ui/button";
import { ActionDialog } from "./components/ui/action-dialog";
import type { GameView } from "../shared/game";
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

export type PreviewSession = {
  state: GameView;
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
  const [page, setPage] = useState<"home" | "profile" | "leaderboard">(() => {
    const value = new URLSearchParams(location.search).get("page");
    return value === "profile" || value === "leaderboard" ? value : "home";
  });
  const [code, setCode] = useState(session.code);
  const [liveGame, setGame] = useState<GameView | null>(null);
  const game = preview?.state ?? liveGame;
  const account = usePlayerStats(session.token, !game && !isPreview, (profile) => {
    setName(profile.name);
    try {
      savePlayerName(profile.name);
    } catch {
      setError(cookieError);
    }
  });
  const profile = {
    name: name || "Guest",
    avatar: account.data?.profile.avatar ?? defaultAvatar(session.token),
  };
  function navigate(next: "home" | "profile" | "leaderboard") {
    history.pushState(
      { ...history.state, giuliettoTable: null },
      "",
      next === "home" ? "/" : `/?page=${next}`,
    );
    setPage(next);
    window.scrollTo(0, 0);
  }
  const [busy, setBusy] = useState(!!session.joinCode);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [connection, setConnection] = useState("");
  const [copied, setCopied] = useState(false);
  const [ace, setAce] = useState<number | null>(null);
  const ready = !session.error;
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  const token = useRef(session.token);
  const transport = useRef<GameConnection | null>(null);
  const httpAttempt = useRef<{ payload: string; commandId: string } | null>(null);
  const gameRef = useRef<GameView | null>(null);
  const busyRef = useRef(!!session.joinCode);
  function setError(message: string) {
    if (message) toast.error(message, { id: "game-error", duration: 4500 });
    else toast.dismiss("game-error");
  }
  const accept = (s: GameView) => {
    const previous = gameRef.current;
    if (previous && previous.code === s.code && s.revision < previous.revision) return;
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
    // Only entering a table saves it; updates in another tab must not undo an exit.
    if (!previous || previous.code !== s.code) storeRoom(s.code);
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
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [session, isPreview]);
  const receiveState = useEffectEvent((s: GameView) => accept(s));
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
      if (!current) {
        const value = new URLSearchParams(location.search).get("page");
        setPage(value === "profile" || value === "leaderboard" ? value : "home");
        return;
      }
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
      let s: GameView;
      if (
        gameRef.current &&
        transport.current &&
        action !== "leave" &&
        TABLE_ACTIONS.includes(action)
      ) {
        s = await transport.current.command(action, extra);
      } else {
        const command = {
          action,
          name: name || "Guest",
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
    transport.current?.stop();
    transport.current = null;
    gameRef.current = null;
    httpAttempt.current = null;
    setGame(null);
    setPage("home");
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
        {(game || page === "home") && (
          <PageHeader
            className={`site-header grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1 ${!game ? "mx-auto w-full max-w-md" : ""}`}
          >
            <div className="col-start-1 row-start-1 flex items-center justify-self-start">
              <a
                href="/"
                className={`wordmark text-primary ${game ? "text-xl min-[360px]:text-2xl sm:text-4xl" : "flex items-center gap-2 text-4xl"}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (!game) navigate("home");
                }}
                aria-label="Giulietto home"
              >
                Giulietto
              </a>
            </div>
            {!game && (
              <Button
                variant="ghost"
                className="col-start-3 row-start-1 h-auto gap-2 rounded-full p-1 pr-2"
                aria-label="Open your profile"
                title={profile.name}
                onClick={() => navigate("profile")}
              >
                <Avatar avatar={profile.avatar} />
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  Lv. {account.data?.player.level ?? 1}
                </span>
              </Button>
            )}
            {game && !waiting && (
              <div className="col-start-2 row-start-1 min-w-0">
                <h2 className="shrink-0 whitespace-nowrap text-center text-sm leading-tight font-semibold min-[360px]:text-base sm:text-2xl">
                  Round {toRoman(game.round)}
                </h2>
              </div>
            )}
            {game && (
              <div className="col-start-3 row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center">
                {!waiting && game.spectatorCount > 0 && (
                  <span
                    className="col-start-1 row-start-1 ml-1 min-[360px]:ml-2 inline-flex min-w-0 overflow-hidden items-center gap-1 text-xs font-black min-[360px]:text-sm tabular-nums drop-shadow-[0_1px_1px] drop-shadow-foreground/25"
                    role="status"
                    title={`${game.spectatorCount} spectators`}
                    aria-label={`${game.spectatorCount} ${game.spectatorCount === 1 ? "spectator" : "spectators"}`}
                  >
                    <span
                      className="min-w-0 truncate text-primary [-webkit-text-stroke:.4px_currentColor]"
                      aria-hidden="true"
                    >
                      {game.spectatorCount}
                    </span>
                    <svg
                      viewBox="0 0 24 18"
                      className="h-3.5 w-4 shrink-0 min-[360px]:h-4 min-[360px]:w-5 text-foreground"
                      aria-hidden="true"
                    >
                      <path
                        d="M1 9Q12-6 23 9Q12 24 1 9Z"
                        fill="white"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="9" r="4" fill="currentColor" />
                      <circle cx="11" cy="8" r="1" fill="white" />
                    </svg>
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="col-start-2 row-start-1 h-11 w-auto min-w-11 flex-nowrap gap-1 rounded-lg p-0 text-muted-foreground hover:bg-transparent sm:gap-2 sm:px-3"
                  onClick={copy}
                  aria-label="Copy lobby invite"
                >
                  <span
                    className={`font-mono text-[10px] leading-none min-[360px]:text-xs sm:text-sm sm:tracking-wide ${!waiting ? "hidden min-[440px]:inline" : ""}`}
                  >
                    {game.code}
                  </span>
                  {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
                </Button>
                <div className="col-start-3 row-start-1">
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
              </div>
            )}
          </PageHeader>
        )}
        <ActionDialog
          confirmation
          open={leaveOpen}
          onOpenChange={setLeaveOpen}
          title="Leave this table?"
          description={
            !waiting && !game?.spectating && phase !== "finished"
              ? "Your seat keeps playing automatically. Rejoin with the invite code to resume."
              : undefined
          }
          cancelLabel="Stay"
          actionLabel={busy ? "Leaving…" : "Leave table"}
          busy={busy}
          onSubmit={() => act("leave")}
        />
        {!game ? (
          page === "home" ? (
            <Home
              code={code}
              ready={ready}
              busy={busy}
              onCodeChange={setCode}
              onAction={act}
              onLeaderboard={() => navigate("leaderboard")}
            />
          ) : (
            <PlayerPages
              page={page}
              data={account.data}
              profile={profile}
              error={account.error}
              saving={account.saving}
              onSave={account.save}
              onBack={() => navigate("home")}
            />
          )
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
              <ResultsPanel game={game} preview={isPreview} onReset={reset} />
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
