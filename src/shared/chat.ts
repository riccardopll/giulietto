import { findPlayer, inPlay, type Game } from "./game";
import { GameError } from "./game-error";

export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY = 50;
export type ChatMessage = {
  id: number;
  sender: string;
  name: string;
  text: string;
  sentAt: number;
};

export function chatText(value: unknown) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) throw new GameError("Type a message.");
  if (text.length > CHAT_MAX_LENGTH)
    throw new GameError(`Keep messages within ${CHAT_MAX_LENGTH} characters.`);
  return text;
}

export function sendChat(game: Game, id: string, text: string, now: number) {
  const sender = findPlayer(game, id) ?? game.spectators?.find((spectator) => spectator.id === id);
  if (!sender) throw new GameError("Join this table first.");
  if (!inPlay(game)) throw new GameError("Chat is available during play.");
  const chat = (game.chat ??= []);
  chat.push({ id: (chat.at(-1)?.id ?? 0) + 1, sender: id, name: sender.name, text, sentAt: now });
  if (chat.length > CHAT_HISTORY) chat.splice(0, chat.length - CHAT_HISTORY);
}
