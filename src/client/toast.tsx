import { useEffect, useState, useSyncExternalStore } from "react";
import { X, type LucideIcon } from "lucide-react";
import { Button } from "@ui/button";
import { Countdown, CountdownBar } from "@ui/countdown";

type Action = { label: string; icon: LucideIcon; onClick: () => void };
type Options = { id?: string; action?: Action; duration?: number; countdown?: string };
type Toast = Options & {
  id: string;
  message: string;
  expiresAt: number;
  duration: number;
  leaving?: boolean;
};
const DURATION_MS = 4500;
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
function show(message: string, options: Options) {
  const { id = crypto.randomUUID(), duration = DURATION_MS } = options;
  const next: Toast = { ...options, id, message, duration, expiresAt: Date.now() + duration };
  publish(
    toasts.some((entry) => entry.id === id)
      ? toasts.map((entry) => (entry.id === id ? next : entry))
      : [...toasts, next],
  );
}

export const toast = {
  show,
  dismiss(id: string) {
    if (!toasts.some((entry) => entry.id === id && !entry.leaving)) return;
    publish(toasts.map((entry) => (entry.id === id ? { ...entry, leaving: true } : entry)));
  },
};

function ToastCard({ entry }: { entry: Toast }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!entry.countdown) return;
    const timer = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(timer);
  }, [entry.countdown]);
  const remaining = Math.min(entry.duration, entry.expiresAt - now);
  return (
    <div
      role={entry.countdown ? "status" : "alert"}
      data-leaving={entry.leaving || undefined}
      onAnimationEnd={(event) => {
        if (entry.leaving && event.target === event.currentTarget)
          publish(toasts.filter((item) => item.id !== entry.id));
      }}
      className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border bg-card py-2 pr-2 pl-4 text-sm shadow-lg animate-[toast-in_.25s_ease-out_both] data-leaving:animate-[toast-out_.2s_ease-in_both]"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 py-1 wrap-anywhere">{entry.message}</p>
        {entry.action && (
          <Button
            variant="accent"
            size="icon"
            aria-label={entry.action.label}
            onClick={entry.action.onClick}
          >
            <entry.action.icon className="size-5" />
          </Button>
        )}
        <Button
          variant="muted"
          size="icon"
          aria-label="Dismiss"
          onClick={() => toast.dismiss(entry.id)}
        >
          <X className="size-4" />
        </Button>
      </div>
      {entry.countdown && (
        <>
          <Countdown className="mb-2" label={entry.countdown} remaining={remaining} />
          <CountdownBar
            className="absolute inset-x-0 bottom-0"
            remaining={remaining}
            total={entry.duration}
          />
        </>
      )}
    </div>
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
        <ToastCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
