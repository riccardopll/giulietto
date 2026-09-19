import { isAvatar } from "../shared/avatars";
import type { Command, EntryCommand, TableCommand } from "../shared/commands";
import { chatText, sendChat } from "../shared/chat";
import { EMOTE_IDS, sendEmote } from "../shared/emotes";
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

const botNames = [
  "Vannacci",
  "Tutorial",
  "El Matador",
  "Asso",
  "Zero",
  "Briscola",
  "Il Barone",
  "Scaramanzia",
  "Senza Pietà",
  "Il Notaio",
  "Tre di Coppe",
  "Il Professore",
];

function integer(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new GameError(message);
  return value;
}
function fields(input: Record<string, unknown>): EntryCommand | TableCommand {
  const name = typeof input.name === "string" ? input.name : undefined;
  const avatar = isAvatar(input.avatar) ? input.avatar : undefined;
  switch (input.action) {
    case "create":
    case "match":
      return { action: input.action, name, avatar };
    case "join":
      return { action: "join", name, avatar, matchmaking: input.matchmaking === true };
    case "rename":
      if (typeof input.name !== "string") throw new GameError("Enter a display name.");
      return { action: "rename", name: displayName(input.name) };
    case "settings": {
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
      return { action: "settings", startingLives: lives };
    }
    case "start":
    case "addBot":
    case "leave":
      return { action: input.action };
    case "removeBot":
      if (typeof input.playerId !== "string") throw new GameError("Choose a bot to remove.");
      return { action: "removeBot", playerId: input.playerId };
    case "bid":
      return { action: "bid", bid: integer(input.bid, "Enter a valid prediction.") };
    case "play":
      return {
        action: "play",
        card: input.card === undefined ? undefined : integer(input.card, "Choose a valid card."),
        mode: input.mode === "high" || input.mode === "low" ? input.mode : undefined,
      };
    case "emote": {
      const emote = EMOTE_IDS.find((id) => id === input.emote);
      if (!emote) throw new GameError("Unknown emote.");
      return { action: "emote", emote };
    }
    case "chat":
      return { action: "chat", text: chatText(input.text) };
    default:
      throw new GameError("Unknown action.");
  }
}
export function command(value: unknown): Command {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GameError("Invalid request.");
  const input = value as Record<string, unknown>;
  const parsed = fields(input);
  if (typeof input.commandId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.commandId))
    throw new GameError("Invalid command ID.");
  return {
    ...parsed,
    commandId: input.commandId,
    ...(typeof input.code === "string" ? { code: input.code } : {}),
  };
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
    join(game, id, displayName(input.name), now, input.matchmaking);
    const seated = findPlayer(game, id);
    if (seated && input.avatar) seated.avatar = input.avatar;
    if (seated && game.phase === "lobby") seated.name = displayName(input.name);
    return;
  }
  const spectator = game.spectators?.find((spectator) => spectator.id === id);
  if (spectator) {
    spectator.seen = now;
    if (input.action === "emote") sendEmote(game, id, input.emote, now);
    else if (input.action === "chat") sendChat(game, id, input.text, now);
    else if (input.action === "leave")
      game.spectators = game.spectators!.filter((spectator) => spectator.id !== id);
    else throw new GameError("Spectators cannot play or change the game.");
    return;
  }
  const player = findPlayer(game, id);
  if (!player) throw new GameError("Join this table first.");
  player.seen = now;
  if (input.action === "rename") {
    if (game.phase !== "lobby") throw new GameError("Names can only change in the lobby.");
    player.name = input.name;
  } else if (input.action === "emote") {
    sendEmote(game, id, input.emote, now);
  } else if (input.action === "chat") {
    sendChat(game, id, input.text, now);
  } else if (input.action === "settings") {
    if (game.host !== id) throw new GameError("Only the host can change starting lives.");
    if (game.phase !== "lobby")
      throw new GameError("Starting lives cannot change after the game starts.");
    game.startingLives = input.startingLives;
    for (const member of game.players) member.lives = input.startingLives;
  } else if (input.action === "addBot" || input.action === "removeBot") {
    if (game.host !== id) throw new GameError("Only the host can add or remove bots.");
    if (game.phase !== "lobby") throw new GameError("Bots can only change in the lobby.");
    if (input.action === "addBot") {
      if (game.players.length >= 6) throw new GameError("This table is full.");
      const names = botNames
        .map((name) => `BOT: ${name}`)
        .filter((name) => !game.players.some((member) => member.name === name));
      const name = names[Math.floor(Math.random() * names.length)];
      game.players.push({
        ...makePlayer(`bot:${crypto.randomUUID()}`, name, now),
        lives: game.startingLives,
        bot: true,
      });
    } else {
      if (!findPlayer(game, input.playerId)?.bot) throw new GameError("Choose a bot to remove.");
      game.players = game.players.filter((member) => member.id !== input.playerId);
    }
  } else if (input.action === "start") {
    if (game.host !== id) throw new GameError("Only the host can start.");
    if (game.phase !== "lobby" || game.players.length < 2)
      throw new GameError("You need at least two players.");
    deal(game, now);
  } else if (input.action === "bid") bid(game, id, input.bid, now);
  else if (input.action === "play") {
    if (game.count !== 1 && input.card === undefined) throw new GameError("Choose a valid card.");
    play(game, id, game.count === 1 ? player.hand[0] : input.card!, input.mode, now);
  } else if (input.action === "leave" && game.phase === "lobby") {
    game.players = game.players.filter((member) => member.id !== id);
    if (game.host === id) game.host = game.players.find((member) => !member.bot)?.id ?? "";
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
