# Dispatch Lab — T-Brain Mobility Challenge

Dispatch Lab runs the T-Brain Mobility Challenge in the browser, on two of its maps: Köln, with 36 trains and 108 timetabled stops, and Neu-Frankfurt, with 19 trains and 59 stops. Each is simulated and scored step by step under the challenge's baseline and a planner, and measured against the leaderboard's current best of −37,374, a figure from the project brief. The challenge comes from Deutsche Telekom's Group Technology and T-Systems International, for the Deutsche Telekom data scientist community, and is built on the Flatland railway simulator.

The page opens on Köln; a switch in the header changes the map, and each map has its own runs, guide and story. A guide explains the challenge to someone who has never heard of it: it opens on the first visit, and any time from "How it works".

**Live:** https://victorpflueger.github.io/mobilitychallenge/ (Köln; Neu-Frankfurt: `?map=frankfurt`)

Static website on the `gh-pages` branch, no backend, no build step, nothing loaded from other sites. It looks like the rest of Victor Pflüger's work: the shell of Rebate Hunter on his design system Vici (v1.0.0), in a light and a dark theme. The challenge itself (Python, flatland-rl) lives on `main`, which this branch leaves untouched.

---

## What it shows

**The guide**, in seven short chapters, told on the map on screen: the challenge (get every train through a busy rail hub, on time, for as few penalty points as possible), the network (a railway made of grid cells, with the real map drawn small), the timetables (every train has a window at each station, with a real example), the decisions (one command per train per step, and what happens when trains meet), the score (the penalties and what they cost, as the challenge's code sets them for the map, when they count, and the best score any dispatcher can reach there), the results, and how to read the page. Every figure in it but the leaderboard's, which comes from the brief, is computed from the scenario, the challenge's rules or the runs, and all of them are checked (`tests/guide.mjs`).

The page plays each run back on the network map (play, step, seek, three speeds; every train moves at its own speed, and a standing train stays at the centre of its cell), with the score, the trains that arrived and the stops served at every step. Under the tracks, the grid of square cells the railway is laid out on shows faintly; **Grid**, beside the map's views, switches it off and on, and the browser remembers the choice. **The Story tab**, open first, tells each run in a few moments worth watching (the first collision, the gridlock, the longest wait, the first stop served, the last arrival …), each of which jumps to its step and rings its train on the map, and says why the run scores what it scores. A line under the map's title says what is going on at the step on screen: a gridlock, trains held back, trains waiting at their entry, all trains arrived. The other tabs hold the score's breakdown and its course, the timetable each train actually ran, a log of events that jumps to its step, and the method. The map, run and step on screen live in the address, so a moment can be shared as a link, e.g. `?map=frankfurt&run=baseline&step=600` or `?map=koeln&run=optimized&step=400`; the address always names the map, and one that names none opens Köln.

The score is the sum of penalties, so zero is perfect. The challenge scales its penalties to the length of the map's episode, so the two maps' scores cannot be compared with each other.

### Neu-Frankfurt: three scores

The challenge's default map, the one its runner loads: 19 trains, 59 stops, 1,248 steps.

| Run | Score | What it is | Trains arrived | Stops served |
|---|---:|---|---:|---:|
| Baseline | −74,022.6 | `OrderedController`, the challenge's default: every train takes the shortest branch towards its destination and never waits, neither for other trains nor at its stations | 7 / 19 | 0 / 59 |
| Current best | −37,374 | The leaderboard's figure, from the project brief, and the target to beat; the page shows the same figure on both maps. The entry's code is not public, so it is not simulated here | — | — |
| Optimized | −1,014.0 | `PlannerController`: plans every train through all its stops in time and space before the first step, so no two trains ever want the same cell, then improves the plan train group by train group | 19 / 19 | 59 / 59 |

**No dispatcher can score better than −944 on this map.** The two S-Bahns of the airport loop (S FF Hbf FF 1 and 2) cannot keep their timetables even on empty track, at full speed and without halting: each reaches its stops and its destination too late to lose fewer than 472 points. `tools/score_floor.py` computes this bound on flatland's own rail (and checks the timing it assumes in every recorded run), `js/floor.js` computes it in the browser, and `tests/guide.mjs` holds the two together. The optimized run is 70 points above the bound.

Where the points go, as the Score tab breaks them down (checked term by term against the Python reward function):

| Penalty | Baseline | Optimized |
|---|---:|---:|
| Collisions (936 × speed) | 44 → −33,040.8 | — |
| Stops never reached (499.2 each) | 32 → −15,974.4 | — |
| Stops passed without stopping (499.2 each) | 27 → −13,478.4 | — |
| Trains not arrived by the end (their remaining delay) | 12 → −11,529.0 | — |
| Late at stops (0.5 per step) | — | 16 → −654.0 |
| Late at the destination (1 per step) | — | 2 → −360.0 |
| **Score** | **−74,022.6** | **−1,014.0** |

### Köln: three scores

The larger of the two maps the challenge's final ran on (T-Systems' whitepaper, October 2026), and the one the page opens on: 36 trains, 108 stops, 1,710 steps, sixteen stations around a hub (Stop 14) where 12 of the 16 lines meet. Its file never names Köln; its line names mention only Essen and Frankfurt, so the other stations keep their numbers.

| Run | Score | What it is | Trains arrived | Stops served |
|---|---:|---|---:|---:|
| Baseline | −270,672.75 | `OrderedController`, as on Neu-Frankfurt. 163 collisions; from step 228 on, 16 trains block each other and nothing moves again | 20 / 36, 6 of them as they enter | 4 / 108 |
| Current best | −37,374 | The same figure as on Neu-Frankfurt: the leaderboard's, from the project brief, and the target to beat. Not simulated | — | — |
| Optimized | −66,212.5 | `PlannerController`, unchanged, run on this map through the challenge's runner (a few minutes of search). No collision, but it finds no plan for 11 trains, which never depart | 25 / 36 | 58 / 108 |

The page rounds the baseline's score to one decimal, −270,672.8.

**No dispatcher can score better than −25,010.5 on Köln.** The six S-Bahn loops (S clock 1–3, S counter 1–3) start on the cell that is their destination, and flatland finishes such a train in the step it enters: its six stops are lost, 684 points each, 4,104 per train and 24,624 in all. Six local trains (RB süd 1–3, RB nord 1–3) cannot keep their timetables even on empty track, at full speed and without halting, and lose at least 386.5 points between them. The optimized run is 41,202 points above the bound, and 37,466 of them come from the 11 trains it never departs:

| Trains never departed | Each loses | Each could lose as little as |
|---|---:|---:|
| S clock 1–3, S counter 1–3 | 6,164 (six stops lost, and the cancellation) | 4,104 (done as it enters) |
| RB nord 1–3 | 6,052 | 1 or 0.5 |
| ICE Frankfurt neben 1–2 | 3,476 | 0 |

Telling the six S-Bahn loops to depart, and changing nothing else in the plan, scores −53,852.5 in the challenge's runner, 12,360 points better: each loop still loses its stops, but not the cancellation, and no other train is touched.

Where the points go on Köln:

| Penalty | Baseline | Optimized |
|---|---:|---:|
| Collisions (1,282.5 × speed) | 163 → −177,626.25 | — |
| Stops never reached (684 each) | 67 → −45,828.0 | 50 → −34,200.0 |
| Stops passed without stopping (684 each) | 37 → −25,308.0 | — |
| Trains not arrived by the end (their remaining delay) | 16 → −21,875.0 | — |
| Never departed (4 × (the trip's travel time + 513)) | — | 11 → −27,892.0 |
| Late at stops (0.5 per step) | 4 → −35.5 | 26 → −2,903.5 |
| Late at the destination (1 per step) | — | 7 → −1,217.0 |
| **Score** | **−270,672.75** | **−66,212.5** |

## How it works

```
 data/frankfurt/, data/koeln/   one folder per map:
   <the map's file>             the challenge's map, byte for byte (rail grid, stations,
                                timetable, trains): neufrankfurt_19agents.json, kk_36agents.json
   planner_actions.json         the optimized run's actions: PlannerController's plan
   reference.json               the Python runner's scores, which the page checks against
 js/maps.js                     the maps (Köln the default): files, runs, the leaderboard's figure,
                                station names, views
            │
            ▼
 js/engine/   flatland-rl 4.2.2's RailEnv.step in JavaScript, line by line: speed counter,
              state machine, motion check (conflicts, swaps, deadlocks), level-free crossings,
              distance maps; the challenge's reward rules (rewards_fix.py, scaled "balanced" to
              the map's episode); CPython's sum(), set order and round() where flatland's results
              depend on them
 js/controllers/   ordered.js (baseline, live), replay.js (optimized: recorded actions)
            │
            ▼
 js/sim.js    runs a controller through the engine once, keeps every step's state, the score's
              terms, the timetable as run and the events; js/glide.js, where the map draws each
              train between steps
            │
            ▼
 js/story.js, js/guide-content.js   a run's facts and moments, the guide's chapters: text and
                                    figures computed from the scenario, the rules and the runs
            │
            ▼
 js/ui/       map (SVG on Vici's honeycomb), KPI tiles, control bar, Story/Score/Trains/Events/
              Method, the guide and its drawings
```

When the page opens it reads the map from the address (`?map=frankfurt` or `?map=koeln`; Köln without one, or with one it does not know), simulates that map's two runs itself (well under a second on either map) and shows "same score as the Python runner" next to each score that matches the map's `reference.json` to the last digit; a banner would say so if one did not. The baseline runs live in the browser. The optimized run replays recorded actions: `PlannerController` plans them in Python before the first step, and the browser's engine then simulates and scores those actions like any other. The map switch loads the other map's page, its address naming the map, and keeps the run on screen.

## Run it locally

The page uses JavaScript modules, which browsers load only over http, not from a file opened directly. From this folder:

```
python3 -m http.server 8000
```

and open http://localhost:8000/ (Köln; Neu-Frankfurt: http://localhost:8000/?map=frankfurt). Any static server works. To get this branch next to the challenge:

```
git clone https://github.com/VictorPflueger/mobilitychallenge.git
cd mobilitychallenge
git worktree add ../mobilitychallenge-pages gh-pages
```

## How it is verified

`tests/README.md` lists every check and how to run it. In short:

- **Engine parity.** `tools/export_fixtures.py` runs each map's controllers through the challenge's own runner (flatland-rl 4.2.2, Python 3.13) and records every step: actions, and each train's position, direction, state, speed, distance in the cell, reward and done flag. `tests/engine.mjs` replays all four runs in the JavaScript engine and compares every value at every step with no tolerance, plus every train's distance map on both maps, and CPython's `sum()`, set order and `round()` on 11,010 random inputs.
- **The score's terms.** The exporter also splits every reward the reward function hands out into its terms (a crash, a stop not served, a delay, a cancellation, …), asserting that they add up to exactly what the function returned; the page's breakdown must list the same terms in the same order, for every run on both maps.
- **Negative controls.** `tests/engine-negctl.mjs` plants small errors (braking 0.4 instead of 0.5, the higher index winning a conflict, a crash penalty of 935, one action of the plan changed, the train that waits longest at its entry entering a step early, a term booked under the wrong heading; on Köln one action of its plan changed, a crash penalty of 1,282 and a lost stop of 683, and the S-Bahn loops' destination moved off their first cell, …); the checks must catch every one.
- **The plans.** `tools/check_plan.py --map frankfurt|koeln` runs `PlannerController` through the challenge's runner and compares its actions with each map's `planner_actions.json`; it needs the planner's two files in the challenge checkout's `src/controller/`, which are not part of this repository.
- **The words.** `tests/story.mjs` holds every figure and moment of the Story tab and the map's situation line, on both maps, against facts worked out from the Python traces alone (arrivals, collisions, the gridlock's first step, stops served and passed, the longest wait, the trains done as they enter); `tests/guide.mjs` holds every figure in both guides against the scenario file, the penalties as the challenge's own code sets them for the map, the floor as `tools/score_floor.py` computes it on flatland's rail, and the same traces (when each penalty is booked, trains turning round at the Hauptbahnhof, the trains that never depart), and the leaderboard's −37,374 as the brief gives it.
- **The motion.** `tests/glide.mjs` holds the map's drawing against the Python traces of all four runs: no train Python moves is drawn standing (except while it inches forward inside one cell between two halts), a standing train stays at the centre of its cell, a train running steadily at half speed (Neu-Frankfurt's S-Bahns, Köln's local trains) moves exactly half a cell per step and a full-speed train a cell per step through cell centres; the old drawing, which held a train still in every step it stayed in its cell, even while it moved more slowly than a cell per step, fails these checks.
- **The page.** Chromium suites (Playwright) for the main flows, the guide and the Story tab, the map switch and the default map, every viewport from 1920 × 1080 to 320 × 640 on both maps (both guides' seven chapters at each, their drawings' words 10 px or larger), contrast in both themes, Vici's files and its hexagon rule (nothing round).

## Files

```
index.html, favicon.svg, .nojekyll   the page (strict Content Security Policy: everything from this site)
css/            style.css (shell), components.css, map.css, panel.css, modals.css, guide.css
js/             main.js (start, playback, the map switch), maps.js (the maps), sim.js,
                glide.js (where the map draws a train between steps), network.js (names, track
                drawing), runs.js, story.js (a run's facts, moments, situation), guide-content.js
                (the guide's text), floor.js (the best score any dispatcher can reach), format.js
js/engine/      env.js, rail.js, motion.js, py.js
js/controllers/ ordered.js, replay.js
js/ui/          map.js, kpis.js, controls.js, panel.js, charts.js, guide.js, diagrams.js
data/<map>/     each map, its plan, the Python scores (frankfurt, koeln)
vici/           Vici v1.0.0, unchanged (tests/vici-files.mjs)
tools/          maps.py (the maps), export_fixtures.py, check_plan.py, score_floor.py (the floor,
                on flatland's rail)
tests/          the checks, and fixtures/<map>/ (the Python traces and the rules, used by the tests only)
DESIGN.md       colour grammar, layout, deviations from Vici and Rebate Hunter
TECH_NOTES.md   the engine port, Python semantics, the controllers, the floor, verification log
```

## Limits

- The planner does not run in the browser; its actions are replayed. That they are exactly what `PlannerController` produces is checked by `tools/check_plan.py`, where the planner's code is available.
- The leaderboard's −37,374 is a figure from the project brief, not simulated: the entry's code is not public. The page shows the same figure on both maps as the target to beat.
- On Köln the optimized run is `PlannerController` as it is: it leaves 11 of the 36 trains at their origin, and the page shows that run, not a better one.
- Malfunctions are off, as in the challenge's runner.
- This branch is public, and so is the page: anyone can see and replay the optimized schedules. The planner's source is not published here.
- Station names come from the scenario's line names; stations no line names keep their number ("Stop 17").

## For Victor's website

A card for `data/prototypes.js` in VictorPflueger/VIP, if you want it listed:

```js
  {
    name: "Dispatch Lab",
    kind: "prototype",
    subtitle: "T-Brain Mobility Challenge",
    description: "Two rail scenarios of the challenge, Neu-Frankfurt and Köln, simulated in your browser, from the challenge's baseline to a planner that serves every stop on Neu-Frankfurt.",
    url: "https://victorpflueger.github.io/mobilitychallenge/",
    icon: "flag",
    tags: ["Optimization", "Rail"],
    note: "Runs in your browser, no data leaves it. The scenarios are the challenge's own maps.",
  },
```

`tests/page-icon.mjs` then checks that the card keeps the page icon's `flag` and `prototype`.
