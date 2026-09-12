import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, Log, LogLevel, type WebSocket } from "miniflare";
import { build } from "rolldown";
import { beforeAll, expect, test as base } from "vitest";
import type { view } from "../../src/shared/game";

export type State = ReturnType<typeof view>;
type Input = { action: string; [field: string]: unknown };
type Reply =
  | { type: "ack"; commandId: string; state: State | { ok: true } }
  | { type: "error"; commandId?: string; error: string };
type Message = Reply | { type: "state"; state: State };
type Guest = { name: string; token: string };

export const guest = (number: number): Guest => ({
  name: `bot_${number}`,
  token: crypto.randomUUID(),
});

let workerCode: string;
let siteHtml: string;
beforeAll(async () => {
  siteHtml = await readFile("index.html", "utf8");
  const built = await build({
    input: "src/server/index.ts",
    write: false,
    external: ["cloudflare:workers"],
    output: { format: "esm" },
  });
  const entry = built.output.find((output) => output.type === "chunk" && output.isEntry);
  if (!entry || entry.type !== "chunk") throw new Error("Worker entry was not bundled.");
  workerCode = entry.code;
});

async function createWorker() {
  const logs: string[] = [];
  const runtime = new Miniflare({
    log: new Log(LogLevel.ERROR),
    handleStructuredLogs: (log: { message: string }) => logs.push(log.message),
    workers: [
      {
        config: {
          name: "game-api",
          type: "worker",
          compatibilityDate: "2026-09-07",
          compatibilityFlags: ["nodejs_compat"],
          manifest: {
            mainModule: "index.js",
            modules: { "index.js": { type: "esm", contents: workerCode } },
          },
          exports: {
            GameTable: { type: "durable-object", storage: "sqlite" },
            MatchQueue: { type: "durable-object", storage: "sqlite" },
          },
          env: {
            ASSETS: {
              type: "node-handler",
              handler(_req: IncomingMessage, res: ServerResponse) {
                res.writeHead(200, {
                  "Content-Type": "text/html; charset=utf-8",
                  "Cache-Control": "public, max-age=60",
                  ETag: '"site-html"',
                  "Content-Length": Buffer.byteLength(siteHtml),
                });
                res.end(siteHtml);
              },
            },
            ROOMS: { type: "durable-object", worker: "game-api", exportName: "GameTable" },
            MATCHMAKER: { type: "durable-object", worker: "game-api", exportName: "MatchQueue" },
            DB: { type: "d1", id: "game-api-db" },
            REQUEST_LIMIT: {
              type: "rate-limit",
              namespace: "1001",
              simple: { limit: 10_000, period: 60 },
            },
          },
        },
      },
    ],
  });
  const sockets: WebSocket[] = [];
  const post = (player: Guest, input: Input) =>
    runtime.dispatchFetch("http://game.test/api/game", {
      method: "POST",
      headers: { "x-player-token": player.token, Origin: "http://game.test" },
      body: JSON.stringify({ name: player.name, commandId: crypto.randomUUID(), ...input }),
    });
  const get = (player: Guest, code: string) =>
    runtime.dispatchFetch(`http://game.test/api/game?code=${code}`, {
      headers: { "x-player-token": player.token },
    });
  return {
    runtime,
    logs,
    post,
    get,
    async state(player: Guest, input: Input) {
      const response = await post(player, input);
      expect(response.status).toBe(200);
      return (await response.json()) as State;
    },
    async connect(player: Guest, code: string) {
      const response = await runtime.dispatchFetch(
        `http://game.test/api/game/socket?code=${code}`,
        {
          headers: {
            Upgrade: "websocket",
            "Sec-WebSocket-Protocol": `giulietto, ${player.token}`,
            Origin: "http://game.test",
          },
        },
      );
      expect(response.status).toBe(101);
      const socket = response.webSocket;
      if (!socket) throw new Error("Worker did not return a WebSocket.");
      sockets.push(socket);
      const messages: Message[] = [];
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") messages.push(JSON.parse(event.data) as Message);
      });
      socket.accept();
      const latest = () => messages.findLast((message) => message.type === "state")?.state;
      await expect.poll(latest).toBeDefined();
      return {
        latest,
        close: () => {
          socket.close(1000);
          sockets.splice(sockets.indexOf(socket), 1);
        },
        async command(input: Input) {
          const commandId =
            typeof input.commandId === "string" ? input.commandId : crypto.randomUUID();
          socket.send(JSON.stringify({ ...input, commandId }));
          const reply = () =>
            messages.find(
              (message): message is Reply =>
                message.type !== "state" && message.commandId === commandId,
            );
          await expect.poll(reply).toBeDefined();
          return reply()!;
        },
      };
    },
    async dispose() {
      for (const socket of sockets) socket.close(1000);
      await runtime.dispose();
    },
  };
}

export const test = base.extend<{ api: Awaited<ReturnType<typeof createWorker>> }>({
  api: async ({ onTestFinished }, use) => {
    const api = await createWorker();
    onTestFinished(() => api.dispose());
    const db = await api.runtime.getD1Database("DB");
    const migrations = (await readdir("migrations")).filter((file) => file.endsWith(".sql")).sort();
    for (const file of migrations) {
      const sql = await readFile(`migrations/${file}`, "utf8");
      const statements = sql.split(";").filter((statement) => statement.trim());
      await db.batch(statements.map((statement) => db.prepare(statement)));
    }
    await use(api);
  },
});
