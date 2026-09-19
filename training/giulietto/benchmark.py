from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import numpy as np
import torch

from .checkpoint import load
from .env import HALL, LEARNER, Actor, Arena, heuristic_actor, naive_actor
from .model import network_actor
from .tactics import evaluate_tactics


def interval(samples: list[float], seed: int = 0) -> list[float]:
    if len(samples) < 2:
        return [0.0, 1.0]
    values = np.asarray(samples)
    rng = np.random.default_rng(seed)
    means = np.mean(rng.choice(values, size=(2000, len(values))), axis=1)
    return [float(x) for x in np.quantile(means, [0.025, 0.975])]


def aggregate(results: list[dict], seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    means = []
    for result in results:
        values = np.asarray(result["deal_scores"])
        means.append(np.mean(rng.choice(values, size=(2000, len(values))), axis=1))
    return {
        "win_rate": float(np.mean([r["win_rate"] for r in results])),
        "ci95": [float(v) for v in np.quantile(np.mean(means, axis=0), [0.025, 0.975])],
        "games": sum(r["games"] for r in results),
    }


def evaluate(
    candidate: Actor,
    opponent: Actor,
    matches: int = 1000,
    players: int = 4,
    lives: int = 3,
    seed: int = 100_000,
    balanced: bool = False,
) -> dict:
    size = players * (2 if balanced else 1)
    deals = math.ceil(matches / size)
    rng = np.random.default_rng(seed)
    seeds, assignments = [], []
    for _ in range(deals):
        deal_seed = int(rng.integers(2**63))
        base = [LEARNER] * (players // 2 if balanced else 1)
        base += [HALL] * (players - len(base))
        for rotation in range(players):
            row = base[rotation:] + base[:rotation]
            seeds.append(deal_seed)
            assignments.append(row)
            if balanced:
                seeds.append(deal_seed)
                assignments.append([HALL if p == LEARNER else LEARNER for p in row])
    arena = Arena(
        len(seeds),
        rng,
        lambda n, r: [],
        players,
        lives,
        seeds=seeds,
        assignments=assignments,
    )
    started = time.monotonic()
    # Evaluation must not advance the learner's sampling or minibatch RNG.
    with torch.random.fork_rng(devices=[]):
        torch.manual_seed(seed)
        arena.run({LEARNER: candidate, HALL: opponent})
    outcomes: dict[int, list[int]] = {}
    for row in arena.results:
        outcomes.setdefault(row["seed"], []).append(row["win"])
    deal_seeds = sorted(outcomes)
    clusters = [float(np.mean(outcomes[seed])) for seed in deal_seeds]
    stats = arena.stats
    return {
        "players": players,
        "lives": lives,
        "seed": seed,
        "format": "balanced" if balanced else "solo",
        "games": stats.matches,
        "deals": deals,
        "win_rate": float(np.mean(clusters)),
        "ci95": interval(clusters),
        "lost_per_round": stats.learner_lost / max(1, stats.learner_rounds),
        "exact_bid_rate": stats.learner_exact / max(1, stats.learner_rounds),
        "overtrick_rate": stats.learner_over / max(1, stats.learner_rounds),
        "lost_by_count": [
            stats.lost_by_count[i] / max(1, stats.rounds_by_count[i]) for i in range(1, 7)
        ],
        "rounds_by_count": stats.rounds_by_count[1:],
        "resets": stats.resets,
        "seconds": round(time.monotonic() - started, 3),
        "deal_scores": clusters,
        "deal_seeds": deal_seeds,
    }


def fingerprint(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def setting_seed(seed: int, players: int, lives: int) -> int:
    return seed + 1000 * players + 10 * lives


def paired_difference(candidate: list[dict], reference: list[dict]) -> dict:

    def key(row):
        return row["players"], row["lives"], row["format"], row.get("opponent")

    old = {key(r): r for r in reference}
    if {key(r) for r in candidate} != old.keys():
        raise ValueError("Paired comparisons require identical settings and opponents")
    differences = []
    for row in candidate:
        other = old[key(row)]
        if row["deal_seeds"] != other["deal_seeds"] or row["games"] != other["games"]:
            raise ValueError("Paired comparisons require identical deals and game counts")
        scores = np.asarray(row["deal_scores"]) - np.asarray(other["deal_scores"])
        differences.append(
            {
                "deal_scores": scores.tolist(),
                "win_rate": float(scores.mean()),
                "games": row["games"],
            }
        )
    result = aggregate(differences)
    return {
        "win_rate_delta": result["win_rate"],
        "ci95": result["ci95"],
        "games_per_model": result["games"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--opponents", nargs="*", type=Path, default=[])
    parser.add_argument(
        "--baselines", nargs="*", choices=["naive", "heuristic"], default=["naive", "heuristic"]
    )
    parser.add_argument("--matches", type=int, default=2000, help="minimum games per matchup")
    parser.add_argument("--players", type=int, nargs="+", default=[2, 3, 4, 5, 6])
    parser.add_argument("--lives", type=int, nargs="+", default=[1, 3, 5])
    parser.add_argument("--seed", type=int, default=9_000_000)
    parser.add_argument("--sample", action="store_true")
    parser.add_argument("--format", choices=["balanced", "solo", "both"], default="balanced")
    parser.add_argument("--search-samples", type=int, default=0)
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    device = torch.device("cpu")
    net = load(args.checkpoint, device)
    actor = network_actor(net, device, greedy=not args.sample)
    fixed = {"naive": naive_actor, "heuristic": heuristic_actor}
    opponents = {name: (fixed[name], False) for name in args.baselines}
    hashes = {}
    for path in args.opponents:
        opponents[str(path)] = (network_actor(load(path, device), device, not args.sample), True)
        hashes[str(path)] = fingerprint(path)
    if args.search_samples:
        from .search import search_actor

        opponents[f"search-{args.search_samples}"] = (search_actor(args.search_samples), False)
    if not opponents:
        parser.error("Choose at least one baseline, checkpoint opponent, or search opponent")
    report = {
        "schema": 1,
        "checkpoint": str(args.checkpoint),
        "sha256": fingerprint(args.checkpoint),
        "opponents": hashes,
        "mode": "sampled" if args.sample else "greedy",
        "seed": args.seed,
        "setting_seed": "seed + 1000 * players + 10 * lives",
        "tactics": evaluate_tactics(net),
        "parameters": sum(p.numel() for p in net.parameters()),
        "results": [],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    for n in args.players:
        for lives in args.lives:
            for name, (other, balanced) in opponents.items():
                formats = [False]
                if balanced:
                    formats = (
                        [True, False] if args.format == "both" else [args.format == "balanced"]
                    )
                for equal in formats:
                    result = evaluate(
                        actor,
                        other,
                        args.matches,
                        n,
                        lives,
                        setting_seed(args.seed, n, lives),
                        equal,
                    )
                    result["opponent"] = name
                    report["results"].append(result)
                    args.out.write_text(json.dumps(report, indent=2) + "\n")
                    print(
                        json.dumps(
                            {
                                k: v
                                for k, v in result.items()
                                if k not in ("deal_scores", "deal_seeds")
                            }
                        ),
                        flush=True,
                    )
    groups = {(r["opponent"], r["format"]) for r in report["results"]}
    report["summary"] = [
        {
            "opponent": name,
            "format": mode,
            **aggregate(
                [r for r in report["results"] if (r["opponent"], r["format"]) == (name, mode)]
            ),
        }
        for name, mode in sorted(groups)
    ]
    args.out.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
