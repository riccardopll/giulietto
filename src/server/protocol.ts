import { GameError } from "../shared/game-error";
import {
  bid,
  deal,
  play,
  player,
  tick,
  MIN_STARTING_LIVES,
  MAX_STARTING_LIVES,
  type Game,
} from "../shared/game";

export type Command = Record<string, unknown> & { action: string; commandId: string };
export function command(value: unknown): Command {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GameError("Invalid request.");
  const b = value as Record<string, unknown>;
  if (
    !["create", "match", "join", "settings", "start", "bid", "play", "leave"].includes(
      String(b.action),
    )
  )
    throw new GameError("Unknown action.");
  if (typeof b.commandId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.commandId))
    throw new GameError("Invalid command ID.");
  if (b.action === "bid" && (typeof b.bid !== "number" || !Number.isInteger(b.bid)))
    throw new GameError("Enter a valid prediction.");
  return b as Command;
}
export function join(g: Game, id: string, name: string, now: number, matchmaking = false) {
  const seated = g.players.find((p) => p.id === id);
  if (matchmaking && g.phase !== "lobby" && !seated)
    throw new GameError("This table is no longer available.");
  const existing = seated ?? g.spectators?.find((p) => p.id === id);
  if (existing) {
    existing.seen = now;
    return;
  }
  if (g.phase !== "lobby") {
    (g.spectators ??= []).push({ id, name, seen: now });
    return;
  }
  if (g.players.length >= 6) throw new GameError("This table is full.");
  g.players.push({ ...player(id, name, now), lives: g.startingLives });
  if (!g.host) g.host = id;
  tick(g, now);
}
export function apply(g: Game, id: string, b: Command, now: number) {
  if (b.action === "join") {
    join(g, id, displayName(b.name), now, b.matchmaking === true);
    return;
  }
  const spectator = g.spectators?.find((p) => p.id === id);
  if (spectator) {
    if (b.action !== "leave") throw new GameError("Spectators cannot play or change the game.");
    g.spectators = g.spectators!.filter((p) => p.id !== id);
    return;
  }
  const p = g.players.find((p) => p.id === id);
  if (!p) throw new GameError("Join this table first.");
  p.seen = now;
  if (b.action === "settings") {
    if (g.host !== id) throw new GameError("Only the host can change starting lives.");
    if (g.phase !== "lobby")
      throw new GameError("Starting lives cannot change after the game starts.");
    const lives = b.startingLives;
    if (
      typeof lives !== "number" ||
      !Number.isInteger(lives) ||
      lives < MIN_STARTING_LIVES ||
      lives > MAX_STARTING_LIVES
    )
      throw new GameError(
        `Choose a whole number from ${MIN_STARTING_LIVES} to ${MAX_STARTING_LIVES} for starting lives.`,
      );
    g.startingLives = lives;
    for (const member of g.players) member.lives = lives;
  } else if (b.action === "start") {
    if (g.host !== id) throw new GameError("Only the host can start.");
    if (g.phase !== "lobby" || g.players.length < 2)
      throw new GameError("You need at least two players.");
    deal(g, now);
  } else if (b.action === "bid") bid(g, id, b.bid as number, now);
  else if (b.action === "play") {
    if (g.count !== 1 && (typeof b.card !== "number" || !Number.isInteger(b.card)))
      throw new GameError("Choose a valid card.");
    play(g, id, g.count === 1 ? p.hand[0] : (b.card as number), b.mode, now);
  } else if (b.action === "leave") {
    if (g.phase === "lobby") {
      g.players = g.players.filter((p) => p.id !== id);
      if (g.host === id) g.host = g.players[0]?.id ?? "";
    }
  } else throw new GameError("Unknown action.");
}
export function displayName(value: unknown) {
  const name = typeof value === "string" ? value.trim().slice(0, 20) : "Guest";
  if (!name) throw new GameError("Enter a display name.");
  return name;
}
export function roomCode(value: unknown) {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    throw new GameError("Enter a valid eight-character lobby code.");
  return code;
}
export function failure(error: unknown) {
  if (error instanceof GameError) return Response.json({ error: error.message }, { status: 400 });
  console.error("Game operation failed", error);
  return Response.json(
    { error: "The table is temporarily unavailable. Please try again." },
    { status: 503 },
  );
}
