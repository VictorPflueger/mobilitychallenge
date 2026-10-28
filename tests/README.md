# Tests (optional, for developers)

Dispatch Lab itself needs no Node.js, npm, Python or build step. These scripts are the checks behind it: that the browser engine is the challenge's Python environment, that the page shows what the engine computed, and that it follows Vici. Run them after changing code or data. GitHub Actions runs the Node.js and browser suites on every push to this branch (`.github/workflows/tests.yml`).

## What runs

| Suite | Command | Checks |
|---|---|---|
| tokens | `node tests/tokens.mjs` | The colour system on Vici's values (`vici/dist/tokens.json`), in the light and the dark theme: WCAG 2.2 contrast for every text-on-fill and mark-on-surface pair the app draws (the shared shell's, and the map's, trains', runs' and legend's in `lib/prototype.mjs`; 4.5:1 for text, 3:1 for marks); every Vici token the CSS and JavaScript name exists. It also reports how far the runs' series colours and the trains' states stay apart under simulated colour-vision deficiencies, without failing on them. Node.js only |
| page-icon | `node tests/page-icon.mjs` | `favicon.svg` byte for byte as given; the header and the loading screen use the page icon's lilac cell with Vici's flag icon; with a checkout of Victor's website (`VIP`) next to this one, its card still gives Dispatch Lab the same icon and kind (otherwise it says it skipped that part and passes). Node.js only |
| vici-files | `node tests/vici-files.mjs` | `vici/` holds exactly the files `vici/README.md` lists; with a checkout of Vici (`ViciDesign`) at the same release next to this one, every file is byte for byte Vici's (otherwise it says it skipped that part and passes). Node.js only |
| data | `node tests/data.mjs --challenge <checkout>` | The site's map is the challenge's `data/maps/neufrankfurt_19agents.json` byte for byte, and the plan, the reference scores and every reference trace were recorded on that file. Needs a checkout of the challenge's `main` branch. Node.js only |
| engine | `node tests/engine.mjs [case …]` | The JavaScript engine against flatland-rl 4.2.2 as the challenge runs it (`fixtures/`, recorded by `tools/export_fixtures.py`). `python`: CPython 3.13's `sum()` of mixed ints and floats, the iteration order of small int sets and `round()`, on 7,000 random inputs. `distance-map`: every train's distance map, by digest. `baseline`, `estimate`, `optimized`: the run step by step, every train's action, position, direction, state, speed, distance in the cell, reward and done flag, with no tolerance, and the final score. `terms`: the page's own run (`js/sim.js`) books the same score terms as the Python reward function, in the same order, and the Score tab's breakdown adds them up to the same totals and counts. Node.js only |
| negctl | `node tests/engine-negctl.mjs` | The engine checks catch planted errors: braking and acceleration, a switch losing a transition a train uses, level-free crossings ignored, the higher index winning a conflict, three penalties off by a little, one action of the plan changed, the estimate checking the wrong cell, a distance off by one, and three terms booked under the wrong heading or stop. The unchanged engine must pass first. Node.js only |
| smoke | `node tests/smoke.mjs [case …]` | `boot`: the page simulates the three runs, shows their scores and "same score as the Python runner", and loads nothing from outside. `playback`: play (time never runs backwards, even when the browser stamps a frame before the click), pause (no lost clicks), step, the ends, the timeline, replay from the end, the KPI tiles at the end (19 / 19 arrived, 59 / 59 stops, −1,014.0). `runs`: switching runs, the link to a moment (`?run=…&step=…`). `panel`: the tabs by mouse and keyboard, the trains table, a train's timetable, the events and a jump to one, the method and its map symbols. `map`: the two views, the legend strip below the drawing, a train picked on the map. `once`: the intro on a first visit, the theme toggle and the speed buttons acting once per click. `motion`: reduced motion. `failure`: a missing data file, and a score that does not match the reference (the banner) |
| layout | `node tests/layout.mjs [WxH …]` | 1920 × 1080, 1600 × 900, 1536 × 864, 1366 × 768, 1280 × 720, 1024 × 768, 390 × 844 and 320 × 640, each at four moments: no sideways scrolling; the header's badges clear of the KPI tiles; the control bar on one row from 1280 px and its step label never cut; the map a usable size, with the caption, the views and the legend never covering each other or the drawing; station names inside the map and never on top of each other; touch targets 40 px at least, 44 px for the main controls. Screenshots of every state go to the output folder |
| hexagon | `node tests/hexagon.mjs` | Vici's hexagon rule, nothing round: the app's own files (not `vici/`, `tests/` or `tools/`) hold no round CSS or drawing code, and the rendered app holds no round element, circle, ellipse or arc in the main states of a tour through it (`lib/prototype.mjs`), in both themes. Each part first proves on planted examples that it catches every kind. `node tests/hexagon.mjs files` runs the file scan alone, without a browser |

`node tests/run-all.mjs` runs all of these in that order and prints a summary; name suites to run only those (`node tests/run-all.mjs engine smoke`). For the data suite it looks for the challenge's checkout in `DL_CHALLENGE` (default `../mobilitychallenge`, next to this folder).

Two more checks need GitHub and are not part of `run-all`:

| Check | Command | Checks |
|---|---|---|
| remote | `node tests/remote.mjs` | This checkout is on `gh-pages` with nothing uncommitted, and the `gh-pages` branch on GitHub points at the same commit, so the page GitHub serves is the build these suites checked |
| pages | `node tests/pages.mjs` | GitHub Pages is switched on for the repository, and its latest deployment is this commit of `gh-pages`, deployed successfully. Reads GitHub's public API, through the GitHub CLI when it is installed |

## The Python side

The fixtures come from the challenge's own Python environment. With a checkout of the challenge (its `uv` environment set up as its README says, flatland-rl 4.2.2):

```
<challenge>/.venv/bin/python -B tools/export_fixtures.py --repo <challenge> --check   rebuild and compare
<challenge>/.venv/bin/python -B tools/export_fixtures.py --repo <challenge>           rewrite tests/fixtures/ and data/reference.json
<challenge>/.venv/bin/python -B tools/check_plan.py --repo <challenge>                the plan is PlannerController's
```

`check_plan.py` needs the planner's two files (`planner_core.py`, `plannercontroller.py`) in `<challenge>/src/controller/`; they are not part of this repository. Both scripts only wrap the runner to record what happens; they change nothing in the environment.

## Setup for the browser suites

You need Node.js 20 or later and Playwright with Chromium. Install them once, outside this folder:

```
npm install -g playwright@1.56.0
npx playwright install chromium
```

Then run with Node's module path pointing at the global packages:

```
NODE_PATH="$(npm root -g)" node tests/run-all.mjs
```

On Windows PowerShell: `$env:NODE_PATH = (npm root -g); node tests/run-all.mjs`.

Options (environment variables):
- `PLAYWRIGHT_MODULE`: path to a Playwright installation, instead of `NODE_PATH`.
- `CHROME_PATH`: use this Chrome or Chromium binary instead of Playwright's.
- `DL_TEST_OUT`: folder for screenshots (default: the system temp folder, `dispatch-lab-tests/`).

The suites serve the page on `127.0.0.1`: smoke on port 8765, layout on 8766, hexagon on a random one between 8790 and 9089. Every request to another host is blocked.
