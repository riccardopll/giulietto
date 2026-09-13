export const avatars = [
  { id: "king-cups", name: "King of Cups" },
  { id: "queen-coins", name: "Queen of Coins" },
  { id: "king-clubs", name: "King of Clubs" },
  { id: "queen-cups", name: "Queen of Cups" },
  { id: "knight-swords", name: "Knight of Swords" },
  { id: "queen-clubs", name: "Queen of Clubs" },
] as const;
export type AvatarId = (typeof avatars)[number]["id"];
export function isAvatar(value: unknown): value is AvatarId {
  return avatars.some((avatar) => avatar.id === value);
}
export function defaultAvatar(id: string): AvatarId {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return avatars[hash % avatars.length].id;
}
export function avatarPath(avatar?: string, id = "") {
  return `/avatars/${isAvatar(avatar) ? avatar : defaultAvatar(id)}.webp`;
}
