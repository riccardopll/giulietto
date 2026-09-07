import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { command, displayName, failure } from "./protocol";
import type { view } from "../shared/game";

type State = ReturnType<typeof view>;
export class MatchQueue extends DurableObject<Env> {
  async fetch(req: Request) {
    // Serialize the seat reservation through the room's commit, including concurrent strangers.
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const b = command(await req.json());
        displayName(b.name);
        const id = req.headers.get("x-player-id")!;
        const key = `request:${id}:${b.commandId}`;
        const saved = this.ctx.storage.kv.get(key) as { code: string; at: number } | undefined;
        const send = (code: string, action: string, create = false) =>
          this.env.ROOMS.getByName(code).fetch(
            `https://internal/${code}${create ? "/create" : ""}`,
            {
              method: "POST",
              headers: { "x-player-id": id },
              body: JSON.stringify({ ...b, action }),
            },
          );
        if (saved) {
          const resumed = await send(saved.code, "join");
          if (resumed.status !== 400) return resumed;
          this.ctx.storage.kv.delete(key);
        }
        const candidates = (
          (this.ctx.storage.kv.get("lobbies") as { code: string; at: number }[] | undefined) ?? []
        ).filter((r) => Date.now() - r.at < 120000);
        const unavailable = new Set<string>();
        if (b.action === "match") {
          for (const candidate of candidates) {
            // Persist the reservation target before cross-object I/O so retries cannot lose a seat.
            this.ctx.storage.kv.put(key, { code: candidate.code, at: Date.now() });
            const res = await send(candidate.code, "join");
            if (res.ok) {
              this.ctx.storage.kv.put(key, { code: candidate.code, at: Date.now() });
              return res;
            }
            if (res.status !== 400) return res;
            this.ctx.storage.kv.delete(key);
            unavailable.add(candidate.code);
          }
        }
        // Deterministic code makes creation retry-safe even after a crash between the two objects.
        const bytes = new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)),
        );
        const code = Array.from(
          bytes.slice(0, 8),
          (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
        ).join("");
        const res = await send(code, b.action, true);
        if (!res.ok) return res;
        const state = (await res.json()) as State;
        if (b.action === "match") candidates.push({ code, at: Date.now() });
        this.ctx.storage.kv.put(
          "lobbies",
          candidates.filter((r) => !unavailable.has(r.code)),
        );
        this.ctx.storage.kv.put(key, { code, at: Date.now() });
        if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + DAY);
        return Response.json(state);
      } catch (error) {
        return failure(error);
      }
    });
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of this.ctx.storage.kv.list<{ at: number }>({ prefix: "request:" })) {
        if (Date.now() - value.at >= DAY) this.ctx.storage.kv.delete(key);
      }
      if (Array.from(this.ctx.storage.kv.list({ prefix: "request:", limit: 1 })).length)
        if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + DAY);
    });
  }
}
const DAY = 86400000;
