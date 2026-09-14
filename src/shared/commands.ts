import type { AvatarId } from "./avatars";
import type { Emote } from "./emotes";

/** Commands that enter a table over HTTP. */
export type EntryCommand =
  | { action: "create" | "match"; name?: string; avatar?: AvatarId }
  | { action: "join"; name?: string; avatar?: AvatarId; matchmaking?: boolean };
/** Commands a seated player sends to their table. */
export type TableCommand =
  | { action: "rename"; name: string }
  | { action: "settings"; startingLives: number }
  | { action: "start" }
  | { action: "bid"; bid: number }
  | { action: "play"; card?: number; mode?: "high" | "low" }
  | { action: "emote"; emote: Emote["id"] }
  | { action: "leave" };
/** A validated request. Commands sent over HTTP name their table with `code`. */
export type Command = (EntryCommand | TableCommand) & { commandId: string; code?: string };

export function isEntryCommand(input: EntryCommand | TableCommand): input is EntryCommand {
  return input.action === "create" || input.action === "match" || input.action === "join";
}
export function isTableCommand(input: EntryCommand | TableCommand): input is TableCommand {
  return !isEntryCommand(input);
}
