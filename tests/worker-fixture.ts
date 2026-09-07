import handler, { GameTable, MatchQueue } from "../src/server/index";
export { MatchQueue };
export default handler;
// Test-only control surface, never included in the production worker entry point.
export class TestGameTable extends GameTable {
  async alarm() {
    if (!this.ctx.storage.kv.get("pause-delivery")) await super.alarm();
  }
  async fetch(req: Request) {
    const path = new URL(req.url).pathname;
    if (path === "/__read") return Response.json(this.ctx.storage.kv.get("room"));
    if (path === "/__events")
      return Response.json(
        this.ctx.storage.sql.exec("SELECT * FROM game_events ORDER BY sequence").toArray(),
      );
    if (path === "/__pause") {
      this.ctx.storage.kv.put("pause-delivery", true);
      return new Response("ok");
    }
    if (path === "/__step") {
      const r = this.ctx.storage.kv.get("room") as {
        game: { deadline: number; code: string; players: { id: string }[] };
      };
      r.game.deadline = Date.now() - 1;
      this.ctx.storage.kv.put("room", r);
      await super.fetch(
        new Request(`https://internal/${r.game.code}`, {
          headers: { "x-player-id": r.game.players[0].id },
        }),
      );
      return Response.json(this.ctx.storage.kv.get("room"));
    }
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
      await super.alarm();
      return new Response("ok");
    }
    return super.fetch(req);
  }
}
