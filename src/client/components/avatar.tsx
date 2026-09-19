import { Bot } from "lucide-react";
import { avatarPath } from "../../shared/avatars";
import { cn } from "../utils";

export function Avatar({
  avatar,
  bot,
  id,
  className,
}: {
  avatar?: string;
  bot?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-input bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {bot ? (
        <Bot className="size-3/5" aria-hidden="true" />
      ) : (
        <img
          src={avatarPath(avatar, id)}
          alt=""
          draggable={false}
          width={128}
          height={128}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}
