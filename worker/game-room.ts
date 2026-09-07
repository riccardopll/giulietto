import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { GameError } from "../lib/game-error";
import { makeGame, player, tick, view, type Game } from "../lib/game";
import { historyStatements, needsHistory } from "../lib/match-history";
import { apply, command, displayName, failure, type Command } from "./protocol";

type Record = { game: Game; updated: number; outbox?: Game; retryAt?: number; failures?: number };
type Attachment = { id: string };
const DAY = 86400000;

export class GameRoom extends DurableObject<Env> {
  private rates = new Map<string, { start: number; count: number }>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS receipts (player TEXT, command TEXT, PRIMARY KEY(player,command))",
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  private read() {
    return this.ctx.storage.kv.get("room") as Record | undefined;
  }
  private send(ws: WebSocket, message: unknown) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      ws.close(1011, "Reconnect");
    }
  }
  private snapshot(ws: WebSocket, g: Game) {
    const { id } = ws.deserializeAttachment() as Attachment;
    try {
      this.send(ws, { type: "state", state: view(g, id) });
    } catch {
      /* A leave acknowledgement is sent before the client closes its socket. */
    }
  }
  private broadcast(g: Game) {
    for (const ws of this.ctx.getWebSockets()) this.snapshot(ws, g);
  }
  private due(r: Record) {
    const g = r.game;
    if (Date.now() - r.updated >= DAY && r.outbox) return Infinity;
    if (g.phase !== "lobby") return g.deadline || r.updated + DAY;
    const connected = new Set(
      this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).id),
    );
    return Math.min(
      g.startAt || Infinity,
      ...g.players.filter((p) => !connected.has(p.id)).map((p) => p.seen + 120000),
      r.updated + DAY,
    );
  }
  private async schedule(r: Record) {
    await this.ctx.storage.setAlarm(
      Math.max(Date.now() + 1, Math.min(this.due(r), r.retryAt ?? Infinity)),
    );
  }
  private async save(before: Record, g: Game, receipt?: { id: string; commandId: string }) {
    g.revision = before.game.revision + 1;
    const r: Record = { ...before, game: g, updated: Date.now() };
    if (needsHistory(before.game, g)) {
      r.outbox = structuredClone(g);
      r.retryAt = Date.now() + 1;
      r.failures = 0;
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.kv.put("room", r);
      if (receipt)
        this.ctx.storage.sql.exec(
          "INSERT INTO receipts VALUES(?,?)",
          receipt.id,
          receipt.commandId,
        );
    });
    await this.schedule(r);
    this.broadcast(g);
    return r;
  }
  private async advance(r: Record) {
    const g = structuredClone(r.game);
    const now = Date.now();
    // Connections survive hibernation. Open lobby seats should not time out while waiting.
    if (g.phase === "lobby") {
      const ids = new Set(
        this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).id),
      );
      for (const p of g.players) if (ids.has(p.id) && now - p.seen >= 60000) p.seen = now;
    }
    tick(g, now);
    return JSON.stringify(g) === JSON.stringify(r.game) ? r : this.save(r, g);
  }
  private async load(code: string) {
    if (this.ctx.storage.kv.get("expired"))
      throw new GameError("Table not found or expired. Check the invite code.");
    let r = this.read();
    if (!r) {
      // One-time import preserves rooms opened before the Durable Object rollout.
      const old = await this.env.DB.prepare("SELECT state,updated FROM rooms WHERE code=?")
        .bind(code)
        .first<{ state: string; updated: number }>();
      if (old && Date.now() - old.updated < DAY) {
        r = { game: JSON.parse(old.state), updated: old.updated };
        this.ctx.storage.kv.put("room", r);
        await this.schedule(r);
      }
    }
    if (!r || Date.now() - r.updated >= DAY)
      throw new GameError("Table not found or expired. Check the invite code.");
    return r;
  }
  private async execute(r: Record, id: string, b: Command) {
    const duplicate = this.ctx.storage.sql
      .exec("SELECT 1 FROM receipts WHERE player=? AND command=?", id, b.commandId)
      .toArray().length;
    if (!duplicate) {
      const g = structuredClone(r.game);
      apply(g, id, b, Date.now());
      r = await this.save(r, g, { id, commandId: b.commandId });
    }
    return b.action === "leave" ? { ok: true } : view(r.game, id);
  }
  async fetch(req: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const url = new URL(req.url);
        const code = url.pathname.split("/")[1];
        const id = req.headers.get("x-player-id")!;
        if (url.pathname.endsWith("/create")) {
          const b = (await req.json()) as Command;
          let r = this.read();
          if (r && r.game.host !== id) throw new GameError("Table already exists.");
          if (!r) {
            const g = makeGame(
              code,
              player(id, displayName(b.name), Date.now()),
              b.action === "match",
            );
            r = { game: g, updated: Date.now() };
            this.ctx.storage.kv.put("room", r);
            await this.schedule(r);
          }
          return Response.json(view(r.game, id));
        }
        let r = await this.load(code);
        // Membership must be checked before reads can advance or broadcast a room.
        if (req.method === "GET" && !r.game.players.some((p) => p.id === id))
          throw new GameError("Join this table first.");
        r = await this.advance(r);
        if (url.pathname.endsWith("/socket")) {
          view(r.game, id);
          const sockets = this.ctx.getWebSockets(id);
          if (sockets.length >= 3) sockets[0].close(4002, "Connected in another tab.");
          const { 0: client, 1: server } = new WebSocketPair();
          this.ctx.acceptWebSocket(server, [id]);
          server.serializeAttachment({ id } satisfies Attachment);
          this.snapshot(server, r.game);
          await this.schedule(r);
          return new Response(null, {
            status: 101,
            webSocket: client,
            headers: { "Sec-WebSocket-Protocol": "giulietto" },
          });
        }
        if (req.method === "GET") return Response.json(view(r.game, id));
        return Response.json(await this.execute(r, id, command(await req.json())));
      } catch (error) {
        return failure(error);
      }
    });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      let commandId: string | undefined;
      try {
        const { id } = ws.deserializeAttachment() as Attachment;
        const now = Date.now();
        let rate = this.rates.get(id);
        if (!rate || now - rate.start > 1000) {
          rate = { start: now, count: 0 };
          this.rates.set(id, rate);
        }
        if (++rate.count > 10) {
          ws.close(1008, "Too many commands.");
          return;
        }
        if (typeof message !== "string" || message.length > 2048) {
          ws.close(1009, "Message too large.");
          return;
        }
        let value;
        try {
          value = JSON.parse(message);
        } catch {
          throw new GameError("Invalid JSON.");
        }
        const b = command(value);
        commandId = b.commandId;
        if (!["start", "bid", "play", "leave"].includes(b.action))
          throw new GameError("Invalid room command.");
        const r = this.read();
        if (!r) throw new GameError("Table expired.");
        const state = await this.execute(await this.advance(r), id, b);
        this.send(ws, { type: "ack", commandId, state });
      } catch (error) {
        const response = failure(error);
        this.send(ws, { type: "error", commandId, ...((await response.json()) as object) });
      }
    });
  }
  async webSocketClose(ws: WebSocket, code: number) {
    ws.close(code === 1005 ? 1000 : code);
    await this.ctx.blockConcurrencyWhile(async () => {
      const r = this.read();
      if (!r) return;
      const { id } = ws.deserializeAttachment() as Attachment;
      const p = r.game.players.find((p) => p.id === id);
      if (p && r.game.phase === "lobby") {
        p.seen = Date.now();
        this.ctx.storage.kv.put("room", r);
      }
      await this.schedule(r);
    });
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011);
  }
  async alarm() {
    const pending = await this.ctx.blockConcurrencyWhile(async () => {
      let r = this.read();
      if (!r) return;
      if (Date.now() - r.updated >= DAY && !r.outbox) {
        for (const ws of this.ctx.getWebSockets()) ws.close(4001, "Table expired.");
        await this.ctx.storage.deleteAll();
        this.ctx.storage.kv.put("expired", true);
        return;
      }
      r = await this.advance(r);
      // Retry deadline is persisted before external I/O, including process failure.
      const pending =
        r.outbox && (r.retryAt ?? 0) <= Date.now() ? structuredClone(r.outbox) : undefined;
      if (pending) {
        r.failures = (r.failures ?? 0) + 1;
        r.retryAt = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(r.failures, 9));
        this.ctx.storage.kv.put("room", r);
      }
      await this.schedule(r);
      return pending;
    });
    if (!pending) return;
    try {
      await this.env.DB.batch(historyStatements(this.env.DB, pending));
      await this.ctx.blockConcurrencyWhile(async () => {
        const r = this.read();
        if (r?.outbox?.revision === pending.revision) {
          delete r.outbox;
          delete r.retryAt;
          delete r.failures;
          this.ctx.storage.kv.put("room", r);
          await this.schedule(r);
        }
      });
    } catch (error) {
      console.error("Match history delivery will retry", error);
    }
  }
}
