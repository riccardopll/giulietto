import type { TableCommand } from "../shared/commands";
import type { GameView } from "../shared/game";
import { GameRequestError, requestGame } from "./game-request";
type Pending = {
  message: string;
  resolve: (state: GameView) => void;
  reject: (error: Error) => void;
  timeout: number;
};

const PING_MS = 10000;
/** Every send expects a reply; a silent socket is treated as dead this soon. */
const REPLY_MS = 5000;

/** Retries keep the same command ID; the room acknowledges each mutation only once. */
export class GameConnection {
  private socket?: WebSocket;
  private stopped = false;
  private attempt = 0;
  private retry?: number;
  private heartbeat?: number;
  private reply?: number;
  private joining?: AbortController;
  private synced = false;
  /** A socket that synced proves membership, so the next reconnect skips the HTTP join. */
  private direct = false;
  private closedReason = "Connection closed.";
  private pending = new Map<string, Pending>();
  private wake = () => {
    if (this.stopped || (typeof document !== "undefined" && document.visibilityState === "hidden"))
      return;
    if (this.retry !== undefined) {
      clearTimeout(this.retry);
      this.retry = undefined;
      void this.rejoin();
    } else if (this.socket?.readyState === WebSocket.OPEN) this.send(this.socket, "ping");
  };
  constructor(
    private code: string,
    private token: string,
    private name: string,
    private accept: (state: GameView) => void,
    private status: (message: string) => void,
  ) {
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.wake);
    if (typeof window !== "undefined") window.addEventListener("online", this.wake);
    this.connect();
  }
  private send(ws: WebSocket, message: string) {
    ws.send(message);
    this.reply ??= setTimeout(() => {
      this.reply = undefined;
      ws.close(4000, "No reply");
    }, REPLY_MS);
  }
  private connect() {
    if (this.stopped) return;
    this.synced = false;
    const url = new URL("/api/game/socket", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("code", this.code);
    const ws = (this.socket = new WebSocket(url, ["giulietto", this.token]));
    this.status("Connecting…");
    ws.onopen = () => {
      if (this.stopped || this.socket !== ws) return;
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) this.send(ws, "ping");
      }, PING_MS);
      // The server sends a current snapshot before we replay unacknowledged commands.
    };
    ws.onmessage = (event) => {
      if (this.stopped || this.socket !== ws) return;
      clearTimeout(this.reply);
      this.reply = undefined;
      if (event.data === "pong") return;
      const message = JSON.parse(event.data);
      if (message.type === "state") {
        this.name = message.state.viewerName;
        this.accept(message.state);
        this.status("");
        this.attempt = 0;
        if (!this.synced) {
          this.synced = true;
          for (const p of this.pending.values()) this.send(ws, p.message);
        }
      } else if (message.type === "ack" || message.type === "error") {
        const p = this.pending.get(message.commandId);
        if (!p) return;
        clearTimeout(p.timeout);
        this.pending.delete(message.commandId);
        if (message.type === "error") p.reject(new Error(message.error));
        else p.resolve(message.state);
      }
    };
    ws.onclose = (event) => {
      clearInterval(this.heartbeat);
      clearTimeout(this.reply);
      this.reply = undefined;
      if (this.stopped) return;
      this.direct = this.synced;
      this.synced = false;
      if (event.code === 4001 || event.code === 4002) {
        this.closedReason = event.reason || "Connection closed.";
        this.status(this.closedReason);
        this.stop();
        return;
      }
      this.reconnect();
    };
    ws.onerror = () => ws.close();
  }
  private reconnect() {
    if (this.stopped) return;
    this.status("Connection lost. Reconnecting…");
    const delay = Math.min(10000, 500 * 2 ** this.attempt++) + Math.random() * 250;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.rejoin();
    }, delay);
  }
  private async rejoin() {
    if (this.stopped) return;
    if (this.direct) {
      this.direct = false;
      this.connect();
      return;
    }
    const controller = (this.joining = new AbortController());
    try {
      await requestGame(
        this.token,
        { action: "join", code: this.code, name: this.name },
        controller,
      );
      if (this.stopped) return;
      this.connect();
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof GameRequestError && !error.retryable) {
        this.closedReason = error.message;
        this.status(this.closedReason);
        this.stop();
      } else this.reconnect();
    } finally {
      this.joining = undefined;
    }
  }
  command(input: TableCommand) {
    if (this.stopped) return Promise.reject(new Error(this.closedReason));
    const commandId = crypto.randomUUID();
    const message = JSON.stringify({ ...input, commandId });
    return new Promise<GameView>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error("Connection interrupted. Check the table state before trying again."));
      }, 30000);
      this.pending.set(commandId, { message, resolve, reject, timeout });
      if (this.synced && this.socket?.readyState === WebSocket.OPEN)
        this.send(this.socket, message);
    });
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    clearTimeout(this.reply);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.wake);
    if (typeof window !== "undefined") window.removeEventListener("online", this.wake);
    this.joining?.abort();
    this.socket?.close(1000, "Leaving table");
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error(this.closedReason));
    }
    this.pending.clear();
  }
}
