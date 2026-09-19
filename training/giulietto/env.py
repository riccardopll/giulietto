from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from .baseline import heuristic_action, naive_action
from .encode import decode, encode, legal_actions
from .rules import FINISHED, Game, advance, bid, deal, make_game, play

LEARNER, NAIVE, HEURISTIC = 0, 1, 2
HALL = 3
MAX_ROUNDS = 180
PLAYER_COUNTS = np.array([2, 3, 4, 5, 6])
PLAYER_WEIGHTS = np.array([0.1, 0.25, 0.3, 0.2, 0.15])
LIVES = np.array([1, 2, 3, 4, 5])
LIVES_WEIGHTS = np.array([0.1, 0.15, 0.5, 0.15, 0.1])
State = tuple[Game, int]
Actor = Callable[[np.ndarray, np.ndarray, list[State]], tuple[np.ndarray, np.ndarray, np.ndarray]]
SeatSampler = Callable[[int, np.random.Generator], list[int]]


def fixed_actor(policy: Callable[[Game, int], int]) -> Actor:
    def act(obs, mask, states):
        actions = np.array([policy(game, seat) for game, seat in states])
        zeros = np.zeros(len(states), dtype=np.float32)
        return actions, zeros, zeros

    return act


naive_actor = fixed_actor(naive_action)
heuristic_actor = fixed_actor(heuristic_action)


class NumpyShuffle:
    def __init__(self, rng: np.random.Generator):
        self.rng = rng

    def shuffle(self, items: list) -> list:
        self.rng.shuffle(items)
        return items


@dataclass
class Rollout:
    obs: list[np.ndarray] = field(default_factory=list)
    mask: list[np.ndarray] = field(default_factory=list)
    action: list[int] = field(default_factory=list)
    logp: list[float] = field(default_factory=list)
    value: list[float] = field(default_factory=list)
    reward: list[float] = field(default_factory=list)
    done: list[bool] = field(default_factory=list)
    next_idx: list[int] = field(default_factory=list)

    def add(self, obs, mask, action, logp, value) -> int:
        self.obs.append(obs)
        self.mask.append(mask)
        self.action.append(int(action))
        self.logp.append(float(logp))
        self.value.append(float(value))
        self.reward.append(0.0)
        self.done.append(False)
        self.next_idx.append(-1)
        return len(self.obs) - 1

    def __len__(self) -> int:
        return len(self.obs)


@dataclass
class Match:
    game: Game
    rng: NumpyShuffle
    seat_policy: list[int]
    pending: list[int | None]
    reward_acc: list[float]
    seed: int


@dataclass
class Stats:
    matches: int = 0
    learner_wins: int = 0
    learner_lost: float = 0.0
    learner_rounds: int = 0
    learner_exact: int = 0
    learner_over: int = 0
    rounds: int = 0
    resets: int = 0
    lost_by_count: list[float] = field(default_factory=lambda: [0.0] * 7)
    rounds_by_count: list[int] = field(default_factory=lambda: [0] * 7)


def training_seats(hall_size: int) -> SeatSampler:
    def sample(players: int, rng: np.random.Generator) -> list[int]:
        if rng.random() < 0.1:
            return [LEARNER] * players
        seats = [LEARNER]
        for _ in range(players - 1):
            r = rng.random()
            if r < 0.3:
                seats.append(LEARNER)
            elif r < 0.6 and hall_size:
                seats.append(HALL)
            elif r < 0.9 and hall_size:
                seats.append(HALL + int(rng.integers(hall_size)))
            elif r < 0.99:
                seats.append(HEURISTIC)
            else:
                seats.append(NAIVE)
        rng.shuffle(seats)
        return seats

    return sample


class Arena:
    def __init__(
        self,
        count: int,
        rng: np.random.Generator,
        seats: SeatSampler,
        players: int | None = None,
        lives: int | None = None,
        shaping: float = 0.0,
        seeds: list[int] | None = None,
        assignments: list[list[int]] | None = None,
    ):
        self.shaping = shaping
        self.matches: list[Match | None] = []
        self.stats = Stats()
        self.results: list[dict] = []
        for i in range(count):
            n = players or int(rng.choice(PLAYER_COUNTS, p=PLAYER_WEIGHTS))
            starting = lives or int(rng.choice(LIVES, p=LIVES_WEIGHTS))
            seed = seeds[i] if seeds is not None else int(rng.integers(2**63))
            shuffle = NumpyShuffle(np.random.default_rng(seed))
            game = make_game(n, starting)
            deal(game, shuffle)
            policies = list(assignments[i]) if assignments is not None else seats(n, rng)
            self.matches.append(Match(game, shuffle, policies, [None] * n, [0.0] * n, seed))

    def active(self) -> list[int]:
        return [i for i, m in enumerate(self.matches) if m is not None]

    def step(self, actors: dict[int, Actor], rollout: Rollout | None) -> None:
        groups: dict[int, list[int]] = {}
        for i in self.active():
            match = self.matches[i]
            groups.setdefault(match.seat_policy[match.game.actor()], []).append(i)
        for policy, indices in groups.items():
            states = [(self.matches[i].game, self.matches[i].game.actor()) for i in indices]
            obs = np.stack([encode(game, seat) for game, seat in states])
            mask = np.stack([legal_actions(game, seat) for game, seat in states])
            actions, logp, values = actors[policy](obs, mask, states)
            record = rollout is not None and policy == LEARNER
            for j, i in enumerate(indices):
                match = self.matches[i]
                seat = match.game.actor()
                if record:
                    idx = rollout.add(obs[j], mask[j], actions[j], logp[j], values[j])
                    prev = match.pending[seat]
                    if prev is not None:
                        rollout.next_idx[prev] = idx
                        rollout.reward[prev] = match.reward_acc[seat]
                    match.pending[seat] = idx
                    match.reward_acc[seat] = 0.0
                self.apply(i, int(actions[j]), rollout)

    def apply(self, i: int, action: int, rollout: Rollout | None) -> None:
        match = self.matches[i]
        game = match.game
        seat = game.actor()
        kind, value, low = decode(action)
        if kind == "bid":
            bid(game, seat, value)
        else:
            play(game, seat, value, low)
        before = [p.lives for p in game.players]
        over = [p.bid is not None and p.taken > p.bid for p in game.players]
        count = game.count
        lost = advance(game, match.rng)
        if lost is None:
            return
        self.stats.rounds += 1
        self.stats.resets += int(all(before[s] <= lost[s] for s in range(len(before))))
        for seat, amount in enumerate(lost):
            if match.seat_policy[seat] != LEARNER:
                continue
            match.reward_acc[seat] += (
                self.shaping * (game.players[seat].lives - before[seat]) / game.starting_lives
            )
            if before[seat] > 0:
                self.stats.learner_lost += amount
                self.stats.learner_rounds += 1
                self.stats.learner_exact += int(amount == 0)
                self.stats.learner_over += int(over[seat])
                self.stats.lost_by_count[count] += amount
                self.stats.rounds_by_count[count] += 1
        if game.phase == FINISHED:
            self.finish(i, rollout)
        elif game.round > MAX_ROUNDS:
            raise RuntimeError(f"Match exceeded {MAX_ROUNDS} rounds (seed {match.seed})")

    def finish(self, i: int, rollout: Rollout | None) -> None:
        match = self.matches[i]
        game = match.game
        for seat, idx in enumerate(match.pending):
            if idx is None or rollout is None:
                continue
            # Terminal potential is zero: the shaped return is win - shaping for every seat.
            terminal = float(seat == game.winner)
            terminal -= self.shaping * game.players[seat].lives / game.starting_lives
            rollout.reward[idx] = match.reward_acc[seat] + terminal
            rollout.done[idx] = True
        won = match.seat_policy[game.winner] == LEARNER
        self.stats.matches += 1
        self.stats.learner_wins += int(won)
        self.results.append(
            {
                "seed": match.seed,
                "win": int(won),
                "winner": game.winner,
                "policies": match.seat_policy,
                "rounds": game.round,
            }
        )
        self.matches[i] = None

    def run(self, actors: dict[int, Actor], rollout: Rollout | None = None) -> None:
        while self.active():
            self.step(actors, rollout)
