import type { AvatarId } from "./avatars";
import type { Emote } from "./emotes";

export type EntryCommand =
  | { action: "create" | "match"; name?: string; avatar?: AvatarId }
  | { action: "join"; name?: string; avatar?: AvatarId; matchmaking?: boolean };
export type LobbyOption = "startingLives" | "turnSeconds";
export type TableCommand =
  | { action: "rename"; name: string }
  | { action: "settings"; option: LobbyOption; value: number }
  | { action: "start" }
  | { action: "addBot" }
  | { action: "removeBot"; playerId: string }
  | { action: "bid"; bid: number }
  | { action: "play"; card?: number; mode?: "high" | "low" }
  | { action: "emote"; emote: Emote["id"] }
  | { action: "chat"; text: string }
  | { action: "rematch" }
  | { action: "leave" };
export type Command = (EntryCommand | TableCommand) & { commandId: string; code?: string };

export function isEntryCommand(input: EntryCommand | TableCommand): input is EntryCommand {
  return input.action === "create" || input.action === "match" || input.action === "join";
}
export function isTableCommand(input: EntryCommand | TableCommand): input is TableCommand {
  return !isEntryCommand(input);
}
