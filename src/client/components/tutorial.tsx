import { useEffect, useState } from "react";
import { CircleHelp, Copy, LogOut, MessageCircleMore, Smile, Target, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Avatar } from "./avatar";
import { PlayingCard } from "./playing-card";
import { LifeCount } from "./lives";
import { Button } from "./ui/button";
import { overlayClass } from "./ui/action-dialog";

function PredictionExample() {
  const [bid, setBid] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setBid((value) => (value === null ? 2 : null)), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <figure className="my-4 rounded-xl bg-secondary px-3 py-4" aria-label="Prediction example">
      <div aria-hidden="true">
        <div className="flex flex-col items-center gap-2">
          {[
            [0, 1, 2],
            [3, 4, 5, 6],
          ].map((numbers) => (
            <div key={numbers[0]} className="flex justify-center gap-2">
              {numbers.map((number) => (
                <span
                  key={number}
                  className={`grid size-11 place-items-center rounded-lg border text-xl font-semibold transition-colors ${bid === number ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  {number}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function TrickExample() {
  return (
    <figure className="my-4 rounded-xl bg-secondary px-3 py-4" aria-label="Trick example">
      <div className="mb-4 text-center text-sm font-semibold">5 of Coins wins this trick</div>
      <div className="flex justify-center gap-3 py-1" aria-hidden="true">
        {[10, 22, 35].map((card, index) => (
          <div
            key={card}
            className="w-16 animate-[tutorial-trick_4s_ease-in-out_infinite]"
            style={{ animationDelay: `${index * 300}ms` }}
          >
            <PlayingCard card={card} />
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        King of Clubs &lt; 2 of Cups &lt; 5 of Coins.
      </figcaption>
    </figure>
  );
}

function TurnExample() {
  return (
    <span className="relative mx-auto block size-11" aria-label="Turn timer">
      <Avatar avatar="king-cups" />
      <svg
        viewBox="0 0 50 50"
        className="absolute -inset-1 size-[calc(100%+8px)] -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="25"
          cy="25"
          r="23"
          pathLength="100"
          className="fill-none stroke-primary stroke-[3] animate-[tutorial-timer_4s_linear_infinite]"
        />
      </svg>
    </span>
  );
}

export function Tutorial() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="link" className="gap-2" aria-label="How to play">
          <CircleHelp className="size-5" /> How to play
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-lg outline-none data-[state=open]:animate-[dialog-in_.2s_ease-out]"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-5 py-2">
            <Dialog.Title className="text-lg font-semibold">How to play</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close tutorial">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed">
            <p>
              Win exactly as many tricks as you predict. The last player with lives wins.
              <strong className="block">A trick is one card from each player.</strong>
            </p>

            <h3 className="mb-1 mt-5 font-semibold">Prediction round</h3>
            <p>Look at your hand. On your turn, tap the number of tricks you expect to win.</p>
            <PredictionExample />
            <p>
              <strong>The last prediction can’t make the total equal the available tricks.</strong>{" "}
              Cards per player: 6 → 5 → 4 → 3 → 2 → 1, then repeat.
            </p>

            <h3 className="mb-1 mt-5 font-semibold">Playing round</h3>
            <p>On your turn, tap a card. The strongest card wins the trick.</p>
            <figure className="my-4" aria-label="Suit strength">
              <figcaption className="mb-3 text-center text-xs text-muted-foreground">
                Weakest → strongest. Suit beats rank.
              </figcaption>
              <div className="mx-auto grid max-w-xs grid-cols-4 gap-3">
                {[
                  { card: 2, suit: "Clubs" },
                  { card: 12, suit: "Swords" },
                  { card: 22, suit: "Cups" },
                  { card: 32, suit: "Coins" },
                ].map(({ card, suit }) => (
                  <div key={card} className="min-w-0">
                    <PlayingCard card={card} />
                    <span className="mt-2 block text-center text-xs font-semibold">{suit}</span>
                  </div>
                ))}
              </div>
            </figure>
            <TrickExample />
            <p>
              For the <strong>Ace of Coins</strong>, choose Low (weakest) or High (strongest).
            </p>
            <div className="my-3 flex justify-center gap-5" aria-label="Ace of Coins choices">
              <div className="w-16">
                <PlayingCard card={31} mode="low" />
              </div>
              <div className="w-16">
                <PlayingCard card={31} mode="high" />
              </div>
            </div>
            <p>Each trick above or below your prediction costs one life.</p>
            <figure className="my-4 grid grid-cols-3 gap-2 rounded-xl bg-secondary px-3 py-3 text-center">
              <div>
                <span className="block text-xs text-muted-foreground">Predicted</span>
                <strong className="text-xl">2</strong>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Won</span>
                <strong className="text-xl">4</strong>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Lives lost</span>
                <span className="inline-flex items-center gap-1 text-xl" aria-label="Lose 2 lives">
                  <span aria-hidden="true">−</span>
                  <span aria-hidden="true">
                    <LifeCount n={2} className="flex-row-reverse" />
                  </span>
                </span>
              </div>
              <figcaption className="sr-only">Predict 2 and win 4: lose 2 lives.</figcaption>
            </figure>
            <p>Zero lives? You spectate. If everyone goes out, everyone returns with one life.</p>

            <h3 className="mb-1 mt-5 font-semibold">Blind round</h3>
            <p>With one card each, you see everyone’s card except your own.</p>
            <figure className="my-4">
              <div className="flex justify-center gap-5" aria-hidden="true">
                <div className="w-16">
                  <PlayingCard card={22} />
                  <span className="mt-2 block text-center text-xs">Theirs</span>
                </div>
                <div className="w-16">
                  <PlayingCard card={null} />
                  <span className="mt-2 block text-center text-xs">Yours</span>
                </div>
              </div>
              <figcaption className="sr-only">
                In the one-card round, their card is visible and yours is hidden.
              </figcaption>
            </figure>

            <h3 className="mb-2 mt-5 font-semibold">Reading the table</h3>
            <dl className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
              <dt className="flex items-center justify-center gap-1 pt-1 text-xs">
                <LifeCount n={3} />
                <span
                  className="inline-flex items-center gap-0.5 border-l border-foreground/10 pl-1 font-semibold whitespace-nowrap tabular-nums"
                  aria-label="1 trick won, 2 predicted"
                >
                  <span className="text-destructive">1</span>
                  <span className="font-normal text-muted-foreground/70">/</span>
                  <span>2</span>
                </span>
              </dt>
              <dd>
                Lives remaining. <strong>1 / 2</strong> beside them means 1 trick won, 2 predicted.
              </dd>
              <dt className="py-1">
                <TurnExample />
              </dt>
              <dd>
                The ring marks the current turn and time left. Out of time? The game acts for you.
              </dd>
              <dt
                className="flex items-center justify-center gap-1 pt-1 text-xs font-semibold tabular-nums"
                aria-label="7 tricks predicted, 1 over the 6 available tricks"
              >
                <Target
                  className="size-5 shrink-0 text-foreground/60"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span aria-hidden="true">7</span>
                <span
                  className="rounded-full bg-destructive px-1.5 leading-5 text-primary-foreground"
                  aria-hidden="true"
                >
                  +1
                </span>
              </dt>
              <dd>Total predictions, and how far over or under the available tricks.</dd>
              <dt className="flex justify-center gap-2 pt-1">
                <MessageCircleMore className="size-5" aria-label="Chat" />
                <Smile className="size-5" aria-label="Emotes" />
              </dt>
              <dd>Side tabs open chat and reactions.</dd>
              <dt className="flex justify-center gap-2 pt-1">
                <Copy className="size-5" aria-label="Copy invite" />
                <LogOut className="size-5" aria-label="Leave table" />
              </dt>
              <dd>
                Copy an invite or leave. Leaving forfeits the game and all your lives. You can
                rejoin as a spectator.
              </dd>
            </dl>
            <Dialog.Close asChild>
              <Button className="mt-5 w-full">Got it</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
