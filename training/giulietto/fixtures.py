"""Fixtures for the TypeScript tests: rule conformance and encoding parity.

Run with `uv run python -m giulietto.fixtures` from the training directory.
"""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

import numpy as np
import torch

from .checkpoint import load
from .encode import ACTION_BID, decode, encode, legal_actions
from .model import Policy
from .rules import (
    ACE,
    BIDDING,
    FINISHED,
    PLAYING,
    Game,
    Xorshift,
    advance,
    bid,
    blind,
    deal,
    legal_bids,
    make_game,
    play,
)

OUT = Path(__file__).resolve().parents[2] / "tests" / "parity" / ".generated"


def pid(game: Game, seat: int | None) -> str | None:
    return None if seat is None else game.players[seat].id


def snapshot(game: Game) -> dict:
    return {
        "phase": game.phase,
        "round": game.round,
        "count": game.count,
        "cycle": game.cycle,
        "turn": game.turn,
        "order": [pid(game, s) for s in game.order],
        "players": [
            {"id": p.id, "lives": p.lives, "hand": list(p.hand), "bid": p.bid, "taken": p.taken}
            for p in game.players
        ],
        "trick": [
            {
                "player": pid(game, t.seat),
                "card": t.card,
                **({"mode": "low" if t.low else "high"} if t.card == ACE else {}),
            }
            for t in game.trick
        ],
        "played": [
            {
                "player": pid(game, t.seat),
                "card": t.card,
                **({"mode": "low" if t.low else "high"} if t.card == ACE else {}),
            }
            for t in game.played
        ],
        "lastWinner": pid(game, game.last_winner),
        "winner": pid(game, game.winner),
        "tie": game.tie,
    }


def to_view(game: Game, me: int) -> dict:
    """The subset of GameView that src/shared/bot.ts reads."""
    hidden = blind(game)
    return {
        "you": pid(game, me),
        "phase": game.phase,
        "count": game.count,
        "cycle": game.cycle,
        "startingLives": game.starting_lives,
        "order": [pid(game, s) for s in game.order],
        "turn": game.turn,
        "trick": snapshot(game)["trick"],
        "played": snapshot(game)["played"],
        "canChooseAce": game.phase == PLAYING
        and game.actor() == me
        and ACE in game.players[me].hand,
        "players": [
            {
                "id": p.id,
                "lives": p.lives,
                "hand": [c if (p.seat == me) != hidden else None for c in p.hand],
                "bid": p.bid,
                "taken": p.taken,
            }
            for p in game.players
        ],
        "legalBids": legal_bids(game) if game.phase == BIDDING and game.actor() == me else [],
    }


def random_action(game: Game, chooser: random.Random) -> dict:
    seat = game.actor()
    if game.phase == BIDDING:
        return {"bid": chooser.choice(legal_bids(game))}
    card = chooser.choice(game.players[seat].hand)
    return {"card": card, **({"mode": chooser.choice(["high", "low"])} if card == ACE else {})}


def apply(game: Game, action: dict) -> None:
    seat = game.actor()
    if "bid" in action:
        bid(game, seat, action["bid"])
    else:
        play(game, seat, action["card"], action.get("mode") == "low")


def conformance(matches: int = 12, max_steps: int = 250) -> dict:
    chooser = random.Random(7)
    out = []
    for i in range(matches):
        seed = 1000 + i
        players = 2 + i % 5
        lives = 1 + i % 5
        game = make_game(players, lives)
        rng = Xorshift(seed)
        deal(game, rng)
        steps = [{"state": snapshot(game)}]
        while game.phase != FINISHED and len(steps) <= max_steps:
            action = random_action(game, chooser)
            apply(game, action)
            advance(game, rng)
            steps.append({"action": action, "state": snapshot(game)})
        out.append({"seed": seed, "players": players, "startingLives": lives, "steps": steps})
    return {"matches": out}


def expected_move(game: Game, me: int, legal: list[int], logits) -> dict | None:
    """What src/shared/bot.ts returns: the blind round hides the own card."""
    if (
        game.phase == PLAYING
        and blind(game)
        and game.actor() == me
        and ACE not in game.players[me].hand
    ):
        return {"action": "play"}
    if not legal:
        return None
    kind, value, low = decode(max(legal, key=lambda a: float(logits[a])))
    if kind == "bid":
        return {"action": "bid", "bid": value}
    return {
        "action": "play",
        "card": value,
        **({"mode": "low" if low else "high"} if value == ACE else {}),
    }


def encoding(samples: int = 120) -> dict:
    torch.manual_seed(1)
    net = Policy(hidden=8).eval()
    chooser = random.Random(3)
    rng = np.random.default_rng(3)

    class Shuffle:
        def shuffle(self, items):
            rng.shuffle(items)
            return items

    cases = []
    for i in range(samples):
        game = make_game(2 + i % 5, 1 + i % 5)
        one_card = i % 4 == 0
        if one_card:
            game.round = 5
        deal(game, Shuffle())
        if one_card and i % 8 == 0:
            # Hand the ace to the first player so the blind ace choice is covered.
            first = game.players[game.order[0]]
            holder = next((p for p in game.players if ACE in p.hand), None)
            if holder is None:
                first.hand = [ACE]
            else:
                holder.hand, first.hand = list(first.hand), list(holder.hand)
        steps = (
            chooser.randrange(0, 2 * len(game.players)) if one_card else chooser.randrange(0, 140)
        )
        for _ in range(steps):
            if game.phase == FINISHED:
                break
            apply(game, random_action(game, chooser))
            advance(game, Shuffle())
        if game.phase not in (BIDDING, PLAYING):
            continue
        me = game.actor() if chooser.random() < 0.8 else chooser.choice(game.order)
        obs = encode(game, me)
        mask = legal_actions(game, me)
        with torch.no_grad():
            logits, value = net(torch.as_tensor(obs)[None], torch.as_tensor(mask)[None])
        legal = [int(i) for i in np.flatnonzero(mask)]
        view = to_view(game, me)
        if game.phase == PLAYING and blind(game) and not view["canChooseAce"]:
            legal = []
        cases.append(
            {
                "view": view,
                "obs": [round(float(v), 6) for v in obs],
                "legal": legal,
                "logits": [round(float(v), 6) for v in logits[0]],
                "value": round(float(value[0]), 6),
                "move": expected_move(game, me, legal, logits[0]),
            }
        )
    assert any(c["legal"] and c["legal"][0] >= ACTION_BID for c in cases)
    assert any(c["view"]["count"] == 1 and c["view"]["phase"] == PLAYING for c in cases)
    assert any(c["view"]["canChooseAce"] and c["view"]["count"] == 1 for c in cases)
    weights_path = OUT.parents[2] / "public" / "bot" / "weights.json"
    shipped = load(weights_path, torch.device("cpu"))
    shipped_cases = []
    for case in cases:
        mask = np.zeros(48, dtype=bool)
        mask[case["legal"]] = True
        with torch.no_grad():
            logits, value = shipped(
                torch.tensor([case["obs"]], dtype=torch.float32), torch.tensor(mask)[None]
            )
        shipped_cases.append(
            {
                "logits": [float(v) for v in logits[0]],
                "value": float(value[0]),
                "action": int(logits[0].argmax()) if case["legal"] else None,
            }
        )
    return {
        "weights": net.export(),
        "cases": cases,
        "shipped": {
            "sha256": hashlib.sha256(weights_path.read_bytes()).hexdigest(),
            "cases": shipped_cases,
        },
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rules.json").write_text(json.dumps(conformance(), separators=(",", ":")))
    (OUT / "bot.json").write_text(json.dumps(encoding(), separators=(",", ":")))
    print(f"wrote fixtures to {OUT}")


if __name__ == "__main__":
    main()
