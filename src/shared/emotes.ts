import { findPlayer, inPlay } from "./game";
import { GameError } from "./game-error";
import type { Game } from "./game";

export const EMOTE_DURATION_MS = 1560;
export const EMOTE_COOLDOWN_MS = 1500;
export const EMOTE_IDS = ["chicken", "perso", "goblin", "princess", "king"] as const;
export type Emote = { id: (typeof EMOTE_IDS)[number]; sentAt: number };

export function sendEmote(game: Game, id: string, emote: Emote["id"], now: number) {
  const sender = findPlayer(game, id) ?? game.spectators?.find((spectator) => spectator.id === id);
  if (!sender) throw new GameError("joinFirst");
  if (!inPlay(game)) throw new GameError("emotesPlayOnly");
  if (sender.emote && now - sender.emote.sentAt < EMOTE_COOLDOWN_MS)
    throw new GameError("emoteCooldown");
  sender.emote = { id: emote, sentAt: now };
}
