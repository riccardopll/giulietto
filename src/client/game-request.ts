import type { EntryCommand, TableCommand } from "../shared/commands";
import type { GameView } from "../shared/game";

export type HttpCommand = (EntryCommand | TableCommand) & {
  code?: string;
  name?: string;
  commandId?: string;
};

export class GameRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
  get retryable() {
    return ![400, 401, 403, 404].includes(this.status);
  }
}

export async function requestGame(
  token: string,
  command: HttpCommand,
  controller = new AbortController(),
): Promise<GameView> {
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), 10000);
  try {
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-player-token": token },
      signal: controller.signal,
      body: JSON.stringify({ ...command, commandId: command.commandId ?? crypto.randomUUID() }),
    });
    const data = (await response.json().catch(() => null)) as
      | (GameView & { error?: string })
      | null;
    controller.signal.throwIfAborted();
    if (!response.ok) throw new GameRequestError(data?.error || "unreachable", response.status);
    if (!data) throw new Error("invalidResponse");
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
