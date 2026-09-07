import handler, { GameRoom, Matchmaker } from "../src/server/index";
export { Matchmaker };
export default handler;
// Test-only control surface, never included in the production worker entry point.
export class TestGameRoom extends GameRoom {
  async fetch(req: Request) {
    const path = new URL(req.url).pathname;
    if (path === "/__read") return Response.json(this.ctx.storage.kv.get("room"));
    if (path === "/__disconnect") {
      const ws = this.ctx.getWebSockets()[0];
      await this.webSocketClose(ws, 1006);
      ws.close(1000);
      return new Response("ok");
    }
    if (path === "/__seed") {
      const r = (await req.json()) as { game: { deadline: number } };
      this.ctx.storage.kv.put("room", r);
      await this.ctx.storage.setAlarm(r.game.deadline || Date.now() + 86400000);
      return new Response("ok");
    }
    if (path === "/__alarm") {
      await this.alarm();
      return new Response("ok");
    }
    return super.fetch(req);
  }
}
