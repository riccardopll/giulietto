"""Exact blind-ace endgames where either choice immediately ends the match."""

from __future__ import annotations

import numpy as np
import torch

from .encode import ACTION_ACE_LOW, encode, legal_actions
from .model import Policy
from .rules import PLAYING, Play, make_game


def ace_endgames() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    observations, masks, answers = [], [], []
    for players in range(2, 7):
        for me in range(players):
            opponent = (me + 1) % players
            for target in [0, 1]:
                for card in range(1, 41):
                    if card == 31:
                        continue
                    game = make_game(players, 1)
                    game.count, game.round, game.phase = 1, 6, PLAYING
                    game.order, game.turn = [opponent, me], 1
                    for p in game.players:
                        p.lives = int(p.seat in game.order)
                        p.bid = target if p.lives else None
                        p.hand = [31] if p.seat == me else []
                    game.trick = [Play(opponent, card)]
                    game.played = list(game.trick)
                    observations.append(encode(game, me))
                    masks.append(legal_actions(game, me))
                    answers.append(30 if target else ACTION_ACE_LOW)
    return np.stack(observations), np.stack(masks), np.array(answers)


def evaluate_tactics(net: Policy) -> dict:
    obs, masks, answers = ace_endgames()
    device = next(net.parameters()).device
    with torch.no_grad():
        logits, _ = net(torch.as_tensor(obs, device=device), torch.as_tensor(masks, device=device))
        choices = logits.argmax(-1).cpu().numpy()
        probabilities = logits.softmax(-1).cpu().numpy()[np.arange(len(answers)), answers]
    return {
        "positions": len(answers),
        "accuracy": float(np.mean(choices == answers)),
        "correct_action_probability": float(np.mean(probabilities)),
    }
