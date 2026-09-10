import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { Lock, Smile } from "lucide-react";
import { EMOTE_COOLDOWN_MS, EMOTE_DURATION_MS, type Emote } from "@/shared/emotes";
import { Button } from "./ui/button";

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

let chickenAsset: Promise<Blob> | undefined;
function preloadChicken() {
  return (chickenAsset ??= fetch("/emotes/chicken.webp")
    .then((response) => {
      if (!response.ok) throw new Error("Could not load chicken emote.");
      return response.blob();
    })
    .catch((error: unknown) => {
      chickenAsset = undefined;
      throw error;
    }));
}

function Chicken({ animated = false }: { animated?: boolean }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    if (!animated) return;
    let disposed = false;
    let url: string | undefined;
    void preloadChicken()
      .then((blob) => {
        if (disposed) return;
        // A fresh URL restarts the cached animation for each send.
        url = URL.createObjectURL(blob);
        setSource(url);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [animated]);
  return (
    <img
      src={animated && source ? source : "/emotes/chicken-still.webp"}
      alt=""
      width={148}
      height={200}
      className={`${animated ? "emote-motion" : ""} size-full object-contain`}
      draggable={false}
    />
  );
}

function EmoteArtwork({
  animated = false,
  placeholder = false,
}: {
  animated?: boolean;
  placeholder?: boolean;
}) {
  const base = animated
    ? "M1.25 32.5Q1.25 43.75 12.5 43.75L10 52L23 43.75H47.5Q58.75 43.75 58.75 32.5"
    : "M1.25 32.5Q1.25 43.75 12.5 43.75H47.5Q58.75 43.75 58.75 32.5";
  const outline = `${base}V16.5Q58.75 5.25 47.5 5.25H12.5Q1.25 5.25 1.25 16.5Z`;
  return (
    <span className="emote-artwork relative block h-[45px] w-[60px] shrink-0">
      <svg
        className="absolute inset-0 size-full overflow-visible"
        viewBox="0 0 60 45"
        aria-hidden="true"
      >
        <path
          d={outline}
          fill="#111111"
          stroke="#111111"
          strokeWidth="2.5"
          strokeLinejoin="round"
          transform="translate(0 2.5)"
        />
        <path d={outline} fill="white" stroke="#111111" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      {placeholder ? (
        <span className="absolute inset-0 flex items-center justify-center text-gray-400">
          <Lock className="size-5" aria-hidden="true" />
        </span>
      ) : (
        <span className="absolute inset-0 [clip-path:inset(-30px_0_2.5px_0)]">
          <span className="absolute -bottom-[7.5px] left-1/2 h-[84.375px] w-[62.5px] -translate-x-[60%]">
            <Chicken animated={animated} />
          </span>
        </span>
      )}
      <svg
        className="absolute inset-0 size-full overflow-visible"
        viewBox="0 0 60 45"
        fill="none"
        aria-hidden="true"
      >
        <path d={base} stroke="#111111" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
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
    <span
      key={emote.sentAt}
      role="status"
      aria-label={`${name} sent the chicken emote`}
      className="seat-bubble pointer-events-none block origin-bottom shrink-0 overflow-visible pb-2.5 animate-[emote-bubble_ease-out_both]"
      style={{ animationDuration: `${EMOTE_DURATION_MS}ms` }}
    >
      <EmoteArtwork animated />
    </span>
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
    void preloadChicken().catch(() => {});
  }, []);
  const coolingDown = useRecent(emote?.sentAt, serverTime, EMOTE_COOLDOWN_MS);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-14 shrink-0 rounded-xl bg-transparent hover:bg-transparent hover:text-red-600 disabled:text-gray-400 disabled:opacity-100"
          disabled={disabled || coolingDown}
          aria-label="Emotes"
        >
          <Smile className="size-7" aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          alignOffset={-64}
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
            <EmoteArtwork />
          </button>
          {[1, 2].map((slot) => (
            <button
              key={slot}
              type="button"
              disabled
              aria-label={`Empty emote slot ${slot}`}
              className="block opacity-60"
            >
              <EmoteArtwork placeholder />
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
