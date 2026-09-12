import type { Env } from "./env";
import { command, failure, roomCode } from "./protocol";
import { GameError } from "../shared/game-error";
import { serveSite } from "./site";
export { GameTable } from "./game-table";
export { MatchQueue } from "./match-queue";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      if (!url.pathname.startsWith("/api/")) return serveSite(req, env.ASSETS);
      const socket = url.pathname === "/api/game/socket";
      if (url.pathname !== "/api/game" && !socket)
        return Response.json({ error: "Not found." }, { status: 404 });
      if (!["GET", "POST"].includes(req.method) || (socket && req.method !== "GET"))
        return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
      if (req.headers.has("origin") && req.headers.get("origin") !== url.origin)
        return Response.json({ error: "Invalid origin." }, { status: 403 });
      if (socket && req.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return new Response(null, { status: 426 });
      // Browser WebSockets cannot set Authorization. Keep guest credentials out of URLs/logs.
      const protocols = req.headers
        .get("sec-websocket-protocol")
        ?.split(",")
        .map((s) => s.trim());
      const token = socket
        ? protocols?.[0] === "giulietto"
          ? protocols[1]
          : ""
        : req.headers.get("x-player-token");
      if (!token || !/^[0-9a-f-]{36,80}$/i.test(token))
        throw new GameError("Refresh the page to create your guest session.");
      if (
        !(await env.REQUEST_LIMIT.limit({ key: req.headers.get("cf-connecting-ip") || token }))
          .success
      )
        return Response.json(
          { error: "Too many requests. Please wait a minute." },
          { status: 429 },
        );
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const id = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join(
        "",
      );
      let body;
      if (req.method === "POST") {
        const raw = await req.text();
        if (raw.length > 2048) throw new GameError("Request too large.");
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          throw new GameError("Invalid JSON.");
        }
        body = command(value);
      }
      const headers = new Headers({ "x-player-id": id });
      let response;
      if (body && ["create", "match"].includes(body.action)) {
        response = await env.MATCHMAKER.getByName("public-v1").fetch("https://internal/", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      } else {
        const code = roomCode(body?.code ?? url.searchParams.get("code"));
        if (socket) {
          headers.set("Upgrade", "websocket");
          headers.set("Sec-WebSocket-Protocol", "giulietto");
        }
        response = await env.ROOMS.getByName(code).fetch(
          `https://internal/${code}${socket ? "/socket" : ""}`,
          { method: req.method, headers, ...(body ? { body: JSON.stringify(body) } : {}) },
        );
      }
      if (response.status === 101) return response;
      const result = new Response(response.body, response);
      result.headers.set("Cache-Control", "no-store");
      result.headers.set("X-Content-Type-Options", "nosniff");
      return result;
    } catch (error) {
      return failure(error);
    }
  },
};
