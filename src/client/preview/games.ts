import {
  bid,
  deal,
  legalBids,
  makeGame,
  play,
  player,
  tick,
  type Game,
} from "../../shared/game.ts";

export type PreviewPhase = "playing" | "bidding" | "trick" | "results" | "blind";
export type PreviewInactive = "none" | "eliminated" | "left";
export type PreviewOptions = {
  people: number;
  cards: number;
  phase: PreviewPhase;
  longNames: boolean;
  played?: number;
  inactive?: PreviewInactive;
};

export function advancePreview(source: Game): Game {
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

export function makePreview(options: PreviewOptions): Game {
  const { people, phase, longNames } = options;
  const cards = phase === "blind" ? 1 : options.cards;
  const players = Array.from({ length: people }, (_, i) =>
    player(
      `preview-${people}-${(i + 1) * 7919}`,
      longNames ? `Player_${i + 1}_Long_Name` : `bot_${i + 1}`,
      Date.now(),
    ),
  );
  const seatOrder = players.map((p) => p.id);
  let game = makeGame(`PREVIEW${people}`, players[0], false);
  game.players = players;
  game.startingLives = 5;
  game.round = 6 - cards;
  deal(game, Date.now());
  // Use a stable seat order so repeated resets are easy to compare.
  game.players.sort((a, b) => seatOrder.indexOf(a.id) - seatOrder.indexOf(b.id));
  game.order = game.players.map((p) => p.id);
  game.players.forEach((p, i) => {
    p.lives = 5 - (i % 3);
  });
  // Keep at least two active players, and retain the inactive seat for spectator previews.
  if (people > 2 && options.inactive && options.inactive !== "none") {
    const inactive = game.players.at(-1)!;
    inactive.lives = 0;
    inactive.left = options.inactive === "left";
    inactive.hand = [];
    game.order = game.order.filter((id) => id !== inactive.id);
  }
  if (phase === "bidding") return game;
  while (game.phase === "bidding") game = advancePreview(game);
  if (phase === "results") {
    while (game.phase !== "trick" || game.players.some((p) => p.hand.length))
      game = advancePreview(game);
    // Keep this fixture on round results even when a random deal gives one player every trick.
    // Include both an exact prediction and a lost life without ending the match.
    for (const p of game.players) p.bid = p.taken;
    const missed = game.players[0];
    missed.bid = missed.taken === game.count ? missed.taken - 1 : missed.taken + 1;
    game = advancePreview(game);
  } else {
    const active = game.order.length;
    const played =
      phase === "trick" ? active : Math.max(0, Math.min(active, options.played ?? active - 1));
    // Rotate the trick's starting player so seat one can act after any partial trick.
    game.turn = (active - played) % active;
    for (let i = 0; i < played; i++) game = advancePreview(game);
  }
  return game;
}
