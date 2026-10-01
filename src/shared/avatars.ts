export const avatars = [
  "king-cups",
  "queen-coins",
  "king-clubs",
  "queen-cups",
  "knight-swords",
] as const;
export type AvatarId = (typeof avatars)[number];
export function isAvatar(value: unknown): value is AvatarId {
  return avatars.some((avatar) => avatar === value);
}
export function defaultAvatar(id: string): AvatarId {
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return avatars[hash % avatars.length];
}
export function avatarPath(avatar?: string, id = "") {
  return `/avatars/${isAvatar(avatar) ? avatar : defaultAvatar(id)}.webp`;
}
