import { GameError } from "@/lib/game-error";
import { env } from "cloudflare:workers";
import { bid, deal, makeGame, play, player, tick, view, type Game } from "@/lib/game";
import { historyStatements, needsHistory } from "@/lib/match-history";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function db() {
  return (env as unknown as { DB: D1Database }).DB;
}
async function identity(req: Request) {
  const t = req.headers.get("x-player-token") ?? "";
  if (!/^[0-9a-f-]{36,80}$/i.test(t))
    throw new GameError("Refresh the page to create your guest session.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(digest))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}
function failure(error: unknown) {
  if (error instanceof GameError) return response({ error: error.message }, 400);
  console.error("Game operation failed", error);
  return response({ error: "The table is temporarily unavailable. Please try again." }, 503);
}
async function mutate(code: string, fn: (g: Game) => void) {
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    throw new GameError("Enter a valid eight-character lobby code.");
  for (let i = 0; i < 8; i++) {
    const database = db();
    const row = await database
      .prepare("SELECT state,version,updated FROM rooms WHERE code=?")
      .bind(code)
      .first<{ state: string; version: number; updated: number }>();
    if (!row || Date.now() - row.updated > 86400000)
      throw new GameError("Table not found or expired. Check the invite code.");
    const before = JSON.parse(row.state) as Game;
    const g = structuredClone(before);
    fn(g);
    if (JSON.stringify(g) === row.state) return g;
    g.revision = row.version + 1;
    const state = JSON.stringify(g);
    const update = database
      .prepare(
        "UPDATE rooms SET state=?,version=version+1,phase=?,updated=? WHERE code=? AND version=?",
      )
      .bind(state, g.phase, Date.now(), code, row.version);
    const r = needsHistory(before, g)
      ? (await database.batch([update, ...historyStatements(database, g, g.revision, state)]))[0]
      : await update.run();
    if (r.meta.changes === 1) return g;
  }
  throw new GameError("The table is busy. Please try again.");
}
export async function GET(req: Request) {
  try {
    const id = await identity(req);
    const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? "";
    const g = await mutate(code, (g) => {
      const p = g.players.find((p) => p.id === id);
      if (!p) throw new GameError("Join this table first.");
      if (Date.now() - p.seen > 15000) p.seen = Date.now();
      tick(g, Date.now());
    });
    return response(view(g, id));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin)
      return response({ error: "Invalid origin." }, 403);
    const id = await identity(req);
    const body: unknown = await req.json().catch(() => {
      throw new GameError("Invalid JSON.");
    });
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new GameError("Invalid request.");
    const b = body as Record<string, unknown>;
    const now = Date.now();
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 20) : "Guest";
    const action = b.action;
    if (!["create", "match", "join", "start", "bid", "play", "leave"].includes(String(action)))
      throw new GameError("Unknown action.");
    if (action === "bid" && (typeof b.bid !== "number" || !Number.isInteger(b.bid)))
      throw new GameError("Enter a valid prediction.");
    let code = typeof b.code === "string" ? b.code.toUpperCase() : "";
    if (action === "create" || action === "match" || action === "join") {
      if (!name) throw new GameError("Enter a display name.");
      await db()
        .prepare(`INSERT INTO players(id,display_name,created_at,last_seen_at) VALUES(?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,last_seen_at=excluded.last_seen_at
  WHERE excluded.last_seen_at>=players.last_seen_at`)
        .bind(id, name, now, now)
        .run();
      const join = async (c: string) =>
        mutate(c, (g) => {
          tick(g, now);
          const existing = g.players.find((p) => p.id === id);
          if (existing && !existing.left) {
            existing.seen = now;
            return;
          }
          if (g.phase !== "lobby") throw new GameError("This game has already started.");
          if (g.players.length >= 6) throw new GameError("This table is full.");
          g.players.push(player(id, name, now));
          if (!g.host) g.host = id;
          tick(g, now);
        });
      if (action === "join") return response(view(await join(code), id));
      if (action === "match") {
        const candidates = await db()
          .prepare(
            "SELECT code FROM rooms WHERE public=1 AND phase='lobby' AND updated>? ORDER BY updated DESC LIMIT 15",
          )
          .bind(now - 120000)
          .all<{ code: string }>();
        for (const row of candidates.results) {
          try {
            return response(view(await join(row.code), id));
          } catch (error) {
            if (!(error instanceof GameError)) throw error;
          }
        }
      }
      for (let i = 0; i < 5; i++) {
        code = Array.from(crypto.getRandomValues(new Uint8Array(8)))
          .map((n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32])
          .join("");
        const g = makeGame(code, player(id, name, now), action === "match");
        const result = await db()
          .prepare(
            "INSERT OR IGNORE INTO rooms(code,state,version,public,phase,updated) VALUES(?,?,0,?,?,?)",
          )
          .bind(code, JSON.stringify(g), g.public ? 1 : 0, g.phase, now)
          .run();
        if (result.meta.changes) return response(view(g, id));
      }
      throw new GameError("Could not create a table. Try again.");
    }
    const g = await mutate(code, (g) => {
      const p = g.players.find((p) => p.id === id);
      if (!p) throw new GameError("Join this table first.");
      if (p.left && action !== "leave") throw new GameError("You have left the game.");
      p.seen = now;
      tick(g, now);
      if (action === "start") {
        if (g.host !== id) throw new GameError("Only the host can start.");
        if (g.phase !== "lobby" || g.players.length < 2)
          throw new GameError("You need at least two players.");
        deal(g, now);
      } else if (action === "bid") bid(g, id, b.bid as number, now);
      else if (action === "play") {
        if (g.count !== 1 && (typeof b.card !== "number" || !Number.isInteger(b.card)))
          throw new GameError("Choose a valid card.");
        const card = g.count === 1 ? p.hand[0] : (b.card as number);
        play(g, id, card, b.mode, now);
      } else if (action === "leave") {
        if (g.phase === "lobby") {
          g.players = g.players.filter((p) => p.id !== id);
          if (g.host === id) g.host = g.players[0]?.id ?? "";
        } else {
          p.left = true;
          p.lives = 0;
        }
      } else throw new GameError("Unknown action.");
    });
    return action === "leave" ? response({ ok: true }) : response(view(g, id));
  } catch (e) {
    return failure(e);
  }
}
