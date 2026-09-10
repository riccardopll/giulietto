import { GameError } from "./game-error";
import type { Game } from "./game";

export const EMOTE_DURATION_MS = 1560;
export const EMOTE_COOLDOWN_MS = 3000;
export type Emote = { id: "chicken"; sentAt: number };

export function sendEmote(game: Game, playerId: string, emote: unknown, now: number) {
  const player = game.players.find((p) => p.id === playerId);
  if (!player || player.lives <= 0) throw new GameError("Only players can send emotes.");
  if (!["bidding", "playing", "trick"].includes(game.phase))
    throw new GameError("Emotes are available during play.");
  if (emote !== "chicken") throw new GameError("Unknown emote.");
  if (player.emote && now - player.emote.sentAt < EMOTE_COOLDOWN_MS)
    throw new GameError("Wait before sending another emote.");
  player.emote = { id: emote, sentAt: now };
}
