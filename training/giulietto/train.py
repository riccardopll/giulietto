"""PPO self-play. Run with `uv run python -m giulietto.train --out runs/first`."""

from __future__ import annotations

import argparse
import copy
import json
import time
from pathlib import Path

import numpy as np
import torch

from .env import HALL, LEARNER, NAIVE, Arena, Rollout, naive_actor, training_seats
from .model import Policy


def network_actor(net: Policy, device: torch.device, greedy: bool = False):
    def act(obs, mask, states):
        return net.act(obs, mask, device, greedy)

    return act


def value_fn(net: Policy, device: torch.device):
    def values(obs, mask):
        return net.act(obs, mask, device)[2]

    return values


def advantages(rollout: Rollout, gamma: float, lam: float) -> tuple[np.ndarray, np.ndarray]:
    n = len(rollout)
    adv = np.zeros(n, dtype=np.float32)
    value = np.array(rollout.value, dtype=np.float32)
    for i in range(n - 1, -1, -1):
        if rollout.done[i]:
            next_value, next_adv = 0.0, 0.0
        elif rollout.next_idx[i] >= 0:
            j = rollout.next_idx[i]
            next_value, next_adv = value[j], adv[j]
        else:
            next_value, next_adv = rollout.bootstrap[i], 0.0
        delta = rollout.reward[i] + gamma * next_value - value[i]
        adv[i] = delta + gamma * lam * next_adv
    return adv, adv + value


def update(net: Policy, opt: torch.optim.Optimizer, rollout: Rollout, args, device) -> dict:
    adv, ret = advantages(rollout, args.gamma, args.lam)
    obs = torch.as_tensor(np.stack(rollout.obs), device=device)
    mask = torch.as_tensor(np.stack(rollout.mask), device=device)
    action = torch.as_tensor(rollout.action, device=device)
    old_logp = torch.as_tensor(rollout.logp, device=device)
    adv_t = torch.as_tensor((adv - adv.mean()) / (adv.std() + 1e-8), device=device)
    ret_t = torch.as_tensor(ret, device=device)
    n = len(rollout)
    totals = {"policy": 0.0, "value": 0.0, "entropy": 0.0, "kl": 0.0, "clip": 0.0}
    batches = 0
    for _ in range(args.epochs):
        perm = torch.randperm(n, device=device)
        for start in range(0, n, args.minibatch):
            idx = perm[start : start + args.minibatch]
            logits, values = net(obs[idx], mask[idx])
            dist = torch.distributions.Categorical(logits=logits)
            logp = dist.log_prob(action[idx])
            ratio = torch.exp(logp - old_logp[idx])
            a = adv_t[idx]
            policy_loss = -torch.min(
                ratio * a, ratio.clamp(1 - args.clip, 1 + args.clip) * a
            ).mean()
            value_loss = 0.5 * (values - ret_t[idx]).pow(2).mean()
            entropy = dist.entropy().mean()
            loss = policy_loss + args.vf * value_loss - args.ent * entropy
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 0.5)
            opt.step()
            with torch.no_grad():
                totals["policy"] += policy_loss.item()
                totals["value"] += value_loss.item()
                totals["entropy"] += entropy.item()
                totals["kl"] += (old_logp[idx] - logp).mean().item()
                totals["clip"] += ((ratio - 1).abs() > args.clip).float().mean().item()
            batches += 1
    return {k: v / batches for k, v in totals.items()}


def series(a: Policy, b: Policy, matches: int, device, rng, players: int = 4) -> float:
    """Win rate of policy a with half the seats against policy b in the other half."""

    def seats(n: int, r: np.random.Generator) -> list[int]:
        s = [LEARNER] * (n // 2) + [HALL] * (n - n // 2)
        r.shuffle(s)
        return s

    arena = Arena(matches, rng, seats, players=players, lives=3, continuous=False)
    actors = {LEARNER: network_actor(a, device), HALL: network_actor(b, device)}
    while arena.active():
        arena.step(actors, None)
    return arena.stats.learner_wins / max(1, arena.stats.matches)


def versus_naive(net: Policy, matches: int, device, rng, players: int = 4) -> float:
    def seats(n: int, r: np.random.Generator) -> list[int]:
        s = [LEARNER] + [NAIVE] * (n - 1)
        r.shuffle(s)
        return s

    arena = Arena(matches, rng, seats, players=players, lives=3, continuous=False)
    actors = {LEARNER: network_actor(net, device), NAIVE: naive_actor}
    while arena.active():
        arena.step(actors, None)
    return arena.stats.learner_wins / max(1, arena.stats.matches)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--envs", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=128, help="decisions per env per update")
    parser.add_argument("--updates", type=int, default=2000)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--minibatch", type=int, default=4096)
    parser.add_argument("--clip", type=float, default=0.2)
    parser.add_argument("--ent", type=float, default=0.01)
    parser.add_argument("--vf", type=float, default=0.5)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--lam", type=float, default=0.95)
    parser.add_argument("--hidden", type=int, default=256)
    parser.add_argument("--eval-every", type=int, default=50)
    parser.add_argument("--eval-matches", type=int, default=1000)
    parser.add_argument("--promote", type=float, default=0.55, help="win rate needed vs champion")
    parser.add_argument("--hall", type=int, default=8, help="past champions kept as opponents")
    parser.add_argument("--anneal", action="store_true", help="decay the learning rate to zero")
    parser.add_argument("--threads", type=int, default=0, help="torch CPU threads, 0 keeps default")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--resume", type=Path, help="state.pt of an earlier run to continue")
    args = parser.parse_args()

    device = torch.device(args.device)
    if args.threads:
        torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    args.out.mkdir(parents=True, exist_ok=True)
    net = Policy(args.hidden).to(device)
    opt = torch.optim.Adam(net.parameters(), lr=args.lr, eps=1e-5)
    hall: list[Policy] = []
    champion: Policy | None = None
    first = 1
    if args.resume:
        state = torch.load(args.resume, map_location=device)
        net.load_state_dict(state["net"])
        opt.load_state_dict(state["opt"])
        for weights in state["hall"]:
            member = Policy(args.hidden).to(device).eval()
            member.load_state_dict(weights)
            hall.append(member)
        champion = hall[-1] if hall else None
        first = state["update"] + 1
    log = (args.out / "log.jsonl").open("a")

    def save_state(update: int) -> None:
        torch.save(
            {
                "net": net.state_dict(),
                "opt": opt.state_dict(),
                "hall": [member.state_dict() for member in hall],
                "update": update,
            },
            args.out / "state.pt",
        )

    arena = Arena(args.envs, rng, training_seats(0))
    for step in range(first, args.updates + 1):
        started = time.time()
        if args.anneal:
            for group in opt.param_groups:
                group["lr"] = args.lr * (1 - (step - 1) / args.updates)
        arena.seats = training_seats(len(hall))
        arena.stats.__init__()
        actors = {LEARNER: network_actor(net, device), NAIVE: naive_actor}
        for i, old in enumerate(hall):
            actors[HALL + i] = network_actor(old, device)
        rollout = Rollout()
        net.eval()
        for _ in range(args.steps):
            arena.step(actors, rollout)
        arena.bootstrap(rollout, value_fn(net, device))
        collected = time.time()
        net.train()
        losses = update(net, opt, rollout, args, device)
        stats = arena.stats
        record = {
            "update": step,
            "transitions": len(rollout),
            "lost_per_round": stats.learner_lost / max(1, stats.learner_rounds),
            "matches": stats.matches,
            "mixed_win_rate": stats.mixed_learner_wins / max(1, stats.mixed_matches),
            "collect_s": round(collected - started, 2),
            "update_s": round(time.time() - collected, 2),
            **{k: round(v, 4) for k, v in losses.items()},
        }
        if step % args.eval_every == 0 or step == args.updates:
            net.eval()
            record["vs_naive"] = versus_naive(net, args.eval_matches, device, rng)
            candidate = copy.deepcopy(net).eval()
            if champion is None:
                promoted = True
            else:
                record["vs_champion"] = series(candidate, champion, args.eval_matches, device, rng)
                promoted = record["vs_champion"] >= args.promote
            record["promoted"] = promoted
            if promoted:
                champion = candidate
                hall.append(candidate)
                del hall[: -args.hall]
                torch.save(net.state_dict(), args.out / "champion.pt")
                (args.out / "weights.json").write_text(json.dumps(net.export()))
            save_state(step)
        print(json.dumps(record), flush=True)
        log.write(json.dumps(record) + "\n")
        log.flush()


if __name__ == "__main__":
    main()
