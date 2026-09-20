import { useEffect, useState } from "react";
import { CircleHelp, Copy, LogOut, MessageCircle, Smile, Target, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { Avatar } from "./avatar";
import { PredictionEmote } from "./prediction-emote";
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
        <div className="relative mx-auto mb-4 w-fit pt-14">
          <div className="absolute top-0 left-1/2 -translate-x-1/2">
            <PredictionEmote bid={bid} name="You" />
          </div>
          <Avatar avatar="king-cups" />
        </div>
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
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">
        Choose 2: you’re predicting two trick wins.
      </figcaption>
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
              Predict how many tricks you’ll win, then try to win exactly that many. Keep your lives
              to be the last player standing.
            </p>

            <h3 className="mb-1 mt-5 font-semibold">Prediction round</h3>
            <p>
              Look at your hand and predict how many tricks you’ll win. On your turn, tap a number
              in the centre. A trick is one card from each player.
            </p>
            <PredictionExample />
            <p>
              The last player can’t make everyone’s predictions add up to the number of tricks; that
              option is disabled. Cards per player go from 6 down to 1, then repeat.
            </p>
            <p className="mt-2">
              In the <strong>one-card round</strong>, you see everyone’s card except your own.
              Predict using what you can see.
            </p>
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

            <h3 className="mb-1 mt-5 font-semibold">Playing round</h3>
            <p>
              Tap any card in your hand when it’s your turn. You don’t have to follow suit. The
              strongest card wins the trick.
            </p>
            <p className="mt-2">
              Suits rank <strong>Clubs → Swords → Cups → Coins</strong>, weakest to strongest. Any
              card in a stronger suit beats every card in a weaker suit. Within each suit: Ace, 2–7,
              Jack, Knight, King.
            </p>
            <TrickExample />
            <p>
              The <strong>Ace of Coins</strong> is special: choose Low (0, weakest) or High (41,
              strongest) when you play it.
            </p>
            <div className="my-3 flex justify-center gap-5" aria-label="Ace of Coins choices">
              <div className="w-16">
                <PlayingCard card={31} mode="low" />
              </div>
              <div className="w-16">
                <PlayingCard card={31} mode="high" />
              </div>
            </div>
            <p>
              At the end of the round, lose one life for each trick above or below your prediction.
              An exact prediction costs nothing.
            </p>
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
                <span className="text-xl">
                  <LifeCount n={2} />
                </span>
              </div>
              <figcaption className="sr-only">Predict 2 and win 4: lose 2 lives.</figcaption>
            </figure>
            <p>
              At zero lives, you watch the rest of the game. If everyone goes out together, everyone
              gets one life and play continues.
            </p>

            <h3 className="mb-2 mt-5 font-semibold">Reading the table</h3>
            <dl className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3">
              <dt className="flex justify-center pt-1">
                <LifeCount n={3} />
              </dt>
              <dd>
                Hearts show lives remaining. Beside them, <strong>1 / 2</strong> means 1 trick won
                out of 2 predicted.
              </dd>
              <dt className="py-1">
                <TurnExample />
              </dt>
              <dd>
                The shrinking ring around an avatar marks whose turn it is and the time left. If
                time runs out, the game acts for you.
              </dd>
              <dt className="flex justify-center pt-1">
                <Target className="size-5" aria-label="Prediction total" />
              </dt>
              <dd>
                The target shows total predictions and how far over or under the available tricks
                they are.
              </dd>
              <dt className="flex justify-center gap-2 pt-1">
                <MessageCircle className="size-5" aria-label="Chat" />
                <Smile className="size-5" aria-label="Emotes" />
              </dt>
              <dd>
                Use the table’s side tabs for chat and reactions. Your cards sit along the bottom;
                played cards appear in the centre.
              </dd>
              <dt className="flex justify-center gap-2 pt-1">
                <Copy className="size-5" aria-label="Copy invite" />
                <LogOut className="size-5" aria-label="Leave table" />
              </dt>
              <dd>
                At the top, copy the lobby invite or leave the table. If you leave mid-game, your
                seat plays automatically; rejoin with the code to resume.
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
