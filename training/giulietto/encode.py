"""Observation and action encoding. Mirrored in src/shared/bot.ts; keep both in sync.

Seats are relative: index 0 is the acting seat, then the others in table order.
"""

from __future__ import annotations

import numpy as np

from .rules import (
    ACE,
    ACE_HIGH,
    BIDDING,
    DECK,
    MAX_COUNT,
    MAX_LIVES,
    MAX_PLAYERS,
    PLAYING,
    Game,
    blind,
    legal_bids,
    strength,
)

SEAT_FEATURES = 13
GLOBAL_FEATURES = 14
HAND_BASE = MAX_PLAYERS * SEAT_FEATURES
VISIBLE_BASE = HAND_BASE + DECK
PLAYED_BASE = VISIBLE_BASE + DECK
GLOBAL_BASE = PLAYED_BASE + DECK
OBS_SIZE = GLOBAL_BASE + GLOBAL_FEATURES  # 212

ACTION_ACE_LOW = DECK  # 40
ACTION_BID = DECK + 1  # 41..47
ACTIONS = ACTION_BID + MAX_COUNT + 1  # 48


def encode(game: Game, me: int) -> np.ndarray:
    obs = np.zeros(OBS_SIZE, dtype=np.float32)
    n = len(game.players)
    my_pos = next(i for i, p in enumerate(game.players) if p.seat == me)
    is_blind = blind(game)
    actor = game.actor() if game.phase in (BIDDING, PLAYING) else -1
    trick_strength = {p.seat: strength(p) for p in game.trick}
    order_pos = {seat: i for i, seat in enumerate(game.order)}

    for k in range(n):
        player = game.players[(my_pos + k) % n]
        base = k * SEAT_FEATURES
        obs[base] = 1.0
        obs[base + 1] = 1.0 if player.lives > 0 else 0.0
        obs[base + 2] = player.lives / MAX_LIVES
        obs[base + 3] = 1.0 if player.bid is not None else 0.0
        obs[base + 4] = (player.bid or 0) / MAX_COUNT
        obs[base + 5] = player.taken / MAX_COUNT
        obs[base + 6] = len(player.hand) / MAX_COUNT
        obs[base + 7] = 1.0 if actor == player.seat else 0.0
        obs[base + 8] = 1.0 if player.seat in order_pos else 0.0
        obs[base + 9] = order_pos.get(player.seat, 0) / (MAX_PLAYERS - 1)
        obs[base + 10] = 1.0 if player.seat in trick_strength else 0.0
        obs[base + 11] = trick_strength.get(player.seat, 0) / ACE_HIGH
        obs[base + 12] = (player.bid - player.taken) / MAX_COUNT if player.bid is not None else 0.0

    if is_blind:
        for player in game.players:
            if player.seat != me:
                for card in player.hand:
                    obs[VISIBLE_BASE + card - 1] = 1.0
    else:
        for card in game.players[my_pos].hand:
            obs[HAND_BASE + card - 1] = 1.0
    for card in game.played:
        obs[PLAYED_BASE + card - 1] = 1.0

    active = [game.players[seat] for seat in game.order]
    bids_made = sum(1 for p in active if p.bid is not None)
    bid_sum = sum(p.bid or 0 for p in active)
    tricks_done = sum(p.taken for p in active)
    best = max(trick_strength.values(), default=0)

    g = GLOBAL_BASE
    obs[g] = 1.0 if game.phase == BIDDING else 0.0
    obs[g + 1] = 1.0 if game.phase == PLAYING else 0.0
    obs[g + 2] = game.count / MAX_COUNT
    obs[g + 3] = min(game.cycle, 5) / 5
    obs[g + 4] = 1.0 if is_blind else 0.0
    obs[g + 5] = bids_made / MAX_PLAYERS
    obs[g + 6] = bid_sum / MAX_COUNT
    obs[g + 7] = (bid_sum - game.count) / MAX_COUNT
    obs[g + 8] = 1.0 if bids_made == len(active) else 0.0
    obs[g + 9] = len(active) / MAX_PLAYERS
    obs[g + 10] = len(game.trick) / MAX_PLAYERS
    obs[g + 11] = best / ACE_HIGH
    obs[g + 12] = game.starting_lives / MAX_LIVES
    obs[g + 13] = tricks_done / MAX_COUNT
    return obs


def legal_actions(game: Game, me: int) -> np.ndarray:
    mask = np.zeros(ACTIONS, dtype=bool)
    if game.phase == BIDDING and game.actor() == me:
        for value in legal_bids(game):
            mask[ACTION_BID + value] = True
    elif game.phase == PLAYING and game.actor() == me:
        for card in game.players[me].hand:
            mask[card - 1] = True
            if card == ACE:
                mask[ACTION_ACE_LOW] = True
    return mask


def decode(action: int) -> tuple[str, int, bool]:
    """Returns (kind, value, low): kind is 'bid' or 'play'."""
    if action >= ACTION_BID:
        return "bid", action - ACTION_BID, False
    if action == ACTION_ACE_LOW:
        return "play", ACE, True
    return "play", action + 1, False
