from __future__ import annotations

import numpy as np
import torch
from torch import nn

from .encode import ACTIONS, OBS_SIZE

HIDDEN = 256
MASK_VALUE = -1e9


class Policy(nn.Module):
    def __init__(self, hidden: int = HIDDEN, obs_size: int = OBS_SIZE):
        super().__init__()
        self.body = nn.Sequential(
            nn.Linear(obs_size, hidden), nn.ReLU(), nn.Linear(hidden, hidden), nn.ReLU()
        )
        self.policy = nn.Linear(hidden, ACTIONS)
        self.value = nn.Linear(hidden, 1)
        nn.init.orthogonal_(self.policy.weight, gain=0.01)
        nn.init.zeros_(self.policy.bias)

    def forward(self, obs: torch.Tensor, mask: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.body(obs[..., : self.body[0].in_features])
        logits = self.policy(h).masked_fill(~mask, MASK_VALUE)
        return logits, self.value(h).squeeze(-1)

    @torch.no_grad()
    def act(
        self, obs: np.ndarray, mask: np.ndarray, device: torch.device, greedy: bool = False
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Returns (actions, log probs, values) for a batch."""
        o = torch.as_tensor(obs, device=device)
        m = torch.as_tensor(mask, device=device)
        logits, values = self(o, m)
        if greedy:
            actions = logits.argmax(-1)
            logp = torch.zeros_like(values)
        else:
            dist = torch.distributions.Categorical(logits=logits)
            actions = dist.sample()
            logp = dist.log_prob(actions)
        return actions.cpu().numpy(), logp.cpu().numpy(), values.cpu().numpy()

    def export(self) -> dict:
        """Weights as plain lists, rounded, for src/shared/bot.ts."""

        def matrix(layer: nn.Linear) -> dict:
            return {
                "w": [[round(float(v), 5) for v in row] for row in layer.weight.T.tolist()],
                "b": [round(float(v), 5) for v in layer.bias.tolist()],
            }

        return {
            "version": 2,
            "obs": self.body[0].in_features,
            "actions": ACTIONS,
            "layers": [matrix(self.body[0]), matrix(self.body[2])],
            "policy": matrix(self.policy),
            "value": matrix(self.value),
        }


def network_actor(net: Policy, device: torch.device, greedy: bool = False):
    def act(obs, mask, states):
        return net.act(obs, mask, device, greedy)

    return act
