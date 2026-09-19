from __future__ import annotations

import json
from pathlib import Path

import torch

from .model import Policy


def from_state(state: dict, device: torch.device) -> Policy:
    hidden = state["body.0.weight"].shape[0]
    net = Policy(hidden).to(device).eval()
    net.load_state_dict(state)
    return net


def load(path: Path, device: torch.device) -> Policy:
    if path.suffix == ".json":
        data = json.loads(path.read_bytes())
        hidden = len(data["layers"][0]["b"])
        net = Policy(hidden).to(device).eval()
        layers = [net.body[0], net.body[2], net.policy, net.value]
        with torch.no_grad():
            for layer, weights in zip(
                layers, [*data["layers"], data["policy"], data["value"]], strict=True
            ):
                layer.weight.copy_(torch.tensor(weights["w"], device=device).T)
                layer.bias.copy_(torch.tensor(weights["b"], device=device))
        return net
    state = torch.load(path, map_location=device, weights_only=True)
    return from_state(state.get("net", state), device)


def initialize(net: Policy, source: Policy) -> None:
    net.load_state_dict(source.state_dict())
    with torch.no_grad():
        net.value.weight.zero_()
        net.value.bias.zero_()
