import { useEffect, useEffectEvent, useState } from "react";
import { defaultAvatar } from "../shared/avatars";
import { AceSelection } from "./components/ace-selection";
import { Avatar } from "./components/avatar";
import { ChatSheet, useChat } from "./components/chat";
import { Home } from "./components/home";
import { Lobby } from "./components/lobby";
import { MatchBoard } from "./components/match-board";
import { PlayerPages } from "./components/player-pages";
import { HowToPlay } from "./components/how-to-play";
import { ResultsPanel } from "./components/results-panel";
import { TableHeader } from "./components/table-header";
import { ActionDialog } from "@ui/action-dialog";
import { Button } from "@ui/button";
import { PageFooter } from "@ui/page-footer";
import { Wordmark } from "./components/wordmark";
import { t, useLocale } from "./i18n";
import { Toaster } from "./toast";
import { useGameSession, type PreviewSession } from "./use-game-session";
import { usePlayerStats } from "./use-player-stats";

type Page = "home" | "profile" | "leaderboard" | "how-to-play";

function readPage(): Page {
  const value = new URLSearchParams(location.search).get("page");
  return value === "profile" || value === "leaderboard" || value === "how-to-play" ? value : "home";
}

export default function App({ preview }: { preview?: PreviewSession }) {
  const isPreview = !!preview;
  const locale = useLocale();
  const [page, setPage] = useState(readPage);
  const table = useGameSession(preview, () => setPage("home"));
  const { game, busy } = table;
  const chat = useChat(game);
  const account = usePlayerStats(table.token, !game && !isPreview, (profile) =>
    table.rename(profile.name),
  );
  const profile = {
    name: table.name || "Guest",
    avatar: account.data?.profile.avatar ?? defaultAvatar(table.token),
  };
  function navigate(next: Page) {
    history.pushState(
      { ...history.state, giuliettoTable: null },
      "",
      next === "home" ? "/" : `/?page=${next}`,
    );
    setPage(next);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.title;
  }, [locale]);
  const syncPage = useEffectEvent(() => {
    if (!game) setPage(readPage());
  });
  useEffect(() => {
    if (isPreview) return;
    const onBack = () => syncPage();
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [isPreview]);
  const phase = game?.phase;
  const waiting = phase === "lobby";
  const result = phase === "results" || phase === "finished";

  return (
    <>
      <div
        className={
          game && !waiting
            ? "match-screen safe-area mx-auto grid h-dvh max-w-6xl grid-rows-[auto_minmax(0,1fr)]"
            : "safe-area mx-auto flex min-h-svh max-w-6xl flex-col [--page-bottom:1rem] [--page-gutter:1rem]"
        }
      >
        {game ? (
          <TableHeader
            game={game}
            copied={table.copied}
            onCopy={table.copyInvite}
            onLeave={() => table.setLeaveOpen(true)}
            exitControl={preview?.exitControl}
          />
        ) : (
          page === "home" && (
            <header className="mx-auto grid min-h-16 w-full max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 py-1">
              <div className="col-start-1 row-start-1 flex items-center justify-self-start">
                <Wordmark className="flex items-center text-4xl" onClick={() => navigate("home")} />
              </div>
              <Button
                variant="ghost"
                size="pill"
                className="col-start-3 row-start-1"
                aria-label={t.home.profile}
                title={profile.name}
                onClick={() => navigate("profile")}
              >
                <Avatar avatar={profile.avatar} />
                <span className="pr-1 text-sm font-medium tabular-nums text-muted-foreground">
                  {t.levelShort(account.data?.player.level ?? 1)}
                </span>
              </Button>
            </header>
          )
        )}
        <ActionDialog
          confirmation
          open={table.leaveOpen}
          onOpenChange={table.setLeaveOpen}
          title={t.table.leaveTitle}
          description={
            !waiting &&
            game?.players.some((player) => player.id === game.you && !player.forfeited) &&
            phase !== "finished"
              ? t.table.leaveForfeit
              : undefined
          }
          cancelLabel={t.table.stay}
          actionLabel={busy ? t.table.leaving : t.table.leave}
          busy={busy}
          onSubmit={() => void table.act({ action: "leave" })}
        />
        {!game ? (
          page === "home" ? (
            <Home
              code={table.code}
              ready={table.ready}
              busy={busy}
              onCodeChange={table.setCode}
              onAction={(action) => void table.act({ action })}
              onHowToPlay={() => navigate("how-to-play")}
              onLeaderboard={() => navigate("leaderboard")}
            />
          ) : page === "how-to-play" ? (
            <HowToPlay onBack={() => navigate("home")} />
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
                chat={chat}
                copied={table.copied}
                onCopy={table.copyInvite}
                onStart={() => void table.act({ action: "start" })}
                onSettings={(settings) => table.act({ action: "settings", ...settings })}
                onRename={table.renameSeat}
                onAddBot={isPreview ? undefined : () => void table.act({ action: "addBot" })}
                onKick={(playerId) => table.act({ action: "kick", playerId })}
              />
            ) : result ? (
              <ResultsPanel
                game={game}
                preview={isPreview}
                busy={busy}
                chat={chat}
                invite={table.invite}
                onRematch={() => void table.rematch()}
                onReset={table.reset}
                onDonate={(playerId) => void table.act({ action: "donate", playerId })}
              />
            ) : (
              <MatchBoard
                game={game}
                busy={busy}
                pendingCard={table.pendingCard}
                preview={isPreview}
                chat={chat}
                onEmote={(emote) => void table.act({ action: "emote", emote })}
                onBid={(bid) => void table.act({ action: "bid", bid })}
                onPlay={table.play}
              />
            )}
          </main>
        )}
        {!game && page === "home" && <PageFooter />}
        {game && (
          <ChatSheet
            open={chat.open}
            onOpenChange={chat.setOpen}
            game={game}
            busy={busy}
            onSend={(text) => table.act({ action: "chat", text })}
          />
        )}
        <AceSelection
          open={table.ace !== null && !!game?.canChooseAce}
          onOpenChange={(open) => {
            if (!open) table.setAce(null);
          }}
          disabled={busy}
          onSelect={(mode) => void table.act({ action: "play", card: table.ace ?? -1, mode })}
        />
      </div>
      <Toaster />
    </>
  );
}
