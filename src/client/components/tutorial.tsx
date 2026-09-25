import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronLeft,
  CircleHelp,
  Copy,
  Heart,
  LogOut,
  MessageCircleMore,
  Smile,
  Target,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { Avatar } from "./avatar";
import { LifeCount } from "./lives";
import { BidButton } from "./match-board";
import { Score, TurnRing } from "./player-seat";
import { PlayingCard } from "./playing-card";
import { cn } from "../utils";
import { Button } from "@ui/button";
import { overlayClass } from "@ui/action-dialog";

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="my-4 rounded-xl bg-secondary px-3 py-4">
      <div inert>{children}</div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

function TrickDemo() {
  return (
    <Demo label="Three players each play a card. The 5 of Coins is strongest and takes the trick.">
      <div className="grid grid-cols-3 gap-3">
        {[
          { avatar: "king-clubs", card: 10 },
          { avatar: "queen-cups", card: 22 },
          { avatar: "queen-coins", card: 35, wins: true },
        ].map(({ avatar, card, wins }, index) => (
          <div key={card} className="flex min-w-0 flex-col items-center gap-3">
            <Avatar avatar={avatar} />
            <div
              className="w-full max-w-16 animate-[tutorial-trick_4s_ease-in-out_var(--delay)_infinite]"
              style={{ "--delay": `${index * 250}ms` } as CSSProperties}
            >
              <div
                className={cn(
                  "rounded-md",
                  wins && "animate-[tutorial-win_4s_ease-in-out_infinite]",
                )}
              >
                <PlayingCard card={card} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function PredictDemo() {
  return (
    <Demo label="With three cards, the others predicted 1 and 0. You can predict 0, 1 or 3, but not 2.">
      <div className="mb-4 flex justify-center">
        {[4, 30, 38].map((card, index) => (
          <div
            key={card}
            className="-mx-1 w-14 origin-bottom rotate-(--angle)"
            style={{ "--angle": `${(index - 1) * 6}deg` } as CSSProperties}
          >
            <PlayingCard card={card} />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-2">
        {[0, 1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "rounded-full",
              n === 1 && "animate-[tutorial-tap_4s_ease-in-out_infinite]",
            )}
          >
            <BidButton n={n} className="size-11" disabled={n === 2} />
          </span>
        ))}
      </div>
    </Demo>
  );
}

function StrengthDemo() {
  return (
    <Demo label="From weakest to strongest suit: Clubs, Swords, Cups, Coins.">
      <div className="grid grid-cols-4 gap-3">
        {[
          { card: 2, suit: "Clubs" },
          { card: 12, suit: "Swords" },
          { card: 22, suit: "Cups" },
          { card: 32, suit: "Coins" },
        ].map(({ card, suit }, index) => (
          <div
            key={card}
            className="min-w-0 animate-[tutorial-rise_4s_ease-in-out_var(--delay)_infinite]"
            style={{ "--delay": `${index * 250}ms` } as CSSProperties}
          >
            <PlayingCard card={card} />
            <span className="mt-2 block text-center text-xs font-semibold">{suit}</span>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function LivesDemo() {
  return (
    <Demo label="Predict 2 and win 4: you lose 2 lives.">
      <div className="grid grid-cols-3 items-center gap-2 text-center">
        <div>
          <span className="block text-xs text-muted-foreground">Predicted</span>
          <strong className="text-2xl">2</strong>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">Won</span>
          <strong className="text-2xl">4</strong>
        </div>
        <div className="flex justify-center gap-1 text-destructive">
          {[0, 1, 2].map((heart) => (
            <Heart
              key={heart}
              className={cn(
                "size-6",
                heart > 0 && "animate-[tutorial-life_4s_ease-in-out_var(--delay)_infinite]",
              )}
              style={{ "--delay": `${(2 - heart) * 250}ms` } as CSSProperties}
              fill="currentColor"
            />
          ))}
        </div>
      </div>
    </Demo>
  );
}

function RoundsDemo() {
  return (
    <Demo label="Cards per player each round: 6, 5, 4, 3, 2, 1, then back to 6.">
      <ol className="flex justify-between">
        {[6, 5, 4, 3, 2, 1].map((count, index) => (
          <li
            key={count}
            className="grid h-12 w-9 place-items-center rounded-md border bg-card text-lg font-semibold tabular-nums animate-[tutorial-count_6s_ease-in-out_var(--delay)_infinite]"
            style={{ "--delay": `${index}s` } as CSSProperties}
          >
            {count}
          </li>
        ))}
      </ol>
    </Demo>
  );
}

function SeatDemo() {
  return (
    <Demo label="Your seat on the table: the ring shows it is your turn.">
      <div className="flex items-center justify-center gap-3">
        <div className="relative size-10 shrink-0">
          <TurnRing remaining={100} duration={4000} loop />
          <Avatar avatar="king-cups" className="size-full" />
        </div>
        <span className="flex flex-col gap-0.5">
          <strong className="text-sm text-primary">You</strong>
          <span className="flex items-center gap-1 text-xs">
            <LifeCount n={3} />
            <Score taken={1} bid={2} />
          </span>
        </span>
      </div>
    </Demo>
  );
}

function Legend({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex w-16 shrink-0 justify-center gap-1 pt-0.5" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

const steps: { title: string; body: ReactNode }[] = [
  {
    title: "The goal",
    body: (
      <>
        <p>
          Each round, predict how many tricks you will win. You lose a life for every trick you are
          off by. The last player with lives wins.
        </p>
        <TrickDemo />
        <p>A trick is one card from each player. The strongest card takes it.</p>
      </>
    ),
  },
  {
    title: "Predict",
    body: (
      <>
        <p>Look at your hand, then tap how many tricks you expect to win.</p>
        <PredictDemo />
        <p>
          The last player can’t make the predictions add up to the cards in hand, so someone always
          misses. Here the others said 1 and 0, so 2 is blocked.
        </p>
      </>
    ),
  },
  {
    title: "Play",
    body: (
      <>
        <p>Take turns playing any card you like. The strongest card wins the trick.</p>
        <StrengthDemo />
        <p>
          Suits beat ranks: any Coins card beats any Cups card. Within a suit, the Ace is lowest and
          the King highest.
        </p>
      </>
    ),
  },
  {
    title: "The Ace of Coins",
    body: (
      <>
        <p>When you play the Ace of Coins, you choose what it is worth.</p>
        <Demo label="The Ace of Coins can be played low or high.">
          <div className="flex justify-center gap-6">
            <div className="w-20">
              <PlayingCard card={31} mode="low" />
            </div>
            <div className="w-20">
              <PlayingCard card={31} mode="high" />
            </div>
          </div>
        </Demo>
        <p>Low makes it the weakest card in the game. High makes it the strongest.</p>
      </>
    ),
  },
  {
    title: "Lives",
    body: (
      <>
        <p>After the last trick, you lose one life for each trick you are off by.</p>
        <LivesDemo />
        <p>
          At zero lives, you watch the rest of the game. If everyone runs out at once, everyone
          comes back with one life.
        </p>
      </>
    ),
  },
  {
    title: "Rounds",
    body: (
      <>
        <p>Hands shrink by one card each round, then start again at six.</p>
        <RoundsDemo />
        <p>With one card each, you see everyone’s card except your own.</p>
        <Demo label="In the one-card round, their card is visible and yours is hidden.">
          <div className="flex justify-center gap-6 text-xs">
            <div className="w-16 text-center">
              <PlayingCard card={22} />
              <span className="mt-2 block">Theirs</span>
            </div>
            <div className="w-16 text-center">
              <PlayingCard card={null} />
              <span className="mt-2 block">Yours</span>
            </div>
          </div>
        </Demo>
      </>
    ),
  },
  {
    title: "The table",
    body: (
      <>
        <SeatDemo />
        <ul className="space-y-3">
          <Legend
            icon={
              <span className="flex items-center gap-1 text-xs">
                <LifeCount n={3} />
                <Score taken={1} bid={2} />
              </span>
            }
          >
            Lives left, then tricks won and predicted.
          </Legend>
          <Legend icon={<span className="size-5 rounded-full border-2 border-primary" />}>
            Whose turn it is and the time left.
          </Legend>
          <Legend
            icon={
              <>
                <Target className="size-5 text-foreground/60" strokeWidth={1.5} />
                <span className="text-xs font-semibold">7</span>
                <span className="rounded-full bg-destructive px-1.5 text-xs leading-5 font-semibold text-primary-foreground">
                  +1
                </span>
              </>
            }
          >
            All predictions added up, and how far they are from the cards in hand.
          </Legend>
          <Legend
            icon={
              <>
                <MessageCircleMore className="size-5 text-primary" />
                <Smile className="size-5 text-primary" />
              </>
            }
          >
            Chat and reactions.
          </Legend>
          <Legend
            icon={
              <>
                <Copy className="size-5 text-muted-foreground" />
                <LogOut className="size-5 text-muted-foreground" />
              </>
            }
          >
            Copy the invite, or leave.
          </Legend>
        </ul>
      </>
    ),
  },
];

function Steps() {
  const [step, setStep] = useState(0);
  const last = step === steps.length - 1;
  return (
    <>
      <div
        key={step}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed animate-[page-in_.2s_ease-out]"
      >
        <h3 className="mb-2 text-base font-semibold">{steps[step].title}</h3>
        {steps[step].body}
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t px-3 py-3">
        <Button
          variant="ghost"
          size="icon"
          className={cn(step === 0 && "invisible")}
          aria-label="Previous"
          onClick={() => setStep(step - 1)}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <ol
          className="flex flex-1 justify-center gap-1.5"
          aria-label={`Step ${step + 1} of ${steps.length}`}
        >
          {steps.map(({ title }, index) => (
            <li
              key={title}
              className={cn(
                "h-2 w-2 rounded-full bg-border transition-all",
                index === step && "w-5 bg-primary",
              )}
            />
          ))}
        </ol>
        {last ? (
          <Dialog.Close asChild>
            <Button>Got it</Button>
          </Dialog.Close>
        ) : (
          <Button onClick={() => setStep(step + 1)}>Next</Button>
        )}
      </div>
    </>
  );
}

export function Tutorial() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="link" aria-label="How to play">
          <CircleHelp className="size-5" /> How to play
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(38rem,calc(100dvh-2rem))] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-lg outline-none data-[state=open]:animate-dialog-in"
        >
          <div className="flex shrink-0 items-center justify-between border-b py-1 pr-2 pl-5">
            <Dialog.Title className="text-lg font-semibold">How to play</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close tutorial">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Steps />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
