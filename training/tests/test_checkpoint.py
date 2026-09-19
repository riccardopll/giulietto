import subprocess
import sys

import numpy as np
import torch

from giulietto.checkpoint import initialize
from giulietto.encode import OBS_SIZE
from giulietto.model import Policy


def test_fine_tuning_preserves_policy_and_resets_value_estimates():
    original = Policy(hidden=16).eval()
    initialized = Policy(hidden=16)
    initialize(initialized, original)
    obs = torch.as_tensor(np.random.default_rng(0).normal(size=(5, OBS_SIZE)), dtype=torch.float32)
    mask = torch.ones((5, 48), dtype=torch.bool)
    with torch.no_grad():
        old_logits, _ = original(obs, mask)
        new_logits, values = initialized(obs, mask)
    torch.testing.assert_close(old_logits, new_logits)
    assert torch.count_nonzero(values) == 0


def test_resume_matches_uninterrupted_training(tmp_path):
    reference = tmp_path / "reference.pt"
    torch.manual_seed(13)
    torch.save(Policy(hidden=8).state_dict(), reference)

    def run(out, updates, resume=None):
        command = [
            sys.executable,
            "-m",
            "giulietto.train",
            "--out",
            str(out),
            "--updates",
            str(updates),
            "--envs",
            "4",
            "--hidden",
            "8",
            "--eval-every",
            "1",
            "--eval-matches",
            "8",
            "--epochs",
            "1",
            "--init",
            str(reference),
            "--opponent",
            str(reference),
        ]
        if resume:
            command += ["--resume", str(resume)]
        subprocess.run(command, check=True, capture_output=True, text=True)
        return torch.load(out / "state.pt", weights_only=True)

    uninterrupted = run(tmp_path / "full", 2)
    run(tmp_path / "split", 1)
    reference.unlink()
    resumed = run(tmp_path / "split", 2, tmp_path / "split" / "state.pt")
    assert resumed["decisions"] == uninterrupted["decisions"]
    assert resumed["numpy_rng"] == uninterrupted["numpy_rng"]
    assert torch.equal(resumed["torch_rng"], uninterrupted["torch_rng"])
    assert resumed["config"]["reference_sha256"] == uninterrupted["config"]["reference_sha256"]
    for key in uninterrupted["net"]:
        torch.testing.assert_close(uninterrupted["net"][key], resumed["net"][key], rtol=0, atol=0)
