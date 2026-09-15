import { findPlayer, inPlay } from "./game";
import { GameError } from "./game-error";
import type { Game } from "./game";

export const EMOTE_DURATION_MS = 1560;
export const EMOTE_COOLDOWN_MS = 3000;
export type Emote = { id: "chicken" | "perso"; sentAt: number };

export function sendEmote(game: Game, id: string, emote: Emote["id"], now: number) {
  const sender = findPlayer(game, id) ?? game.spectators?.find((spectator) => spectator.id === id);
  if (!sender) throw new GameError("Join this table first.");
  if (!inPlay(game)) throw new GameError("Emotes are available during play.");
  if (sender.emote && now - sender.emote.sentAt < EMOTE_COOLDOWN_MS)
    throw new GameError("Wait before sending another emote.");
  sender.emote = { id: emote, sentAt: now };
}
