import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { GameError } from "../shared/game-error";
import { TABLE_RETENTION_MS } from "../shared/game";
import { command, displayName, failure, lobbyCode } from "./protocol";
export class MatchQueue extends DurableObject<Env> {
  async fetch(req: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const input = command(await req.json());
        if (input.action !== "create" && input.action !== "match")
          throw new GameError("Invalid request.");
        displayName(input.name);
        const id = req.headers.get("x-player-id")!;
        const key = `request:${id}:${input.commandId}`;
        const saved = this.ctx.storage.kv.get(key) as { code: string; at: number } | undefined;
        const send = (code: string, action: string, create = false, matchmaking = false) =>
          this.env.ROOMS.getByName(code).fetch(
            `https://internal/${code}${create ? "/create" : ""}`,
            {
              method: "POST",
              headers: { "x-player-id": id },
              body: JSON.stringify({ ...input, action, matchmaking }),
            },
          );
        if (saved) {
          const resumed = await send(saved.code, "join", false, input.action === "match");
          if (resumed.status !== 400) return resumed;
          this.ctx.storage.kv.delete(key);
        }
        const candidates = (
          (this.ctx.storage.kv.get("lobbies") as { code: string; at: number }[] | undefined) ?? []
        ).filter((lobby) => Date.now() - lobby.at < 120000);
        const unavailable = new Set<string>();
        if (input.action === "match") {
          for (const candidate of candidates) {
            this.ctx.storage.kv.put(key, { code: candidate.code, at: Date.now() });
            const response = await send(candidate.code, "join", false, true);
            if (response.status !== 400) return response;
            this.ctx.storage.kv.delete(key);
            unavailable.add(candidate.code);
          }
        }
        const code = await lobbyCode(key);
        const response = await send(code, input.action, true);
        if (!response.ok) return response;
        if (input.action === "match") candidates.push({ code, at: Date.now() });
        this.ctx.storage.kv.put(
          "lobbies",
          candidates.filter((lobby) => !unavailable.has(lobby.code)),
        );
        this.ctx.storage.kv.put(key, { code, at: Date.now() });
        if (!(await this.ctx.storage.getAlarm()))
          await this.ctx.storage.setAlarm(Date.now() + TABLE_RETENTION_MS);
        return response;
      } catch (error) {
        return failure(error);
      }
    });
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of this.ctx.storage.kv.list<{ at: number }>({ prefix: "request:" })) {
        if (Date.now() - value.at >= TABLE_RETENTION_MS) this.ctx.storage.kv.delete(key);
      }
      if (Array.from(this.ctx.storage.kv.list({ prefix: "request:", limit: 1 })).length)
        if (!(await this.ctx.storage.getAlarm()))
          await this.ctx.storage.setAlarm(Date.now() + TABLE_RETENTION_MS);
    });
  }
}
