# TECH_NOTES — the engine port and how it was verified

What Dispatch Lab's engine is, what it had to reproduce exactly, and the record of the checks. The page's own README covers what it shows; `tests/README.md` lists the checks.

## 1. What the page reproduces

The challenge's runner (`src/tbrain-simulation.py` on `main`) loads `data/maps/neufrankfurt_19agents.json` with `src/scenario_loader.py` and steps flatland-rl's `RailEnv` with one controller until every train is done or 1,248 steps have passed. The score is the sum of every step's rewards.

| Item | Value |
|---|---|
| Challenge | VictorPflueger/mobilitychallenge, `main` at 5303697 (28 Oct 2026) |
| Map | `neufrankfurt_19agents.json`, 100 × 60 cells, 19 trains, 59 intermediate stops, sha256 `8b7a7b6e…bea0d5228` |
| Environment | flatland-rl 4.2.2 on Python 3.13.18 (the challenge's `uv.lock`) |
| Loader settings | `remove_agents_at_target=True`, acceleration 0.3, braking −0.5, malfunctions off |
| Rewards | `src/rewards_fix.py` (`DefaultRewards`) with `get_scaled_penalties(1248, "balanced")`: crash 0.75 × 1,248 = 936 × speed, stop not served 0.40 × 1,248 = 499.2, cancellation 4 × (travel time + 0.30 × 1,248), late at a stop 0.5 per step, early departure 1.75 per step, late at the target 1 per step |

The challenge also ships `src/speed_counter_fix.py` and `src/agent_utils_fix.py`, but the runner does not import them: flatland's own `SpeedCounter` and `EnvAgent` run, and the port follows those.

## 2. The engine (`js/engine/`)

A line-by-line port of `RailEnv.step` and what it calls, for the parts this scenario uses:

- **Speed counter**: a train's speed is `1 / round(1 / speed)`, so the scenario's RB speed 0.8 becomes 1.0 and the S-Bahn's 0.6 becomes 0.5; distance accumulates modulo 1; a cell is left when distance + speed ≥ 1.
- **Actions**: `check_action_on_agent` on the transition map: LEFT or RIGHT where there is no such branch becomes MOVE_FORWARD, a move with no track ahead becomes STOP_MOVING, and a cell with a single way out decides the direction; a train speeds up on MOVE_FORWARD only when that was the action given.
- **State machine**: `envs/step_utils/state_machine.py`, all seven states, with the signals computed in the same order.
- **Motion check** (`envs/step_utils/motion_check.py`, Bochatay 2024): the graph of who wants which resource, conflicts resolved with the lower index winning, swaps and deadlocks stopped. A level-free crossing is two resources, one per axis, so trains crossing at different levels never conflict.
- **Distance maps**: `DistanceMap._distance_map_walker`, a breadth-first walk backwards from each target over the transitions, and `get_shortest_paths` for the travel time on the shortest path, including its quirk at a dead end (an empty path, so a travel time of 0).
- **Episode end**: when every train is done, or at step 1,248, every train gets its end-of-episode reward and the episode is over; a train at its target is removed from the map.
- **Rewards**: `DefaultRewards.step_reward` and `_agent_done_or_max_episode_steps_reward` with their bookkeeping of arrivals, departures and states per waypoint, including the assertion that rejects a revisited waypoint.

Each reward is kept with its Python type (int or float), because the score is a sum of both.

## 3. Python semantics the scores depend on

Matching flatland's floats to the last digit needed CPython's own behaviour in four places (`js/engine/py.js`):

- **`sum()`** in CPython 3.13: an exact integer fast path, the first float added plainly, later floats with Neumaier compensation, the compensation added at the end. The runner's total and `cumulate()` both use it; the baseline's score is −74,022.59999999998, not −74,022.6.
- **Set iteration order** for small ints (the hash table's 8 slots, linear probes, perturbation, resizing): `MotionCheck` iterates a set of train handles when it stops deadlocked trains, and the order decides who stops first.
- **`round()`** rounds half to even (`1 / 0.4` = 2.5 → 2).
- **Enum comparison**: flatland's `RailEnvActions` (a `fastenum`) never equals a plain int. The estimate's Python reference compares an int action with `RailEnvActions.MOVE_LEFT`, which is always false, so its occupancy check always looks at the cell straight ahead; the port does the same (`compareActions = false`).

`tests/engine.mjs python` checks the first three against CPython on 7,000 random inputs.

## 4. The controllers (`js/controllers/`)

- **Baseline**: `OrderedController.act` on a tree observation of depth 2; only the children's `dist_min_to_target` at depth 1 matter. The smallest distance of at least 0 wins (`min_gt` tests ≥, whatever its docstring says), ties go to the last index, and with no branch at all (every distance infinite) the last index is the backward one, which maps to STOP_MOVING.
- **Estimate**: `tools/estimate_controller.py` is the Python reference, ported to `estimate.js`. Rules on top of the baseline's routing: on a platform of the next timetabled stop, brake until stopped and stay until the earliest departure; never move into a cell another train occupies. It scores −36,576.6, 797.4 points from the leaderboard's −37,374. The leaderboard entry's code is not public; this is a reconstruction of the kind of controller that lands there, and the page labels it as Claude's.
- **Optimized**: `PlannerController(n_orders=1, lns_iters=40, seed=2)` with the full observation (`FullEnvObservation`) plans every train through its stops in time and space before the first step, then improves the plan by large-neighbourhood search; about two minutes in Python. Its 597 steps of actions are in `data/planner_actions.json`; `replay.js` hands them to the engine, which simulates and scores them like any other run. `tools/check_plan.py` reruns the planner and compares the actions.

## 5. What the page adds on top (`js/sim.js`)

`simulate()` runs a controller through the engine once and keeps, for every step, each train's cell, direction, state, speed, whether it was blocked, how late it is and how long it has stood still; the running score per step and per train; every reward term (the engine's optional ledger, which changes no computation); the timetable as run; and the events. Everything on screen reads from that record, so scrubbing the timeline costs nothing.

A train counts as **late** from the step it passes the latest arrival of the next stop it has not reached (or of its destination); **blocked** when the motion check refused its move; **stuck** when it has stood still for 40 steps and is 40 steps past its departure time.

## 6. Build decisions

- **Replay, not a port of the planner.** The planner is several hundred lines of search over a time-expanded network and takes two minutes in Python; the page would wait or need a worker and a port that is hard to verify. Replaying its actions through the verified engine shows the same run and the same score, and `check_plan.py` ties the actions to the planner.
- **Fixtures in the branch.** The Python traces (about 3.7 MB in `tests/fixtures/`) make the engine checks runnable without Python. The page never loads them.
- **An orphan `gh-pages` branch.** The site has nothing in common with the Python code on `main`, and GitHub Pages serves a branch's root as it is (`.nojekyll`).
- **No dependencies.** Vici's files are copied unchanged into `vici/`; everything else is plain ES modules. The Content Security Policy allows only this site, and no code uses `innerHTML`.
- **The leaderboard's figure is fixed in `js/runs.js`** (−37,374, from the brief); it is not computed.

## 7. Verification log (28 Oct 2026)

| Check | Result |
|---|---|
| `tools/export_fixtures.py --check` | the three traces, the reward terms, the reference scores and the Python semantics rebuilt identically from flatland-rl 4.2.2 |
| `tools/check_plan.py` | PlannerController's live actions identical to `data/planner_actions.json`: −1,014.0 in 597 steps (1 min 51 s) |
| `tests/engine.mjs` | baseline 1,248 steps, estimate 1,248, optimized 597: every value identical; scores −74,022.59999999998, −36,576.6, −1,014.0; distance maps identical; 122, 91 and 137 reward terms identical; 4,000 sums, 3,000 set orders and 10 roundings identical |
| `tests/engine-negctl.mjs` | 14 planted errors, all caught; the unchanged engine passes |
| `tests/data.mjs` | the site's map is the challenge's byte for byte; plan, scores and traces recorded on it |
| Browser suites | smoke, layout (8 viewports × 4 states), hexagon (both themes), tokens (both themes), page icon, Vici's files: all pass |
