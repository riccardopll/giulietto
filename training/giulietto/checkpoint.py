from __future__ import annotations

import gzip
import json
from pathlib import Path

import torch

from .model import Policy


def from_state(state: dict, device: torch.device) -> Policy:
    hidden, inputs = state["body.0.weight"].shape
    net = Policy(hidden, inputs).to(device).eval()
    net.load_state_dict(state)
    return net


def load(path: Path, device: torch.device) -> Policy:
    if path.suffix in (".json", ".gz"):
        data = json.loads(
            gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
        )
        hidden = len(data["layers"][0]["b"])
        net = Policy(hidden, len(data["layers"][0]["w"])).to(device).eval()
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
    """Preserve the policy when adding observations; start the new value objective afresh."""
    old = source.state_dict()
    weights = net.state_dict()
    hidden = source.body[0].out_features
    if hidden > net.body[0].out_features:
        raise ValueError("Initialization cannot reduce the hidden width")
    for key in weights:
        if key.startswith("value."):
            continue
        if key == "body.0.weight":
            weights[key][:hidden].zero_()
            inputs = min(weights[key].shape[1], old[key].shape[1])
            weights[key][:hidden, :inputs] = old[key][:, :inputs]
        elif key == "body.2.weight":
            weights[key][:hidden].zero_()
            weights[key][:hidden, :hidden] = old[key]
        elif key in ("body.0.bias", "body.2.bias"):
            weights[key][:hidden] = old[key]
        elif key == "policy.weight":
            weights[key].zero_()
            weights[key][:, :hidden] = old[key]
        else:
            weights[key] = old[key]
    net.load_state_dict(weights)
    with torch.no_grad():
        net.value.weight.zero_()
        net.value.bias.zero_()
