import { useEffect, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "./components/ui/button";

type Action = { label: string; onClick: () => void };
type Toast = { id: string; message: string; action?: Action; expiresAt: number; leaving?: boolean };
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

export const toast = {
  error(
    message: string,
    { id = crypto.randomUUID(), action }: { id?: string; action?: Action } = {},
  ) {
    const next: Toast = { id, message, action, expiresAt: Date.now() + DURATION_MS };
    publish(
      toasts.some((entry) => entry.id === id)
        ? toasts.map((entry) => (entry.id === id ? next : entry))
        : [...toasts, next],
    );
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
          role="alert"
          data-leaving={entry.leaving || undefined}
          className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg border bg-card py-2 pr-2 pl-4 text-sm shadow-lg animate-[toast-in_.25s_ease-out_both] data-leaving:animate-[toast-out_.2s_ease-in_both]"
        >
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
        </div>
      ))}
    </div>
  );
}
