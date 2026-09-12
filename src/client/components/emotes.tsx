import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { Lock, Smile } from "lucide-react";
import { EMOTE_COOLDOWN_MS, EMOTE_DURATION_MS, type Emote } from "@/shared/emotes";
import { Button } from "./ui/button";
import { Bubble, BubbleArtwork } from "./bubble";
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
          src="/emotes/perso-picker.webp"
          alt=""
          className="size-full object-contain"
          draggable={false}
        />
      )}
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
    <Bubble
      key={emote.sentAt}
      label={`${name} sent the ${emote.id} emote`}
      complete={emote.id === "perso"}
    >
      {emote.id === "perso" ? <Perso animated /> : <Chicken animated />}
    </Bubble>
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
          <span className="absolute inset-y-0 right-0 grid w-8 place-items-center rounded-l-2xl bg-[#fff8ed] shadow-sm">
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
          <button
            type="button"
            className="block"
            aria-label="Send chicken emote"
            onClick={() => {
              if (disabled || coolingDown) return;
              onSend("chicken");
              onOpenChange(false);
            }}
          >
            <BubbleArtwork>
              <Chicken />
            </BubbleArtwork>
          </button>
          <button
            type="button"
            className="block"
            aria-label="Send Perso emote"
            onClick={() => {
              if (disabled || coolingDown) return;
              onSend("perso");
              onOpenChange(false);
            }}
          >
            <BubbleArtwork>
              <Perso />
            </BubbleArtwork>
          </button>
          {[1].map((slot) => (
            <button
              key={slot}
              type="button"
              disabled
              aria-label={`Empty emote slot ${slot}`}
              className="block opacity-60"
            >
              <BubbleArtwork>
                <span className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <Lock className="size-5" aria-hidden="true" />
                </span>
              </BubbleArtwork>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
