# Bot

The bot learns to win complete Giulietto matches through self-play reinforcement
learning. It currently plays the other seats in the development `/preview`.
Live tables do not yet have bot seats. The bot is served via TypeScript inference.

## Model and play

The released model takes 326 numeric observations, passes them through two
256-unit ReLU layers, and scores 48 actions: 40 cards, the low ace, and bids 0–6.
A separate value head estimates future reward during training; play uses only
the policy scores and selects the highest-scoring legal action.

Observations contain only the acting player's information: visible cards, lives,
bids, tricks taken, turn order, and the current round's public play history.
The blind round hides the bot's own card and preserves which opponent holds each
visible card. The strategy is encoded in the learned weights; deployment uses
one network pass per decision.

`public/bot/weights.json` is the only versioned model artifact. The release was
added in commit `5b11593`; its SHA-256 is
`8696ef4634496990a8c0ff668188dfacc419d3e635042ae773fef0a634e65cbc`.

## Training

The standalone Python simulator uses NumPy and PyTorch with a custom PPO
(Proximal Policy Optimization) loop. It samples moves during training, estimates
whether their outcomes beat the value prediction, and updates the policy with
clipped probability ratios. Training data comes from simulated matches.

The objective is undiscounted match wins. Life-based potential shaping supplies
intermediate feedback while preserving that objective: a complete seat's reward
sums to `win - initial potential`. Trajectories continue through elimination,
because an all-out round can revive a player, and end only when the match ends.

Training mixes 2–6 players and 1–5 starting lives. Opponents include the current
policy, a fixed reference, historical policies, and naive and heuristic bots.
The reference stays fixed so progress is not measured only against a changing
self-play population.

Current defaults are 2,048 complete matches per update, Adam learning rate
0.0003, four PPO epochs, minibatches of 4,096 decisions, clip 0.2, entropy
coefficient 0.01, GAE lambda 0.95, and shaping coefficient 0.5. These are the
current recipe, not a claim that every setting is optimal. Fine-tuning requires
matching network shapes; resuming restores optimizer, opponents, and RNG state.

## Experiments and release selection

- **Initial tuning, September 17, 2026:** batches of 1,024 matches and hidden
  width 256 improved the original defaults. Learning rate 0.0001, entropy 0.003,
  and decaying the rate to zero performed worse. Width 256 versus 384 and entropy
  0.01 versus 0.02 were indistinguishable within noise. These observations used
  the earlier trainer and should not be treated as a sweep of the current one.
- **Follow-up training, September 19:** 14 training runs collected approximately
  318 million learner decisions. The revised trainer used complete-match
  rewards and observations with blind-card ownership and public play history.
  The release is an equal weight average of three compatible fine-tuning runs
  of roughly 30 million learner decisions each, starting from the same policy.
- **Final evaluation:** the exact exported average scored **52.48%** against the
  previous bot, with a **95% interval of 52.09–52.86%**, over **75,024 games**.
  It also improved against two neural opponents excluded from training.

The initial tuning notes are preserved in commit `7ae843a`; the release result
is recorded in [PR #52](https://github.com/riccardopll/giulietto/pull/52).
Raw run logs, intermediate checkpoints, and benchmark reports were removed
during cleanup, so the full per-run sweep cannot be reconstructed from the
release weights alone. Keep future generated outputs under ignored
`training/runs/` and record the selected model's recipe and final evidence here.

## Measuring progress

The release comparison covers 2–6 players and 1/3/5 starting lives, weighted
equally. It reuses seeded deals, rotates seats, and swaps candidate/reference
seat allocations. The score measures whether a candidate-controlled seat wins;
50% is the equal-strength baseline for this balanced comparison, including odd
table sizes. Confidence intervals bootstrap whole deals rather than treating
correlated seat rotations as independent games.

Use greedy inference for benchmarks, separate selection deals from fresh final
deals, and include opponents excluded from training. The benchmark also supports
naive, heuristic, and sampled-hidden-hand search opponents, and checks blind-ace
endgames. Wins against one reference establish relative improvement, not optimal
play or strength against humans. The TypeScript test against a naive policy is
a smoke check, not release evidence.
