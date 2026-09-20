import { useEffect, useRef, useState } from "react";
import { CircleHelp, Copy, LogOut, MessageCircle, RotateCcw, Smile, Target, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { PlayingCard } from "./playing-card";
import { LifeCount } from "./lives";
import { Button } from "./ui/button";
import { overlayClass } from "./ui/action-dialog";

function TrickExample() {
  const table = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const animations = Array.from(table.current!.children).flatMap((card, index) => [
      card.animate(
        [
          { opacity: 0, transform: "translateY(18px) scale(.94)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 240, delay: index * 450, easing: "ease-out", fill: "backwards" },
      ),
      card.animate(
        [
          { opacity: 1, transform: "translate(0,0) scale(1)" },
          { opacity: 0, transform: `translate(${(1 - index) * 76}px,-70px) scale(.22)` },
        ],
        { duration: 380, delay: 2000 + index * 18, easing: "cubic-bezier(.4,0,.2,1)" },
      ),
    ]);
    return () => animations.forEach((animation) => animation.cancel());
  }, [replay]);
  return (
    <figure className="my-4 rounded-xl bg-secondary px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <span className="font-semibold">Coins wins this trick</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Replay trick animation"
          onClick={() => setReplay(replay + 1)}
        >
          <RotateCcw className="size-4" />
        </Button>
      </div>
      <div ref={table} className="flex justify-center gap-3 py-1">
        {[10, 35, 22].map((card) => (
          <div key={card} className="w-16">
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

            <h3 className="mb-1 mt-5 font-semibold">Predict, then play</h3>
            <p>
              Each round deals 6 cards, then 5, 4, 3, 2 and 1 before repeating. On your turn, tap a
              number in the centre to predict your wins. The last player can’t make everyone’s
              predictions add up to the number of tricks; that option is disabled.
            </p>
            <p className="mt-2">
              A trick is one card from each player. Tap any card in your hand when it’s your turn.
              You don’t have to follow suit. The strongest card wins the trick.
            </p>

            <h3 className="mb-1 mt-5 font-semibold">Which card wins?</h3>
            <p>
              From weakest to strongest: <strong>Clubs → Swords → Cups → Coins</strong>. Any card in
              a stronger suit beats every card in a weaker suit. Within each suit: Ace, 2–7, Jack,
              Knight, King.
            </p>
            <TrickExample />
            <p>
              The <strong>Ace of Coins</strong> is special: when you play it, choose Low (0,
              weakest) or High (41, strongest).
            </p>
            <div className="my-3 flex justify-center gap-5" aria-label="Ace of Coins choices">
              <div className="w-16">
                <PlayingCard card={31} mode="low" />
              </div>
              <div className="w-16">
                <PlayingCard card={31} mode="high" />
              </div>
            </div>

            <h3 className="mb-1 mt-5 font-semibold">Keep your lives</h3>
            <p>
              Lose one life for each trick above or below your prediction. Predict 2 and win 4? Lose
              2 lives. An exact prediction costs nothing. At zero lives, you watch the rest of the
              game. If everyone goes out together, everyone gets one life and play continues.
            </p>
            <p className="mt-2">
              In the <strong>one-card round</strong>, you see everyone’s card except your own.
              Predict using what you can see, then play your hidden card.
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
              <dt className="text-center font-semibold text-primary">Ring</dt>
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
