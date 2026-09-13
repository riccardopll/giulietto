import { avatarPath } from "@/shared/avatars";
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
  return (
    <img
      src={avatarPath(avatar, id)}
      alt=""
      draggable={false}
      width={128}
      height={128}
      className={cn(
        "size-11 shrink-0 rounded-full border border-[#d6c9b9] bg-[#f6ecd7] object-cover",
        className,
      )}
    />
  );
}
