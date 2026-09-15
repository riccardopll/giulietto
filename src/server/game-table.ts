import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { isTableCommand, type Command } from "../shared/commands";
import { GameError } from "../shared/game-error";
import {
  makeGame,
  makePlayer,
  tick,
  view,
  SPECTATOR_RETENTION_MS,
  TABLE_RETENTION_MS,
  type Game,
  findPlayer,
} from "../shared/game";
import { historyStatements } from "./match-history";
import { eventStatements, gameEvents, type EventSource, type GameEvent } from "./game-events";
import { apply, command, displayName, failure } from "./protocol";

type Room = {
  game: Game;
  updated: number;
  outbox?: Game;
  retryAt?: number;
  failures?: number;
  deliveredSequence: number;
};
type Attachment = { id: string; roomCode: string; connectionId?: string };

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
    return this.ctx.storage.kv.get("room") as Room | undefined;
  }
  private logConnection(
    event: string,
    attachment: Attachment,
    details: { [key: string]: unknown } = {},
  ) {
    console.log({
      message: "websocket_connection",
      event,
      playerId: attachment.id,
      connectionId: attachment.connectionId ?? null,
      roomCode: attachment.roomCode,
      ...details,
    });
  }
  private send(ws: WebSocket, message: unknown) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      this.logConnection("send_failed", ws.deserializeAttachment() as Attachment, {
        reason: error instanceof Error ? error.message : "WebSocket send failed",
      });
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
  private view(game: Game, id: string) {
    return view(game, id, this.connected());
  }
  private snapshot(ws: WebSocket, game: Game) {
    const { id } = ws.deserializeAttachment() as Attachment;
    try {
      this.send(ws, { type: "state", state: this.view(game, id) });
    } catch {
      /* A leave acknowledgement is sent before the client closes its socket. */
    }
  }
  private broadcast(game: Game) {
    for (const ws of this.ctx.getWebSockets()) this.snapshot(ws, game);
  }
  private due(room: Room) {
    const game = room.game;
    if (Date.now() - room.updated >= TABLE_RETENTION_MS && room.outbox) return Infinity;
    const connected = this.connected();
    return Math.min(
      ...(game.phase === "lobby" ? game.players : [])
        .filter((player) => !connected.has(player.id))
        .map((player) => player.seen + 120000),
      ...(game.spectators ?? [])
        .filter((spectator) => !connected.has(spectator.id))
        .map((spectator) => spectator.seen + SPECTATOR_RETENTION_MS),
      game.deadline || Infinity,
      room.updated + TABLE_RETENTION_MS,
    );
  }
  private async schedule(room: Room) {
    await this.ctx.storage.setAlarm(
      Math.max(Date.now() + 1, Math.min(this.due(room), room.retryAt ?? Infinity)),
    );
  }
  private async save(
    before: Room,
    game: Game,
    receipt?: { id: string; commandId: string },
    origin?: EventSource,
  ) {
    game.revision = before.game.revision + 1;
    const room: Room = { ...before, game, updated: Date.now() };
    const events = gameEvents(
      before.game,
      game,
      origin ?? { source: "player", commandId: receipt?.commandId },
      room.updated,
    );
    if (events.length) {
      room.outbox = structuredClone(game);
      room.retryAt = Date.now() + 1;
      room.failures = 0;
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.kv.put("room", room);
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
    await this.schedule(room);
    this.broadcast(game);
    return room;
  }
  private async advance(room: Room) {
    const game = structuredClone(room.game);
    const now = Date.now();
    // Connections survive hibernation. Open lobby seats should not time out while waiting.
    if (game.phase === "lobby") {
      const ids = new Set(
        this.ctx.getWebSockets().map((ws) => (ws.deserializeAttachment() as Attachment).id),
      );
      for (const player of game.players)
        if (ids.has(player.id) && now - player.seen >= 60000) player.seen = now;
    }
    tick(game, now, this.connected());
    return JSON.stringify(game) === JSON.stringify(room.game)
      ? room
      : this.save(room, game, undefined, {
          source: ["bidding", "playing"].includes(room.game.phase) ? "timeout" : "system",
        });
  }
  private load() {
    if (this.ctx.storage.kv.get("expired"))
      throw new GameError("Table not found or expired. Check the invite code.");
    const room = this.read();
    if (!room || Date.now() - room.updated >= TABLE_RETENTION_MS)
      throw new GameError("Table not found or expired. Check the invite code.");
    return room;
  }
  private async execute(room: Room, id: string, input: Command) {
    const duplicate = this.ctx.storage.sql
      .exec("SELECT 1 FROM receipts WHERE player=? AND command=?", id, input.commandId)
      .toArray().length;
    if (!duplicate) {
      const game = structuredClone(room.game);
      apply(game, id, input, Date.now());
      if (input.action === "rename") {
        await this.env.DB.prepare("UPDATE players SET display_name=? WHERE id=?")
          .bind(findPlayer(game, id)!.name, id)
          .run();
      }
      room = await this.save(room, game, { id, commandId: input.commandId });
    }
    return {
      state: input.action === "leave" ? { ok: true } : this.view(room.game, id),
      duplicate: !!duplicate,
    };
  }
  async fetch(req: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const url = new URL(req.url);
      const code = url.pathname.split("/")[1];
      const id = req.headers.get("x-player-id")!;
      const attachment: Attachment = { id, roomCode: code };
      try {
        if (url.pathname.endsWith("/create")) {
          const input = command(await req.json());
          if (input.action !== "create" && input.action !== "match")
            throw new GameError("Invalid request.");
          let room = this.read();
          if (room && room.game.host !== id) throw new GameError("Table already exists.");
          if (!room) {
            const game = makeGame(
              code,
              makePlayer(id, displayName(input.name), Date.now()),
              input.action === "match",
            );
            if (input.avatar) game.players[0].avatar = input.avatar;
            room = { game, updated: Date.now(), deliveredSequence: 0 };
            this.ctx.storage.kv.put("room", room);
            await this.schedule(room);
          }
          return Response.json(this.view(room.game, id));
        }
        let room = this.load();
        // Membership must be checked before reads can advance or broadcast a room.
        if (
          req.method === "GET" &&
          !findPlayer(room.game, id) &&
          !room.game.spectators?.some((spectator) => spectator.id === id)
        )
          throw new GameError("Join this table first.");
        room = await this.advance(room);
        if (url.pathname.endsWith("/socket")) {
          this.view(room.game, id);
          const sockets = this.ctx.getWebSockets(id);
          if (sockets.length >= 3) sockets[0].close(4002, "Connected in another tab.");
          const { 0: client, 1: server } = new WebSocketPair();
          this.ctx.acceptWebSocket(server, [id]);
          attachment.connectionId = crypto.randomUUID();
          server.serializeAttachment(attachment);
          this.broadcast(room.game);
          await this.schedule(room);
          this.logConnection("opened", attachment, {
            matchId: room.game.matchId ?? null,
            phase: room.game.phase,
          });
          return new Response(null, {
            status: 101,
            webSocket: client,
            headers: { "Sec-WebSocket-Protocol": "giulietto" },
          });
        }
        if (req.method === "GET") return Response.json(this.view(room.game, id));
        const { state } = await this.execute(room, id, command(await req.json()));
        return Response.json(state);
      } catch (error) {
        const response = failure(error);
        this.logConnection("request_failed", attachment, {
          path: url.pathname,
          method: req.method,
          status: response.status,
          reason: error instanceof GameError ? error.message : "Table temporarily unavailable",
        });
        return response;
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
        // Rejections should reach the pending command even when its fields are invalid.
        if (typeof value?.commandId === "string") commandId = value.commandId;
        const input = command(value);
        action = input.action;
        if (!isTableCommand(input)) throw new GameError("Invalid room command.");
        const room = this.read();
        if (!room) throw new GameError("Table expired.");
        const { state, duplicate } = await this.execute(await this.advance(room), id, input);
        this.send(ws, { type: "ack", commandId, state });
        outcome = duplicate ? "duplicate" : "accepted";
      } catch (error) {
        const response = failure(error);
        const body = (await response.json()) as { error: string };
        outcome = response.status === 400 ? "rejected" : "error";
        reason = body.error;
        this.send(ws, { type: "error", commandId, ...body });
      } finally {
        const game = this.read()?.game;
        console.log({
          message: "websocket_command",
          commandId: commandId ?? null,
          action: action ?? null,
          playerId: playerId ?? null,
          connectionId: (ws.deserializeAttachment() as Attachment).connectionId ?? null,
          roomCode: game?.code ?? null,
          matchId: game?.matchId ?? null,
          revision: game?.revision ?? null,
          outcome,
          ...(reason ? { reason } : {}),
        });
      }
    });
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.logConnection("closed", ws.deserializeAttachment() as Attachment, {
      code,
      reason,
      wasClean,
    });
    // Complete the handshake without echoing reserved, diagnostic-only codes.
    ws.close([1004, 1005, 1006, 1015].includes(code) ? 1000 : code);
    await this.disconnected(ws);
  }
  private async disconnected(ws: WebSocket) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = this.read();
      if (!room) return;
      const { id } = ws.deserializeAttachment() as Attachment;
      const member =
        room.game.phase === "lobby"
          ? findPlayer(room.game, id)
          : room.game.spectators?.find((spectator) => spectator.id === id);
      if (member && !this.connected().has(id)) {
        member.seen = Date.now();
        this.ctx.storage.kv.put("room", room);
      }
      this.broadcast(room.game);
      await this.schedule(room);
    });
  }
  async webSocketError(ws: WebSocket, error: unknown) {
    this.logConnection("error", ws.deserializeAttachment() as Attachment, {
      reason: error instanceof Error ? error.message : "WebSocket error",
    });
    ws.close(1011, "Reconnect");
    await this.disconnected(ws);
  }
  async alarm() {
    const pending = await this.ctx.blockConcurrencyWhile(async () => {
      let room = this.read();
      if (!room) return;
      if (
        Date.now() - room.updated >= TABLE_RETENTION_MS &&
        !room.outbox &&
        ["lobby", "finished"].includes(room.game.phase)
      ) {
        for (const ws of this.ctx.getWebSockets()) ws.close(4001, "Table expired.");
        await this.ctx.storage.deleteAll();
        this.ctx.storage.kv.put("expired", true);
        return;
      }
      room = await this.advance(room);
      // Retry deadline is persisted before external I/O, including process failure.
      const pending =
        room.outbox && (room.retryAt ?? 0) <= Date.now() ? structuredClone(room.outbox) : undefined;
      if (pending) {
        room.failures = (room.failures ?? 0) + 1;
        room.retryAt = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(room.failures, 9));
        this.ctx.storage.kv.put("room", room);
      }
      await this.schedule(room);
      if (!pending) return;
      const rows = this.ctx.storage.sql
        .exec<GameEvent>(
          "SELECT * FROM game_events WHERE sequence>? AND revision<=? ORDER BY sequence LIMIT 101",
          room.deliveredSequence,
          pending.revision,
        )
        .toArray();
      const events = rows.slice(0, 100);
      return {
        game: pending,
        events,
        last: rows.length <= 100,
        sequence: events.at(-1)?.sequence ?? room.deliveredSequence,
      };
    });
    if (!pending) return;
    try {
      await this.env.DB.batch([
        ...eventStatements(this.env.DB, pending.game, pending.events),
        ...(pending.last ? historyStatements(this.env.DB, pending.game, pending.sequence) : []),
      ]);
      await this.ctx.blockConcurrencyWhile(async () => {
        const room = this.read();
        if (!room) return;
        room.deliveredSequence = Math.max(room.deliveredSequence, pending.sequence);
        if (room.outbox?.revision === pending.game.revision) {
          if (pending.last) {
            delete room.outbox;
            delete room.retryAt;
            delete room.failures;
          } else {
            room.retryAt = Date.now() + 1;
            room.failures = 0;
          }
        }
        this.ctx.storage.kv.put("room", room);
        await this.schedule(room);
      });
    } catch (error) {
      console.error("Match history delivery will retry", error);
    }
  }
}
