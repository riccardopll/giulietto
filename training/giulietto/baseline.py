from __future__ import annotations

from .encode import ACTION_ACE_LOW, ACTION_BID
from .rules import ACE, ACE_HIGH, BIDDING, Game, blind, legal_bids, strength


def naive_action(game: Game, seat: int) -> int:
    if game.phase == BIDDING:
        choices = legal_bids(game)
        target = int(game.count / len(game.order) + 0.5)
        return ACTION_BID + (target if target in choices else choices[0])
    return game.players[seat].hand[0] - 1


def rank(card: int) -> int:
    return ACE_HIGH if card == ACE else card


def heuristic_action(game: Game, seat: int) -> int:
    player = game.players[seat]
    n = len(game.order)
    if game.phase == BIDDING:
        if blind(game):
            visible = [c for p in game.players if p.seat != seat for c in p.hand]
            best = max((rank(c) for c in visible), default=0)
            unseen = [c for c in range(1, 41) if c not in visible]
            estimate = sum(rank(c) > best for c in unseen) / len(unseen)
        else:
            estimate = sum(((rank(c) - 1) / 40) ** (n - 1) for c in player.hand)
        target = min(legal_bids(game), key=lambda b: (abs(b - estimate), b))
        return ACTION_BID + target
    choices = [(c - 1, rank(c)) for c in player.hand]
    if ACE in player.hand:
        choices.append((ACTION_ACE_LOW, 0))
    need = player.bid - player.taken
    best = max((strength(p) for p in game.trick), default=-1)
    if need <= 0:
        losers = [entry for entry in choices if entry[1] < best]
        return max(losers, key=lambda x: x[1])[0] if losers else min(choices, key=lambda x: x[1])[0]
    winners = [entry for entry in choices if entry[1] > best]
    if not winners:
        return min(choices, key=lambda x: x[1])[0]
    if len(game.trick) == n - 1:
        return min(winners, key=lambda x: x[1])[0]
    if need >= len(player.hand):
        return max(winners, key=lambda x: x[1])[0]
    required = need / len(player.hand)
    remaining = n - len(game.trick) - 1
    enough = [entry for entry in winners if (entry[1] / 41) ** remaining >= required]
    return min(enough, key=lambda x: x[1])[0] if enough else min(choices, key=lambda x: x[1])[0]
