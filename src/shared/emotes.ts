export const EMOTES = [
  { id: "wave", emoji: "👋", label: "Hello" },
  { id: "clap", emoji: "👏", label: "Well played" },
  { id: "laugh", emoji: "😂", label: "Haha" },
  { id: "wow", emoji: "😮", label: "Wow" },
  { id: "oops", emoji: "😅", label: "Oops" },
  { id: "luck", emoji: "🍀", label: "Good luck" },
] as const;

export type EmoteId = (typeof EMOTES)[number]["id"];
export type Emote = { id: EmoteId; commandId: string; sentAt: number };
export const EMOTE_COOLDOWN_MS = 3000;
export const EMOTE_DURATION_MS = 4000;

export function isEmoteId(value: unknown): value is EmoteId {
  return EMOTES.some((emote) => emote.id === value);
}
