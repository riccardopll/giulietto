import type { view } from "../shared/game";
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
  private pending = new Map<string, Pending>();
  private lastMessage = Date.now();
  constructor(
    private code: string,
    private token: string,
    private accept: (state: State) => void,
    private status: (message: string) => void,
  ) {
    this.connect();
  }
  private connect() {
    if (this.stopped) return;
    const url = new URL("/api/game/socket", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("code", this.code);
    const ws = (this.socket = new WebSocket(url, ["giulietto", this.token]));
    this.status("Connecting…");
    ws.onopen = () => {
      this.lastMessage = Date.now();
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastMessage > 45000) {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 20000);
      // The server sends a current snapshot before we replay unacknowledged commands.
    };
    let synced = false;
    ws.onmessage = (event) => {
      this.lastMessage = Date.now();
      if (event.data === "pong") return;
      const message = JSON.parse(event.data);
      if (message.type === "state") {
        this.accept(message.state);
        this.status("");
        this.attempt = 0;
        if (!synced) {
          synced = true;
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
      if (event.code === 4001 || event.code === 4002) {
        this.status(event.reason);
        this.stop();
        return;
      }
      this.status("Connection lost. Reconnecting…");
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(10000, 500 * 2 ** this.attempt++) + Math.random() * 250,
      );
    };
    ws.onerror = () => ws.close();
  }
  command(action: string, extra: Record<string, unknown>) {
    const commandId = crypto.randomUUID();
    const message = JSON.stringify({ ...extra, action, commandId });
    return new Promise<State>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(commandId);
        reject(new Error("Connection interrupted. Check the table state before trying again."));
      }, 30000);
      this.pending.set(commandId, { message, resolve, reject, timeout });
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
    });
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.socket?.close(1000, "Leaving table");
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error("Connection closed."));
    }
    this.pending.clear();
  }
}
