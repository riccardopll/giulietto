import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { CHAT_MAX_LENGTH, type ChatMessage } from "@/shared/chat";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import "./table-chat.css";

export function TableChat({
  messages,
  you,
  disabled,
  send,
}: {
  messages: ChatMessage[];
  you: string;
  disabled: boolean;
  send: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const latest = messages.at(-1)?.sentAt ?? 0;
  const [readAt, setReadAt] = useState(latest);
  const log = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const atBottom = useRef(true);
  const unread = open ? 0 : messages.filter((m) => m.playerId !== you && m.sentAt > readAt).length;

  useEffect(() => {
    if (open) {
      if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    }
  }, [open, latest]);
  function close() {
    setReadAt(latest);
    setOpen(false);
    trigger.current?.focus();
  }
  async function submit() {
    if (sending.current || disabled || !draft.trim()) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      await send(draft);
      setDraft("");
      atBottom.current = true;
      if (log.current) log.current.scrollTop = log.current.scrollHeight;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setPending(false);
      input.current?.focus();
    }
  }
  return (
    <div
      className="table-chat"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <Button
        ref={trigger}
        variant="ghost"
        aria-label={`Table chat${unread ? `, ${unread} unread ${unread === 1 ? "message" : "messages"}` : ""}`}
        aria-expanded={open}
        aria-controls="table-chat-panel"
        onClick={() => {
          atBottom.current = true;
          setReadAt(latest);
          setOpen(!open);
        }}
      >
        <MessageCircle size={18} />
        <span className="chat-trigger-label">Chat</span>
        {unread > 0 && <span className="chat-unread">{unread}</span>}
      </Button>
      {open && (
        <section id="table-chat-panel" className="chat-panel" aria-label="Table chat">
          <div className="chat-heading">
            <div>
              <h2>Table chat</h2>
              <p>Only players at this table · Last 50 messages</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Close chat" onClick={close}>
              <X size={18} />
            </Button>
          </div>
          <div
            ref={log}
            className="chat-log"
            role="log"
            aria-label="Messages"
            aria-live="polite"
            aria-relevant="additions"
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {messages.length === 0 && <p className="chat-empty">No messages yet. Say hello!</p>}
            {messages.map((message) => (
              <div className="chat-message" key={`${message.playerId}-${message.id}`}>
                <div className="chat-message-meta">
                  <strong>
                    {message.name}
                    {message.playerId === you ? " (you)" : ""}
                  </strong>
                  <time dateTime={new Date(message.sentAt).toISOString()}>
                    {new Date(message.sentAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="sr-only" htmlFor="chat-message">
              Message to table
            </label>
            <div className="chat-compose">
              <Input
                ref={input}
                id="chat-message"
                value={draft}
                maxLength={CHAT_MAX_LENGTH}
                readOnly={pending}
                disabled={disabled}
                autoComplete="off"
                placeholder={disabled ? "Chat unavailable" : "Message to table…"}
                onChange={(e) => setDraft(e.target.value)}
                aria-describedby="chat-feedback"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={disabled || pending || !draft.trim()}
              >
                <Send size={16} />
              </Button>
            </div>
            <div id="chat-feedback" className="chat-feedback">
              <span role="status">{error || (pending ? "Sending…" : "")}</span>
              <span>
                {draft.length}/{CHAT_MAX_LENGTH}
              </span>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
