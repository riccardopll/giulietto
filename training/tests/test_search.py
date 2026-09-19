import copy

import numpy as np

from giulietto.rules import deal, make_game
from giulietto.search import sample_hands, search_action


def test_search_uses_only_visible_information_and_preserves_the_position():
    game = make_game(3)
    deal(game, np.random.default_rng(4))
    other = copy.deepcopy(game)
    other.players[1].hand, other.players[2].hand = other.players[2].hand, other.players[1].hand
    before = copy.deepcopy(game)
    first = sample_hands(game, 0, np.random.default_rng(13))
    second = sample_hands(other, 0, np.random.default_rng(13))
    assert first == second
    assert search_action(game, 0, 2) == search_action(other, 0, 2)
    assert game == before
