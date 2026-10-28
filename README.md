# Dispatch Lab — T-Brain Mobility Challenge

Dispatch Lab runs the T-Brain Mobility Challenge (Deutsche Bahn) in the browser: the Neu-Frankfurt scenario with its 19 trains and 59 timetabled stops, simulated and scored step by step under three dispatching strategies, and compared with the leaderboard's current best of −37,374.

**Live:** https://victorpflueger.github.io/mobilitychallenge/

Static website on the `gh-pages` branch, no backend, no build step, nothing loaded from other sites. It looks like the rest of Victor Pflüger's work: the shell of Rebate Hunter on his design system Vici (v1.0.0), in a light and a dark theme. The challenge itself (Python, flatland-rl) lives on `main`, which this branch leaves untouched.

---

## What it shows

Four scores on the same scenario. The score is the sum of penalties, so zero is perfect.

| Run | Score | What it is | Trains arrived | Stops served |
|---|---:|---|---:|---:|
| Baseline | −74,022.6 | `OrderedController`, the challenge's default: every train takes the shortest branch towards its destination and never stops on its own | 7 / 19 | 0 / 59 |
| Current best | −37,374 | The leaderboard's figure, from the brief. Its code is not public, so it is not simulated here | — | — |
| Estimate | −36,576.6 | A rule-based dispatcher of the kind that lands near −37,374 (797.4 points from it): the baseline's routing, no driving into an occupied cell, a stop at the next timetabled station, no early departure. Claude's reconstruction, labelled as AI-made on the page | 3 / 19 | 16 / 59 |
| Optimized | −1,014.0 | `PlannerController`: plans every train through all its stops in time and space before the first step, so no two trains ever want the same cell, then improves the plan train group by train group | 19 / 19 | 59 / 59 |

Where the points go, as the Score tab breaks them down (checked term by term against the Python reward function):

| Penalty | Baseline | Estimate | Optimized |
|---|---:|---:|---:|
| Collisions (936 × speed) | 44 → −33,040.8 | — | — |
| Stops never reached (499.2 each) | 32 → −15,974.4 | 36 → −17,971.2 | — |
| Stops passed without stopping (499.2 each) | 27 → −13,478.4 | 7 → −3,494.4 | — |
| Trains not arrived by the end (their remaining delay) | 12 → −11,529.0 | 16 → −15,067.0 | — |
| Late at stops (0.5 per step) | — | 4 → −44.0 | 16 → −654.0 |
| Late at the destination (1 per step) | — | — | 2 → −360.0 |
| **Score** | **−74,022.6** | **−36,576.6** | **−1,014.0** |

The page plays each run back on the network map (play, step, seek, three speeds), with the score, the trains that arrived and the stops served at every step, the timetable each train actually ran, and a log of events (arrivals, stops, stops passed, collisions) that jumps to its step. The run and step on screen live in the address, so a moment can be shared as a link, e.g. `?run=baseline&step=600`.

## How it works

```
 data/neufrankfurt_19agents.json   the challenge's map, byte for byte (rail grid, stations,
                                   timetable, 19 trains)
 data/planner_actions.json         the optimized run's actions: PlannerController's plan
 data/reference.json               the Python runner's three scores, which the page checks against
            │
            ▼
 js/engine/   flatland-rl 4.2.2's RailEnv.step in JavaScript, line by line: speed counter,
              state machine, motion check (conflicts, swaps, deadlocks), level-free crossings,
              distance maps; the challenge's reward rules (rewards_fix.py, scaled "balanced");
              CPython's sum(), set order and round() where flatland's results depend on them
 js/controllers/   ordered.js (baseline), estimate.js (estimate), replay.js (optimized)
            │
            ▼
 js/sim.js    runs a controller through the engine once, keeps every step's state, the score's
              terms, the timetable as run and the events
            │
            ▼
 js/ui/       map (SVG on Vici's honeycomb), KPI tiles, control bar, Score/Trains/Events/Method
```

When the page opens it simulates all three runs itself (well under a second) and shows "same score as the Python runner" next to each score that matches `data/reference.json` to the last digit; a banner would say so if one did not. The baseline and the estimate run live in the browser. The optimized run replays the recorded plan: the planner searches for its plan in Python, and the browser's engine then simulates and scores those actions like any other.

## Run it locally

The page uses JavaScript modules, which browsers load only over http, not from a file opened directly. From this folder:

```
python3 -m http.server 8000
```

and open http://localhost:8000/. Any static server works. To get this branch next to the challenge:

```
git clone https://github.com/VictorPflueger/mobilitychallenge.git
cd mobilitychallenge
git worktree add ../mobilitychallenge-pages gh-pages
```

## How it is verified

`tests/README.md` lists every check and how to run it. In short:

- **Engine parity.** `tools/export_fixtures.py` runs the three controllers through the challenge's own runner (flatland-rl 4.2.2, Python 3.13) and records every step: actions, and each train's position, direction, state, speed, distance in the cell, reward and done flag. `tests/engine.mjs` replays all three runs in the JavaScript engine and compares every value with no tolerance (1,248 + 1,248 + 597 steps), plus every train's distance map, and CPython's `sum()`, set order and `round()` on 7,000 random inputs.
- **The score's terms.** The exporter also splits every reward the reward function hands out into its terms (a crash, a stop not served, a delay, …), asserting that they add up to exactly what the function returned; the page's breakdown must list the same terms in the same order.
- **Negative controls.** `tests/engine-negctl.mjs` plants 14 small errors (braking 0.4 instead of 0.5, the higher index winning a conflict, a crash penalty of 935, one action of the plan changed, a term booked under the wrong heading, …); the checks must catch every one.
- **The plan.** `tools/check_plan.py` reruns `PlannerController` through the runner and compares its actions with `data/planner_actions.json`. It needs the planner's two files in the challenge checkout's `src/controller/`; they are not part of this repository.
- **The page.** Chromium suites (Playwright) for the main flows, every viewport from 1920 × 1080 to 320 × 640, contrast in both themes, Vici's files and its hexagon rule (nothing round).

## Files

```
index.html, favicon.svg, .nojekyll   the page (strict Content Security Policy: everything from this site)
css/            style.css (shell), components.css, map.css, panel.css, modals.css
js/             main.js (start, playback), sim.js, network.js (names, track drawing), runs.js, format.js
js/engine/      env.js, rail.js, motion.js, py.js
js/controllers/ ordered.js, estimate.js, replay.js
js/ui/          map.js, kpis.js, controls.js, panel.js, charts.js, intro.js, ailabel.js
data/           the map, the plan, the Python scores
vici/           Vici v1.0.0, unchanged (tests/vici-files.mjs)
tools/          export_fixtures.py, check_plan.py, estimate_controller.py (the estimate's Python reference)
tests/          the checks, and fixtures/ (the Python traces, about 3.7 MB, used by the tests only)
DESIGN.md       colour grammar, layout, deviations from Vici and Rebate Hunter
TECH_NOTES.md   the engine port, Python semantics, verification log
```

## Limits

- The planner does not run in the browser; its actions are replayed. That they are exactly what `PlannerController` produces is checked by `tools/check_plan.py`, where the planner's code is available.
- The estimate is a reconstruction of how a score near −37,374 comes about, not the leaderboard entry's code. Its score is the engine's, computed live.
- Malfunctions are off, as in the challenge's runner. The scenario is Neu-Frankfurt only; the Köln map (`kk_36agents.json`) on `main` is not part of the page.
- This branch is public, and so is the page: anyone can see and replay the optimized schedule. The planner's source is not published here.
- Station names come from the scenario's line names; stations no line names keep their number ("Stop 17").

## For Victor's website

A card for `data/prototypes.js` in VictorPflueger/VIP, if you want it listed:

```js
  {
    name: "Dispatch Lab",
    kind: "prototype",
    subtitle: "T-Brain Mobility Challenge",
    description: "The Neu-Frankfurt rail scenario simulated in your browser under three dispatching strategies, from the challenge's baseline to a planner that serves every stop.",
    url: "https://victorpflueger.github.io/mobilitychallenge/",
    icon: "flag",
    tags: ["Optimization", "Rail"],
    note: "Runs in your browser, no data leaves it. The scenario is the challenge's fictional network.",
  },
```

`tests/page-icon.mjs` then checks that the card keeps the page icon's `flag` and `prototype`.
