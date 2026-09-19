from __future__ import annotations

import hashlib
from dataclasses import replace

import numpy as np

from .baseline import heuristic_action
from .encode import decode, encode, legal_actions
from .env import fixed_actor
from .rules import ACE, FINISHED, PLAYING, Game, advance, bid, blind, play


def clone(game: Game) -> Game:
    return replace(
        game,
        players=[replace(p, hand=list(p.hand)) for p in game.players],
        order=list(game.order),
        trick=list(game.trick),
        played=list(game.played),
    )


def sample_hands(game: Game, seat: int, rng: np.random.Generator) -> Game:
    sampled = clone(game)
    is_blind = blind(game)
    known = {p.card for p in game.played}
    unknown = []
    for player in sampled.players:
        visible = (player.seat != seat) if is_blind else (player.seat == seat)
        if is_blind and player.seat == seat and game.phase == PLAYING and ACE in player.hand:
            visible = True
        if visible:
            known.update(player.hand)
        else:
            unknown.append(player)
    deck = [c for c in range(1, 41) if c not in known]
    rng.shuffle(deck)
    cursor = 0
    for player in unknown:
        size = len(player.hand)
        player.hand = sorted(deck[cursor : cursor + size])
        cursor += size
    return sampled


def apply(game: Game, action: int, rng: np.random.Generator) -> None:
    kind, value, low = decode(action)
    if kind == "bid":
        bid(game, game.actor(), value)
    else:
        play(game, game.actor(), value, low)
    advance(game, rng)


def search_action(game: Game, seat: int, samples: int = 8) -> int:
    legal = np.flatnonzero(legal_actions(game, seat))
    if len(legal) == 1:
        return int(legal[0])
    digest = hashlib.blake2b(encode(game, seat).tobytes(), digest_size=8).digest()
    rng = np.random.default_rng(int.from_bytes(digest, "little"))
    scores = np.zeros(len(legal))
    for _ in range(samples):
        sampled = sample_hands(game, seat, rng)
        for j, action in enumerate(legal):
            simulated = clone(sampled)
            shuffle = np.random.default_rng(0)
            apply(simulated, int(action), shuffle)
            while simulated.phase != FINISHED and simulated.round == game.round:
                apply(simulated, heuristic_action(simulated, simulated.actor()), shuffle)
            if simulated.phase == FINISHED:
                scores[j] += simulated.winner == seat
            else:
                lives = [p.lives**2 for p in simulated.players]
                scores[j] += lives[seat] / sum(lives)
    return int(legal[int(np.argmax(scores))])


def search_actor(samples: int = 8):
    return fixed_actor(lambda game, seat: search_action(game, seat, samples))
