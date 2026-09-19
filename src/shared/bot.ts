// Observation encoding and inference for the trained bot.
// Mirrors training/giulietto/encode.py and model.py; keep both in sync.
import { strength, type Play } from "./game";

const DECK = 40;
const ACE = 31;
const ACE_HIGH = 41;
const MAX_COUNT = 6;
const MAX_PLAYERS = 6;
const MAX_LIVES = 5;
const SEAT_FEATURES = 13;
const GLOBAL_FEATURES = 14;
const HAND_BASE = MAX_PLAYERS * SEAT_FEATURES;
const VISIBLE_BASE = HAND_BASE + DECK;
const PLAYED_BASE = VISIBLE_BASE + DECK;
const GLOBAL_BASE = PLAYED_BASE + DECK;
const SEAT_VISIBLE_BASE = GLOBAL_BASE + GLOBAL_FEATURES;
const HISTORY_BASE = SEAT_VISIBLE_BASE + MAX_PLAYERS;
export const OBS_SIZE = HISTORY_BASE + MAX_COUNT * MAX_PLAYERS * 3;
export const ACTION_ACE_LOW = DECK;
export const ACTION_BID = DECK + 1;
export const ACTIONS = ACTION_BID + MAX_COUNT + 1;
const MASK_VALUE = -1e9;

export type BotView = {
  you: string;
  phase: string;
  count: number;
  cycle: number;
  startingLives: number;
  order: string[];
  turn: number;
  trick: Play[];
  played: Play[];
  canChooseAce: boolean;
  players: {
    id: string;
    lives: number;
    hand: (number | null)[];
    bid: number | null;
    taken: number;
  }[];
  legalBids: number[];
};
type Layer = { w: number[][]; b: number[] };
export type BotWeights = { version: number; layers: Layer[]; policy: Layer; value: Layer };
export type BotMove =
  | { action: "bid"; bid: number }
  | { action: "play"; card?: number; mode?: "high" | "low" };

function actorOf(view: BotView) {
  return view.phase === "bidding" || view.phase === "playing" ? view.order[view.turn] : null;
}

export function encode(view: BotView): Float32Array {
  const obs = new Float32Array(OBS_SIZE);
  const n = view.players.length;
  const myPos = view.players.findIndex((player) => player.id === view.you);
  const blind = isBlind(view);
  const actor = actorOf(view);
  const trickStrength = new Map(view.trick.map((play) => [play.player, strength(play)]));
  const orderPos = new Map(view.order.map((id, i) => [id, i]));

  for (let k = 0; k < n; k++) {
    const player = view.players[(myPos + k) % n];
    const base = k * SEAT_FEATURES;
    obs[base] = 1;
    obs[base + 1] = player.lives > 0 ? 1 : 0;
    obs[base + 2] = player.lives / MAX_LIVES;
    obs[base + 3] = player.bid !== null ? 1 : 0;
    obs[base + 4] = (player.bid ?? 0) / MAX_COUNT;
    obs[base + 5] = player.taken / MAX_COUNT;
    obs[base + 6] = player.hand.length / MAX_COUNT;
    obs[base + 7] = actor === player.id ? 1 : 0;
    obs[base + 8] = orderPos.has(player.id) ? 1 : 0;
    obs[base + 9] = (orderPos.get(player.id) ?? 0) / (MAX_PLAYERS - 1);
    obs[base + 10] = trickStrength.has(player.id) ? 1 : 0;
    obs[base + 11] = (trickStrength.get(player.id) ?? 0) / ACE_HIGH;
    obs[base + 12] = player.bid !== null ? (player.bid - player.taken) / MAX_COUNT : 0;
  }

  for (const player of view.players) {
    const mine = player.id === view.you;
    if (mine === blind) continue;
    for (const card of player.hand)
      if (card !== null) obs[(mine ? HAND_BASE : VISIBLE_BASE) + card - 1] = 1;
  }
  for (let k = 0; k < n; k++) {
    const player = view.players[(myPos + k) % n];
    const card = player.hand[0];
    if (blind && player.id !== view.you && card != null)
      obs[SEAT_VISIBLE_BASE + k] = (card === ACE ? ACE_HIGH : card) / ACE_HIGH;
  }
  for (let i = 0; i < view.played.length; i++) {
    const entry = view.played[i];
    obs[PLAYED_BASE + entry.card - 1] = 1;
    const seat = view.players.findIndex((player) => player.id === entry.player);
    const relative = (seat - myPos + n) % n;
    const trick = Math.floor(i / view.order.length);
    const position = i % view.order.length;
    const base = HISTORY_BASE + (trick * MAX_PLAYERS + relative) * 3;
    obs[base] = 1;
    obs[base + 1] = strength(entry) / ACE_HIGH;
    obs[base + 2] = position / (MAX_PLAYERS - 1);
  }

  const active = view.order.map((id) => view.players.find((player) => player.id === id)!);
  const bidsMade = active.filter((player) => player.bid !== null).length;
  const bidSum = active.reduce((total, player) => total + (player.bid ?? 0), 0);
  const tricksDone = active.reduce((total, player) => total + player.taken, 0);
  const best = Math.max(0, ...trickStrength.values());

  const g = GLOBAL_BASE;
  obs[g] = view.phase === "bidding" ? 1 : 0;
  obs[g + 1] = view.phase === "playing" ? 1 : 0;
  obs[g + 2] = view.count / MAX_COUNT;
  obs[g + 3] = Math.min(view.cycle, 5) / 5;
  obs[g + 4] = blind ? 1 : 0;
  obs[g + 5] = bidsMade / MAX_PLAYERS;
  obs[g + 6] = bidSum / MAX_COUNT;
  obs[g + 7] = (bidSum - view.count) / MAX_COUNT;
  obs[g + 8] = bidsMade === active.length ? 1 : 0;
  obs[g + 9] = active.length / MAX_PLAYERS;
  obs[g + 10] = view.trick.length / MAX_PLAYERS;
  obs[g + 11] = best / ACE_HIGH;
  obs[g + 12] = view.startingLives / MAX_LIVES;
  obs[g + 13] = tricksDone / MAX_COUNT;
  return obs;
}

function isBlind(view: BotView) {
  return view.count === 1 && ["bidding", "playing", "trick"].includes(view.phase);
}

/** In the blind round the own card is hidden; only the ace choice remains a decision. */
export function legalActions(view: BotView): number[] {
  if (actorOf(view) !== view.you) return [];
  if (view.phase === "bidding") return view.legalBids.map((value) => ACTION_BID + value);
  if (isBlind(view)) return view.canChooseAce ? [ACE - 1, ACTION_ACE_LOW] : [];
  const hand = view.players.find((player) => player.id === view.you)!.hand;
  const actions: number[] = [];
  for (const card of hand) {
    if (card === null) continue;
    actions.push(card - 1);
    if (card === ACE) actions.push(ACTION_ACE_LOW);
  }
  return actions.sort((a, b) => a - b);
}

function dense(input: ArrayLike<number>, layer: Layer, relu: boolean): Float32Array {
  const out = new Float32Array(layer.b);
  for (let i = 0; i < layer.w.length; i++) {
    const x = input[i];
    if (x === 0) continue;
    const row = layer.w[i];
    for (let j = 0; j < row.length; j++) out[j] += x * row[j];
  }
  if (relu) for (let j = 0; j < out.length; j++) if (out[j] < 0) out[j] = 0;
  return out;
}

export function infer(weights: BotWeights, obs: Float32Array, legal: number[]) {
  let hidden: Float32Array = obs;
  for (const layer of weights.layers) hidden = dense(hidden, layer, true);
  const logits = dense(hidden, weights.policy, false);
  const allowed = new Set(legal);
  for (let i = 0; i < logits.length; i++) if (!allowed.has(i)) logits[i] = MASK_VALUE;
  return { logits, value: dense(hidden, weights.value, false)[0] };
}

export function decode(action: number): BotMove {
  if (action >= ACTION_BID) return { action: "bid", bid: action - ACTION_BID };
  if (action === ACTION_ACE_LOW) return { action: "play", card: ACE, mode: "low" };
  return { action: "play", card: action + 1, ...(action + 1 === ACE ? { mode: "high" } : {}) };
}

/** Picks the best legal move, or samples one when `random` is given. */
export function botMove(view: BotView, weights: BotWeights, random?: () => number): BotMove | null {
  const legal = legalActions(view);
  if (!legal.length)
    return view.phase === "playing" && isBlind(view) && actorOf(view) === view.you
      ? { action: "play" }
      : null;
  const { logits } = infer(weights, encode(view), legal);
  if (!random) return decode(legal.reduce((best, a) => (logits[a] > logits[best] ? a : best)));
  const max = Math.max(...legal.map((a) => logits[a]));
  const weights_ = legal.map((a) => Math.exp(logits[a] - max));
  let r = random() * weights_.reduce((total, w) => total + w, 0);
  for (let i = 0; i < legal.length; i++) {
    r -= weights_[i];
    if (r <= 0) return decode(legal[i]);
  }
  return decode(legal[legal.length - 1]);
}
