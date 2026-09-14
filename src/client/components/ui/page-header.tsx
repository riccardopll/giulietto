import type { ComponentProps } from "react";
import { cn } from "../../utils";

export function PageHeader({ className, ...props }: ComponentProps<"header">) {
  return <header className={cn("min-h-16 items-center py-1 sm:min-h-20", className)} {...props} />;
}

export function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href="/"
      className={cn("wordmark text-primary", className)}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
      aria-label="Giulietto home"
    >
      Giulietto
    </a>
  );
}
