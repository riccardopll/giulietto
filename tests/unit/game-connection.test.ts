import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameConnection } from "../../src/client/game-connection";
import { view } from "../../src/shared/game";
import { gameFixture } from "./helpers";

class Socket {
  static OPEN = 1;
  static sockets: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number; reason: string }) => void;
  send = vi.fn();
  close = vi.fn((code = 1000, reason = "") => this.disconnect(code, reason));
  constructor() {
    Socket.sockets.push(this);
  }
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  disconnect(code = 1006, reason = "") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

let connection: GameConnection;
const state = () => view(gameFixture(), "p0");
let request: ReturnType<typeof vi.fn<typeof fetch>>;
let accept: ReturnType<typeof vi.fn<(snapshot: ReturnType<typeof state>) => void>>;
let status: ReturnType<typeof vi.fn<(message: string) => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("location", { href: "https://game.test/", protocol: "https:" });
  request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(state()));
  vi.stubGlobal("fetch", request);
  Socket.sockets = [];
  accept = vi.fn();
  status = vi.fn();
  connection = new GameConnection("ABCDEFGH", "guest-token", "bot_1", accept, status);
});

afterEach(() => {
  connection.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("rejoins with the current name and replays an unacknowledged command only after a socket snapshot", async () => {
  const first = Socket.sockets[0];
  first.open();
  first.receive({ type: "state", state: { ...state(), viewerName: "bot_2" } });
  const pending = connection.command("bid", { bid: 0 });
  const message = first.send.mock.calls[0][0];
  first.disconnect();
  await vi.advanceTimersByTimeAsync(500);

  expect(request).toHaveBeenCalledTimes(1);
  const [url, init] = request.mock.calls[0];
  expect(url).toBe("/api/game");
  expect(init?.headers).toEqual({
    "Content-Type": "application/json",
    "x-player-token": "guest-token",
  });
  const body = JSON.parse(init!.body as string);
  expect(body).toMatchObject({
    action: "join",
    code: "ABCDEFGH",
    name: "bot_2",
  });
  const second = Socket.sockets[1];
  second.open();
  expect(second.send).not.toHaveBeenCalled();
  second.receive({ type: "state", state: state() });
  second.receive({ type: "state", state: state() });
  expect(second.send.mock.calls).toEqual([[message]]);
  second.receive({ type: "ack", commandId: JSON.parse(message).commandId, state: state() });
  await expect(pending).resolves.toMatchObject({ you: "p0" });
  expect(status).toHaveBeenLastCalledWith("");
});

it("retries network failures, throttling, and unavailable servers before opening a socket", async () => {
  request
    .mockRejectedValueOnce(new TypeError("Offline"))
    .mockResolvedValueOnce(Response.json({ error: "Wait" }, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }));
  Socket.sockets[0].disconnect();
  for (const delay of [500, 1000, 2000]) {
    await vi.advanceTimersByTimeAsync(delay);
    expect(Socket.sockets).toHaveLength(1);
  }
  await vi.advanceTimersByTimeAsync(4000);
  expect(Socket.sockets).toHaveLength(2);
  expect(request).toHaveBeenCalledTimes(4);
});

it.each([
  {
    response: Response.json({ error: "Table not found or expired." }, { status: 400 }),
    error: "Table not found or expired.",
  },
  {
    response: new Response("Forbidden", { status: 403 }),
    error: "Could not reach the table. Please try again.",
  },
])("stops on a permanent rejoin rejection: $error", async ({ response, error }) => {
  request.mockResolvedValue(response);
  Socket.sockets[0].disconnect();
  await vi.advanceTimersByTimeAsync(500);
  expect(status).toHaveBeenLastCalledWith(error);
  await expect(connection.command("bid", { bid: 0 })).rejects.toThrow(error);
  await vi.advanceTimersByTimeAsync(60000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(Socket.sockets).toHaveLength(1);
});

it("aborts a pending rejoin when leaving and ignores a late response", async () => {
  let resolve!: (response: Response) => void;
  request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  Socket.sockets[0].disconnect();
  await vi.advanceTimersByTimeAsync(500);
  const signal = request.mock.calls[0][1]!.signal!;
  connection.stop();
  expect(signal.aborted).toBe(true);
  resolve(Response.json(state()));
  await vi.advanceTimersByTimeAsync(60000);
  expect(Socket.sockets).toHaveLength(1);
  expect(accept).not.toHaveBeenCalled();
});

it("times out a stalled rejoin and tries again", async () => {
  request.mockImplementationOnce(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("Aborted")));
      }),
  );
  Socket.sockets[0].disconnect();
  await vi.advanceTimersByTimeAsync(10500);
  expect(request.mock.calls[0][1]!.signal!.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(Socket.sockets).toHaveLength(2);
});
