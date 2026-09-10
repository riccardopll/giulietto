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
    <Bubble key={emote.sentAt} label={`${name} sent the chicken emote`}>
      <Chicken animated />
    </Bubble>
  );
}

export function EmotePicker({
  disabled,
  emote,
  serverTime,
  onSend,
}: {
  disabled: boolean;
  emote?: Emote;
  serverTime: number;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void preloadWebp("/emotes/chicken.webp").catch(() => {});
  }, []);
  const coolingDown = useRecent(emote?.sentAt, serverTime, EMOTE_COOLDOWN_MS);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="col-start-3 row-start-1 size-11 shrink-0 translate-x-[min(1rem,calc((100vw-100cqw)/2))] justify-self-end rounded-xl bg-transparent hover:bg-transparent hover:text-red-600 disabled:text-gray-400 disabled:opacity-100"
          disabled={disabled || coolingDown}
          aria-label="Emotes"
        >
          <Smile className="size-6" aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          alignOffset={-88}
          sideOffset={6}
          collisionPadding={12}
          aria-label="Emotes"
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 grid w-auto grid-cols-3 gap-x-3 gap-y-6 bg-transparent px-2 pt-6 pb-2"
        >
          <button
            type="button"
            className="block"
            aria-label="Send chicken emote"
            onClick={() => {
              if (disabled || coolingDown) return;
              onSend();
              setOpen(false);
            }}
          >
            <BubbleArtwork>
              <Chicken />
            </BubbleArtwork>
          </button>
          {[1, 2].map((slot) => (
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
