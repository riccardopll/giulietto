import { Globe2, Loader2, Users } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";

export const homeShellClass =
  "safe-area mx-auto min-h-svh max-w-6xl [--page-bottom:1rem] [--page-gutter:1rem] sm:[--page-gutter:2rem]";

export function HomeHeader() {
  return (
    <header className="site-header flex min-h-16 items-center justify-center py-1 sm:min-h-20">
      <a
        href="/"
        aria-label="Giulietto home"
        className="wordmark flex items-center gap-2 text-4xl text-primary"
      >
        <img src="/logo.png" width={48} height={48} alt="" className="size-12" />
        Giulietto
      </a>
    </header>
  );
}

type HomeProps = {
  name: string;
  code: string;
  ready: boolean;
  busy: boolean;
  onNameChange: (name: string) => void;
  onCodeChange: (code: string) => void;
  onAction: (action: "match" | "create" | "join") => void | Promise<void>;
};

const inputClass = "h-13 rounded-lg bg-card px-4 text-base md:text-base";
const actionClass = "h-auto min-h-12 w-full rounded-lg px-4 py-3 text-sm whitespace-normal";

export function Home({ name, code, ready, busy, onNameChange, onCodeChange, onAction }: HomeProps) {
  return (
    <main className="mx-auto w-full max-w-sm py-6 sm:py-8">
      <h1 className="text-center text-xl font-semibold">Play Giulietto online with friends</h1>
      <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
        A Neapolitan card game for 2–6 players. Predict your tricks and protect your lives.
      </p>
      <nav
        aria-label="About the game"
        className="mt-3 mb-7 flex justify-center gap-6 text-sm text-primary"
      >
        <a className="underline underline-offset-4" href="#about">
          About
        </a>
        <a className="underline underline-offset-4" href="#rules">
          How to play
        </a>
      </nav>
      <div data-nosnippet>
        <div className="grid gap-2.5">
          <label htmlFor="name" className="text-sm font-medium">
            Display name
          </label>
          <Input
            className={inputClass}
            id="name"
            maxLength={20}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Your name"
            autoComplete="nickname"
          />
        </div>
        <div className="mt-3.5 grid gap-3.5">
          <Button
            className={actionClass}
            disabled={!ready || busy || !name.trim()}
            onClick={() => void onAction("match")}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Globe2 className="size-5" />}
            Find matchmaking
          </Button>
          <Button
            variant="outline"
            className={actionClass}
            disabled={!ready || busy || !name.trim()}
            onClick={() => void onAction("create")}
          >
            <Users className="size-5" />
            Create private lobby
          </Button>
        </div>
        <form
          className="mt-7 grid gap-2.5 border-t pt-6"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void onAction("join");
          }}
        >
          <label htmlFor="lobby-code" className="text-sm font-medium">
            Lobby code
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <Input
              className={`${inputClass} tracking-wider uppercase placeholder:tracking-normal placeholder:normal-case`}
              id="lobby-code"
              name="table-invite"
              type="text"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              placeholder="Enter code"
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
              className="h-13 rounded-lg px-5"
              type="submit"
              variant="secondary"
              disabled={!ready || busy || !name.trim() || code.length !== 8}
            >
              Join
            </Button>
          </div>
        </form>
      </div>
      <section id="about" aria-labelledby="about-title" className="mt-10 scroll-mt-6 border-t pt-7">
        <h2 id="about-title" className="text-lg font-semibold">
          About Giulietto
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Giulietto is a multiplayer card game for 2–6 players, played with a 40-card Neapolitan
          deck. Each round, predict how many tricks you’ll win, then try to match your prediction.
          Every trick above or below your prediction costs a life. The last player with lives
          remaining wins.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Create a private lobby and share the code with friends, or find a public table. Play
          directly in your browser, with no download or account required.
        </p>
      </section>
      <section id="rules" aria-labelledby="rules-title" className="mt-8 scroll-mt-6 border-t pt-7">
        <h2 id="rules-title" className="text-lg font-semibold">
          How to play Giulietto
        </h2>
        <ol className="mt-3 list-decimal space-y-4 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">Join a table.</strong> Choose a display
            name, create a private lobby or find a public table. The host starts with 2–6 players
            and chooses 1–5 starting lives. The default is 3.
          </li>
          <li>
            <strong className="font-medium text-foreground">Predict your tricks.</strong> Rounds
            start with 6 cards per player, dropping to 1 before the cycle repeats. Bid how many
            tricks you expect to win. The last player to bid cannot make the total predictions equal
            the number of available tricks.
          </li>
          <li>
            <strong className="font-medium text-foreground">Play a card.</strong> Everyone plays one
            card per trick. You may play any card in your hand; there is no requirement to follow
            suit. The highest card wins, and the winner leads the next trick.
          </li>
          <li>
            <strong className="font-medium text-foreground">Know the card order.</strong> Coins beat
            cups, cups beat swords, and swords beat clubs. Within each suit, the order from low to
            high is ace, 2–7, jack, knight, king. The Ace of Coins is special: choose whether it is
            the lowest or highest card when you play it.
          </li>
          <li>
            <strong className="font-medium text-foreground">Keep your lives.</strong> Lose one life
            for each trick above or below your prediction. Predict 2 and win 3, for example, and you
            lose 1 life. At zero lives, you watch as a spectator. If everyone is eliminated in the
            same round, all players return with 1 life.
          </li>
          <li>
            <strong className="font-medium text-foreground">Play the blind round.</strong> With one
            card each, you see the other active players’ cards but not your own. Predict your trick
            before playing. Be the last player with lives remaining to win.
          </li>
        </ol>
      </section>
    </main>
  );
}
