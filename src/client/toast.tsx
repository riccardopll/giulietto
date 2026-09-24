import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "./components/ui/button";
import { Countdown, CountdownBar } from "./components/ui/countdown";
import { cn } from "./utils";

type Action = { label: string; onClick: () => void };
type Prompt = { countdown: string; decline: string };
type Toast = {
  id: string;
  message: string;
  action?: Action;
  expiresAt: number;
  duration: number;
  prompt?: Prompt;
  leaving?: boolean;
};
type Options = { id?: string; action?: Action; duration?: number };
const DURATION_MS = 4500;
const EXIT_MS = 200;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function publish(next: Toast[]) {
  toasts = next;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function show(message: string, options: Options, prompt?: Prompt) {
  const { id = crypto.randomUUID(), action, duration = DURATION_MS } = options;
  const next: Toast = { id, message, action, prompt, duration, expiresAt: Date.now() + duration };
  publish(
    toasts.some((entry) => entry.id === id)
      ? toasts.map((entry) => (entry.id === id ? next : entry))
      : [...toasts, next],
  );
}

export const toast = {
  error(message: string, options: Options = {}) {
    show(message, options);
  },
  prompt(message: string, { countdown, decline, ...options }: Options & Prompt) {
    show(message, options, { countdown, decline });
  },
  dismiss(id: string) {
    if (!toasts.some((entry) => entry.id === id && !entry.leaving)) return;
    publish(toasts.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)));
    setTimeout(() => {
      if (toasts.some((entry) => entry.id === id && entry.leaving))
        publish(toasts.filter((entry) => entry.id !== id));
    }, EXIT_MS);
  },
};

function PromptCard({ entry, prompt }: { entry: Toast; prompt: Prompt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.min(entry.duration, entry.expiresAt - now);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-lg font-semibold wrap-anywhere">{entry.message}</p>
        <Countdown
          className="shrink-0 gap-1.5 text-xs whitespace-nowrap"
          label={prompt.countdown}
          remaining={remaining}
        />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => toast.dismiss(entry.id)}>
          {prompt.decline}
        </Button>
        {entry.action && (
          <Button className="min-h-11 text-base font-semibold" onClick={entry.action.onClick}>
            {entry.action.label}
          </Button>
        )}
      </div>
      <CountdownBar
        className="absolute inset-x-0 bottom-0 rounded-none"
        remaining={remaining}
        total={entry.duration}
      />
    </>
  );
}

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts);
  useEffect(() => {
    const pending = items.filter((entry) => !entry.leaving);
    if (!pending.length) return;
    const delay = Math.min(...pending.map((entry) => entry.expiresAt)) - Date.now();
    const timer = setTimeout(
      () => {
        for (const entry of pending) if (entry.expiresAt <= Date.now()) toast.dismiss(entry.id);
      },
      Math.max(0, delay),
    );
    return () => clearTimeout(timer);
  }, [items]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(16px,env(safe-area-inset-top))] z-60 flex flex-col items-center gap-2 px-4">
      {items.map((entry) => (
        <div
          key={entry.id}
          role={entry.prompt ? "status" : "alert"}
          data-leaving={entry.leaving || undefined}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm rounded-lg border bg-card text-sm shadow-lg animate-[toast-in_.25s_ease-out_both] data-leaving:animate-[toast-out_.2s_ease-in_both]",
            entry.prompt
              ? "relative flex-col overflow-hidden px-4 pt-3 pb-5"
              : "items-center gap-2 py-2 pr-2 pl-4",
          )}
        >
          {entry.prompt ? (
            <PromptCard entry={entry} prompt={entry.prompt} />
          ) : (
            <>
              <p className="min-w-0 flex-1 py-1 wrap-anywhere">{entry.message}</p>
              {entry.action && (
                <Button
                  variant="outline"
                  className="h-8 shrink-0 px-3 text-xs"
                  onClick={entry.action.onClick}
                >
                  {entry.action.label}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-full text-muted-foreground"
                aria-label="Dismiss"
                onClick={() => toast.dismiss(entry.id)}
              >
                <X className="size-4" />
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
