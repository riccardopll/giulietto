"""Round-robin on matched deals with both seat allocations, including odd table sizes."""

from __future__ import annotations

import argparse
import itertools
import json
from pathlib import Path

import torch

from .benchmark import evaluate
from .checkpoint import load
from .model import network_actor


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoints", type=Path, nargs="+")
    parser.add_argument("--matches", type=int, default=2000)
    parser.add_argument("--players", type=int, default=4)
    parser.add_argument("--lives", type=int, default=3)
    parser.add_argument("--seed", type=int, default=200_000)
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--sample", action="store_true")
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    device = torch.device("cpu")
    nets = {str(path): load(path, device) for path in args.checkpoints}
    for a, b in itertools.combinations(nets, 2):
        result = evaluate(
            network_actor(nets[a], device, not args.sample),
            network_actor(nets[b], device, not args.sample),
            args.matches,
            args.players,
            args.lives,
            args.seed,
            balanced=True,
        )
        print(
            json.dumps(
                {
                    "a": a,
                    "b": b,
                    **{k: v for k, v in result.items() if k not in ("deal_scores", "deal_seeds")},
                }
            )
        )


if __name__ == "__main__":
    main()
