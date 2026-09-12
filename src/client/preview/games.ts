import {
  bid,
  deal,
  legalBids,
  makeGame,
  MAX_STARTING_LIVES,
  MIN_STARTING_LIVES,
  play,
  player,
  tick,
  type Game,
} from "../../shared/game.ts";

export type PreviewPhase =
  | "lobby"
  | "playing"
  | "bidding"
  | "trick"
  | "results"
  | "finished"
  | "blind";
export type PreviewSeatState = "active" | "eliminated";
export type PreviewOptions = {
  people: number;
  cards: number;
  phase: PreviewPhase;
  longNames: boolean;
  played?: number;
  seatStates?: PreviewSeatState[];
  startingLives?: number;
  completedTricks?: number;
  bids?: number;
  cycle?: number;
};

export function normalizePreview(options: PreviewOptions): Required<PreviewOptions> {
  const clamp = (value: number, min: number, max: number) =>
    Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : min;
  const people = clamp(options.people, 2, 6);
  const cards = options.phase === "blind" ? 1 : clamp(options.cards, 1, 6);
  const seatStates = Array.from(
    { length: people },
    (_, index) => options.seatStates?.[index] ?? "active",
  );
  // A round needs at least two active players.
  let active = seatStates.filter((state) => state === "active").length;
  for (let index = 0; active < 2; index++) {
    if (seatStates[index] !== "active") {
      seatStates[index] = "active";
      active++;
    }
  }
  return {
    ...options,
    people,
    cards,
    seatStates,
    startingLives: clamp(options.startingLives ?? 5, MIN_STARTING_LIVES, MAX_STARTING_LIVES),
    played: clamp(options.played ?? 0, 0, active),
    completedTricks: clamp(options.completedTricks ?? 0, 0, cards - 1),
    bids: clamp(options.bids ?? 0, 0, active - 1),
    cycle: clamp(options.cycle ?? 0, 0, 4),
  };
}

export function advancePreview(source: Game): Game {
  if (source.phase === "lobby") return source;
  const game = structuredClone(source);
  const now = Date.now();
  if (game.phase === "bidding") {
    const choices = legalBids(game);
    const target = Math.round(game.count / game.order.length);
    bid(game, game.order[game.turn], choices.includes(target) ? target : choices[0], now);
  } else if (game.phase === "playing") {
    const id = game.order[game.turn];
    play(game, id, game.players.find((p) => p.id === id)!.hand[0], "high", now);
  } else if (game.phase !== "finished") {
    tick(game, game.deadline);
  }
  game.revision++;
  return game;
}

export function makePreview(input: PreviewOptions): Game {
  const options = normalizePreview(input);
  const { people, phase, longNames, cards, seatStates, startingLives } = options;
  const players = Array.from({ length: people }, (_, i) =>
    player(
      `preview-${people}-${(i + 1) * 7919}`,
      longNames
        ? i % 2 === 0
          ? `${"W".repeat(19)}${i + 1}`
          : "就挨餓的那".repeat(4)
        : `bot_${i + 1}`,
      Date.now(),
    ),
  );
  const seatOrder = players.map((p) => p.id);
  let game = makeGame(`PREVIEW${people}`, players[0], false);
  game.players = players;
  game.startingLives = startingLives;
  if (phase === "finished") {
    game.phase = "finished";
    game.winner = players[1].id;
    game.finishedAt = Date.now();
    game.round = people;
    game.players.forEach((p, index) => {
      p.lives = p.id === game.winner ? startingLives : 0;
      if (p.lives === 0) p.eliminatedRound = people - (index === 0 ? 0 : index - 1);
    });
    return game;
  }
  if (phase === "lobby") {
    game.players.forEach((p) => {
      p.lives = startingLives;
    });
    return game;
  }
  game.round = 6 * options.cycle + 6 - cards;
  deal(game, Date.now());
  // Use a stable seat order so repeated resets are easy to compare.
  game.players.sort((a, b) => seatOrder.indexOf(a.id) - seatOrder.indexOf(b.id));
  game.players.forEach((p, i) => {
    const state = seatStates[i];
    p.lives = state === "eliminated" ? 0 : startingLives;
    if (p.lives === 0) p.hand = [];
  });
  game.order = game.players.filter((p) => p.hand.length > 0).map((p) => p.id);
  if (phase === "bidding") {
    for (let i = 0; i < options.bids; i++) game = advancePreview(game);
    return game;
  }
  while (game.phase === "bidding") game = advancePreview(game);
  if (phase === "results") {
    while (game.phase !== "trick" || game.players.some((p) => p.hand.length))
      game = advancePreview(game);
    game = advancePreview(game);
  } else {
    for (let trick = 0; trick < options.completedTricks; trick++) {
      while (game.phase === "playing") game = advancePreview(game);
      game = advancePreview(game);
    }
    const active = game.order.length;
    const played = phase === "trick" ? active : options.played;
    // Rotate the trick's starting player so seat one can act after any partial trick.
    if (options.completedTricks === 0) game.turn = (active - played) % active;
    for (let i = 0; i < played; i++) game = advancePreview(game);
  }
  return game;
}
