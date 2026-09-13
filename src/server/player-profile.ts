import { defaultAvatar, isAvatar, type AvatarId } from "../shared/avatars";
import { GameError } from "../shared/game-error";
import { displayName } from "./protocol";

export type Profile = { name: string; avatar: AvatarId };
export async function readProfile(db: D1Database, id: string): Promise<Profile | null> {
  const row = await db
    .prepare("SELECT display_name AS name, avatar FROM players WHERE id=?")
    .bind(id)
    .first<{ name: string; avatar: string | null }>();
  return row
    ? { name: row.name, avatar: isAvatar(row.avatar) ? row.avatar : defaultAvatar(id) }
    : null;
}
export async function ensureProfile(db: D1Database, id: string, name: unknown): Promise<Profile> {
  const existing = await readProfile(db, id);
  if (existing) return existing;
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO players(id,display_name,avatar,created_at,last_seen_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(id, displayName(name), defaultAvatar(id), now, now)
    .run();
  return (await readProfile(db, id))!;
}
export async function saveProfile(db: D1Database, id: string, value: unknown): Promise<Profile> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GameError("Invalid profile.");
  const { name, avatar } = value as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 20)
    throw new GameError("Enter a name between 1 and 20 characters.");
  if (!isAvatar(avatar)) throw new GameError("Choose a player avatar.");
  const profile = { name: displayName(name), avatar };
  const now = Date.now();
  await db
    .prepare(`INSERT INTO players(id,display_name,avatar,created_at,last_seen_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,avatar=excluded.avatar,last_seen_at=MAX(players.last_seen_at,excluded.last_seen_at)`)
    .bind(id, profile.name, profile.avatar, now, now)
    .run();
  return profile;
}
