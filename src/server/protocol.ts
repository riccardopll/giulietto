import { ENTRY_ACTIONS, TABLE_ACTIONS } from "../shared/actions";
import { isAvatar } from "../shared/avatars";
import { sendEmote } from "../shared/emotes";
import { GameError } from "../shared/game-error";
import {
  bid,
  deal,
  play,
  makePlayer,
  tick,
  MIN_STARTING_LIVES,
  MAX_STARTING_LIVES,
  type Game,
  findPlayer,
} from "../shared/game";

export type Command = Record<string, unknown> & { action: string; commandId: string };
export function command(value: unknown): Command {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GameError("Invalid request.");
  const input = value as Record<string, unknown>;
  if (![...ENTRY_ACTIONS, ...TABLE_ACTIONS].includes(String(input.action)))
    throw new GameError("Unknown action.");
  if (typeof input.commandId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.commandId))
    throw new GameError("Invalid command ID.");
  if (input.action === "bid" && (typeof input.bid !== "number" || !Number.isInteger(input.bid)))
    throw new GameError("Enter a valid prediction.");
  return input as Command;
}
export function join(game: Game, id: string, name: string, now: number, matchmaking = false) {
  const seated = findPlayer(game, id);
  if (matchmaking && game.phase !== "lobby" && !seated)
    throw new GameError("This table is no longer available.");
  const existing = seated ?? game.spectators?.find((spectator) => spectator.id === id);
  if (existing) {
    existing.seen = now;
    return;
  }
  if (game.phase !== "lobby") {
    (game.spectators ??= []).push({ id, name, seen: now });
    return;
  }
  if (game.players.length >= 6) throw new GameError("This table is full.");
  game.players.push({ ...makePlayer(id, name, now), lives: game.startingLives });
  if (!game.host) game.host = id;
  tick(game, now);
}
export function apply(game: Game, id: string, input: Command, now: number) {
  if (input.action === "join") {
    join(game, id, displayName(input.name), now, input.matchmaking === true);
    const seated = findPlayer(game, id);
    if (seated && isAvatar(input.avatar)) seated.avatar = input.avatar;
    if (seated && game.phase === "lobby") seated.name = displayName(input.name);
    return;
  }
  const spectator = game.spectators?.find((spectator) => spectator.id === id);
  if (spectator) {
    if (input.action !== "leave") throw new GameError("Spectators cannot play or change the game.");
    game.spectators = game.spectators!.filter((spectator) => spectator.id !== id);
    return;
  }
  const player = findPlayer(game, id);
  if (!player) throw new GameError("Join this table first.");
  player.seen = now;
  if (input.action === "rename") {
    if (game.phase !== "lobby") throw new GameError("Names can only change in the lobby.");
    if (typeof input.name !== "string") throw new GameError("Enter a display name.");
    player.name = displayName(input.name);
  } else if (input.action === "emote") {
    sendEmote(game, id, input.emote, now);
  } else if (input.action === "settings") {
    if (game.host !== id) throw new GameError("Only the host can change starting lives.");
    if (game.phase !== "lobby")
      throw new GameError("Starting lives cannot change after the game starts.");
    const lives = input.startingLives;
    if (
      typeof lives !== "number" ||
      !Number.isInteger(lives) ||
      lives < MIN_STARTING_LIVES ||
      lives > MAX_STARTING_LIVES
    )
      throw new GameError(
        `Choose a whole number from ${MIN_STARTING_LIVES} to ${MAX_STARTING_LIVES} for starting lives.`,
      );
    game.startingLives = lives;
    for (const member of game.players) member.lives = lives;
  } else if (input.action === "start") {
    if (game.host !== id) throw new GameError("Only the host can start.");
    if (game.phase !== "lobby" || game.players.length < 2)
      throw new GameError("You need at least two players.");
    deal(game, now);
  } else if (input.action === "bid") bid(game, id, input.bid as number, now);
  else if (input.action === "play") {
    if (game.count !== 1 && (typeof input.card !== "number" || !Number.isInteger(input.card)))
      throw new GameError("Choose a valid card.");
    play(game, id, game.count === 1 ? player.hand[0] : (input.card as number), input.mode, now);
  } else if (input.action === "leave" && game.phase === "lobby") {
    game.players = game.players.filter((member) => member.id !== id);
    if (game.host === id) game.host = game.players[0]?.id ?? "";
  }
}
export function displayName(value: unknown) {
  const name = typeof value === "string" ? value.trim().slice(0, 20) : "Guest";
  if (!name) throw new GameError("Enter a display name.");
  return name;
}
export function roomCode(value: unknown) {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    throw new GameError("Enter a valid eight-character lobby code.");
  return code;
}
export function failure(error: unknown) {
  if (error instanceof GameError) return Response.json({ error: error.message }, { status: 400 });
  console.error("Game operation failed", error);
  return Response.json(
    { error: "The table is temporarily unavailable. Please try again." },
    { status: 503 },
  );
}
