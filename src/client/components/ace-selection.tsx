import { ArrowDown, ArrowUp } from "lucide-react";
import { PlayingCard } from "./playing-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function AceSelection({
  open,
  onOpenChange,
  onSelect,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: "low" | "high") => void;
  disabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(20rem,calc(100%-2rem))] sm:max-w-80">
        <DialogHeader>
          <DialogTitle>Ace of Coins</DialogTitle>
          <DialogDescription>Choose its value before playing.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {(["low", "high"] as const).map((mode) => {
            const Arrow = mode === "low" ? ArrowDown : ArrowUp;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(mode)}
                className="grid min-w-0 gap-3 rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <span className="relative block" aria-hidden="true">
                  <PlayingCard card={31} />
                  <span
                    className={`pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-center gap-1 rounded-lg bg-white/90 py-2 shadow-sm ${mode === "low" ? "text-blue-700" : "text-orange-700"}`}
                  >
                    {[0, 1].map((index) => (
                      <Arrow
                        key={index}
                        className="size-9 motion-safe:animate-[ace-arrow_1.2s_ease-in-out_infinite]"
                        strokeWidth={3}
                        style={{
                          animationDelay: `${index * 0.15}s`,
                          animationDirection: mode === "low" ? "normal" : "reverse",
                        }}
                      />
                    ))}
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {mode === "low" ? "Low · 0" : "High · 41"}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
