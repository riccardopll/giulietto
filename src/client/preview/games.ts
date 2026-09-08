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
export type PreviewOptions = {
  people: number;
  cards: number;
  phase: PreviewPhase;
  longNames: boolean;
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
  if (phase === "bidding") return game;
  while (game.phase === "bidding") game = advancePreview(game);
  if (phase === "results") {
    while (game.phase !== "results" && game.phase !== "finished") game = advancePreview(game);
  } else {
    // Others have played; the viewer can make the final play in this trick.
    game.turn = 1;
    for (let i = 1; i < people; i++) game = advancePreview(game);
    if (phase === "trick") game = advancePreview(game);
  }
  return game;
}
