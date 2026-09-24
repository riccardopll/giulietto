import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { Smile } from "lucide-react";
import { EMOTE_COOLDOWN_MS, EMOTE_DURATION_MS, EMOTE_IDS, type Emote } from "../../shared/emotes";
import type { GameView } from "../../shared/game";
import { Button } from "./ui/button";
import { Bubble, MenuBubble, SideBubble, type Side } from "./bubble";
import { AnimatedWebp, preloadWebp } from "./animated-webp";
import { cn } from "../utils";

export function useRecent(sentAt: number | undefined, serverTime: number, duration: number) {
  const [expired, setExpired] = useState<number>();
  const remaining = sentAt === undefined ? 0 : duration - (serverTime - sentAt);
  useEffect(() => {
    if (sentAt === undefined || remaining <= 0) return;
    const timer = setTimeout(() => setExpired(sentAt), remaining);
    return () => clearTimeout(timer);
  }, [sentAt, remaining]);
  return sentAt !== undefined && expired !== sentAt && remaining > 0;
}

const EMOTES: Record<Emote["id"], { label: string; size: string; bust?: boolean }> = {
  chicken: { label: "Send chicken emote", size: "h-[78.5px] w-[51.5px]", bust: true },
  perso: { label: "Send Perso emote", size: "h-[86px] w-[108px]" },
  goblin: { label: "Send goblin emote", size: "h-[53.7px] w-[76px]", bust: true },
  princess: { label: "Send princess emote", size: "h-[58.4px] w-[45.9px]", bust: true },
};

function EmoteArt({ id, animated = false }: { id: Emote["id"]; animated?: boolean }) {
  const { size, bust } = EMOTES[id];
  const still = `/emotes/${id}-still.webp`;
  return (
    <span className={cn("absolute inset-0", bust && "[clip-path:inset(-40px_-40px_2.5px)]")}>
      <span
        className={cn(
          "absolute left-1/2 -translate-x-1/2",
          bust ? "bottom-0" : "top-[21.5px] -translate-y-1/2",
          size,
        )}
      >
        {animated ? (
          <AnimatedWebp src={`/emotes/${id}.webp`} poster={still} />
        ) : (
          <img src={still} alt="" className="size-full object-contain" draggable={false} />
        )}
      </span>
    </span>
  );
}

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
  return (
    <Bubble key={emote.sentAt} label={`${name} sent the ${emote.id} emote`}>
      <EmoteArt id={emote.id} animated />
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
  return (
    <SideBubble label={`${name} sent the ${emote.id} emote`} {...placement(emote)}>
      <EmoteArt id={emote.id} animated />
    </SideBubble>
  );
}

// A random side and height per reaction; the timestamp keeps every client in agreement.
function placement(emote: Emote): { side: Side; top: number } {
  return {
    side: emote.sentAt % 2 ? "right" : "left",
    top: 4 + (Math.floor(emote.sentAt / 2) % 82),
  };
}

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
    <div className="reaction-rail pointer-events-none relative z-50 col-span-full row-start-2 row-end-5 min-h-0">
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
    for (const id of EMOTE_IDS) void preloadWebp(`/emotes/${id}.webp`).catch(() => {});
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
          <span className="absolute inset-y-0 right-0 grid w-8 place-items-center drop-shadow-sm">
            {/* The button sits at 98% of the table width; the mask trims this to the rim's curve. */}
            <span className="table-edge absolute inset-y-0 left-0 -right-2 -z-1 rounded-l-2xl bg-background [mask-position:calc(32px_-_98cqw)_50%]" />
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
          className="z-50 grid w-auto grid-cols-4 gap-3 bg-transparent p-2"
        >
          {EMOTE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="block"
              aria-label={EMOTES[id].label}
              onClick={() => {
                if (disabled || coolingDown) return;
                onSend(id);
                onOpenChange(false);
              }}
            >
              <MenuBubble>
                <EmoteArt id={id} />
              </MenuBubble>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
