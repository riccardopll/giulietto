import { findPlayer, type Game } from "./game";
import { GameError } from "./game-error";

export const REMATCH_INVITE_MS = 60000;

export function checkRematch(game: Game, id: string, now: number) {
  if (game.phase !== "finished") throw new GameError("rematchNotOver");
  const player = findPlayer(game, id);
  if (!player || player.bot || player.forfeited) throw new GameError("rematchPlayersOnly");
  const invite = game.rematch;
  if (invite && now < invite.expiresAt) throw new GameError("rematchInvited");
}

export function inviteRematch(game: Game, id: string, code: string, now: number) {
  checkRematch(game, id, now);
  game.rematch = { code, by: id, expiresAt: now + REMATCH_INVITE_MS };
}
