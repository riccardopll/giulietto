import numpy as np

from giulietto.baseline import naive_action
from giulietto.encode import ACTION_BID, ACTIONS, OBS_SIZE, decode, encode, legal_actions
from giulietto.env import LEARNER, NAIVE, Arena, Rollout, naive_actor
from giulietto.rules import (
    ACE,
    BIDDING,
    FINISHED,
    PLAYING,
    Xorshift,
    advance,
    bid,
    deal,
    legal_bids,
    make_game,
    play,
)


class Shuffle:
    def __init__(self, seed=0):
        self.rng = np.random.default_rng(seed)

    def shuffle(self, items):
        self.rng.shuffle(items)
        return items


def test_deal_rotates_and_counts_down():
    game = make_game(3)
    rng = Shuffle()
    deal(game, rng)
    seats = [p.seat for p in game.players]
    assert game.count == 6 and game.order[0] == seats[0]
    assert all(len(p.hand) == 6 for p in game.players)
    assert len({c for p in game.players for c in p.hand}) == 18
    counts = [game.count]
    for r in range(2, 8):
        game.phase = "results"
        advance(game, rng)
        counts.append(game.count)
        assert game.order[0] == seats[(r - 1) % 3]
    assert counts == [6, 5, 4, 3, 2, 1, 6] and game.cycle == 2


def test_hook_rule_and_trick_winner():
    game = make_game(3)
    deal(game, Shuffle())
    game.count = 2
    a, b, c = game.order
    game.players[a].hand = [2, 3]
    game.players[b].hand = [39, 40]
    game.players[c].hand = [9, 31]
    bid(game, a, 1)
    bid(game, b, 0)
    assert legal_bids(game) == [0, 2]
    bid(game, c, 0)
    assert game.phase == PLAYING and game.actor() == a
    play(game, a, 2)
    play(game, b, 39)
    play(game, c, 31, low=True)
    assert game.last_winner == b and game.played == [2, 39, 31]
    advance(game, Shuffle())
    assert game.phase == PLAYING and game.actor() == b
    play(game, b, 40)
    play(game, c, 9)
    play(game, a, 3)
    lost = advance(game, Shuffle())
    assert lost[a] == 1 and lost[b] == 2 and lost[c] == 0
    assert game.round == 2 and game.players[b].lives == 1


def test_score_eliminates_and_ties():
    game = make_game(2, 1)
    deal(game, Shuffle())
    game.count = 1
    for p in game.players:
        p.hand = [p.seat + 1]
    a, b = game.order
    bid(game, a, 1)
    bid(game, b, 1)
    play(game, a, game.players[a].hand[0])
    play(game, b, game.players[b].hand[0])
    lost = advance(game, Shuffle())
    assert sorted(lost) == [0, 1]
    assert game.phase == FINISHED and game.winner == game.last_winner


def test_all_out_gives_everyone_a_life():
    game = make_game(2, 1)
    deal(game, Shuffle())
    game.count = 2
    a, b = game.order
    game.players[a].hand = [1, 40]
    game.players[b].hand = [2, 39]
    bid(game, a, 0)
    bid(game, b, 0)
    play(game, a, 1)
    play(game, b, 2)
    advance(game, Shuffle())
    play(game, b, 39)
    play(game, a, 40)
    lost = advance(game, Shuffle())
    assert lost == [1, 1]
    assert all(p.lives == 1 for p in game.players) and game.phase == BIDDING and game.round == 2


def test_xorshift_matches_known_sequence():
    rng = Xorshift(1)
    assert [rng.next_u32() for _ in range(3)] == [270369, 67634689, 2647435461]


def test_encoding_shapes_and_legal_actions():
    game = make_game(4)
    deal(game, Shuffle())
    me = game.actor()
    obs = encode(game, me)
    assert obs.shape == (OBS_SIZE,) and obs.dtype == np.float32
    mask = legal_actions(game, me)
    assert mask.shape == (ACTIONS,) and set(np.flatnonzero(mask)) == {
        ACTION_BID + b for b in range(7)
    }
    assert decode(ACTION_BID + 3) == ("bid", 3, False)
    assert decode(40) == ("play", ACE, True)
    assert decode(30) == ("play", ACE, False)
    assert legal_actions(game, (me + 1) % 4).sum() == 0


def test_naive_matches_preview_policy():
    game = make_game(4)
    deal(game, Shuffle())
    assert naive_action(game, game.actor()) == ACTION_BID + 2  # round(6 / 4) = 2
    for seat in game.order:
        bid(game, seat, naive_action(game, seat) - ACTION_BID)
    assert naive_action(game, game.actor()) == game.players[game.actor()].hand[0] - 1


def test_arena_records_consistent_trajectories():
    rng = np.random.default_rng(0)

    def seats(n, r):
        s = [LEARNER] * (n - 1) + [NAIVE]
        r.shuffle(s)
        return s

    def random_actor(obs, mask, states):
        actions = np.array([rng.choice(np.flatnonzero(m)) for m in mask])
        return actions, np.zeros(len(mask)), np.zeros(len(mask))

    arena = Arena(16, rng, seats)
    rollout = Rollout()
    for _ in range(300):
        arena.step({LEARNER: random_actor, NAIVE: naive_actor}, rollout)
    arena.bootstrap(rollout, lambda obs, mask: np.zeros(len(obs)))
    assert arena.stats.matches > 0
    assert all(rollout.mask[i][rollout.action[i]] for i in range(len(rollout)))
    for i, j in enumerate(rollout.next_idx):
        assert j == -1 or (j > i and not rollout.done[i])
    assert sum(rollout.done) >= arena.stats.matches
    assert min(rollout.reward) >= -6 / 3 and max(rollout.reward) <= 1.0
