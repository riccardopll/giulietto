from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .benchmark import fingerprint
from .checkpoint import load


def average(paths: list[Path], target: Path, coefficients: list[float] | None = None) -> dict:
    coefficients = coefficients or [1.0] * len(paths)
    if len(coefficients) != len(paths) or min(coefficients) < 0 or sum(coefficients) <= 0:
        raise ValueError("Use one nonnegative weight per checkpoint, with positive total weight")
    coefficients = [v / sum(coefficients) for v in coefficients]
    states = [load(path, torch.device("cpu")).state_dict() for path in paths]
    if any(
        state.keys() != states[0].keys()
        or any(state[key].shape != states[0][key].shape for key in state)
        for state in states[1:]
    ):
        raise ValueError("Checkpoint architectures must match")
    weights = {
        key: sum(state[key] * weight for state, weight in zip(states, coefficients, strict=True))
        for key in states[0]
    }
    recipe = [
        {"path": str(path), "sha256": fingerprint(path), "weight": weight}
        for path, weight in zip(paths, coefficients, strict=True)
    ]
    target.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"net": weights, "recipe": recipe}, target)
    target.with_suffix(".recipe.json").write_text(json.dumps(recipe, indent=2) + "\n")
    return {"checkpoint": str(target), "sha256": fingerprint(target), "recipe": recipe}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoints", type=Path, nargs="+")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--weights", type=float, nargs="+")
    args = parser.parse_args()
    torch.set_num_threads(1)
    print(json.dumps(average(args.checkpoints, args.out, args.weights)))


if __name__ == "__main__":
    main()
