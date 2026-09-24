import { findPlayer, type Game } from "./game";
import { GameError } from "./game-error";

export const REMATCH_INVITE_MS = 60000;

export function checkRematch(game: Game, id: string, now: number) {
  if (game.phase !== "finished") throw new GameError("A rematch can start once the game is over.");
  const player = findPlayer(game, id);
  if (!player || player.bot || player.forfeited)
    throw new GameError("Only players at this table can start a rematch.");
  const invite = game.rematch;
  if (invite && now < invite.expiresAt)
    throw new GameError(
      `${findPlayer(game, invite.by)?.name ?? "Another player"} already invited everyone to a rematch.`,
    );
}

export function inviteRematch(game: Game, id: string, code: string, now: number) {
  checkRematch(game, id, now);
  game.rematch = { code, by: id, expiresAt: now + REMATCH_INVITE_MS };
}
