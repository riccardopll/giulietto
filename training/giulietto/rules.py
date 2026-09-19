from __future__ import annotations

from dataclasses import dataclass, field

DECK = 40
ACE = 31
ACE_HIGH = 41
ACE_LOW = 0
MAX_COUNT = 6
MAX_PLAYERS = 6
MAX_LIVES = 5
DEFAULT_LIVES = 3

BIDDING, PLAYING, TRICK, RESULTS, FINISHED = "bidding", "playing", "trick", "results", "finished"


@dataclass(slots=True)
class Player:
    id: str
    seat: int
    lives: int = DEFAULT_LIVES
    hand: list[int] = field(default_factory=list)
    bid: int | None = None
    taken: int = 0


@dataclass(slots=True)
class Play:
    seat: int
    card: int
    low: bool = False


@dataclass(slots=True)
class Game:
    players: list[Player]
    starting_lives: int = DEFAULT_LIVES
    phase: str = BIDDING
    order: list[int] = field(default_factory=list)
    round: int = 0
    count: int = MAX_COUNT
    cycle: int = 1
    turn: int = 0
    trick: list[Play] = field(default_factory=list)
    played: list[Play] = field(default_factory=list)
    last_winner: int | None = None
    winner: int | None = None
    tie: bool = False

    def actor(self) -> int:
        return self.order[self.turn]

    def alive(self) -> list[Player]:
        return [p for p in self.players if p.lives > 0]


def strength(play: Play) -> int:
    if play.card == ACE:
        return ACE_LOW if play.low else ACE_HIGH
    return play.card


class Xorshift:
    def __init__(self, seed: int):
        self.x = seed & 0xFFFFFFFF or 1

    def next_u32(self) -> int:
        x = self.x
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= x >> 17
        x ^= (x << 5) & 0xFFFFFFFF
        self.x = x
        return x

    def shuffle(self, items: list) -> list:
        for i in range(len(items) - 1, 0, -1):
            span = i + 1
            limit = (4294967296 // span) * span
            while True:
                random = self.next_u32()
                if random < limit:
                    break
            j = random % span
            items[i], items[j] = items[j], items[i]
        return items


def make_game(players: int, starting_lives: int = DEFAULT_LIVES) -> Game:
    return Game(players=[Player(f"p{i}", i) for i in range(players)], starting_lives=starting_lives)


def deal(game: Game, rng) -> None:
    if game.round == 0:
        for player in game.players:
            player.lives = game.starting_lives
        rng.shuffle(game.players)
        for seat, player in enumerate(game.players):
            player.seat = seat
    game.round += 1
    game.count = MAX_COUNT - ((game.round - 1) % MAX_COUNT)
    game.cycle = (game.round - 1) // MAX_COUNT + 1
    active = game.alive()
    order = [p.seat for p in active]
    offset = (game.round - 1) % len(active)
    game.order = order[offset:] + order[:offset]
    deck = rng.shuffle(list(range(1, DECK + 1)))
    cursor = 0
    for player in game.players:
        if player.lives > 0:
            player.hand = sorted(deck[cursor : cursor + game.count])
            cursor += game.count
        else:
            player.hand = []
        player.bid = None
        player.taken = 0
    game.phase = BIDDING
    game.turn = 0
    game.trick = []
    game.played = []
    game.tie = False


def legal_bids(game: Game) -> list[int]:
    total = sum(p.bid or 0 for p in game.players)
    last = game.turn == len(game.order) - 1
    return [b for b in range(game.count + 1) if not (last and total + b == game.count)]


def bid(game: Game, seat: int, value: int) -> None:
    assert game.phase == BIDDING and game.actor() == seat
    assert value in legal_bids(game)
    game.players[seat].bid = value
    game.turn += 1
    if game.turn == len(game.order):
        game.phase = PLAYING
        game.turn = 0


def play(game: Game, seat: int, card: int, low: bool = False) -> None:
    assert game.phase == PLAYING and game.actor() == seat
    player = game.players[seat]
    player.hand.remove(card)
    entry = Play(seat, card, low and card == ACE)
    game.played.append(entry)
    game.trick.append(entry)
    if len(game.trick) == len(game.order):
        best = game.trick[0]
        for entry in game.trick[1:]:
            if strength(entry) > strength(best):
                best = entry
        game.players[best.seat].taken += 1
        game.last_winner = best.seat
        game.phase = TRICK
    else:
        game.turn = (game.turn + 1) % len(game.order)


def score(game: Game) -> list[int]:
    lost = [0] * len(game.players)
    for seat in game.order:
        player = game.players[seat]
        lost[seat] = abs(player.taken - player.bid)
        player.lives = max(0, player.lives - lost[seat])
    alive = game.alive()
    if not alive:
        for player in game.players:
            player.lives = 1
        alive = game.players
        game.tie = True
    if len(alive) <= 1:
        game.phase = FINISHED
        game.winner = alive[0].seat if alive else None
    else:
        game.phase = RESULTS
    return lost


def advance(game: Game, rng) -> list[int] | None:
    lost = None
    while game.phase in (TRICK, RESULTS):
        if game.phase == TRICK:
            if not game.players[game.order[0]].hand:
                lost = score(game)
            else:
                game.phase = PLAYING
                game.turn = game.order.index(game.last_winner)
                game.trick = []
        else:
            deal(game, rng)
    return lost


def blind(game: Game) -> bool:
    return game.count == 1 and game.phase in (BIDDING, PLAYING, TRICK)
