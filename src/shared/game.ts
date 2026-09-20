import { defaultAvatar, type AvatarId } from "./avatars";
import { GameError } from "./game-error";
import type { Emote } from "./emotes";
import type { ChatMessage } from "./chat";
export type RoundStats = {
  roundsPlayed: number;
  tricksWon: number;
  exactPredictions: number;
  predictionError: number;
};
export type Player = {
  avatar: AvatarId;
  id: string;
  name: string;
  bot?: boolean;
  lives: number;
  hand: number[];
  bid: number | null;
  taken: number;
  seen: number;
  stats: RoundStats;
  eliminatedRound?: number;
  forfeited?: boolean;
  emote?: Emote;
};
export type Spectator = { id: string; name: string; seen: number; emote?: Emote };
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
  startingLives: number;
  turnSeconds: number;
  phase: "lobby" | "bidding" | "playing" | "trick" | "results" | "finished";
  players: Player[];
  spectators?: Spectator[];
  chat?: ChatMessage[];
  order: string[];
  round: number;
  count: number;
  cycle: number;
  turn: number;
  trick: Play[];
  played: Play[];
  lastWinner: string | null;
  results: Result[];
  deadline: number;
  winner: string | null;
  tie: boolean;
};
export const DEFAULT_TURN_SECONDS = 30;
export const MIN_TURN_SECONDS = 5;
export const MAX_TURN_SECONDS = 60;
export const ROUND_PAUSE_MS = 8000;
export const TRICK_PAUSE_MS = 1600;
export const TABLE_RETENTION_MS = 86400000;
export const SPECTATOR_RETENTION_MS = 120000;
export const DEFAULT_STARTING_LIVES = 3;
export const MIN_STARTING_LIVES = 1;
export const MAX_STARTING_LIVES = 5;
export function makeGame(code: string, host: Player, isPublic: boolean): Game {
  return {
    code,
    revision: 0,
    public: isPublic,
    host: host.id,
    startingLives: DEFAULT_STARTING_LIVES,
    turnSeconds: DEFAULT_TURN_SECONDS,
    phase: "lobby",
    players: [host],
    order: [],
    round: 0,
    count: 6,
    cycle: 1,
    turn: 0,
    trick: [],
    played: [],
    lastWinner: null,
    results: [],
    deadline: 0,
    winner: null,
    tie: false,
  };
}
export function makePlayer(id: string, name: string, now: number): Player {
  return {
    id,
    name,
    avatar: defaultAvatar(id),
    lives: DEFAULT_STARTING_LIVES,
    hand: [],
    bid: null,
    taken: 0,
    seen: now,
    stats: { roundsPlayed: 0, tricksWon: 0, exactPredictions: 0, predictionError: 0 },
  };
}
export function findPlayer<T extends { id: string }>(game: { players: T[] }, id: string) {
  return game.players.find((player) => player.id === id);
}
export function inPlay(game: { phase: Game["phase"] }) {
  return game.phase === "bidding" || game.phase === "playing" || game.phase === "trick";
}
export function strength(play: Play) {
  return play.card === 31 ? (play.mode === "low" ? 0 : 41) : play.card;
}
function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const range = i + 1,
      limit = Math.floor(4294967296 / range) * range;
    let random;
    do {
      random = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (random >= limit);
    const j = random % range;
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
export function deal(game: Game, now: number) {
  if (game.round === 0) {
    game.matchId = crypto.randomUUID();
    game.startedAt = now;
    for (const player of game.players) player.lives = game.startingLives;
    shuffle(game.players);
  }
  game.round++;
  game.count = 6 - ((game.round - 1) % 6);
  game.cycle = Math.floor((game.round - 1) / 6) + 1;
  const active = game.players.filter((player) => player.lives > 0);
  game.order = active.map((player) => player.id);
  const offset = (game.round - 1) % active.length;
  game.order = [...game.order.slice(offset), ...game.order.slice(0, offset)];
  const deck = shuffle(Array.from({ length: 40 }, (_, i) => i + 1));
  for (const player of game.players) {
    player.hand = active.includes(player) ? deck.splice(0, game.count).sort((a, b) => a - b) : [];
    player.bid = null;
    player.taken = 0;
  }
  game.phase = "bidding";
  game.turn = 0;
  game.trick = [];
  game.played = [];
  game.results = [];
  game.tie = false;
  game.deadline = now + game.turnSeconds * 1000;
}
export function legalBids(game: Game) {
  const sum = game.players.reduce((total, player) => total + (player.bid ?? 0), 0);
  return Array.from({ length: game.count + 1 }, (_, i) => i).filter(
    (option) => game.turn !== game.order.length - 1 || sum + option !== game.count,
  );
}
export function bid(game: Game, id: string, prediction: number, now: number) {
  if (game.phase !== "bidding" || game.order[game.turn] !== id)
    throw new GameError("Wait for your bidding turn.");
  if (!Number.isInteger(prediction) || !legalBids(game).includes(prediction))
    throw new GameError("That prediction would make the total equal the available tricks.");
  findPlayer(game, id)!.bid = prediction;
  game.turn++;
  if (game.turn === game.order.length) {
    game.phase = "playing";
    game.turn = 0;
  }
  game.deadline = now + game.turnSeconds * 1000;
}
export function play(
  game: Game,
  id: string,
  card: number,
  mode: "high" | "low" | undefined,
  now: number,
) {
  if (game.phase !== "playing" || game.order[game.turn] !== id)
    throw new GameError("Wait for your turn.");
  const player = findPlayer(game, id)!;
  if (!player.hand.includes(card)) throw new GameError("That card is not in your hand.");
  if (card === 31 && mode !== "high" && mode !== "low")
    throw new GameError("Choose high or low for the Ace of Coins.");
  player.hand.splice(player.hand.indexOf(card), 1);
  const entry = { player: id, card, ...(card === 31 ? { mode } : {}) };
  (game.played ??= []).push(entry);
  game.trick.push(entry);
  if (game.trick.length === game.order.length) {
    const winning = game.trick.reduce((best, play) =>
      strength(best) > strength(play) ? best : play,
    );
    const winner = findPlayer(game, winning.player)!;
    winner.taken++;
    game.lastWinner = winner.id;
    game.phase = "trick";
    game.deadline = now + TRICK_PAUSE_MS;
  } else {
    game.turn = (game.turn + 1) % game.order.length;
    game.deadline = now + game.turnSeconds * 1000;
  }
}
export function forfeit(game: Game, id: string, now: number) {
  if (game.phase === "finished") return;
  const player = findPlayer(game, id)!;
  if (player.forfeited) return;
  player.forfeited = true;
  player.lives = 0;
  player.eliminatedRound ??= game.round;
  player.hand = [];
  player.bid = null;
  const result = game.results.find((entry) => entry.id === id);
  if (result) result.lives = 0;
  const alive = game.players.filter((member) => member.lives > 0);
  const phase = game.phase;
  const current = game.order[game.turn];
  const index = game.order.indexOf(id);
  game.order = game.order.filter((member) => member !== id);
  if (alive.length <= 1) {
    game.phase = "finished";
    game.finishedAt = now;
    game.winner = alive[0]?.id ?? null;
    game.deadline = 0;
    return;
  }
  if (index < 0 || game.phase === "results") return;
  if (game.phase === "trick") findPlayer(game, game.lastWinner!)!.taken--;
  game.trick = game.trick.filter((entry) => entry.player !== id);
  if (game.phase === "bidding") {
    game.turn = game.order.findIndex((member) => findPlayer(game, member)!.bid === null);
    if (game.turn < 0) {
      game.phase = "playing";
      game.turn = 0;
    }
  } else if (game.trick.length === game.order.length) {
    const winning = game.trick.reduce((best, entry) =>
      strength(best) > strength(entry) ? best : entry,
    );
    findPlayer(game, winning.player)!.taken++;
    game.lastWinner = winning.player;
    game.phase = "trick";
    game.deadline = now + TRICK_PAUSE_MS;
    return;
  } else {
    game.turn = current === id ? index % game.order.length : game.order.indexOf(current);
  }
  if (current === id || phase !== game.phase) game.deadline = now + game.turnSeconds * 1000;
}
export function score(game: Game, now: number) {
  game.results = game.order.map((id) => {
    const player = findPlayer(game, id)!;
    const lost = Math.abs(player.taken - player.bid!);
    player.stats.roundsPlayed++;
    player.stats.tricksWon += player.taken;
    player.stats.exactPredictions += lost === 0 ? 1 : 0;
    player.stats.predictionError += lost;
    player.lives = Math.max(0, player.lives - lost);
    if (player.lives === 0) player.eliminatedRound = game.round;
    return {
      id: player.id,
      name: player.name,
      bid: player.bid!,
      taken: player.taken,
      lost,
      lives: player.lives,
    };
  });
  let alive = game.players.filter((player) => player.lives > 0);
  if (!alive.length) {
    for (const player of game.players.filter((member) => !member.forfeited)) {
      player.lives = 1;
      delete player.eliminatedRound;
    }
    for (const result of game.results) {
      result.lives = findPlayer(game, result.id)!.lives;
    }
    alive = game.players.filter((player) => player.lives > 0);
    game.tie = true;
  }
  if (alive.length <= 1) {
    game.phase = "finished";
    game.finishedAt = now;
    game.winner = alive[0]?.id ?? null;
    game.deadline = 0;
  } else {
    game.phase = "results";
    game.deadline = now + ROUND_PAUSE_MS;
  }
}
export function tick(game: Game, now: number, connected?: ReadonlySet<string>) {
  if (game.spectators)
    game.spectators = game.spectators.filter(
      (spectator) => connected?.has(spectator.id) || now - spectator.seen < SPECTATOR_RETENTION_MS,
    );
  if (game.phase === "lobby") {
    game.players = game.players.filter((player) => player.bot || now - player.seen < 120000);
    if (!findPlayer(game, game.host))
      game.host = game.players.find((player) => !player.bot)?.id ?? "";
    return;
  }
  if (!game.deadline || now < game.deadline) return;
  if (game.phase === "bidding") {
    bid(game, game.order[game.turn], legalBids(game)[0], now);
  } else if (game.phase === "playing") {
    const id = game.order[game.turn];
    play(game, id, findPlayer(game, id)!.hand[0], "high", now);
  } else if (game.phase === "trick") {
    if (findPlayer(game, game.order[0])!.hand.length === 0) score(game, now);
    else {
      game.phase = "playing";
      game.turn = game.order.indexOf(game.lastWinner!);
      game.trick = [];
      game.deadline = now + game.turnSeconds * 1000;
    }
  } else if (game.phase === "results") deal(game, now);
}
export function view(game: Game, id: string, connected?: ReadonlySet<string>) {
  const me = findPlayer(game, id);
  const spectator = game.spectators?.find((spectator) => spectator.id === id);
  if (!me && !spectator) throw new GameError("You are no longer at this table. Join again.");
  const active = !!me && game.order.includes(id);
  const blind = game.count === 1 && ["bidding", "playing", "trick"].includes(game.phase);
  return {
    ...game,
    you: id,
    viewerName: (me ?? spectator)!.name,
    spectatorCount: [
      ...(game.spectators ?? []),
      ...game.players.filter(
        (player) => !player.bot && game.phase !== "lobby" && player.lives <= 0,
      ),
    ].filter((watcher) => !connected || connected.has(watcher.id)).length,
    spectating: !me || (game.phase !== "lobby" && me.lives <= 0),
    canChooseAce:
      active && game.phase === "playing" && game.order[game.turn] === id && me.hand.includes(31),
    players: game.players.map((player) => ({
      ...player,
      connected: player.bot || (connected?.has(player.id) ?? true),
      hand: player.hand.map((card) =>
        active && ((!blind && player.id === id) || (blind && player.id !== id)) ? card : null,
      ),
    })),
    legalBids: game.phase === "bidding" && game.order[game.turn] === id ? legalBids(game) : [],
    serverTime: Date.now(),
  };
}
export type GameView = ReturnType<typeof view>;
