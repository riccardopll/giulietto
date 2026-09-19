# Bot

The bot is a neural network with 162,097 parameters, including its training-only
value head, built in PyTorch and trained through self-play reinforcement learning
using PPO. The bot is served via TypeScript inference.

## Experiments

- **Initial tuning (September 17, 2026):** batches of 1,024 matches and hidden
  width 256 improved the original defaults. Learning rate 0.0001, entropy 0.003,
  and decaying the learning rate to zero performed worse. Width 256 versus 384
  and entropy 0.01 versus 0.02 were inconclusive. These runs used the earlier
  trainer.
- **Revised training (September 19):** 14 runs collected approximately 318 million
  learner decisions using complete-match rewards, blind-card ownership, and
  public play history. The released weights average three compatible runs of
  roughly 30 million decisions each, fine-tuned from the same policy.
- **Final evaluation:** the release scored **52.48%** against the previous bot
  (**95% interval: 52.09–52.86%**, **75,024 games**). This balanced comparison
  covered 2–6 players and 1/3/5 starting lives, with 50% as the equal-strength
  baseline. It also improved against two neural opponents excluded from training.
  Results are recorded in [PR #52](https://github.com/riccardopll/giulietto/pull/52).
