import type { ComponentProps } from "react";
import { cn } from "../../utils";

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  link: "text-primary underline underline-offset-4 hover:text-primary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
};
const sizes = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  icon: "size-9",
  large: "min-h-13 h-auto rounded-xl px-5 py-3 text-base whitespace-normal",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants; size?: keyof typeof sizes }) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
