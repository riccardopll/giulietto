import type { view } from "../shared/game";

export class GameRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestGame(
  token: string,
  command: { action: string; [key: string]: unknown },
  controller = new AbortController(),
): Promise<ReturnType<typeof view>> {
  const timeout = setTimeout(
    () => controller.abort(new Error("The request timed out. Please try again.")),
    10000,
  );
  try {
    const response = await fetch("/api/game", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-player-token": token },
      signal: controller.signal,
      body: JSON.stringify({ commandId: crypto.randomUUID(), ...command }),
    });
    const data = (await response.json().catch(() => null)) as
      | (ReturnType<typeof view> & { error?: string })
      | null;
    controller.signal.throwIfAborted();
    if (!response.ok)
      throw new GameRequestError(
        data?.error || "Could not reach the table. Please try again.",
        response.status,
      );
    if (!data) throw new Error("Invalid table response. Please try again.");
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
