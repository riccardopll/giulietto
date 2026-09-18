"""Round-robin between saved champions plus a naive check.

`uv run poe compare runs/a/champion.pt runs/b/champion.pt --matches 2000`
"""

from __future__ import annotations

import argparse
import itertools
from pathlib import Path

import numpy as np
import torch

from .model import Policy
from .train import series, versus_naive


def load(path: Path, device: torch.device) -> Policy:
    state = torch.load(path, map_location=device)
    if "net" in state:
        state = state["net"]
    hidden = state["body.0.weight"].shape[0]
    net = Policy(hidden).to(device).eval()
    net.load_state_dict(state)
    return net


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoints", type=Path, nargs="+")
    parser.add_argument("--matches", type=int, default=2000)
    parser.add_argument("--players", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--threads", type=int, default=0)
    args = parser.parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)
    device = torch.device("cpu")
    rng = np.random.default_rng(args.seed)
    nets = {str(path): load(path, device) for path in args.checkpoints}
    names = list(nets)
    print("vs naive (1 seat vs naive, par %.2f):" % (1 / args.players))
    for name in names:
        print(f"  {versus_naive(nets[name], args.matches, device, rng, args.players):.3f}  {name}")
    if len(names) < 2:
        return
    print("head to head (row wins vs column, half the seats each):")
    wins = {name: 0.0 for name in names}
    for a, b in itertools.combinations(names, 2):
        rate = series(nets[a], nets[b], args.matches, device, rng, args.players)
        wins[a] += rate
        wins[b] += 1 - rate
        print(f"  {rate:.3f}  {a}  vs  {b}")
    print("average head-to-head win rate:")
    for name in sorted(names, key=lambda n: -wins[n]):
        print(f"  {wins[name] / (len(names) - 1):.3f}  {name}")


if __name__ == "__main__":
    main()
