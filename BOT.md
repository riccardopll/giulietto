# Bot plan

Goal: a bot that plays Giulietto as close to optimally as practical. A network
trained by self-play reinforcement learning, then public bots at tables.

## Game facts the bot relies on

- 40 cards, strict order 1 to 40. No suits, no trump, no follow-suit.
- Card 31 (Ace of Coins) is played as 41 or 0, chosen at play time.
- Rounds deal 6, 5, 4, 3, 2, 1 cards, repeating. The 1-card round is blind:
  you see every hand except your own.
- The last bidder cannot make the bid total equal the trick count, so every
  round has either spare tricks (total below count) or missing tricks (total
  above count). Play strategy differs between the two.
- Lives lost per round equal the gap between bid and tricks taken. Last player
  alive wins.

## Decisions

- The bot is a pure function over a player's view of the game. It lives in
  `src/shared` so the browser, the worker, and tests call the same code.
- Not imitation learning. The event log is small (74 matches) and capped at
  human skill. Bots never learn from the production event log.
- No search-based teacher and no evolution. The network starts from random
  weights and improves by policy-gradient self-play against itself, past
  champions, and a fixed naive baseline.
- A naive policy (round-share bid, lowest card) is the fixed baseline every
  version is measured against. It lives only in training and the bot test.
- Training uses a Python port of the rules, vectorised over many games, so the
  simulator runs inside the learner's process. A conformance test feeds the
  same deals and actions to both implementations and compares states. The
  TypeScript rules remain the source of truth for the app.

## Layout

- `training/`: Python package managed by uv. `uv run poe check` lints and
  tests, `uv run poe train --out runs/<name>` trains, `uv run poe compare
a/champion.pt b/champion.pt` plays saved champions against each other, and
  `uv run poe fixtures` regenerates the TypeScript parity fixtures after
  changing rules, encoding, or the network shape. `--resume runs/<name>/state.pt`
  continues a run with its optimiser and hall of fame.
- `src/shared/bot.ts`: encoding and inference used by the app. It reads a
  `played` list on the game state, added so the bot can count cards without
  an event log.
- `tests/unit/rules.test.ts` replays seeded matches from the Python port
  through the TypeScript rules. `tests/unit/bot.test.ts` checks encoding and
  inference against the Python encoder and model, then plays full matches
  with the shipped weights.

## Step 1: self-play network

Actor-critic trained with PPO. One network plays every seat.

- Input: the player's view encoded as fixed vectors. Own hand, cards played
  this round, each seat's bid, tricks taken, lives, position, round count,
  and the trick in progress. Blind round uses the same encoding with the
  visible hands filled in.
- Outputs: a policy over the 41 possible plays (40 cards, Ace of Coins low as
  a separate action) plus 7 bid values, with illegal actions masked, and a
  value head estimating the expected match outcome from this seat.
- Reward: lives lost per round as a dense signal, plus a terminal reward for
  winning the match. Match outcome is the true objective and is where
  life-total awareness comes from.
- Opponents: sample each seat from the current policy, a hall of fame of past
  checkpoints, and the naive baseline, so the policy does not overfit to
  itself.
- Training runs on a Mac against the Python rules port. The network is small
  enough that CPU is as fast as MPS; pass `--device mps` to compare.
- Export weights as JSON. Inference is a few matrix multiplies written in
  TypeScript, so the worker and the browser run it without a runtime.
- Promotion rule: a checkpoint joins the hall of fame and becomes the
  shipped bot only when it wins a fixed match series against the current one.
- Tuned on 2026-09-17: batch 1024 matches per update and hidden 256 each beat
  the first defaults clearly; learning rate 1e-4, entropy 0.003, and decaying
  the rate to zero all hurt. At 2000 updates, hidden 256 versus 384 and
  entropy 0.01 versus 0.02 were equal within noise, and promotions stopped
  around update 1400. Those settings are now the flag defaults. Ship
  `latest.pt` rather than `champion.pt` when the naive win rate keeps rising
  after the last promotion.
- Fallback if self-play stalls: expert iteration with a determinized Monte
  Carlo search as teacher. The search samples unseen cards into opponents'
  hands, rolls out the round with opponents playing to their bids, and picks
  the move with the lowest expected lives lost. The network learns the
  search's moves and outcomes, then guides the search in the next iteration.

## Step 2: play against the network in `/preview`

The preview runs a local game where the viewer seat bids and plays through
the normal UI and every other seat is the network, loaded from
`public/bot/weights.json` before the page renders. Copy `runs/<name>/weights.json` there
after a training run; it holds the last promoted champion. A unit test plays
full matches with the shipped weights against the naive policy to catch
moves the rules reject.

## Step 3: public bots

Bot seats on real tables.

- Bot moves come from the Durable Object alarm, the same path that auto-plays
  on timeout, with a short delay instead of the 40 second one.
- Inference is one forward pass, well under the Durable Object CPU budget.

Open decisions before starting this step:

- Whether bots count in stats and rankings.
- Whether bots join matchmaking tables or private tables only.
- How a bot seat is shown and named. Live test matches already reserve
  `bot_1` to `bot_6`.
