import type { view } from "../shared/game";
import { GameRequestError, requestGame } from "./game-request";
type State = ReturnType<typeof view>;
type Pending = {
  message: string;
  resolve: (state: State) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

/** Retries keep the same command ID; the room acknowledges each mutation only once. */
export class GameConnection {
  private socket?: WebSocket;
  private stopped = false;
  private attempt = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private joining?: AbortController;
  private synced = false;
  private closedReason = "Connection closed.";
  private pending = new Map<string, Pending>();
  private lastMessage = Date.now();
  constructor(
    private code: string,
    private token: string,
    private name: string,
    private accept: (state: State) => void,
    private status: (message: string) => void,
  ) {
    this.connect();
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
      this.lastMessage = Date.now();
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastMessage > 45000) {
          ws.close(4000, "Heartbeat timed out");
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 20000);
      // The server sends a current snapshot before we replay unacknowledged commands.
    };
    ws.onmessage = (event) => {
      if (this.stopped || this.socket !== ws) return;
      this.lastMessage = Date.now();
      if (event.data === "pong") return;
      const message = JSON.parse(event.data);
      if (message.type === "state") {
        this.name = message.state.viewerName;
        this.accept(message.state);
        this.status("");
        this.attempt = 0;
        if (!this.synced) {
          this.synced = true;
          for (const p of this.pending.values()) ws.send(p.message);
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
      if (this.stopped) return;
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
    const delay = Math.min(10000, 500 * 2 ** Math.min(this.attempt++, 5)) + Math.random() * 250;
    this.retry = setTimeout(() => void this.rejoin(), delay);
  }
  private async rejoin() {
    if (this.stopped) return;
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
      if (error instanceof GameRequestError && [400, 401, 403, 404].includes(error.status)) {
        this.closedReason = error.message;
        this.status(this.closedReason);
        this.stop();
      } else this.reconnect();
    } finally {
      if (this.joining === controller) this.joining = undefined;
    }
  }
  command(action: string, extra: Record<string, unknown>) {
    if (this.stopped) return Promise.reject(new Error(this.closedReason));
    const commandId = crypto.randomUUID();
    const message = JSON.stringify({ ...extra, action, commandId });
    return new Promise<State>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error("Connection interrupted. Check the table state before trying again."));
      }, 30000);
      this.pending.set(commandId, { message, resolve, reject, timeout });
      if (this.synced && this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
    });
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.joining?.abort();
    this.socket?.close(1000, "Leaving table");
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error(this.closedReason));
    }
    this.pending.clear();
  }
}
