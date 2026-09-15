import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { Lock, Smile } from "lucide-react";
import { EMOTE_COOLDOWN_MS, EMOTE_DURATION_MS, type Emote } from "../../shared/emotes";
import type { GameView } from "../../shared/game";
import { Button } from "./ui/button";
import { Bubble, MenuBubble, SideBubble, type Side } from "./bubble";
import { AnimatedWebp, preloadWebp } from "./animated-webp";

function useRecent(sentAt: number | undefined, serverTime: number, duration: number) {
  const [expired, setExpired] = useState<number>();
  const remaining = sentAt === undefined ? 0 : duration - (serverTime - sentAt);
  useEffect(() => {
    if (sentAt === undefined || remaining <= 0) return;
    const timer = setTimeout(() => setExpired(sentAt), remaining);
    return () => clearTimeout(timer);
  }, [sentAt, remaining]);
  return sentAt !== undefined && expired !== sentAt && remaining > 0;
}

function Chicken({ animated = false }: { animated?: boolean }) {
  return (
    <span className="absolute inset-0 [clip-path:inset(-30px_0_2.5px_0)]">
      <span className="absolute -bottom-[7.5px] left-1/2 h-[84.375px] w-[62.5px] -translate-x-[60%]">
        {animated ? (
          <AnimatedWebp src="/emotes/chicken.webp" poster="/emotes/chicken-still.webp" />
        ) : (
          <img
            src="/emotes/chicken-still.webp"
            alt=""
            className="size-full object-contain"
            draggable={false}
          />
        )}
      </span>
    </span>
  );
}

function Perso({ animated = false }: { animated?: boolean }) {
  return (
    <span className="absolute -left-6 -top-[32.55px] h-[90px] w-[108px]">
      {animated ? (
        <AnimatedWebp src="/emotes/perso.webp" poster="/emotes/perso-still.webp" />
      ) : (
        <img
          src="/emotes/perso-still.webp"
          alt=""
          className="size-full object-contain"
          draggable={false}
        />
      )}
    </span>
  );
}

const art: Record<Emote["id"], typeof Chicken> = { chicken: Chicken, perso: Perso };
const emotes: { id: Emote["id"]; label: string }[] = [
  { id: "chicken", label: "Send chicken emote" },
  { id: "perso", label: "Send Perso emote" },
];

export function EmoteBubble({
  emote,
  serverTime,
  name,
}: {
  emote?: Emote;
  serverTime: number;
  name: string;
}) {
  const visible = useRecent(emote?.sentAt, serverTime, EMOTE_DURATION_MS);
  if (!emote || !visible) return null;
  const Art = art[emote.id];
  return (
    <Bubble key={emote.sentAt} label={`${name} sent the ${emote.id} emote`}>
      <Art animated />
    </Bubble>
  );
}

function SideReaction({
  emote,
  serverTime,
  name,
}: {
  emote: Emote;
  serverTime: number;
  name: string;
}) {
  const visible = useRecent(emote.sentAt, serverTime, EMOTE_DURATION_MS);
  if (!visible) return null;
  const Art = art[emote.id];
  return (
    <SideBubble label={`${name} sent the ${emote.id} emote`} {...placement(emote)}>
      <Art animated />
    </SideBubble>
  );
}

// A random side and height per reaction; the timestamp keeps every client in agreement.
function placement(emote: Emote): { side: Side; top: number } {
  return {
    side: emote.sentAt % 2 ? "right" : "left",
    top: 8 + (Math.floor(emote.sentAt / 2) % 65),
  };
}

/** Reactions from spectators and eliminated players, each at its own spot along the edges. */
export function ReactionRail({ game }: { game: GameView }) {
  const reactions = [
    ...(game.spectators ?? []),
    ...game.players.filter((player) => player.lives <= 0),
  ]
    .flatMap((sender) =>
      sender.emote && game.serverTime - sender.emote.sentAt < EMOTE_DURATION_MS
        ? [{ ...sender, emote: sender.emote }]
        : [],
    )
    .sort((a, b) => a.emote.sentAt - b.emote.sentAt);
  return (
    <div className="reaction-rail pointer-events-none relative z-30 col-span-full row-start-3 min-h-0">
      {reactions.map((sender) => (
        <SideReaction
          key={`${sender.id}-${sender.emote.sentAt}`}
          emote={sender.emote}
          serverTime={game.serverTime}
          name={sender.name}
        />
      ))}
    </div>
  );
}

export function EmotePicker({
  open,
  onOpenChange,
  disabled,
  emote,
  serverTime,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  emote?: Emote;
  serverTime: number;
  onSend: (emote: Emote["id"]) => void;
}) {
  useEffect(() => {
    void preloadWebp("/emotes/chicken.webp").catch(() => {});
    void preloadWebp("/emotes/perso.webp").catch(() => {});
  }, []);
  const coolingDown = useRecent(emote?.sentAt, serverTime, EMOTE_COOLDOWN_MS);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="pointer-events-auto absolute right-[2%] top-1/2 -translate-y-1/2 h-11 w-11 shrink-0 rounded-none bg-transparent p-0 text-primary hover:bg-transparent focus-visible:outline-ring disabled:text-muted-foreground disabled:opacity-100"
          disabled={disabled || coolingDown}
          aria-label="Emotes"
        >
          <span className="absolute inset-y-0 right-0 grid w-8 place-items-center rounded-l-2xl bg-background shadow-sm">
            <Smile className="size-6" aria-hidden="true" />
          </span>
        </Button>
      </Popover.Trigger>
      <Popover.Anchor className="pointer-events-none absolute left-1/2 -bottom-[4.5rem] size-px -translate-x-1/2 @min-2xl/board:-bottom-[5.5rem]" />
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={16}
          collisionPadding={12}
          aria-label="Emotes"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 grid w-auto grid-cols-3 gap-1 sm:gap-3 bg-transparent p-2"
        >
          {emotes.map(({ id, label }) => {
            const Art = art[id];
            return (
              <button
                key={id}
                type="button"
                className="block"
                aria-label={label}
                onClick={() => {
                  if (disabled || coolingDown) return;
                  onSend(id);
                  onOpenChange(false);
                }}
              >
                <MenuBubble>
                  <Art />
                </MenuBubble>
              </button>
            );
          })}
          <button
            type="button"
            disabled
            aria-label="Empty emote slot 1"
            className="block opacity-60"
          >
            <MenuBubble>
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Lock className="size-5" aria-hidden="true" />
              </span>
            </MenuBubble>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
