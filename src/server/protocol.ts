import { isAvatar } from "../shared/avatars";
import type { Command, EntryCommand, TableCommand } from "../shared/commands";
import { chatText, sendChat } from "../shared/chat";
import { EMOTE_IDS, sendEmote } from "../shared/emotes";
import { GameError, type ErrorCode } from "../shared/game-error";
import { inviteRematch } from "../shared/rematch";
import {
  autoPlays,
  bid,
  forfeit,
  deal,
  donate,
  play,
  makePlayer,
  tick,
  MIN_STARTING_LIVES,
  MIN_TURN_SECONDS,
  MAX_TURN_SECONDS,
  MAX_STARTING_LIVES,
  type Game,
  findPlayer,
} from "../shared/game";

const botNames = ["Vannacci", "Tutorial", "Perso", "Pippa", "Netanyahu", "Slayer 1.90"];

function integer(value: unknown, code: ErrorCode) {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new GameError(code);
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
      return {
        action: "join",
        name,
        avatar,
        matchmaking: input.matchmaking === true,
        resume: input.resume === true,
      };
    case "rename":
      if (typeof input.name !== "string") throw new GameError("nameRequired");
      return { action: "rename", name: displayName(input.name) };
    case "settings": {
      const option = input.option;
      if (option === "lifeDonation") {
        if (typeof input.value !== "boolean") throw new GameError("optionRequired");
        return { action: "settings", option, value: input.value };
      }
      if (option !== "startingLives" && option !== "turnSeconds")
        throw new GameError("optionRequired");
      const lives = option === "startingLives";
      const min = lives ? MIN_STARTING_LIVES : MIN_TURN_SECONDS;
      const max = lives ? MAX_STARTING_LIVES : MAX_TURN_SECONDS;
      const value = input.value;
      if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
        throw new GameError(lives ? "livesRange" : "moveTimeRange");
      return { action: "settings", option, value };
    }
    case "start":
    case "addBot":
    case "rematch":
    case "leave":
      return { action: input.action };
    case "kick":
    case "donate":
      if (typeof input.playerId !== "string") throw new GameError("playerRequired");
      return { action: input.action, playerId: input.playerId };
    case "bid":
      return { action: "bid", bid: integer(input.bid, "invalidBid") };
    case "play":
      return {
        action: "play",
        card: integer(input.card, "invalidCard"),
        mode: input.mode === "high" || input.mode === "low" ? input.mode : undefined,
      };
    case "emote": {
      const emote = EMOTE_IDS.find((id) => id === input.emote);
      if (!emote) throw new GameError("invalidRequest");
      return { action: "emote", emote };
    }
    case "chat":
      return { action: "chat", text: chatText(input.text) };
    default:
      throw new GameError("invalidRequest");
  }
}
export function command(value: unknown): Command {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GameError("invalidRequest");
  const input = value as Record<string, unknown>;
  const parsed = fields(input);
  if (typeof input.commandId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.commandId))
    throw new GameError("invalidRequest");
  return {
    ...parsed,
    commandId: input.commandId,
    ...(typeof input.code === "string" ? { code: input.code } : {}),
  };
}
export function join(
  game: Game,
  id: string,
  name: string,
  now: number,
  { matchmaking = false, resume = false } = {},
) {
  if (game.kicked?.includes(id)) {
    if (resume) throw new GameError("removed");
    game.kicked = game.kicked.filter((kicked) => kicked !== id);
  }
  const seated = findPlayer(game, id);
  if (matchmaking && game.phase !== "lobby" && !seated) throw new GameError("tableClosed");
  const existing = seated ?? game.spectators?.find((spectator) => spectator.id === id);
  if (existing) {
    existing.seen = now;
    return;
  }
  if (game.phase !== "lobby") {
    (game.spectators ??= []).push({ id, name, seen: now });
    return;
  }
  if (game.players.length >= 6) throw new GameError("tableFull");
  game.players.push({ ...makePlayer(id, name, now), lives: game.startingLives });
  if (!game.host) game.host = id;
  tick(game, now);
}
export function apply(game: Game, id: string, input: Command, now: number) {
  if (input.action === "join") {
    join(game, id, displayName(input.name), now, input);
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
    else throw new GameError("spectating");
    return;
  }
  const player = findPlayer(game, id);
  if (!player) throw new GameError("joinFirst");
  if (player.forfeited && !["leave", "chat", "emote"].includes(input.action))
    throw new GameError("spectating");
  player.seen = now;
  if (input.action === "rename") {
    if (game.phase !== "lobby") throw new GameError("namesLobbyOnly");
    player.name = input.name;
  } else if (input.action === "emote") {
    sendEmote(game, id, input.emote, now);
  } else if (input.action === "chat") {
    sendChat(game, id, input.text, now);
  } else if (input.action === "settings") {
    if (game.host !== id) throw new GameError("hostOnlyOptions");
    if (game.phase !== "lobby") throw new GameError("optionsLocked");
    if (input.option === "lifeDonation") game.lifeDonation = input.value;
    else {
      game[input.option] = input.value;
      if (input.option === "startingLives")
        for (const member of game.players) member.lives = input.value;
    }
  } else if (input.action === "addBot") {
    if (game.host !== id) throw new GameError("hostOnlyBots");
    if (game.phase !== "lobby") throw new GameError("botsLobbyOnly");
    if (game.players.length >= 6) throw new GameError("tableFull");
    const names = botNames.filter((name) => !game.players.some((member) => member.name === name));
    const name = names[Math.floor(Math.random() * names.length)];
    game.players.push({
      ...makePlayer(`bot:${crypto.randomUUID()}`, name, now),
      lives: game.startingLives,
      bot: true,
    });
  } else if (input.action === "kick") {
    if (game.host !== id) throw new GameError("hostOnlyRemove");
    if (game.phase !== "lobby") throw new GameError("removeLobbyOnly");
    const target = findPlayer(game, input.playerId);
    if (!target || target.id === id) throw new GameError("playerRequired");
    game.players = game.players.filter((member) => member !== target);
    if (!target.bot) (game.kicked ??= []).push(target.id);
  } else if (input.action === "start") {
    if (game.host !== id) throw new GameError("hostOnlyStart");
    if (game.phase !== "lobby" || game.players.length < 2) throw new GameError("needTwoPlayers");
    deal(game, now);
  } else if (input.action === "bid") bid(game, id, input.bid, now);
  else if (input.action === "play") {
    if (autoPlays(game)) throw new GameError("notYourTurn");
    play(game, id, game.count === 1 ? player.hand[0] : input.card, input.mode, now);
  } else if (input.action === "donate") donate(game, id, input.playerId);
  else if (input.action === "rematch") {
    if (!input.code) throw new GameError("invalidRequest");
    inviteRematch(game, id, input.code, now);
  } else if (input.action === "leave" && game.phase === "lobby") {
    game.players = game.players.filter((member) => member.id !== id);
    if (game.host === id) game.host = game.players.find((member) => !member.bot)?.id ?? "";
  } else if (input.action === "leave") forfeit(game, id, now);
}
export function displayName(value: unknown) {
  const name = typeof value === "string" ? value.trim().slice(0, 20) : "Guest";
  if (!name) throw new GameError("nameRequired");
  return name;
}
export function roomCode(value: unknown) {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new GameError("codeInvalid");
  return code;
}
export async function lobbyCode(key: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
  );
  return Array.from(
    bytes.slice(0, 8),
    (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32],
  ).join("");
}
export function rejection(code: ErrorCode, status: number) {
  return Response.json({ error: code }, { status });
}
export function failure(error: unknown) {
  if (error instanceof GameError) return rejection(error.code, 400);
  console.error("Game operation failed", error);
  return rejection("unavailable", 503);
}
