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
      <DialogContent className="max-w-[min(20rem,calc(100%-2rem))] gap-0 border-0 bg-transparent p-2 shadow-none sm:max-w-80">
        <DialogHeader className="sr-only">
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
                className="grid min-w-0 rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <span className="relative block" aria-hidden="true">
                  <PlayingCard card={31} />
                  <span
                    className={`pointer-events-none absolute top-1/2 left-1/2 h-36 max-h-[calc(100%-1rem)] w-12 -translate-x-1/2 -translate-y-1/2 overflow-hidden [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)] ${mode === "low" ? "text-blue-600" : "text-orange-600"}`}
                  >
                    <span
                      className="ace-arrow-track flex flex-col animate-[ace-arrow_2s_linear_infinite]"
                      style={{ animationDirection: mode === "low" ? "normal" : "reverse" }}
                    >
                      {Array.from({ length: 6 }, (_, index) => (
                        <Arrow key={index} className="size-12 shrink-0" strokeWidth={3} />
                      ))}
                    </span>
                  </span>
                </span>
                <span className="sr-only">{mode === "low" ? "Low · 0" : "High · 41"}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
