"""Write a checkpoint as weights JSON.

`uv run poe export runs/x/state.pt ../public/bot/weights.json`
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .checkpoint import load


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    net = load(args.checkpoint, torch.device("cpu"))
    args.target.write_text(json.dumps(net.export()))
    print(f"wrote {args.target} ({args.target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
