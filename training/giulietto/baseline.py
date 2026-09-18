"""The naive policy from src/client/preview/games.ts: round-share bid, lowest card, ace high."""

from __future__ import annotations

from .encode import ACTION_BID
from .rules import BIDDING, Game, legal_bids


def naive_action(game: Game, seat: int) -> int:
    if game.phase == BIDDING:
        choices = legal_bids(game)
        target = int(game.count / len(game.order) + 0.5)
        return ACTION_BID + (target if target in choices else choices[0])
    return game.players[seat].hand[0] - 1
