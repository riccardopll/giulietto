import { ChevronRight, Globe2, Loader2, Trophy, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PlayingCard } from "./playing-card";

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
          {busy ? <Loader2 className="animate-spin" /> : <Globe2 />} Find a game
        </Button>
        <Button
          size="large"
          variant="outline"
          disabled={!ready || busy}
          onClick={() => void onAction("create")}
        >
          <Users /> Create private lobby
        </Button>
      </div>
      <form
        className="mt-7 grid gap-3 border-t pt-6"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void onAction("join");
        }}
      >
        <label htmlFor="lobby-code" className="sr-only">
          Lobby code
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <Input
            className="h-13 bg-card px-4 text-base tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal md:text-base"
            id="lobby-code"
            name="table-invite"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            placeholder="Enter lobby code"
            maxLength={8}
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) =>
              onCodeChange(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())
            }
          />
          <Button
            size="large"
            type="submit"
            variant="secondary"
            disabled={!ready || busy || code.length !== 8}
          >
            Join
          </Button>
        </div>
      </form>
      <Button variant="link" className="mx-auto mt-6 gap-3" onClick={onLeaderboard}>
        <Trophy className="fill-current" />
        Leaderboard
        <ChevronRight />
      </Button>
    </main>
  );
}
