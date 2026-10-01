import { type CSSProperties, type ReactNode } from "react";
import { Copy, Heart, LogOut, MessageCircleMore, Smile, Target } from "lucide-react";
import { Avatar } from "./avatar";
import { LifeCount } from "./lives";
import { BidButton } from "./match-board";
import { Score, TurnRing } from "./player-seat";
import { PlayingCard } from "./playing-card";
import { t } from "../i18n";
import { cn } from "../utils";
import { PageHeading } from "@ui/page-heading";

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
    <Demo label={t.howToPlay.goal.demo}>
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
    <Demo label={t.howToPlay.predict.demo}>
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
    <Demo label={t.howToPlay.play.demo}>
      <div className="grid grid-cols-4 gap-3">
        {t.cards.suits
          .map((suit, index) => ({ card: index * 10 + 2, suit }))
          .map(({ card, suit }, index) => (
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
    <Demo label={t.howToPlay.lives.demo}>
      <div className="grid grid-cols-3 items-center gap-2 text-center">
        <div>
          <span className="block text-xs text-muted-foreground">{t.howToPlay.lives.predicted}</span>
          <strong className="text-2xl">2</strong>
        </div>
        <div>
          <span className="block text-xs text-muted-foreground">{t.howToPlay.lives.won}</span>
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
    <Demo label={t.howToPlay.rounds.demo}>
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
    <Demo label={t.howToPlay.table.seat}>
      <div className="flex items-center justify-center gap-3">
        <div className="relative size-10 shrink-0">
          <TurnRing remaining={100} duration={4000} loop />
          <Avatar avatar="king-cups" className="size-full" />
        </div>
        <span className="flex flex-col gap-0.5">
          <strong className="text-sm text-primary">{t.you}</strong>
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

function sections(): { title: string; body: ReactNode }[] {
  const { goal, predict, play, ace, lives, rounds, table } = t.howToPlay;
  return [
    {
      title: goal.title,
      body: (
        <>
          <p>{goal.intro}</p>
          <TrickDemo />
          <p>{goal.outro}</p>
        </>
      ),
    },
    {
      title: predict.title,
      body: (
        <>
          <p>{predict.intro}</p>
          <PredictDemo />
          <p>{predict.outro}</p>
        </>
      ),
    },
    {
      title: play.title,
      body: (
        <>
          <p>{play.intro}</p>
          <StrengthDemo />
          <p>{play.outro}</p>
        </>
      ),
    },
    {
      title: ace.title,
      body: (
        <>
          <p>{ace.intro}</p>
          <Demo label={ace.demo}>
            <div className="flex justify-center gap-6">
              <div className="w-20">
                <PlayingCard card={31} mode="low" />
              </div>
              <div className="w-20">
                <PlayingCard card={31} mode="high" />
              </div>
            </div>
          </Demo>
          <p>{ace.outro}</p>
        </>
      ),
    },
    {
      title: lives.title,
      body: (
        <>
          <p>{lives.intro}</p>
          <LivesDemo />
          <p>{lives.outro}</p>
        </>
      ),
    },
    {
      title: rounds.title,
      body: (
        <>
          <p>{rounds.intro}</p>
          <RoundsDemo />
          <p>{rounds.blind}</p>
          <Demo label={rounds.blindDemo}>
            <div className="flex justify-center gap-6 text-xs">
              <div className="w-16 text-center">
                <PlayingCard card={22} />
                <span className="mt-2 block">{rounds.theirs}</span>
              </div>
              <div className="w-16 text-center">
                <PlayingCard card={null} />
                <span className="mt-2 block">{rounds.yours}</span>
              </div>
            </div>
          </Demo>
        </>
      ),
    },
    {
      title: table.title,
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
              {table.score}
            </Legend>
            <Legend icon={<span className="size-5 rounded-full border-2 border-primary" />}>
              {table.turn}
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
              {table.tally}
            </Legend>
            <Legend
              icon={
                <>
                  <MessageCircleMore className="size-5 text-primary" />
                  <Smile className="size-5 text-primary" />
                </>
              }
            >
              {table.chat}
            </Legend>
            <Legend
              icon={
                <>
                  <Copy className="size-5 text-muted-foreground" />
                  <LogOut className="size-5 text-muted-foreground" />
                </>
              }
            >
              {table.invite}
            </Legend>
          </ul>
        </>
      ),
    },
  ];
}

export function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <main className="mx-auto w-full max-w-md animate-[page-in_.2s_ease-out] pb-8">
      <PageHeading title={t.howToPlay.title} onBack={onBack} />
      <div className="space-y-8 px-1 text-sm leading-relaxed">
        {sections().map(({ title, body }) => (
          <section key={title}>
            <h2 className="mb-2 text-lg font-semibold">{title}</h2>
            {body}
          </section>
        ))}
      </div>
    </main>
  );
}
