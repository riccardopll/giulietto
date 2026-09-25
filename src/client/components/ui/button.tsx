import type { ComponentProps } from "react";
import { cn } from "../../utils";

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border bg-card shadow-xs hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  muted: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  accent: "font-semibold text-primary hover:bg-accent hover:text-accent-foreground",
  tab: "text-primary hover:text-accent-foreground disabled:text-muted-foreground disabled:opacity-100",
  link: "text-primary underline underline-offset-4 hover:text-primary/80",
};
const sizes = {
  default: "h-11 px-4 py-2 has-[>svg]:px-3",
  icon: "size-11 rounded-full",
  pill: "h-auto rounded-full p-1",
  lg: "h-auto min-h-12 rounded-xl px-5 py-3 text-base font-semibold whitespace-normal",
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
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-2 outline-offset-2 outline-transparent focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
