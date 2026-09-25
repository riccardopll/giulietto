import type { ReactNode } from "react";
import { Check, Copy, LogOut } from "lucide-react";
import type { GameView } from "../../shared/game";
import { toRoman } from "../utils";
import { Button } from "@ui/button";
import { Wordmark } from "./wordmark";

function SpectatorCount({ count }: { count: number }) {
  return (
    <span
      className="col-start-1 row-start-1 ml-1 min-[360px]:ml-2 inline-flex min-w-0 overflow-hidden items-center gap-1 text-xs font-black min-[360px]:text-sm tabular-nums drop-shadow-[0_1px_1px] drop-shadow-foreground/25"
      role="status"
      title={`${count} spectators`}
      aria-label={`${count} ${count === 1 ? "spectator" : "spectators"}`}
    >
      <span
        className="min-w-0 truncate text-primary [-webkit-text-stroke:.4px_currentColor]"
        aria-hidden="true"
      >
        {count}
      </span>
      <svg
        viewBox="0 0 24 18"
        className="h-3.5 w-4 shrink-0 min-[360px]:h-4 min-[360px]:w-5 text-foreground"
        aria-hidden="true"
      >
        <path
          d="M1 9Q12-6 23 9Q12 24 1 9Z"
          className="fill-card"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="9" r="4" fill="currentColor" />
        <circle cx="11" cy="8" r="1" className="fill-card" />
      </svg>
    </span>
  );
}

export function TableHeader({
  game,
  copied,
  onCopy,
  onLeave,
  exitControl,
}: {
  game: GameView;
  copied: boolean;
  onCopy: () => void;
  onLeave: () => void;
  exitControl?: ReactNode;
}) {
  const waiting = game.phase === "lobby";
  return (
    <header className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 py-1">
      <div className="col-start-1 row-start-1 flex items-center justify-self-start">
        <Wordmark className="text-xl min-[360px]:text-2xl" />
      </div>
      {!waiting && (
        <div className="col-start-2 row-start-1 min-w-0">
          <h2 className="shrink-0 whitespace-nowrap text-center text-sm leading-tight font-semibold min-[360px]:text-base">
            Round {toRoman(game.round)}
          </h2>
        </div>
      )}
      <div className="col-start-3 row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center">
        {!waiting && game.spectatorCount > 0 && <SpectatorCount count={game.spectatorCount} />}
        <Button
          variant="muted"
          className="col-start-2 row-start-1"
          onClick={onCopy}
          aria-label="Copy lobby invite"
        >
          <span
            className={`font-mono text-2xs leading-none min-[360px]:text-xs ${!waiting ? "hidden min-[440px]:inline" : ""}`}
          >
            {game.code}
          </span>
          {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
        </Button>
        <div className="col-start-3 row-start-1">
          {exitControl ?? (
            <Button variant="muted" size="icon" aria-label="Leave table" onClick={onLeave}>
              <LogOut className="size-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
