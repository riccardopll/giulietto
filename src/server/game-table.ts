import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { GameError } from "../shared/game-error";
import { makeGame, player, tick, view, SPECTATOR_RETENTION_MS, type Game } from "../shared/game";
import { historyStatements } from "./match-history";
import { eventStatements, gameEvents, type EventSource, type GameEvent } from "./game-events";
import { apply, command, displayName, failure, type Command } from "./protocol";

type Record = {
  game: Game;
  updated: number;
  outbox?: Game;
  retryAt?: number;
  failures?: number;
  deliveredSequence: number;
};
type Attachment = { id: string };
const DAY = 86400000;

export class GameTable extends DurableObject<Env> {
  private rates = new Map<string, { start: number; count: number }>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS receipts (player TEXT, command TEXT, PRIMARY KEY(player,command))",
    );
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS game_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL,
      revision INTEGER NOT NULL, round INTEGER NOT NULL, type TEXT NOT NULL,
      player_id TEXT, source TEXT NOT NULL, command_id TEXT,
      occurred_at INTEGER NOT NULL, payload TEXT NOT NULL
    )`);
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
  private connected() {
    return new Set(
      this.ctx
        .getWebSockets()
        .filter((ws) => ws.readyState === WebSocket.OPEN)
        .map((ws) => (ws.deserializeAttachment() as Attachment).id),
    );
  }
  private view(g: Game, id: string) {
    return view(g, id, this.connected());
  }
  private snapshot(ws: WebSocket, g: Game) {
    const { id } = ws.deserializeAttachment() as Attachment;
    try {
      this.send(ws, { type: "state", state: this.view(g, id) });
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
    const connected = this.connected();
    return Math.min(
      ...(g.phase === "lobby" ? g.players : [])
        .filter((p) => !connected.has(p.id))
        .map((p) => p.seen + 120000),
      ...(g.spectators ?? [])
        .filter((p) => !connected.has(p.id))
        .map((p) => p.seen + SPECTATOR_RETENTION_MS),
      g.deadline || Infinity,
      r.updated + DAY,
    );
  }
  private async schedule(r: Record) {
    await this.ctx.storage.setAlarm(
      Math.max(Date.now() + 1, Math.min(this.due(r), r.retryAt ?? Infinity)),
    );
  }
  private async save(
    before: Record,
    g: Game,
    receipt?: { id: string; commandId: string },
    origin?: EventSource,
  ) {
    g.revision = before.game.revision + 1;
    const r: Record = { ...before, game: g, updated: Date.now() };
    const events = gameEvents(
      before.game,
      g,
      origin ?? { source: "player", commandId: receipt?.commandId },
      r.updated,
    );
    if (events.length) {
      r.outbox = structuredClone(g);
      r.retryAt = Date.now() + 1;
      r.failures = 0;
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.kv.put("room", r);
      for (const event of events)
        this.ctx.storage.sql.exec(
          `INSERT INTO game_events
          (match_id,revision,round,type,player_id,source,command_id,occurred_at,payload)
          VALUES(?,?,?,?,?,?,?,?,?)`,
          event.match_id,
          event.revision,
          event.round,
          event.type,
          event.player_id,
          event.source,
          event.command_id,
          event.occurred_at,
          event.payload,
        );
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
    tick(g, now, this.connected());
    return JSON.stringify(g) === JSON.stringify(r.game)
      ? r
      : this.save(r, g, undefined, {
          source: ["bidding", "playing"].includes(r.game.phase) ? "timeout" : "system",
        });
  }
  private load() {
    if (this.ctx.storage.kv.get("expired"))
      throw new GameError("Table not found or expired. Check the invite code.");
    const r = this.read();
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
    return {
      state: b.action === "leave" ? { ok: true } : this.view(r.game, id),
      duplicate: !!duplicate,
    };
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
            r = { game: g, updated: Date.now(), deliveredSequence: 0 };
            this.ctx.storage.kv.put("room", r);
            await this.schedule(r);
          }
          return Response.json(this.view(r.game, id));
        }
        let r = this.load();
        // Membership must be checked before reads can advance or broadcast a room.
        if (
          req.method === "GET" &&
          !r.game.players.some((p) => p.id === id) &&
          !r.game.spectators?.some((p) => p.id === id)
        )
          throw new GameError("Join this table first.");
        r = await this.advance(r);
        if (url.pathname.endsWith("/socket")) {
          this.view(r.game, id);
          const sockets = this.ctx.getWebSockets(id);
          if (sockets.length >= 3) sockets[0].close(4002, "Connected in another tab.");
          const { 0: client, 1: server } = new WebSocketPair();
          this.ctx.acceptWebSocket(server, [id]);
          server.serializeAttachment({ id } satisfies Attachment);
          this.broadcast(r.game);
          await this.schedule(r);
          return new Response(null, {
            status: 101,
            webSocket: client,
            headers: { "Sec-WebSocket-Protocol": "giulietto" },
          });
        }
        if (req.method === "GET") return Response.json(this.view(r.game, id));
        const { state } = await this.execute(r, id, command(await req.json()));
        return Response.json(state);
      } catch (error) {
        return failure(error);
      }
    });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      let commandId: string | undefined;
      let action: string | undefined;
      let playerId: string | undefined;
      let outcome = "error";
      let reason: string | undefined;
      try {
        const { id } = ws.deserializeAttachment() as Attachment;
        playerId = id;
        const now = Date.now();
        let rate = this.rates.get(id);
        if (!rate || now - rate.start > 1000) {
          rate = { start: now, count: 0 };
          this.rates.set(id, rate);
        }
        if (++rate.count > 10) {
          outcome = "rate_limited";
          ws.close(1008, "Too many commands.");
          return;
        }
        if (typeof message !== "string" || message.length > 2048) {
          outcome = "invalid_message";
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
        action = b.action;
        if (!["settings", "start", "bid", "play", "emote", "leave"].includes(b.action))
          throw new GameError("Invalid room command.");
        const r = this.read();
        if (!r) throw new GameError("Table expired.");
        const { state, duplicate } = await this.execute(await this.advance(r), id, b);
        this.send(ws, { type: "ack", commandId, state });
        outcome = duplicate ? "duplicate" : "accepted";
      } catch (error) {
        const response = failure(error);
        const body = (await response.json()) as { error: string };
        outcome = response.status === 400 ? "rejected" : "error";
        reason = body.error;
        this.send(ws, { type: "error", commandId, ...body });
      } finally {
        const g = this.read()?.game;
        console.log({
          message: "websocket_command",
          commandId: commandId ?? null,
          action: action ?? null,
          playerId: playerId ?? null,
          roomCode: g?.code ?? null,
          matchId: g?.matchId ?? null,
          revision: g?.revision ?? null,
          outcome,
          ...(reason ? { reason } : {}),
        });
      }
    });
  }
  async webSocketClose(ws: WebSocket, code: number) {
    // Complete the handshake without echoing reserved, diagnostic-only codes.
    ws.close([1004, 1005, 1006, 1015].includes(code) ? 1000 : code);
    await this.ctx.blockConcurrencyWhile(async () => {
      const r = this.read();
      if (!r) return;
      const { id } = ws.deserializeAttachment() as Attachment;
      const p =
        r.game.phase === "lobby"
          ? r.game.players.find((p) => p.id === id)
          : r.game.spectators?.find((p) => p.id === id);
      if (p && !this.connected().has(id)) {
        p.seen = Date.now();
        this.ctx.storage.kv.put("room", r);
      }
      this.broadcast(r.game);
      await this.schedule(r);
    });
  }
  async webSocketError(ws: WebSocket) {
    ws.close(1011, "Reconnect");
    await this.webSocketClose(ws, 1011);
  }
  async alarm() {
    const pending = await this.ctx.blockConcurrencyWhile(async () => {
      let r = this.read();
      if (!r) return;
      if (
        Date.now() - r.updated >= DAY &&
        !r.outbox &&
        ["lobby", "finished"].includes(r.game.phase)
      ) {
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
      if (!pending) return;
      const rows = this.ctx.storage.sql
        .exec<GameEvent>(
          "SELECT * FROM game_events WHERE sequence>? AND revision<=? ORDER BY sequence LIMIT 101",
          r.deliveredSequence,
          pending.revision,
        )
        .toArray();
      const events = rows.slice(0, 100);
      return {
        game: pending,
        events,
        last: rows.length <= 100,
        sequence: events.at(-1)?.sequence ?? r.deliveredSequence,
      };
    });
    if (!pending) return;
    try {
      await this.env.DB.batch([
        ...eventStatements(this.env.DB, pending.game, pending.events),
        ...(pending.last
          ? historyStatements(this.env.DB, pending.game, {
              eventCount: pending.sequence,
            })
          : []),
      ]);
      await this.ctx.blockConcurrencyWhile(async () => {
        const r = this.read();
        if (!r) return;
        r.deliveredSequence = Math.max(r.deliveredSequence, pending.sequence);
        if (r.outbox?.revision === pending.game.revision) {
          if (pending.last) {
            delete r.outbox;
            delete r.retryAt;
            delete r.failures;
          } else {
            r.retryAt = Date.now() + 1;
            r.failures = 0;
          }
        }
        this.ctx.storage.kv.put("room", r);
        await this.schedule(r);
      });
    } catch (error) {
      console.error("Match history delivery will retry", error);
    }
  }
}
