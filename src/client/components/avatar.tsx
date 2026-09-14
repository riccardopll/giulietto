import { avatarPath } from "../../shared/avatars";
import { cn } from "../utils";

export function Avatar({
  avatar,
  id,
  className,
}: {
  avatar?: string;
  id?: string;
  className?: string;
}) {
  const src = avatarPath(avatar, id);
  return (
    <span
      className={cn(
        "inline-flex size-11 shrink-0 overflow-hidden rounded-full border border-parchment-edge bg-parchment-deep",
        className,
      )}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        width={128}
        height={128}
        className="size-full object-cover"
      />
    </span>
  );
}
