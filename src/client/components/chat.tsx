import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Dialog } from "radix-ui";
import { MessageCircle, SendHorizontal, X } from "lucide-react";
import { CHAT_MAX_LENGTH } from "../../shared/chat";
import { inPlay, type GameView } from "../../shared/game";
import { cn } from "../utils";
import { overlayClass } from "./ui/action-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export type ChatState = { open: boolean; setOpen: (open: boolean) => void; unread: number };

/** Sheet state kept above the board, so unread counts survive the results screen. */
export function useChat(game: GameView | null): ChatState {
  const code = game?.code;
  // The sheet belongs to one round of play and closes when the board leaves.
  const key = game && inPlay(game) ? `${game.code}:${game.round}` : null;
  const latest = game?.chat?.at(-1)?.id ?? 0;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [seen, setSeen] = useState({ code, id: 0 });
  const open = !!key && openKey === key;
  if (open && (seen.code !== code || seen.id !== latest)) setSeen({ code, id: latest });
  const seenId = seen.code === code ? seen.id : 0;
  const unread = open ? 0 : (game?.chat?.filter((message) => message.id > seenId).length ?? 0);
  return { open, setOpen: (next) => setOpenKey(next ? key : null), unread };
}

export function ChatButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="pointer-events-auto absolute left-[2%] top-1/2 h-11 w-11 shrink-0 -translate-y-1/2 rounded-none bg-transparent p-0 text-primary hover:bg-transparent focus-visible:outline-ring"
      aria-label={unread ? `Chat, ${unread} unread` : "Chat"}
      onClick={onClick}
    >
      <span className="absolute inset-y-0 left-0 grid w-8 place-items-center rounded-r-2xl bg-background shadow-sm">
        <MessageCircle className="size-6" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
    </Button>
  );
}

/** Tracks the visible area so the composer stays above a phone keyboard. */
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
  useEffect(() => {
    if (pinned.current) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [latest]);
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
      className="chat-sheet fixed inset-x-0 top-[var(--viewport-top,0px)] z-50 flex h-[var(--viewport-height,100dvh)] flex-col bg-card outline-none data-[state=open]:animate-[dialog-in_.2s_ease-out] data-[state=closed]:animate-[dialog-out_.2s_ease-in] sm:inset-x-auto sm:top-1/2 sm:left-1/2 sm:h-[min(40rem,calc(100dvh-2rem))] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:shadow-lg"
    >
      <header className="flex items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] sm:pt-0">
        <Dialog.Title className="py-2 text-lg font-semibold">Chat</Dialog.Title>
        <Dialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-11 rounded-lg text-muted-foreground"
            aria-label="Close chat"
          >
            <X className="size-5" />
          </Button>
        </Dialog.Close>
      </header>
      <ol
        ref={list}
        role="log"
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4"
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          pinned.current = scrollHeight - scrollTop - clientHeight < 32;
        }}
      >
        {messages.length === 0 && (
          <li className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-base text-muted-foreground">
            <MessageCircle
              className="size-32 text-primary/70"
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
                "max-w-[85%] rounded-2xl px-4 py-3 wrap-anywhere shadow-xs",
                own
                  ? "self-end rounded-br-md bg-accent text-accent-foreground"
                  : "self-start rounded-bl-md bg-secondary text-foreground",
              )}
            >
              <strong
                className={cn(
                  "block text-sm font-semibold",
                  own ? "text-primary" : "text-secondary-foreground",
                )}
              >
                {own ? "You" : message.name}
              </strong>{" "}
              <span className="text-lg leading-snug">{message.text}</span>
            </li>
          );
        })}
      </ol>
      <form
        className="flex items-center gap-2 border-t px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:pb-2"
        onSubmit={(event) => void submit(event)}
      >
        <Input
          ref={input}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Message"
          aria-label="Message"
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 flex-1"
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label="Send message"
          disabled={busy || !text.trim()}
        >
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
