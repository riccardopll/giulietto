import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { toast } from "./toast";
import { isTableCommand, type EntryCommand, type TableCommand } from "../shared/commands";
import { findPlayer, type GameView } from "../shared/game";
import { GameConnection } from "./game-connection";
import { GameRequestError, requestGame } from "./game-request";
import {
  cookieError,
  readStored,
  restoreSession,
  savePlayerName,
  storeRoom,
} from "./player-session";

export type PreviewSession = {
  state: GameView;
  exitControl?: ReactNode;
  command: (input: TableCommand) => void;
  reset: () => void;
};

function showError(message: string) {
  if (message) toast.error(message, { id: "game-error" });
  else toast.dismiss("game-error");
}

export function useGameSession(preview?: PreviewSession, onExit?: () => void) {
  const isPreview = !!preview;
  const [session] = useState(() =>
    preview
      ? { name: preview.state.viewerName, code: "", joinCode: null, token: "", error: "" }
      : restoreSession(),
  );
  const [name, setName] = useState(session.name);
  const [code, setCode] = useState(session.code);
  const [liveGame, setGame] = useState<GameView | null>(null);
  const [busy, setBusyState] = useState(!!session.joinCode);
  const [connection, setConnection] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [ace, setAce] = useState<number | null>(null);
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const transport = useRef<GameConnection | null>(null);
  const httpAttempt = useRef<{ payload: string; commandId: string } | null>(null);
  const gameRef = useRef<GameView | null>(null);
  const busyRef = useRef(busy);
  const game = preview?.state ?? liveGame;
  const ready = !session.error;

  // The ref guards re-entrant commands before React commits the state.
  function setBusy(value: boolean) {
    busyRef.current = value;
    setBusyState(value);
  }
  function rename(next: string) {
    setName(next);
    try {
      savePlayerName(next);
    } catch {
      showError(cookieError);
    }
  }
  function accept(s: GameView) {
    const previous = gameRef.current;
    if (previous && previous.code === s.code && s.revision < previous.revision) return;
    if (!previous || previous.code !== s.code || previous.viewerName !== s.viewerName)
      rename(s.viewerName);
    gameRef.current = s;
    if (!previous && history.state?.giuliettoTable !== s.code) {
      // Keep a dashboard entry below the table, including direct invite links.
      history.replaceState({ ...history.state, giuliettoTable: null }, "", location.pathname);
      history.pushState({ ...history.state, giuliettoTable: s.code }, "", `?table=${s.code}`);
    }
    setGame(s);
    // Only entering a table saves it; updates in another tab must not undo an exit.
    if (!previous || previous.code !== s.code) storeRoom(s.code);
  }

  useEffect(() => {
    if (isPreview) return;
    if (session.error) showError(session.error);
    let disposed = false;
    const controller = new AbortController();
    if (session.joinCode) {
      requestGame(
        session.token,
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
          if (session.code || !rejected) showError(error.message);
        })
        .finally(() => {
          if (!disposed) setBusy(false);
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
      session.token,
      gameRef.current!.viewerName,
      receiveState,
      setConnection,
    );
    transport.current = connection;
    return () => {
      transport.current = null;
      connection.stop();
    };
  }, [game?.code, isPreview, session.token]);
  useEffect(() => {
    if (connection) toast.error(connection, { id: "connection-error" });
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
  // Seated players see the live invite; only those who did not open it are notified.
  const invite = game?.rematch && findPlayer(game, game.you) ? game.rematch : undefined;
  const inviteCode = invite && invite.by !== game!.you ? invite.code : undefined;
  const announceInvite = useEffectEvent((code: string) => {
    const current = game!;
    toast.notify(
      `${findPlayer(current, current.rematch!.by)?.name ?? "A player"} invited you to a rematch.`,
      {
        id: "rematch-invite",
        duration: current.rematch!.expiresAt - current.serverTime,
        action: { label: "Join", onClick: () => void moveTo(code) },
      },
    );
  });
  useEffect(() => {
    if (inviteCode) announceInvite(inviteCode);
    else toast.dismiss("rematch-invite");
  }, [inviteCode]);
  useEffect(() => {
    if (!game?.code) return;
    for (let i = 0; i <= 40; i++) {
      const img = new Image();
      img.fetchPriority = "low";
      img.src = `/cards/neapolitan/${i || "back"}.webp`;
    }
  }, [game?.code, game?.matchId]);

  async function act(input: EntryCommand | TableCommand) {
    if (preview) {
      try {
        if (input.action === "leave") {
          setLeaveOpen(false);
          preview.reset();
        } else if (isTableCommand(input)) preview.command(input);
        setAce(null);
        return true;
      } catch (error) {
        showError((error as Error).message);
        return false;
      }
    }
    if (!ready || busyRef.current) return false;
    setBusy(true);
    showError("");
    if (input.action === "play") setPendingCard(input.card ?? -1);
    try {
      let s: GameView;
      if (
        gameRef.current &&
        transport.current &&
        input.action !== "leave" &&
        isTableCommand(input)
      ) {
        s = await transport.current.command(input);
      } else {
        const command = { name: name || "Guest", code: gameRef.current?.code || code, ...input };
        const payload = JSON.stringify(command);
        // Reuse mutation IDs after failures; a fresh join must restore expired membership.
        if (input.action === "join" || httpAttempt.current?.payload !== payload)
          httpAttempt.current = { payload, commandId: crypto.randomUUID() };
        s = await requestGame(session.token, {
          ...command,
          commandId: httpAttempt.current.commandId,
        });
        httpAttempt.current = null;
      }
      if (input.action === "leave") reset();
      else accept(s);
      setAce(null);
      return true;
    } catch (e) {
      if (e instanceof GameRequestError && !e.retryable) httpAttempt.current = null;
      if (input.action === "leave" && gameRef.current?.phase === "lobby") reset();
      else if (input.action === "leave") {
        setLeaveOpen(false);
        toast.error((e as Error).message, {
          id: "game-error",
          action: { label: "Retry", onClick: () => void act(input) },
        });
      } else showError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      setPendingCard(null);
    }
  }
  /** Switches tables in place, replacing the current history entry. */
  async function moveTo(code: string) {
    if (preview || !ready || busyRef.current) return;
    setBusy(true);
    showError("");
    try {
      const s = await requestGame(session.token, { action: "join", code, name: name || "Guest" });
      transport.current?.stop();
      transport.current = null;
      gameRef.current = null;
      setAce(null);
      setLeaveOpen(false);
      history.replaceState({ ...history.state, giuliettoTable: s.code }, "", `?table=${s.code}`);
      accept(s);
    } catch (e) {
      toast.error((e as Error).message, {
        id: "game-error",
        action: { label: "Retry", onClick: () => void moveTo(code) },
      });
    } finally {
      setBusy(false);
    }
  }
  async function rematch() {
    if (!(await act({ action: "rematch" }))) return;
    const code = gameRef.current?.rematch?.code;
    if (code) await moveTo(code);
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
    setCode("");
    showError("");
    setConnection("");
    setAce(null);
    setPendingCard(null);
    storeRoom(null);
    setLeaveOpen(false);
    onExit?.();
    if (history.state?.giuliettoTable) history.back();
    else history.replaceState({ ...history.state, giuliettoTable: null }, "", location.pathname);
  }
  async function renameSeat(next: string) {
    if (preview) {
      preview.command({ action: "rename", name: next });
      return true;
    }
    await act({ action: "rename", name: next });
    return gameRef.current?.viewerName === next.trim();
  }
  function play(card: number | null) {
    if (game?.canChooseAce && (card === null || card === 31)) setAce(card ?? -1);
    else void act({ action: "play", card: card ?? -1 });
  }
  async function copyInvite() {
    const link = `${location.origin}/?table=${game!.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showError(`Copy this invite link: ${link}`);
    }
  }

  return {
    token: session.token,
    ready,
    game,
    name,
    rename,
    code,
    setCode,
    busy,
    leaveOpen,
    setLeaveOpen,
    ace,
    setAce,
    pendingCard,
    copied,
    copyInvite,
    act,
    reset,
    renameSeat,
    play,
    rematch,
    invite,
    joinRematch: () => void moveTo(invite!.code),
  };
}
