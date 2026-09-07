import { GameError } from "./game-error.ts";
import type { ChatMessage } from "./chat.ts";
export type PlayerStats = {
  roundsPlayed: number;
  tricksWon: number;
  exactPredictions: number;
  predictionError: number;
};
export type Player = {
  id: string;
  name: string;
  lives: number;
  hand: number[];
  bid: number | null;
  taken: number;
  seen: number;
  stats: PlayerStats;
  left?: boolean;
};
export type Play = { player: string; card: number; mode?: "high" | "low" };
export type Result = {
  id: string;
  name: string;
  bid: number;
  taken: number;
  lost: number;
  lives: number;
};
export type Game = {
  code: string;
  matchId?: string;
  startedAt?: number;
  finishedAt?: number;
  revision: number;
  public: boolean;
  host: string;
  phase: "lobby" | "bidding" | "playing" | "trick" | "results" | "finished";
  players: Player[];
  order: string[];
  round: number;
  count: number;
  cycle: number;
  turn: number;
  trick: Play[];
  lastWinner: string | null;
  results: Result[];
  deadline: number;
  startAt: number | null;
  winner: string | null;
  tie: boolean;
  chat: ChatMessage[];
};
export const TURN_MS = 40000;
export function makeGame(code: string, p: Player, isPublic: boolean): Game {
  return {
    code,
    revision: 0,
    public: isPublic,
    host: p.id,
    phase: "lobby",
    players: [p],
    order: [],
    round: 0,
    count: 6,
    cycle: 1,
    turn: 0,
    trick: [],
    lastWinner: null,
    results: [],
    deadline: 0,
    startAt: null,
    winner: null,
    tie: false,
    chat: [],
  };
}
export function player(id: string, name: string, now: number): Player {
  return {
    id,
    name,
    lives: 3,
    hand: [],
    bid: null,
    taken: 0,
    seen: now,
    stats: { roundsPlayed: 0, tricksWon: 0, exactPredictions: 0, predictionError: 0 },
  };
}
export function strength(p: Play) {
  return p.card === 31 ? (p.mode === "low" ? 0 : 41) : p.card;
}
function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const range = i + 1,
      limit = Math.floor(4294967296 / range) * range;
    let n;
    do {
      n = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (n >= limit);
    const j = n % range;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function deal(g: Game, now: number) {
  if (g.round === 0) {
    g.matchId = crypto.randomUUID();
    g.startedAt = now;
    shuffle(g.players);
  }
  g.round++;
  g.count = 6 - ((g.round - 1) % 6);
  g.cycle = Math.floor((g.round - 1) / 6) + 1;
  const active = g.players.filter((p) => p.lives > 0 && !p.left);
  g.order = active.map((p) => p.id);
  const offset = (g.round - 1) % active.length;
  g.order = [...g.order.slice(offset), ...g.order.slice(0, offset)];
  const deck = shuffle(Array.from({ length: 40 }, (_, i) => i + 1));
  for (const p of g.players) {
    p.hand = active.includes(p) ? deck.splice(0, g.count).sort((a, b) => a - b) : [];
    p.bid = null;
    p.taken = 0;
  }
  g.phase = "bidding";
  g.turn = 0;
  g.trick = [];
  g.results = [];
  g.tie = false;
  g.deadline = now + TURN_MS;
}
export function legalBids(g: Game) {
  const sum = g.players.reduce((n, p) => n + (p.bid ?? 0), 0);
  return Array.from({ length: g.count + 1 }, (_, i) => i).filter(
    (n) => g.turn !== g.order.length - 1 || sum + n !== g.count,
  );
}
export function bid(g: Game, id: string, n: number, now: number) {
  if (g.phase !== "bidding" || g.order[g.turn] !== id)
    throw new GameError("Wait for your bidding turn.");
  if (!Number.isInteger(n) || !legalBids(g).includes(n))
    throw new GameError("That prediction would make the total equal the available tricks.");
  g.players.find((p) => p.id === id)!.bid = n;
  g.turn++;
  if (g.turn === g.order.length) {
    g.phase = "playing";
    g.turn = 0;
  }
  g.deadline = now + TURN_MS;
}
export function play(g: Game, id: string, card: number, mode: unknown, now: number) {
  if (g.phase !== "playing" || g.order[g.turn] !== id) throw new GameError("Wait for your turn.");
  const p = g.players.find((p) => p.id === id)!;
  if (!p.hand.includes(card)) throw new GameError("That card is not in your hand.");
  if (card === 31 && mode !== "high" && mode !== "low")
    throw new GameError("Choose high or low for the Ace of Coins.");
  p.hand.splice(p.hand.indexOf(card), 1);
  g.trick.push({ player: id, card, ...(card === 31 ? { mode: mode as "high" | "low" } : {}) });
  if (g.trick.length === g.order.length) {
    const winning = g.trick.reduce((a, b) => (strength(a) > strength(b) ? a : b));
    const winner = g.players.find((p) => p.id === winning.player)!;
    winner.taken++;
    g.lastWinner = winner.id;
    g.phase = "trick";
    g.deadline = now + 2600;
  } else {
    g.turn = (g.turn + 1) % g.order.length;
    g.deadline = now + TURN_MS;
  }
}
export function score(g: Game, now: number) {
  g.results = g.order.map((id) => {
    const p = g.players.find((p) => p.id === id)!;
    const lost = Math.abs(p.taken - p.bid!);
    p.stats.roundsPlayed++;
    p.stats.tricksWon += p.taken;
    p.stats.exactPredictions += lost === 0 ? 1 : 0;
    p.stats.predictionError += lost;
    p.lives = p.left ? 0 : Math.max(0, p.lives - lost);
    return { id: p.id, name: p.name, bid: p.bid!, taken: p.taken, lost, lives: p.lives };
  });
  let alive = g.players.filter((p) => p.lives > 0 && !p.left);
  if (!alive.length) {
    for (const p of g.players) {
      if (!p.left) p.lives = 1;
    }
    for (const r of g.results) {
      r.lives = g.players.find((p) => p.id === r.id)!.lives;
    }
    alive = g.players.filter((p) => p.lives > 0 && !p.left);
    g.tie = true;
  }
  if (alive.length <= 1) {
    g.phase = "finished";
    g.finishedAt = now;
    g.winner = alive[0]?.id ?? null;
    g.deadline = 0;
  } else {
    g.phase = "results";
    g.deadline = now + 12000;
  }
}
export function tick(g: Game, now: number) {
  if (g.phase === "lobby") {
    g.players = g.players.filter((p) => now - p.seen < 120000 && !p.left);
    if (!g.players.some((p) => p.id === g.host)) g.host = g.players[0]?.id ?? "";
    if (g.public) {
      if (g.players.length < 2) g.startAt = null;
      else if (!g.startAt) g.startAt = now + 20000;
      if (g.players.length === 6 || (g.startAt && now >= g.startAt)) deal(g, now);
    }
    return;
  }
  if (!g.deadline || now < g.deadline) return;
  if (g.phase === "bidding") {
    bid(g, g.order[g.turn], legalBids(g)[0], now);
  } else if (g.phase === "playing") {
    const id = g.order[g.turn];
    const p = g.players.find((p) => p.id === id)!;
    play(g, id, p.hand[0], "high", now);
  } else if (g.phase === "trick") {
    if (g.players.find((p) => p.id === g.order[0])!.hand.length === 0) score(g, now);
    else {
      g.phase = "playing";
      g.turn = g.order.indexOf(g.lastWinner!);
      g.trick = [];
      g.deadline = now + TURN_MS;
    }
  } else if (g.phase === "results") deal(g, now);
}
export function view(g: Game, id: string) {
  const me = g.players.find((p) => p.id === id);
  if (!me) throw new GameError("You are no longer at this table. Join again.");
  const active = g.order.includes(id) && !me.left;
  const blind = g.count === 1 && ["bidding", "playing", "trick"].includes(g.phase);
  return {
    ...g,
    chat: me.left ? [] : g.chat,
    you: id,
    canChooseAce: active && g.phase === "playing" && g.order[g.turn] === id && me.hand.includes(31),
    players: g.players.map((p) => ({
      ...p,
      hand: p.hand.map((card) =>
        active && ((!blind && p.id === id) || (blind && p.id !== id)) ? card : null,
      ),
    })),
    legalBids: g.phase === "bidding" && g.order[g.turn] === id ? legalBids(g) : [],
    serverTime: Date.now(),
  };
}
