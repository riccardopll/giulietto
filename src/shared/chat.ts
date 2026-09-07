export const CHAT_MAX_LENGTH = 280;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_INTERVAL_MS = 1000;

export type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  sentAt: number;
};
