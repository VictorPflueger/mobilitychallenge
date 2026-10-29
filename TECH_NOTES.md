# TECH_NOTES — the engine port and how it was verified

What Dispatch Lab's engine is, what it had to reproduce exactly, and the record of the checks. The page's own README covers what it shows; `tests/README.md` lists the checks.

## 1. What the page reproduces

The challenge's runner (`src/tbrain-simulation.py` on `main`) loads `data/maps/neufrankfurt_19agents.json` with `src/scenario_loader.py` and steps flatland-rl's `RailEnv` with one controller until every train is done or the map's last step (1,248) has passed. The score is the sum of every step's rewards. For Köln the tools run the same runner with the same loader settings on `data/maps/kk_36agents.json` instead; the loader scales the penalties to that map's 1,710 steps.

| Item | Value |
|---|---|
| Challenge | VictorPflueger/mobilitychallenge, `main` at 5303697 (28 Oct 2026) |
| Map: Neu-Frankfurt | `neufrankfurt_19agents.json`, 100 × 60 cells, 19 trains, 59 intermediate stops, 1,248 steps, sha256 `8b7a7b6e…bea0d5228` |
| Map: Köln | `kk_36agents.json`, 120 × 100 cells, 36 trains, 108 intermediate stops, 1,710 steps, sha256 `b308ff99…cfce02bb` |
| Environment | flatland-rl 4.2.2 on Python 3.13.18 (the challenge's `uv.lock`) |
| Loader settings | `remove_agents_at_target=True`, acceleration 0.3, braking −0.5, malfunctions off |
| Rewards | `src/rewards_fix.py` (`DefaultRewards`) with `get_scaled_penalties(max_episode_steps, "balanced")`: crash 0.75 × steps × speed, stop not served 0.40 × steps, cancellation 4 × (travel time + 0.30 × steps), late at a stop 0.5 per step, early departure 1.75 per step, late at the target 1 per step. Neu-Frankfurt: crash 936, lost stop 499.2, cancellation buffer 374.4; Köln: 1,282.5, 684 and 513 |

The challenge also ships `src/speed_counter_fix.py` and `src/agent_utils_fix.py`, but the runner does not import them: flatland's own `SpeedCounter` and `EnvAgent` run, and the port follows those.

## 2. The engine (`js/engine/`)

A line-by-line port of `RailEnv.step` and what it calls, for the parts these scenarios use:

- **Speed counter**: a train's speed is `1 / round(1 / speed)`, so Neu-Frankfurt's RB speed 0.8 becomes 1.0 and the S-Bahn's 0.6 becomes 0.5 (on Köln the express trains' 0.8 and the local trains' 0.6 likewise); distance accumulates modulo 1; a cell is left when distance + speed ≥ 1.
- **Actions**: `check_action_on_agent` on the transition map: LEFT or RIGHT where there is no such branch becomes MOVE_FORWARD, a move with no track ahead becomes STOP_MOVING, and a cell with a single way out decides the direction; a train speeds up on MOVE_FORWARD only when that was the action given.
- **State machine**: `envs/step_utils/state_machine.py`, all seven states, with the signals computed in the same order.
- **Motion check** (`envs/step_utils/motion_check.py`, Bochatay 2024): the graph of who wants which resource, conflicts resolved with the lower index winning, swaps and deadlocks stopped. A level-free crossing is two resources, one per axis, so trains crossing at different levels never conflict.
- **Distance maps**: `DistanceMap._distance_map_walker`, a breadth-first walk backwards from each target over the transitions, and `get_shortest_paths` for the travel time on the shortest path, including its quirk at a dead end (an empty path, so a travel time of 0).
- **Episode end**: when every train is done, or at the map's last step (1,248 or 1,710), every train gets its end-of-episode reward and the episode is over; a train at its target is removed from the map.
- **A train placed on its own destination** (Köln's six S-Bahn loops, which start and end on the same cell): the arrival check (`update_if_reached`) runs in the step the train moves onto the map, so it is done and removed in that step, and all its stops are booked as lost. A loop that never sets off pays the cancellation as well.
- **Rewards**: `DefaultRewards.step_reward` and `_agent_done_or_max_episode_steps_reward` with their bookkeeping of arrivals, departures and states per waypoint, including the assertion that rejects a revisited waypoint.

Each reward is kept with its Python type (int or float), because the score is a sum of both.

## 3. Python semantics the scores depend on

Matching flatland's floats to the last digit needed CPython's own behaviour in three places (`js/engine/py.js`):

- **`sum()`** in CPython 3.13: an exact integer fast path, the first float added plainly, later floats with Neumaier compensation, the compensation added at the end. The runner's total and `cumulate()` both use it; the baseline's score is −74,022.59999999998, not −74,022.6.
- **Set iteration order** for small ints (the hash table's 8 slots, linear probes, perturbation, resizing): `MotionCheck` iterates a set of train handles when it stops deadlocked trains, and the order decides who stops first.
- **`round()`** rounds half to even (`1 / 0.4` = 2.5 → 2).

(A fourth trap, outside the engine: flatland's `RailEnvActions` is a `fastenum` that never equals a plain int and cannot be passed to `int()`; the estimate's planner records `action.value`.)

`tests/engine.mjs python` checks the first three against CPython on 11,010 random inputs (6,000 sums, 5,000 set orders, 10 roundings), with pools sized for both maps (sums of up to 45 terms, sets of handles up to 35).

## 4. The controllers (`js/controllers/`)

- **Baseline**: `OrderedController.act` on a tree observation of depth 2; only the children's `dist_min_to_target` at depth 1 matter. The smallest distance of at least 0 wins (`min_gt` tests ≥, whatever its docstring says), ties go to the last index, and with no branch at all (every distance infinite) the last index is the backward one, which maps to STOP_MOVING.
- **Estimate**: `tools/estimate_planner.py` (`EstimatePlanner`), planned in Python before the first step and replayed by `replay.js` from `data/frankfurt/estimate_actions.json`. Neu-Frankfurt only. The leaderboard entry's code is not public; this is a reconstruction of the kind of solution that lands in its range, and the page labels it as Claude's. It solves the first half of the challenge and ignores the second:
  - *Route*: through a platform of each timetabled stop, in order, then to the destination, the shortest way (breadth-first search over cell and direction, never through the destination cell before the end and never twice through the same cell and direction; where that fails, the shortest way to the destination alone).
  - *Booking*: trains are planned one after another by earliest departure. A train enters only at a step from which its whole route is free: every resource on it (a cell, or one level of a level-free crossing) unbooked by any other train within one step of when this train holds it. Until then it waits off the map.
  - *Timing* (exact, checked step by step): a train is ready at step max(earliest departure, 1) and can enter from the next step; a train at speed 1 moves one cell per step, an S-Bahn (speed 0.5) one cell every second step; the action given at step *t* is the branch to take out of the cell the train stands in when *t* begins; it reaches its destination at entry + cells × steps per cell and leaves the map there.
  - *Result*: 1,043 steps, all 19 trains arrive, no train is ever held back; all 59 stops are passed without stopping (−29,452.8) and the trains arrive 3,036 steps late in all (−3,036.0): −32,488.8, 4,885.2 points better than −37,374. The longest wait at an entry is 761 steps (train 2).
  - *Why not the first estimate*: the page first showed a rule-based controller (−36,576.6) that stopped at stations and never drove into an occupied cell. From step 391 on nothing moved any more: 16 trains stood in a deadlock it could not see coming, so on the page the run looked frozen. A dispatcher that books whole routes cannot jam, and every train visibly runs through to its destination.
  - `tools/check_estimate.py` runs the planner through the challenge's runner, checks after every step that every train is where its booking says, that every train arrives at its planned step, and that the actions equal `data/frankfurt/estimate_actions.json`.
- **Optimized**: `PlannerController(n_orders=1, lns_iters=40, seed=2)` with the full observation (`FullEnvObservation`) plans every train through its stops in time and space before the first step, then improves the plan by large-neighbourhood search; about two minutes in Python on Neu-Frankfurt. Its 597 steps of actions are in `data/frankfurt/planner_actions.json`; `replay.js` hands them to the engine, which simulates and scores them like any other run. `tools/check_plan.py --map <map>` reruns the planner and compares the actions.
  - *On Köln* the same controller, unchanged and with the same wiring, plans for about five minutes; its 1,710 steps of actions are in `data/koeln/planner_actions.json`. It runs 25 trains without a collision and serves 58 of the 108 stops, but finds no plan for 11 trains, which never set off: the six S-Bahn loops, RB nord 1–3 and ICE Frankfurt neben 1–2. They cost 62,092 of its 66,212.5 points; the loops alone 36,984, of which 12,360 are cancellations a dispatcher could avoid by letting them set off (they are done the moment they enter: −53,852.5 in the challenge's runner, with every other action unchanged).

## 4a. The floor (`js/floor.js`, `tools/score_floor.py`)

The best score any dispatcher can reach on the map, bounded from below. For each train, a breadth-first search from its start over (cell, direction), never through its destination, gives the fewest moves to a platform of each timetabled stop and to the destination. A train is on the map at the earliest at step max(earliest departure, 1) + 1 and moves at most one cell every 1 / speed steps; halting, detours and other trains only add time, and a train that never arrives or never sets off pays more than a late one. A stop reached L steps after its latest arrival costs at least 0.5 × L (or the lost stop's penalty, 499.2 or 684, whichever is less), the destination L steps late costs L.

- **Neu-Frankfurt: 944.** Only the two S-Bahns of the airport loop are bound to be late (217 cells at two steps each, against a window of 267 steps), at least 472 points each.
- **Köln: 25,010.5.** The six S-Bahn loops start on their destination, so the search reaches none of their stops, and flatland agrees (section 2): 6 × 684 = 4,104 points each, 24,624 in all. Six local trains (RB süd 1–3, RB nord 1–3, two steps per cell) are bound to be late: 386.5 points between them.

`tools/score_floor.py` computes it on flatland's own rail (`get_transitions`, `get_new_position`, the agents' waypoints and latest arrivals); `tools/export_fixtures.py` writes it to `tests/fixtures/<map>/rules.json` and asserts that the two timing assumptions hold in every recorded run (no train on the map before max(earliest departure, 1) + 1, no move sooner than 1 / speed steps after the last). `js/floor.js` computes the same in the browser; `tests/guide.mjs` compares the two train by train on both maps, and a planted error in the browser's entry step is caught.

## 4b. When penalties are booked

`DefaultRewards.step_reward` books a collision when a moving train is brought to a halt without a stop action (936 or 1,282.5 × its speed at that moment, so a train already standing costs nothing more). A train's stops (served, late, early or lost) and its delay at the destination are booked by `_agent_done_or_max_episode_steps_reward` in the step it arrives, or at the end of the episode for a train still on its way or never started. The running score therefore lags behind what the map shows; the guide, the Score tab and the Method say so, and `tests/guide.mjs` checks the rule on every term of the five Python runs.

A stop counts as served when the train stood on any of the platforms its timetable lists for it. Two calls of one train at the same station can share platforms (Köln's RB süd and RB nord trains call at Stop 2 on the way to the hub and again on the way back, and five or six of the eight platforms, cell and direction, are listed for both calls), and then one halt on a shared platform counts for both: the reward function looks for each call's platforms in the train's arrivals. The page's timetable does the same, while its events and the train's progress follow the first call (`js/sim.js`).

## 5. What the page adds on top (`js/sim.js`)

`simulate()` runs a controller through the engine once and keeps, for every step, each train's cell, direction, state, speed, whether it was blocked, how late it is and how long it has stood still; the running score per step and per train; every reward term (the engine's optional ledger, which changes no computation); the timetable as run; and the events. Everything on screen reads from that record, so scrubbing the timeline costs nothing.

A train counts as **late** from the step it passes the latest arrival of the next stop it has not reached (or of its destination); **blocked** when the motion check refused its move; **stuck** when it has stood still for 40 steps and is 40 steps past its departure time. A train done in the step it enters (Köln's loops) counts as having entered and arrived in that step; it is never drawn on the map, and the Story tab tells it as one moment ("Done before it moves").

**How the map moves trains between steps** (`js/glide.js`, computed once per run as `run.paths`). Flatland keeps a train in one cell until its speed counter has covered the whole cell: an S-Bahn (0.5) takes two steps per cell, and a train setting off covers 0.3 and then 0.6 of a cell before it leaves its first one. The first release moved a hexagon only in the step its train changed cells, so these trains glided for one step and froze for the next although they never stopped: 607 such frozen steps in the estimate run (only the three S-Bahns, in a run where no train ever halts), 821 in the optimized run, 192 in the baseline. Now a train rests at the centre of its cell in every step it stands, at the centre of every cell it enters at a steady speed (the speed of the step before) and does not halt in, and where it enters and leaves the map; between two of these rest points it moves in proportion to the distance its speed counter covers in each step, never more than a cell in a step. So a train glides at its own speed, slows into a stop and speeds up out of one, runs through cell centres at full speed exactly as before, and stands still, at its cell's centre, whenever the engine has it standing. Drawing the speed counter's distance itself was rejected: a train waiting behind another stands near the end of its cell, so the two hexagons would sit on top of each other. One real movement stays hidden: the optimized plan sometimes inches a waiting train forward inside its cell (halt, 0.3 of a cell, halt; 52 steps), which mostly lets it leave the cell with its first move once it may go; such a train is drawn standing. With reduced motion every train sits at the centre of its cell and jumps from cell to cell, as before. `tests/glide.mjs` checks all of this on the five runs of both maps against the Python traces.

## 6. Build decisions

- **Replay, not a port of the planners.** `PlannerController` is several hundred lines of search over a time-expanded network and takes two minutes in Python on Neu-Frankfurt and about five on Köln; the page would wait or need a worker and a port that is hard to verify. Replaying its actions through the verified engine shows the same run and the same score, and `check_plan.py` ties the actions to the planner. The estimate's planner is small, but it is replayed the same way, so that both plans are checked by the same means (`check_estimate.py`).
- **Words computed, not typed.** The guide (`js/guide-content.js`) and the Story tab (`js/story.js`) build every figure in their text from the scenario, the rules and the simulated runs; `tests/guide.mjs` and `tests/story.mjs` hold them against facts worked out independently from the scenario file, the challenge's own penalty code (`tests/fixtures/<map>/rules.json`, written by the exporter) and the Python traces.
- **Fixtures in the branch.** The Python traces (about 8.8 MB in `tests/fixtures/<map>/`) make the engine checks runnable without Python. The page never loads them.
- **An orphan `gh-pages` branch.** The site has nothing in common with the Python code on `main`, and GitHub Pages serves a branch's root as it is (`.nojekyll`).
- **No dependencies.** Vici's files are copied unchanged into `vici/`; everything else is plain ES modules. The Content Security Policy allows only this site, and no code uses `innerHTML`.
- **One map per page load.** The map is part of the address (`?map=koeln`; none for Neu-Frankfurt, so links from before Köln still work). The switch in the header loads the other map's page rather than swapping data in place: every module reads its map once, and only the map on screen is simulated. `js/maps.js` (the page), `tests/lib/maps.mjs` (the tests) and `tools/maps.py` (the Python tools) list the same maps, files and runs, and `tests/data.mjs` holds the three together. Each map's files live in `data/<map>/` and `tests/fixtures/<map>/`.
- **The leaderboard's figure is fixed in `js/maps.js`** (−37,374, from the brief, on Neu-Frankfurt); it is not computed. The brief names no map for it. The page keeps it on the map the challenge's runner loads and shows none on Köln, whose penalties are on another scale; there the KPI tile compares the run with the floor instead.
- **Köln's station names** come from its line names, as Neu-Frankfurt's do: the only places they mention are Essen and Frankfurt, so Stop 12 is Essen, Stop 18 Frankfurt and Stop 16, the end of the Frankfurt branch line (`ICE_Frankfurt_nebenstrecke`), Frankfurt (branch line); the other thirteen stations keep their numbers. The file never names Köln; the name comes from the challenge's final, which ran on maps of Frankfurt and Köln (T-Systems' whitepaper, October 2026).

## 7. Verification log

28 Oct 2026, first release; 29 Oct 2026, the guide, the Story tab and the new estimate, then trains drawn at their own speed, then Köln as a second map. The last full run, on both maps:

| Check | Result |
|---|---|
| `tools/export_fixtures.py --check` | both maps: the five traces, the reward terms, the reference scores, the rules with the floors, and the Python semantics rebuilt identically from flatland-rl 4.2.2 |
| `tools/check_estimate.py` | the estimate's planner through the challenge's runner: −32,488.8 in 1,043 steps, every train where its booking says after every step, all 19 at their planned step, actions identical to `data/frankfurt/estimate_actions.json` |
| `tools/check_plan.py` | PlannerController's live actions identical to each map's `planner_actions.json`: −1,014.0 in 597 steps on Neu-Frankfurt, −66,212.5 in 1,710 steps on Köln |
| `tests/engine.mjs` | Neu-Frankfurt: baseline 1,248 steps, estimate 1,043, optimized 597; Köln: baseline and optimized 1,710 each; every value identical; scores −74,022.59999999998, −32,488.800000000007, −1,014, −270,672.75 and −66,212.5; distance maps identical (19 and 36 trains); 122, 78, 137, 311 and 202 reward terms identical; 6,000 sums, 5,000 set orders and 10 roundings identical |
| `tests/engine-negctl.mjs` | 18 planted errors, 4 of them on Köln, all caught; the unchanged engine passes on both maps |
| `tests/data.mjs` | both maps are the challenge's byte for byte; their plans, scores, traces and rules were recorded on them; the page's, the tests' and the tools' lists of maps agree |
| `tests/story.mjs`, `tests/guide.mjs` | 117 and 167 checks: every figure and moment of the Story tab and of both guides agrees with the Python traces, the scenario and the rules; the floors (−944 and −25,010.5) are the same in the browser and on flatland's rail |
| `tests/glide.mjs` | 62 checks, the map's motion on all five runs against the Python traces: no train Python moves is drawn standing (2,547, 4,710 and 5,028 moving steps on Neu-Frankfurt, 3,588 and 5,317 on Köln; the 21, 52, 19 and 21 steps of inching inside a cell between two halts are drawn standing), every standing train still at its cell's centre, the S-Bahns exactly half a cell per step in Neu-Frankfurt's estimate run, full-speed trains a cell per step through cell centres, never backwards, never more than a cell in a step, Köln's loops never drawn; the old drawing and a drawing at the speed counter's distance both fail |
| Browser suites | smoke (main flows, guide, story, an S-Bahn moving in every frame at ×1, the map switch and Köln's page), layout (9 viewports × 9 states on both maps, and both guides' 7 chapters), hexagon (both themes, both maps, the guides included), tokens (both themes), page icon, Vici's files: all pass |
