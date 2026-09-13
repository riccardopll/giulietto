import { ChevronRight, Link, Loader2, Play } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { TrophyIcon } from "./ui/trophy-icon";
import { PlayingCard } from "./playing-card";

function PlayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-5" aria-hidden="true">
      <circle cx="12" cy="6.5" r="3.5" />
      <circle cx="4.5" cy="9" r="2.5" />
      <circle cx="19.5" cy="9" r="2.5" />
      <path d="M4.5 13A4.5 4.5 0 0 0 0 17.5V20h4v-2a8 8 0 0 1 1.6-4.8A4.5 4.5 0 0 0 4.5 13ZM19.5 13a4.5 4.5 0 0 0-1.1.2A8 8 0 0 1 20 18v2h4v-2.5a4.5 4.5 0 0 0-4.5-4.5ZM12 12a6 6 0 0 0-6 6v3h12v-3a6 6 0 0 0-6-6Z" />
    </svg>
  );
}

export function Home({
  code,
  ready,
  busy,
  onCodeChange,
  onAction,
  onLeaderboard,
}: {
  code: string;
  ready: boolean;
  busy: boolean;
  onCodeChange: (code: string) => void;
  onAction: (action: "match" | "create" | "join") => void | Promise<void>;
  onLeaderboard: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col pb-8 pt-7 sm:pt-10">
      <div
        className="relative mx-auto mb-9 h-52 w-64 sm:mb-12 sm:h-64 sm:w-80"
        aria-label="Neapolitan cards"
      >
        <div className="absolute left-3 top-4 w-[37%] -rotate-15">
          <PlayingCard card={1} />
        </div>
        <div className="absolute right-3 top-4 w-[37%] rotate-15">
          <PlayingCard card={31} />
        </div>
        <div className="absolute left-1/2 top-0 z-10 w-[37%] -translate-x-1/2">
          <PlayingCard card={30} />
        </div>
      </div>
      <div className="grid gap-3">
        <Button size="large" disabled={!ready || busy} onClick={() => void onAction("match")}>
          {busy ? <Loader2 className="animate-spin" /> : <Play className="size-5 fill-current" />}
          Find a game
        </Button>
        <Button
          size="large"
          variant="outline"
          disabled={!ready || busy}
          onClick={() => void onAction("create")}
        >
          <PlayersIcon /> Create private lobby
        </Button>
      </div>
      <form
        className="mt-7 grid gap-4"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void onAction("join");
        }}
      >
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          Have a code?
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>
        <label htmlFor="lobby-code" className="sr-only">
          Lobby code
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div className="relative min-w-0">
            <Link
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="h-13 bg-card pl-11 pr-4 text-base tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal md:text-base"
              id="lobby-code"
              name="table-invite"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              placeholder="Enter lobby code"
              required
              minLength={8}
              maxLength={8}
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) =>
                onCodeChange(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())
              }
            />
          </div>
          <Button size="large" type="submit" disabled={!ready || busy}>
            Join
          </Button>
        </div>
      </form>
      <Button variant="link" className="mx-auto mt-6 gap-3" onClick={onLeaderboard}>
        <TrophyIcon className="size-5" />
        Leaderboard
        <ChevronRight />
      </Button>
    </main>
  );
}
