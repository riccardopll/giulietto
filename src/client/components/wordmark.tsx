import { t } from "../i18n";
import { cn } from "../utils";

export function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href="/"
      className={cn("wordmark text-primary", className)}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
      aria-label={t.home.open}
    >
      Giulietto
    </a>
  );
}
