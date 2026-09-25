import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react";
import { Dialog } from "radix-ui";
import { MessageCircleDashed, MessageCircleMore, SendHorizontal, X } from "lucide-react";
import { CHAT_MAX_LENGTH, chatOpen } from "../../shared/chat";
import type { GameView } from "../../shared/game";
import { cn } from "../utils";
import { overlayClass } from "@ui/action-dialog";
import { Button } from "@ui/button";
import { Input } from "@ui/input";

export type ChatState = { open: boolean; setOpen: (open: boolean) => void; unread: number };

export function useChat(game: GameView | null): ChatState {
  const code = game?.code;
  const key = game && chatOpen(game) ? `${game.code}:${game.round}` : null;
  const latest = game?.chat?.at(-1)?.id ?? 0;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [seen, setSeen] = useState({ code, id: 0 });
  const open = !!key && openKey === key;
  if (open && (seen.code !== code || seen.id !== latest)) setSeen({ code, id: latest });
  const seenId = seen.code === code ? seen.id : 0;
  const unread = open ? 0 : (game?.chat?.filter((message) => message.id > seenId).length ?? 0);
  return { open, setOpen: (next) => setOpenKey(next ? key : null), unread };
}

let lastSpot: { rect: DOMRect; at: number } | undefined;

function useSlideFromLastSpot(ref: RefObject<HTMLButtonElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const from = lastSpot;
    lastSpot = undefined;
    if (from && performance.now() - from.at < 1000) {
      const to = element.getBoundingClientRect();
      const dx = from.rect.left - to.left;
      const dy = from.rect.top - to.top;
      if (dx || dy)
        element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 450,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
    }
    return () => {
      lastSpot = { rect: element.getBoundingClientRect(), at: performance.now() };
    };
  }, [ref]);
}

export function ChatButton({
  unread,
  onClick,
  edge = false,
  className,
}: {
  unread: number;
  onClick: () => void;
  edge?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useSlideFromLastSpot(ref);
  return (
    <Button
      ref={ref}
      variant="tab"
      size="icon"
      className={className}
      aria-label={unread ? `Chat, ${unread} unread` : "Chat"}
      onClick={onClick}
    >
      <span
        className={cn(
          "grid place-items-center",
          edge ? "absolute inset-y-0 left-0 w-8 drop-shadow-sm" : "relative",
        )}
      >
        {edge && (
          <span className="table-edge absolute inset-y-0 right-0 -left-2 -z-1 rounded-r-2xl bg-background [mask-position:calc(8px_-_2cqw)_50%]" />
        )}
        <MessageCircleMore className="size-6" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-2xs leading-none font-semibold text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
    </Button>
  );
}

function useVisualViewport() {
  const [box, setBox] = useState<{ top: number; height: number }>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setBox({ top: viewport.offsetTop, height: viewport.height });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}

function Sheet({
  game,
  busy,
  onSend,
}: {
  game: GameView;
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const viewport = useVisualViewport();
  const messages = game.chat ?? [];
  const latest = messages.at(-1)?.id ?? 0;
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pinned = useRef(true);
  const [text, setText] = useState("");
  const showLatest = () => {
    if (pinned.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  };
  useEffect(showLatest, [latest]);
  useEffect(() => {
    if (!list.current) return;
    const observer = new ResizeObserver(showLatest);
    observer.observe(list.current);
    return () => observer.disconnect();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    if (await onSend(message)) setText("");
    input.current?.focus();
  }

  return (
    <Dialog.Content
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
      }}
      style={
        viewport &&
        ({
          "--viewport-top": `${viewport.top}px`,
          "--viewport-height": `${viewport.height}px`,
        } as CSSProperties)
      }
      className="fixed inset-x-0 top-[var(--viewport-top,0px)] z-50 flex h-[var(--viewport-height,100dvh)] flex-col bg-card outline-none transition-[height] duration-300 ease-out after:pointer-events-none after:absolute after:inset-x-0 after:-inset-y-[100dvh] after:-z-10 after:bg-card data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out"
    >
      <header className="flex items-center px-4 pt-[env(safe-area-inset-top)]">
        <Dialog.Title className="sr-only">Chat</Dialog.Title>
        <Dialog.Close asChild>
          <Button variant="muted" size="icon" className="ml-auto" aria-label="Close chat">
            <X className="size-5" />
          </Button>
        </Dialog.Close>
      </header>
      <ol
        ref={list}
        role="log"
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-3 pb-3"
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          pinned.current = scrollHeight - scrollTop - clientHeight < 32;
        }}
      >
        {messages.length === 0 && (
          <li className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-base text-muted-foreground">
            <MessageCircleDashed
              className="size-32 text-muted-foreground/50"
              strokeWidth={1.25}
              aria-hidden="true"
            />
            No messages yet.
          </li>
        )}
        {messages.map((message) => {
          const own = message.sender === game.you;
          return (
            <li
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-1.5 wrap-anywhere text-foreground shadow-xs",
                own
                  ? "self-end rounded-br-md bg-primary/30"
                  : "self-start rounded-bl-md bg-secondary",
              )}
            >
              {!own && (
                <strong className="block text-xs font-semibold text-secondary-foreground">
                  {message.name}
                </strong>
              )}{" "}
              <span className="text-base leading-snug">{message.text}</span>
              <time
                dateTime={new Date(message.sentAt).toISOString()}
                className="float-right mt-2 ml-2 text-2xs leading-none whitespace-nowrap text-muted-foreground"
              >
                {new Date(message.sentAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                })}
              </time>
            </li>
          );
        })}
      </ol>
      <form
        className="flex items-center gap-2 border-t px-3 pt-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => void submit(event)}
      >
        <Input
          ref={input}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          aria-label="Message"
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 flex-1"
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" size="icon" aria-label="Send message" disabled={busy || !text.trim()}>
          <SendHorizontal className="size-5" />
        </Button>
      </form>
    </Dialog.Content>
  );
}

export function ChatSheet({
  open,
  onOpenChange,
  game,
  busy,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameView;
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Sheet game={game} busy={busy} onSend={onSend} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
