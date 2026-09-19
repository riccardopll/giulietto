import copy

import numpy as np
import pytest
import torch

from giulietto.baseline import heuristic_action
from giulietto.benchmark import evaluate
from giulietto.encode import HISTORY_BASE, SEAT_VISIBLE_BASE, encode
from giulietto.env import LEARNER, Arena, Rollout, heuristic_actor, naive_actor
from giulietto.rules import BIDDING, PLAYING, Play, make_game
from giulietto.train import advantages


@pytest.mark.parametrize("shaping", [0.0, 0.5, 1.0])
def test_complete_seat_return_is_match_win_minus_initial_potential(shaping):
    rng = np.random.default_rng(13)
    arena = Arena(1, rng, lambda n, r: [LEARNER] * n, players=4, lives=3, shaping=shaping)
    game = arena.matches[0].game
    rollout = Rollout()

    def actor(obs, mask, states):
        actions = [rng.choice(np.flatnonzero(m)) for m in mask]
        return np.array(actions), np.array([seat for _, seat in states]), np.zeros(len(states))

    arena.run({LEARNER: actor}, rollout)
    linked = set(rollout.next_idx)
    roots = [i for i in range(len(rollout)) if i not in linked]
    assert len(roots) == 4
    for i in roots:
        seat = int(rollout.logp[i])
        reward = 0.0
        while True:
            reward += rollout.reward[i]
            if rollout.done[i]:
                break
            i = rollout.next_idx[i]
            assert i >= 0
        assert reward == pytest.approx(float(seat == game.winner) - shaping)
    _, returns = advantages(rollout, 1.0)
    for i in roots:
        assert returns[i] == pytest.approx(float(rollout.logp[i] == game.winner) - shaping)


def test_eliminated_seat_remains_in_its_match_trajectory_through_revival():
    arena = Arena(1, np.random.default_rng(0), lambda n, r: [LEARNER] * n, players=3, lives=1)
    game = arena.matches[0].game
    game.phase, game.count, game.round, game.order, game.turn = PLAYING, 3, 4, [0, 1, 2], 0
    for player, cards, target in zip(
        game.players, [[1, 2, 3], [4, 5, 6], [38, 39, 40]], [1, 0, 3], strict=True
    ):
        player.hand, player.bid = cards, target
    rollout = Rollout()
    for _ in range(9):
        arena.step({LEARNER: naive_actor}, rollout)
    assert [p.lives for p in game.players] == [0, 1, 1]
    previous = arena.matches[0].pending[0]
    assert previous is not None and not any(rollout.done)
    game.phase = PLAYING
    game.players[1].hand, game.players[2].hand = [1, 40], [2, 39]
    for player in game.players:
        player.bid, player.taken = 0, 0
    for _ in range(4):
        arena.step({LEARNER: naive_actor}, rollout)
    assert [p.lives for p in game.players] == [1, 1, 1]
    arena.run({LEARNER: naive_actor}, rollout)
    assert rollout.next_idx[previous] > previous


def test_encoding_preserves_visible_ownership_and_public_play_order():
    game = make_game(4)
    game.count, game.round, game.order, game.turn = 1, 6, [0, 1, 2, 3], 3
    for p, card, target in zip(game.players, [20, 1, 31, 10], [1, 1, 0, None], strict=True):
        p.hand, p.bid = [card], target
    first = encode(game, 3)
    game.players[0].hand, game.players[2].hand = game.players[2].hand, game.players[0].hand
    second = encode(game, 3)
    assert np.array_equal(first[:SEAT_VISIBLE_BASE], second[:SEAT_VISIBLE_BASE])
    assert not np.array_equal(first, second)
    game.phase, game.count = PLAYING, 3
    game.played = [Play(0, 31, True), Play(2, 20)]
    obs = encode(game, 3)
    ace_slot = HISTORY_BASE + 3
    assert obs[ace_slot] == 1 and obs[ace_slot + 1] == 0
    game.played.reverse()
    assert not np.array_equal(obs, encode(game, 3))


def test_blind_bid_does_not_observe_own_card():
    game = make_game(3)
    game.phase, game.count, game.order = BIDDING, 1, [0, 1, 2]
    for p, card in zip(game.players, [2, 20, 40], strict=True):
        p.hand = [card]
    other = copy.deepcopy(game)
    other.players[0].hand = [31]
    assert np.array_equal(encode(game, 0), encode(other, 0))
    assert heuristic_action(game, 0) == heuristic_action(other, 0)


@pytest.mark.parametrize("players", [2, 3, 4, 5, 6])
def test_paired_identical_policies_are_exactly_equal_for_every_table_size(players):
    before = torch.get_rng_state().clone()
    mps_before = torch.mps.get_rng_state().clone() if torch.backends.mps.is_available() else None
    result = evaluate(
        heuristic_actor, heuristic_actor, 4 * players, players, seed=91, balanced=True
    )
    assert result["win_rate"] == 0.5
    assert result["deal_scores"] == [0.5, 0.5]
    assert torch.equal(before, torch.get_rng_state())
    if mps_before is not None:
        assert torch.equal(mps_before, torch.mps.get_rng_state())
