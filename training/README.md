# Bot training

`public/bot/weights.json` is the only versioned model artifact. It runs in the
development preview; live tables do not have bot seats. Training runs separately;
the game consumes only the exported weights. Keep checkpoints, reference
models, benchmark reports, and plots out of Git. Store new
experiment outputs under `training/runs/`.

Run from `training/` with uv:

```sh
uv sync --frozen
uv run poe check
uv run poe train --out runs/example --init ../public/bot/weights.json --opponent ../public/bot/weights.json --decisions 30000000
uv run poe benchmark runs/example/latest.pt --opponents ../public/bot/weights.json --out runs/example/benchmark.json
uv run poe export runs/example/latest.pt ../public/bot/weights.json
```

`--opponent` selects the fixed reference. `--init` requires the same network shape.
`--resume runs/example/state.pt` restores training; repeat the original options
apart from the output path, budget, device, or thread count.

Keep these constraints when changing training:

- Collect complete matches. Elimination does not end a seat's trajectory because
  an all-out round revives everyone.
- Optimize undiscounted match wins. Life-based potential shaping must telescope
  to `win - initial potential`, including revivals and terminal states.
- Observe only the acting player's information.
- Keep a fixed opponent and historical policies. Evaluate greedy deployment play
  on paired deals with rotated seats, equal settings, and deal-cluster intervals.
- Select on development deals, then evaluate the exact JSON export on fresh deals
  and opponents excluded from training. Use new final seeds for each selection.
- Average only compatible checkpoints from the same initialization, and benchmark
  the exported average before replacing the release weights.
