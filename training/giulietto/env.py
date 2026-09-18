"""Batches of matches stepped one decision at a time, with per-seat trajectories."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from .baseline import naive_action
from .encode import decode, encode, legal_actions
from .rules import FINISHED, Game, advance, bid, deal, make_game, play

LEARNER = 0
NAIVE = 1
HALL = 2  # policy ids >= HALL index into the hall of fame

LIFE_SCALE = 3.0
WIN_REWARD = 1.0
MAX_ROUNDS = 60

PLAYER_COUNTS = np.array([2, 3, 4, 5, 6])
PLAYER_WEIGHTS = np.array([0.1, 0.3, 0.3, 0.2, 0.1])
LIVES = np.array([1, 2, 3, 4, 5])
LIVES_WEIGHTS = np.array([0.1, 0.15, 0.5, 0.15, 0.1])

State = tuple[Game, int]
Actor = Callable[[np.ndarray, np.ndarray, list[State]], tuple[np.ndarray, np.ndarray, np.ndarray]]
"""(obs batch, mask batch, (game, seat) per row) -> (actions, log probs, values)."""


def naive_actor(obs: np.ndarray, mask: np.ndarray, states: list[State]) -> tuple:
    actions = np.array([naive_action(game, seat) for game, seat in states])
    zeros = np.zeros(len(states), dtype=np.float32)
    return actions, zeros, zeros


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
    bootstrap: list[float] = field(default_factory=list)

    def add(self, obs, mask, action, logp, value) -> int:
        self.obs.append(obs)
        self.mask.append(mask)
        self.action.append(int(action))
        self.logp.append(float(logp))
        self.value.append(float(value))
        self.reward.append(0.0)
        self.done.append(False)
        self.next_idx.append(-1)
        self.bootstrap.append(0.0)
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


@dataclass
class Stats:
    matches: int = 0
    learner_wins: int = 0
    mixed_matches: int = 0
    mixed_learner_wins: int = 0
    rounds: int = 0
    learner_lost: float = 0.0
    learner_rounds: int = 0


SeatSampler = Callable[[int, np.random.Generator], list[int]]


def training_seats(hall_size: int) -> SeatSampler:
    def sample(players: int, rng: np.random.Generator) -> list[int]:
        if rng.random() < 0.5:
            return [LEARNER] * players
        seats = [LEARNER]
        for _ in range(players - 1):
            r = rng.random()
            if r < 0.5 or (r < 0.9 and hall_size == 0):
                seats.append(LEARNER)
            elif r < 0.9:
                seats.append(HALL + int(rng.integers(hall_size)))
            else:
                seats.append(NAIVE)
        rng.shuffle(seats)
        return seats

    return sample


def new_match(
    rng: np.random.Generator,
    seats: SeatSampler,
    players: int | None = None,
    lives: int | None = None,
) -> Match:
    n = players or int(rng.choice(PLAYER_COUNTS, p=PLAYER_WEIGHTS))
    starting = lives or int(rng.choice(LIVES, p=LIVES_WEIGHTS))
    game = make_game(n, starting)
    shuffle = NumpyShuffle(rng)
    deal(game, shuffle)
    return Match(game, shuffle, seats(n, rng), [None] * n, [0.0] * n)


class Arena:
    """Runs many matches in lockstep. Each step is one decision per match."""

    def __init__(
        self,
        count: int,
        rng: np.random.Generator,
        seats: SeatSampler,
        players: int | None = None,
        lives: int | None = None,
        continuous: bool = True,
    ):
        self.rng = rng
        self.seats = seats
        self.players = players
        self.lives = lives
        self.continuous = continuous
        self.matches: list[Match | None] = [
            new_match(rng, seats, players, lives) for _ in range(count)
        ]
        self.stats = Stats()

    def active(self) -> list[int]:
        return [i for i, m in enumerate(self.matches) if m is not None]

    def step(self, actors: dict[int, Actor], rollout: Rollout | None) -> None:
        groups: dict[int, list[int]] = {}
        for i in self.active():
            match = self.matches[i]
            groups.setdefault(match.seat_policy[match.game.actor()], []).append(i)
        for policy, indices in groups.items():
            obs = np.stack(
                [encode(self.matches[i].game, self.matches[i].game.actor()) for i in indices]
            )
            mask = np.stack(
                [legal_actions(self.matches[i].game, self.matches[i].game.actor()) for i in indices]
            )
            states = [(self.matches[i].game, self.matches[i].game.actor()) for i in indices]
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
        lost = advance(game, match.rng)
        if lost is None:
            return
        self.stats.rounds += 1
        for seat, amount in enumerate(lost):
            if before[seat] <= 0:
                continue
            if match.seat_policy[seat] == LEARNER:
                match.reward_acc[seat] -= amount / LIFE_SCALE
                self.stats.learner_lost += amount
                self.stats.learner_rounds += 1
            if game.players[seat].lives == 0 and game.phase != FINISHED:
                self.close(match, seat, rollout)
        timed_out = game.round > MAX_ROUNDS and game.phase != FINISHED
        if game.phase == FINISHED or timed_out:
            self.finish(i, rollout, timed_out)

    def close(self, match: Match, seat: int, rollout: Rollout | None) -> None:
        idx = match.pending[seat]
        if idx is not None and rollout is not None:
            rollout.reward[idx] = match.reward_acc[seat]
            rollout.done[idx] = True
        match.pending[seat] = None
        match.reward_acc[seat] = 0.0

    def finish(self, i: int, rollout: Rollout | None, timed_out: bool) -> None:
        match = self.matches[i]
        game = match.game
        winner = None if timed_out else game.winner
        if winner is not None and match.seat_policy[winner] == LEARNER:
            match.reward_acc[winner] += WIN_REWARD
        for seat in range(len(game.players)):
            self.close(match, seat, rollout)
        self.stats.matches += 1
        mixed = any(p != LEARNER for p in match.seat_policy) and LEARNER in match.seat_policy
        if winner is not None and match.seat_policy[winner] == LEARNER:
            self.stats.learner_wins += 1
            if mixed:
                self.stats.mixed_learner_wins += 1
        if mixed:
            self.stats.mixed_matches += 1
        self.matches[i] = (
            new_match(self.rng, self.seats, self.players, self.lives) if self.continuous else None
        )

    def bootstrap(
        self, rollout: Rollout, value_fn: Callable[[np.ndarray, np.ndarray], np.ndarray]
    ) -> None:
        """Value estimates for transitions still waiting on their next decision."""
        entries: list[tuple[int, np.ndarray, np.ndarray]] = []
        for match in self.matches:
            if match is None:
                continue
            for seat, idx in enumerate(match.pending):
                if idx is None:
                    continue
                entries.append((idx, encode(match.game, seat), legal_actions(match.game, seat)))
                rollout.reward[idx] = match.reward_acc[seat]
                match.reward_acc[seat] = 0.0
                match.pending[seat] = None
        if not entries:
            return
        values = value_fn(np.stack([e[1] for e in entries]), np.stack([e[2] for e in entries]))
        for (idx, _, _), value in zip(entries, values, strict=True):
            rollout.bootstrap[idx] = float(value)
