import { expect, test } from "vitest";
import { CHAT_HISTORY, CHAT_MAX_LENGTH, chatText, sendChat } from "../../src/shared/chat";
import { gameFixture } from "./helpers";

test("normalizes message text and rejects blank or oversized messages", () => {
  expect(chatText("  good \n luck\t all  ")).toBe("good luck all");
  expect(chatText("x".repeat(CHAT_MAX_LENGTH))).toHaveLength(CHAT_MAX_LENGTH);
  for (const value of ["", "   ", "\n", 12, undefined]) {
    expect(() => chatText(value)).toThrow("Type a message.");
  }
  expect(() => chatText("x".repeat(CHAT_MAX_LENGTH + 1))).toThrow("within");
});

test("anyone at the table chats during play and messages keep their order", () => {
  const game = gameFixture();
  game.spectators = [{ id: "watcher", name: "Observer", seen: 0 }];
  game.players[2].lives = 0;
  const before = structuredClone(game);
  expect(() => sendChat(game, "never-joined", "hi", 1000)).toThrow("Join this table");
  sendChat(game, "p0", "hello", 1000);
  sendChat(game, "watcher", "hi from the stands", 1001);
  sendChat(game, "p2", "still here", 1002);
  expect(game.chat).toEqual([
    { id: 1, sender: "p0", name: "bot_1", text: "hello", sentAt: 1000 },
    { id: 2, sender: "watcher", name: "Observer", text: "hi from the stands", sentAt: 1001 },
    { id: 3, sender: "p2", name: "bot_3", text: "still here", sentAt: 1002 },
  ]);
  const withoutChat = structuredClone(game);
  delete withoutChat.chat;
  expect(withoutChat).toEqual(before);
  for (const phase of ["lobby", "results", "finished"] as const) {
    game.phase = phase;
    expect(() => sendChat(game, "p1", "hi", 2000)).toThrow("during play");
    expect(() => sendChat(game, "watcher", "hi", 2000)).toThrow("during play");
  }
});

test("keeps only the newest messages while ids keep growing", () => {
  const game = gameFixture();
  for (let i = 1; i <= CHAT_HISTORY + 5; i++) sendChat(game, "p0", `message ${i}`, i);
  expect(game.chat).toHaveLength(CHAT_HISTORY);
  expect(game.chat![0]).toMatchObject({ id: 6, text: "message 6" });
  expect(game.chat!.at(-1)).toMatchObject({ id: CHAT_HISTORY + 5 });
});
