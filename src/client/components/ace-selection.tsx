import { Dialog } from "radix-ui";
import { t } from "../i18n";
import { cn } from "../utils";
import { PlayingCard } from "./playing-card";
import { contentClass, overlayClass } from "@ui/action-dialog";

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content
          className={cn(
            contentClass,
            "max-w-[min(20rem,calc(100%-2rem))] gap-0 border-0 bg-transparent p-2 shadow-none",
          )}
        >
          <Dialog.Title className="sr-only">{t.cards.aceOfCoins}</Dialog.Title>
          <Dialog.Description className="sr-only">{t.cards.chooseValue}</Dialog.Description>
          <div className="grid grid-cols-2 gap-4">
            {(["low", "high"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(mode)}
                className="grid min-w-0 rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <span className="relative block" aria-hidden="true">
                  <PlayingCard card={31} mode={mode} />
                </span>
                <span className="sr-only">
                  {mode === "low" ? t.cards.lowOption : t.cards.highOption}
                </span>
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
