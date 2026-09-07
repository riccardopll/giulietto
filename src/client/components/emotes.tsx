import { useState } from "react";
import { Smile } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "./ui/button";
import {
  EMOTES,
  EMOTE_COOLDOWN_MS,
  EMOTE_DURATION_MS,
  type Emote,
  type EmoteId,
} from "@/shared/emotes";

export function EmoteMenu({
  emote,
  now,
  disabled,
  send,
}: {
  emote?: Emote;
  now: number;
  disabled: boolean;
  send: (id: EmoteId) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const remaining = Math.max(
    0,
    Math.ceil(Math.min(EMOTE_COOLDOWN_MS, (emote?.sentAt ?? 0) + EMOTE_COOLDOWN_MS - now) / 1000),
  );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Send emote"
          title={remaining ? `Emotes available in ${remaining}s` : "Send emote"}
          disabled={disabled}
        >
          <Smile size={18} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="emote-menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <DropdownMenu.Label className="emote-menu-label">
            {pending
              ? "Sending emote…"
              : remaining
                ? `Available in ${remaining}s`
                : "Send an emote"}
          </DropdownMenu.Label>
          {EMOTES.map((option) => (
            <DropdownMenu.Item
              key={option.id}
              className="emote-option"
              textValue={option.label}
              disabled={disabled || pending || remaining > 0}
              onSelect={() => {
                setPending(true);
                void send(option.id).finally(() => setPending(false));
              }}
            >
              <span aria-hidden="true">{option.emoji}</span>
              {option.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function PlayerEmote({
  emote,
  name,
  now,
  floating = false,
}: {
  emote?: Emote;
  name: string;
  now: number;
  floating?: boolean;
}) {
  if (!emote || now >= emote.sentAt + EMOTE_DURATION_MS) return null;
  const option = EMOTES.find((option) => option.id === emote.id);
  if (!option) return null;
  return (
    <span
      key={emote.commandId}
      className={`player-emote ${floating ? "floating-emote" : ""}`}
      role="status"
      aria-label={`${name}: ${option.label}`}
      title={`${name}: ${option.label}`}
    >
      <span aria-hidden="true">{option.emoji}</span>
    </span>
  );
}
