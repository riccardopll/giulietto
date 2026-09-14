import { SELF } from "cloudflare:test";
import { expect, onTestFinished, vi } from "vitest";
import type { GameView } from "../../src/shared/game";

type Input = { action: string; [field: string]: unknown };
type Reply =
  | { type: "ack"; commandId: string; state: GameView | { ok: true } }
  | { type: "error"; commandId?: string; error: string };
type Message = Reply | { type: "state"; state: GameView };
type Guest = { name: string; token: string };

export const origin = "http://game.test";

export const guest = (number: number): Guest => ({
  name: `bot_${number}`,
  token: crypto.randomUUID(),
});

const post = (player: Guest, input: Input) =>
  SELF.fetch(`${origin}/api/game`, {
    method: "POST",
    headers: { "x-player-token": player.token, Origin: origin },
    body: JSON.stringify({ name: player.name, commandId: crypto.randomUUID(), ...input }),
  });

const get = (player: Guest, code: string) =>
  SELF.fetch(`${origin}/api/game?code=${code}`, { headers: { "x-player-token": player.token } });

async function state(player: Guest, input: Input) {
  const response = await post(player, input);
  expect(response.status).toBe(200);
  return (await response.json()) as GameView;
}

async function connect(player: Guest, code: string) {
  const response = await SELF.fetch(`${origin}/api/game/socket?code=${code}`, {
    headers: {
      Upgrade: "websocket",
      "Sec-WebSocket-Protocol": `giulietto, ${player.token}`,
      Origin: origin,
    },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("Worker did not return a WebSocket.");
  const messages: Message[] = [];
  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") messages.push(JSON.parse(event.data) as Message);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason })),
  );
  socket.accept();
  let open = true;
  const close = () => {
    if (open) socket.close(1000);
    open = false;
  };
  onTestFinished(close);
  const latest = () => messages.findLast((message) => message.type === "state")?.state;
  await expect.poll(latest).toBeDefined();
  return {
    latest,
    close,
    closed,
    send: (message: string) => socket.send(message),
    async command(input: Input) {
      const commandId = typeof input.commandId === "string" ? input.commandId : crypto.randomUUID();
      socket.send(JSON.stringify({ ...input, commandId }));
      const reply = () =>
        messages.find(
          (message): message is Reply =>
            message.type !== "state" && message.commandId === commandId,
        );
      await expect.poll(reply).toBeDefined();
      return reply()!;
    },
  };
}

export const api = { post, get, state, connect };

/** Structured console output from the worker for the rest of the current test. */
export function captureLogs() {
  const logs: Record<string, unknown>[] = [];
  vi.spyOn(console, "log").mockImplementation((entry: unknown) => {
    if (entry && typeof entry === "object") logs.push(entry as Record<string, unknown>);
  });
  return logs;
}
