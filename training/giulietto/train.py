from __future__ import annotations

import argparse
import copy
import json
import platform
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
import torch

from .benchmark import aggregate, evaluate, fingerprint
from .checkpoint import from_state, initialize, load
from .encode import OBS_SIZE, SEAT_VISIBLE_BASE
from .env import (
    HALL,
    HEURISTIC,
    LEARNER,
    NAIVE,
    Arena,
    Rollout,
    heuristic_actor,
    naive_actor,
    training_seats,
)
from .model import Policy, network_actor


def advantages(rollout: Rollout, lam: float) -> tuple[np.ndarray, np.ndarray]:
    adv = np.zeros(len(rollout), dtype=np.float32)
    values = np.asarray(rollout.value, dtype=np.float32)
    for i in range(len(rollout) - 1, -1, -1):
        j = rollout.next_idx[i]
        if j < 0:
            if not rollout.done[i]:
                raise ValueError("PPO requires complete per-seat trajectories")
            next_value, next_adv = 0.0, 0.0
        else:
            next_value, next_adv = values[j], adv[j]
        adv[i] = rollout.reward[i] + next_value - values[i] + lam * next_adv
    return adv, adv + values


def update(net, opt, rollout, args, device) -> dict:
    adv, ret = advantages(rollout, args.lam)
    obs = torch.as_tensor(np.stack(rollout.obs), device=device)
    mask = torch.as_tensor(np.stack(rollout.mask), device=device)
    action = torch.as_tensor(rollout.action, device=device)
    old_logp = torch.as_tensor(rollout.logp, device=device)
    adv_t = torch.as_tensor((adv - adv.mean()) / (adv.std() + 1e-8), device=device)
    ret_t = torch.as_tensor(ret, device=device)
    n = len(rollout)
    totals = {"policy": 0.0, "value": 0.0, "entropy": 0.0, "kl": 0.0, "clip": 0.0}
    batches = 0
    stopped = False
    for _ in range(args.epochs):
        perm = torch.randperm(n, device=device)
        for start in range(0, n, args.minibatch):
            idx = perm[start : start + args.minibatch]
            logits, values = net(obs[idx], mask[idx])
            dist = torch.distributions.Categorical(logits=logits)
            logp = dist.log_prob(action[idx])
            logratio = logp - old_logp[idx]
            ratio = logratio.exp()
            kl = ((ratio - 1) - logratio).mean()
            if kl.item() > args.target_kl:
                stopped = True
                break
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
            totals["policy"] += policy_loss.item()
            totals["value"] += value_loss.item()
            totals["entropy"] += entropy.item()
            totals["kl"] += kl.item()
            totals["clip"] += ((ratio - 1).abs() > args.clip).float().mean().item()
            batches += 1
        if stopped:
            break
    variance = float(np.var(ret))
    return {
        **{k: v / max(1, batches) for k, v in totals.items()},
        "early_stop": stopped,
        "batches": batches,
        "explained_variance": 1
        - float(np.var(ret - np.asarray(rollout.value))) / max(variance, 1e-8),
    }


def validate(net, champion, reference, matches, device) -> dict:
    actor = network_actor(net, device, greedy=True)
    out = {}
    opponents = {"naive": (naive_actor, False), "heuristic": (heuristic_actor, False)}
    if reference is not None:
        opponents["reference"] = (network_actor(reference, device, True), True)
    if champion is not None:
        opponents["champion"] = (network_actor(champion, device, True), True)
    for name, (other, balanced) in opponents.items():
        results = [
            evaluate(actor, other, matches, n, 3, seed=100_000 + n, balanced=balanced)
            for n in ([2, 3, 4, 5, 6] if balanced else [4])
        ]
        out[name] = aggregate(results)
        out[name]["by_players"] = {
            r["players"]: {k: r[k] for k in ("win_rate", "ci95", "games")} for r in results
        }
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--envs", type=int, default=2048, help="complete matches per update")
    parser.add_argument("--updates", type=int, default=2000)
    parser.add_argument(
        "--decisions", type=int, default=0, help="stop after this many learner decisions"
    )
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--minibatch", type=int, default=4096)
    parser.add_argument("--clip", type=float, default=0.2)
    parser.add_argument("--ent", type=float, default=0.01)
    parser.add_argument("--vf", type=float, default=0.5)
    parser.add_argument("--lam", type=float, default=0.95)
    parser.add_argument("--shaping", type=float, default=0.5)
    parser.add_argument("--target-kl", type=float, default=0.02)
    parser.add_argument("--hidden", type=int, default=256)
    parser.add_argument("--features", choices=["basic", "history"], default="history")
    parser.add_argument("--eval-every", type=int, default=12)
    parser.add_argument("--eval-matches", type=int, default=512)
    parser.add_argument("--hall", type=int, default=8)
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--init", type=Path)
    parser.add_argument(
        "--opponent",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "public" / "bot" / "weights.json",
    )
    parser.add_argument("--resume", type=Path)
    args = parser.parse_args()
    if args.hall < 2 or args.envs < 1 or not 0 <= args.lam <= 1:
        parser.error("hall must be >=2, envs positive, and lambda in [0,1]")
    torch.set_num_threads(args.threads)
    device = torch.device(args.device)
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    net = Policy(args.hidden, OBS_SIZE if args.features == "history" else SEAT_VISIBLE_BASE).to(
        device
    )
    reference = load(args.opponent, device) if not args.resume else None
    if args.init and not args.resume:
        initialize(net, load(args.init, device))
    opt = torch.optim.Adam(net.parameters(), lr=args.lr, eps=1e-5)
    hall = [reference] if reference is not None else []
    champion = None
    snapshots, total, first = 0, 0, 1
    elapsed = 0.0
    config = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()}
    if args.resume:
        state = torch.load(args.resume, map_location=device, weights_only=True)
        mutable = {"out", "updates", "decisions", "resume", "device", "threads"}
        for key in config.keys() - mutable:
            if config[key] != state["config"][key]:
                raise ValueError(f"Resume config differs for {key}: use the saved configuration")
        net.load_state_dict(state["net"])
        opt.load_state_dict(state["opt"])
        hall = [from_state(weights, device) for weights in state["hall"]]
        reference = hall[0]
        champion = from_state(state["champion"], device) if state["champion"] is not None else None
        snapshots, total, elapsed = state["snapshots"], state["decisions"], state["elapsed_s"]
        first = state["update"] + 1
        rng.bit_generator.state = state["numpy_rng"]
        torch.set_rng_state(state["torch_rng"].cpu())
        if device.type == "mps" and state["device_rng"] is not None:
            torch.mps.set_rng_state(state["device_rng"].cpu())
    elif (args.out / "state.pt").exists():
        parser.error("Output already contains a run; choose a new directory or --resume")
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "checkpoints").mkdir(exist_ok=True)
    source = args.out / "source"
    source.mkdir(exist_ok=True)
    source_hashes = {}
    for path in sorted(Path(__file__).parent.glob("*.py")):
        source_hashes[path.name] = fingerprint(path)
        shutil.copyfile(path, source / path.name)
    config["source_sha256"] = source_hashes
    config["torch_version"] = str(torch.__version__)
    config["numpy_version"] = np.__version__
    config["platform"] = platform.platform()
    config["reference_sha256"] = (
        state["config"]["reference_sha256"] if args.resume else fingerprint(args.opponent)
    )
    config["git_commit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    (args.out / "config.json").write_text(json.dumps(config, indent=2) + "\n")

    def save(step):
        state = {
            "net": net.state_dict(),
            "opt": opt.state_dict(),
            "config": config,
            "hall": [old.state_dict() for old in hall],
            "champion": champion.state_dict() if champion is not None else None,
            "snapshots": snapshots,
            "update": step,
            "decisions": total,
            "elapsed_s": elapsed,
            "numpy_rng": rng.bit_generator.state,
            "torch_rng": torch.get_rng_state(),
            "device_rng": torch.mps.get_rng_state() if device.type == "mps" else None,
        }
        temporary = args.out / "state.tmp"
        torch.save(state, temporary)
        temporary.replace(args.out / "state.pt")
        torch.save(net.state_dict(), args.out / "latest.pt")

    with (args.out / "log.jsonl").open("a") as log:
        for step in range(first, args.updates + 1):
            started = time.monotonic()
            arena = Arena(args.envs, rng, training_seats(len(hall)), shaping=args.shaping)
            actors = {
                LEARNER: network_actor(net, device),
                NAIVE: naive_actor,
                HEURISTIC: heuristic_actor,
            }
            actors.update(
                {
                    HALL + i: network_actor(old, device, greedy=i % 2 == 0)
                    for i, old in enumerate(hall)
                }
            )
            net.eval()
            rollout = Rollout()
            arena.run(actors, rollout)
            collected = time.monotonic()
            net.train()
            losses = update(net, opt, rollout, args, device)
            total += len(rollout)
            elapsed += time.monotonic() - started
            stats = arena.stats
            record = {
                "update": step,
                "transitions": len(rollout),
                "decisions": total,
                "elapsed_s": round(elapsed, 3),
                "lost_per_round": stats.learner_lost / max(1, stats.learner_rounds),
                "matches": stats.matches,
                "collect_s": round(collected - started, 3),
                "update_s": round(time.monotonic() - collected, 3),
                **losses,
            }
            final = step == args.updates or (args.decisions and total >= args.decisions)
            if step % args.eval_every == 0 or final:
                net.eval()
                record["validation"] = validate(net, champion, reference, args.eval_matches, device)
                comparison = record["validation"].get("champion")
                promoted = comparison is None or (
                    comparison["ci95"][0] > 0.5
                    and all(r["ci95"][1] >= 0.5 for r in comparison["by_players"].values())
                )
                record["promoted"] = promoted
                if promoted:
                    champion = copy.deepcopy(net).eval()
                    torch.save(champion.state_dict(), args.out / "champion.pt")
                candidate = copy.deepcopy(net).eval()
                snapshots += 1
                if len(hall) < args.hall:
                    hall.append(candidate)
                else:
                    slot = int(rng.integers(snapshots))
                    if slot < args.hall - 1:
                        hall[slot + 1] = candidate
                torch.save(net.state_dict(), args.out / "checkpoints" / f"{step:06d}.pt")
                save(step)
            print(json.dumps(record), flush=True)
            log.write(json.dumps(record) + "\n")
            log.flush()
            if final:
                break


if __name__ == "__main__":
    main()
