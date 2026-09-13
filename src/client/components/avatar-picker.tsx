import { Check } from "lucide-react";
import { avatars, type AvatarId } from "@/shared/avatars";
import { Avatar } from "./avatar";

export function AvatarPicker({
  value,
  disabled,
  onChange,
}: {
  value: AvatarId;
  disabled: boolean;
  onChange: (avatar: AvatarId) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Player avatar</legend>
      <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-x-3 gap-y-4 px-1 py-3">
        {avatars.map((option) => (
          <label
            key={option.id}
            className="relative aspect-square w-[calc((100%-1.5rem)/3)] max-w-28 cursor-pointer"
          >
            <input
              className="peer absolute inset-0 z-10 size-full cursor-pointer rounded-full opacity-0"
              type="radio"
              name="avatar"
              value={option.id}
              checked={value === option.id}
              autoFocus={value === option.id}
              onChange={() => onChange(option.id)}
              aria-label={option.name}
            />
            <span className="block size-full rounded-full border-2 border-transparent p-px peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-dashed peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50">
              <Avatar avatar={option.id} className="size-full" />
              {value === option.id && (
                <span
                  className="absolute bottom-0 right-0 grid size-6 place-items-center rounded-full border-2 border-card bg-primary text-white sm:size-7"
                  aria-hidden="true"
                >
                  <Check className="size-3.5 sm:size-4" />
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
