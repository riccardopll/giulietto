import type { ComponentProps } from "react";
import { cn } from "@/client/utils";

export function PageHeader({ className, ...props }: ComponentProps<"header">) {
  return <header className={cn("min-h-16 items-center py-1 sm:min-h-20", className)} {...props} />;
}
