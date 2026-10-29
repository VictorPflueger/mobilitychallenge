# Dispatch Lab — design

How the page looks and why. It follows Rebate Hunter (VictorPflueger/PROC-Rebate-Hunter), Victor Pflüger's reference prototype, on his design system Vici v1.0.0 (`vici/`, unchanged). Where Dispatch Lab departs from either, §7 says so.

## 1. The brief

One page that a jury, a team or a curious engineer can open and understand in a minute, even one who has never heard of the challenge: what the challenge asks, how a run is scored, where a dispatching strategy loses its points, and how far each run is from the leaderboard's current best. It opens on Köln, the larger map of the challenge's final; Neu-Frankfurt, the map the challenge's runner loads, is one click away: the same page on a smaller network. It has to read on a projector (1920 × 1080 down to 1280 × 720) and still work on a phone. Every figure on it must be the engine's, and the engine must be the challenge's; every figure in its words must come from the scenario, the rules or the runs, never typed in. The one exception is the leaderboard's −37,374, which comes from the project brief and says so wherever it appears.

## 2. The shell (Rebate Hunter's)

- **Header**: the page icon (Vici's flag in a lilac hexagon cell, the colour of a prototype's card on Victor's website), the name with the map and its number of trains under it, the map switch (Neu-Frankfurt, Köln; a segmented control like the run switch, the map on screen pressed), the black-and-white tape badge with the word SIMULATION, *How it works* (the guide), the theme toggle, and four KPI tiles: the score so far, the distance to the leaderboard's −37,374 (on both maps), trains arrived, stops served.
- **Control bar**: the run switch (each run with its series colour and final score), Play (the one solid merlot button), four step buttons, three speeds, the timeline with its step label, and the playback status as a Vici tag with a hexagon pip.
- **Workspace**: the network map (62 %), with its two views and the grid switch at its top right, and a tabbed panel (38 %): Story, Score, Trains, Events, Method.
- **Footer**: how the numbers come about (checked against the Python runner) and Vici's byline with Victor's LinkedIn and website. The app links to its author, never to its own source code.
- **Boot screen** while the browser simulates the map's runs, with what it is doing and, if a file is missing, why it stopped.
- **The guide** on the first visit (remembered in the browser) and from *How it works*: a large Vici dialog with seven chapters, its chapter list on Vici's vertical stepper (§5a).

## 3. Colour grammar

Every colour is one of Vici's semantic tokens, so both themes follow from one set of rules. JavaScript draws no colour; it sets data attributes that the CSS maps to tokens.

1. **Merlot** (`--vc-accent`) is the person at the controls: the Play button and the focus ring. It never encodes a state, and a selection is always ink, never merlot.
2. **Danger, warning, success** are the trains' outcomes: blocked, stuck and lost (danger), behind the timetable (warning), on time and served (success). Every state also differs in form, so no state depends on colour alone (below).
3. **Fjord**, the info tone, is checking: "same score as the Python runner".
4. **Each run keeps one series colour** from Vici's chart palette: baseline `data-8` (the baselines' grey-brown), optimized `data-2` (teal). The leaderboard's figure, which is not simulated, is a dashed outline.
5. **Ink** carries everything else: the network, labels, a train on time.

**Trains** are flat-top hexagons with their number when the marker is large enough (17 px). Form first, colour second:

| State | Form | Colour |
|---|---|---|
| On time | filled | ink |
| Behind its timetable | filled, also when standing | warning fill, warning outline |
| Standing (at a platform or holding) | hollow | ink outline |
| Blocked by a train in its way | filled, with a dashed ring that pulses | danger fill and outline |
| Stuck (standing 40 steps past its time) | hollow, with the dashed ring | danger outline on the danger background |
| Selected | an ink ring around it | — |

`tests/tokens.mjs` measures every one of these pairs for WCAG 2.2 contrast in both themes (4.5:1 for text, 3:1 for marks) and reports how far the states stay apart under colour-vision deficiencies. Behind and blocked stay close in colour for tritanopia (light theme) and deuteranopia (dark theme); there the dashed ring around a blocked train tells them apart.

## 4. The map

- The network is drawn from the scenario's own transitions: one segment per transition, straight through the cell centre or cutting the corner at 45° (Vici's chamfer; there are no arcs), a stub and a bar for a buffer stop, a small square for a level-free crossing, and the stations' platforms as boxes.
- Under the network lies the **grid** it is laid out on, Flatland's square cells (100 × 60 on Neu-Frankfurt, 120 × 100 on Köln), so the reader sees that a track runs through the middle of its cell and a train fills one. A line along every cell edge, one screen pixel at any zoom, in ink at 7 % on the canvas (`--grid-line`): the same faint step in both themes, where Vici's border-subtle, the honeycomb's line, would stand out nearly five times as much on the dark canvas as on the light one. Over the grid the canvas is plain; the honeycomb stays the page's background around it, so the grid's edge shows where the railway's world ends (Köln's tracks fill only part of it). The grid is a layer of its own over the whole panel, lined up with the drawing's cells, so in the zoomed views it runs on under the caption and the legend, as the honeycomb does, instead of stopping at the drawing's edge. **Grid**, a toggle beside the views in their style, switches it off and on; the browser remembers the choice, for both maps.
- Tracks scale with the panel; train markers (14–26 px, 1.35 cells) and station names (13 px) keep their size on screen, so they stay legible on a projector and on a laptop.
- Station names sit beside their platforms where they cover no other name, no platform and as few tracks as possible. Numbered stops lose their name before anything overlaps; the stops' names appear from about 7 px per cell.
- Two views: the whole network, and the busy middle, where the numbers show (around the Hauptbahnhof on Neu-Frankfurt, around the hub, Stop 14, on Köln). Köln's tracks fill only part of its grid, so its whole-network view is the tracks' extent, not the grid. The views and the grid switch float at the top right; in a narrow panel they drop under the caption, and on a small phone their buttons tighten so that they share one row.
- The **legend** is a strip under the map, always visible, with short names; the Method tab explains every symbol in full. The map's drawing area ends above it, so it never covers a station or a train.
- Playback moves each train at its own speed between steps (`js/glide.js`): an S-Bahn glides through a cell in two steps, a train setting off or braking speeds up or slows down, and a standing train stays at the centre of its cell. A train the engine moves is drawn moving, except while it inches forward inside one cell between two halts. A reader who prefers reduced motion sees every train at the centre of its cell, jumping from cell to cell.

## 5. The panel

- **Story** (first): what the run's dispatcher does, its figures (trains arrived, stops served, collisions, score), the moments worth watching, each with the step it happens at, and why the run scores what it scores (the largest penalty kinds and their share; a kind whose terms include stops booked in Python's hash order says so in a muted line, as in the Score tab). A moment jumps to its step and rings its train on the map, and the story stays in view; the moment on screen carries an ink frame. A button at the end leads on to the next run, and after the optimized run to the comparison of all scores. The moments' stripes follow the colour grammar: a collision, a gridlock or a station passed in danger, a wait in warning, a stop served or an arrival in success.
- **Score**: the map's scores as bars on one scale (a shorter bar is better), each simulated one with its check: three on each map, the leaderboard's among them; where the points go, as a table of the eight penalty kinds with count, the value so far and the final value (a kind whose terms include stops booked in Python's hash order carries a muted note pointing to the Method, kept on phones, where the kinds' hints give way); the score over time for the map's runs, with a line at −37,374.
- **Trains**: all of the map's trains (19 or 36) with their state at the step on screen, stops served and points; picking one frames its stops on the map and opens its timetable as run (due, arrived, earliest departure, left), each stop at the platform the reward function books it at. A stop booked in Python's hash order says what is counted in its mark ("Counted as left 10 early", not "Left 10 early": the train itself did not) and where in a muted line under it ("booked at the first call's platform, with its times (Python's hash order, see Method)").
- **Events**: newest first, up to the step on screen; each jumps to its step and picks its train.
- **Method**: what runs in the browser, how it is checked, the runs, reading the map, how the score works (on Köln with the three stops of the optimized run booked in Python's hash order, the two scores the hash seed allows, and the early departures the booking shown counts), and the limits.

**The situation line** under the map's title says in a few words what is going on at the step on screen, in the tone of its state: a gridlock (danger), trains held back by trains in their way (danger), trains waiting at their entry (muted), all trains arrived (success). On a small phone it uses its short form ("Gridlock: 12 trains stuck").

## 5a. The guide

For a reader who knows nothing of the challenge, in the order they need it, told on the map on screen (each map has its own guide, with the same seven chapters): (1) the challenge, with the real network drawn small; (2) a railway made of grid cells, with a made-up stretch that shows a cell, a buffer stop, a train, a switch, a station and a level-free crossing; (3) the timetables, with the map's three kinds of train and one train's real timetable; (4) the decisions: the five commands, and three scenes of trains meeting (free track, a taken cell, head to head); (5) the score, as a table of the seven penalties as the challenge's code sets them for the map, the one rule that decides everything (a lost stop costs as much as 499 steps of delay on Neu-Frankfurt, 684 on Köln), when points count (a run's score lags behind the map), and why zero is out of reach (no dispatcher can beat −944 on Neu-Frankfurt, −25,010.5 on Köln, where six S-Bahn loops are done as they enter); (6) the results, three on each map, each with where its figure comes from (simulated in the browser, from the project brief, planned in Python and replayed), what it is or does, what happens, a bar on the baseline's scale and, for each run, a button that closes the guide and plays that run with its story; (7) how to read the page, the map switch included.

- Each chapter is short: a heading, a lead sentence, then the figure or table that carries it. The drawings use the map's own classes, so a track, a platform and a train look as they do on the map.
- The chapter list is Vici's vertical stepper (numbers in hexagons; the open chapter marked by its label and the current step, not merlot). Below 900 px it becomes a row of numbered hexagons above the chapter; on a phone, the hexagons alone, spread over the width, and the dialog takes the whole screen.
- Words in the drawings stay 10 px or larger on any screen: the network's names are laid out again for the width they are drawn at (13 px, 11 px when narrow), and below about 380 px the pieces drawing swaps its labels for numbered hexagon markers with a key below it. The example timetable becomes one block per station on a small phone.
- The focus starts on *Next* and moves to each new chapter's heading; Escape closes the guide.

## 6. Built for the room

- 44 px targets for the main controls (Play, the step buttons, tabs, the trains' rows, events, the byline's links), 40 px for the header's theme toggle and *How it works* (Rebate Hunter's sizes).
- The control bar stays on one row from 1280 px; the run switch drops its scores below 1400 px (the KPI tiles and the Score tab keep them).
- Fluid root size: 15 px at 1280 px wide, about 17 px at 1920 px, never more than 18 px.
- Keyboard: Vici's tabs with the arrow keys, Escape closes the guide, the skip link, visible focus. Forced colours keep tracks and trains visible.
- A strict Content Security Policy: scripts, styles, fonts and data from this site only; no `innerHTML` anywhere.

## 7. Deviations

From Rebate Hunter:
- The legend is a strip under the map instead of a foldable card on it: the network fills the panel, and a card on top would cover stations.
- No live agent and no API key: everything is computed in the browser from the scenario.
- The playback status is a Vici tag at control height (44 px), so it lines up with the bar.
- The first visit opens a seven-chapter guide instead of a short intro window: the page has to explain a challenge its reader may never have heard of.
- A second scenario sits behind a switch in the header, not in a menu: the two maps are the page's two subjects, and a link can open either (`?map=koeln`, `?map=frankfurt`; without one the page opens on Köln). Switching loads the other map's page.

From Vici:
- Over the railway's grid the honeycomb gives way to a plain canvas with the grid's squares on it; around the grid it stays the map's background, and with the grid switched off it fills the map again.
- The grid's line is a mix of two of Vici's tokens (ink at 7 % on the canvas), not a single token: the nearest one, border-subtle, steps nearly five times as far from the dark canvas as from the light one, and the grid has to be equally faint in both themes.
- Train markers on the map are not keyboard-focusable; the Trains tab is the keyboard path to every train (the same picks, the same timetable).
- Platforms and level-free crossings use small corner radii (well under half their size), which the hexagon rule allows; nothing is round.
- On a phone the guide's chapter buttons are 40 px wide (44 px high), so all seven fit in one row at 320 px; everywhere else they are 44 px.
- The map's caption on a phone drops its step and score line (both are in the control bar and the tiles right above) and lets the run's title take two lines.

## 8. The checks

| Check | What it guards |
|---|---|
| `tests/tokens.mjs` | the colour grammar's contrast, both themes, and that every token exists |
| `tests/hexagon.mjs` | nothing round, in the files and in the rendered app, both themes |
| `tests/page-icon.mjs` | the page icon in the header, the boot screen and `favicon.svg` |
| `tests/vici-files.mjs` | `vici/` is Vici v1.0.0, unchanged |
| `tests/layout.mjs` | nine viewports from 1920 × 1080 over a tablet to 320 × 640, on both maps: no overflow, one-row control bar, nothing covering the drawing or another name, the map's tools (views and grid switch) inside its panel, the run's title and the situation line never cut, target sizes; both guides' seven chapters at each (inside the window, nothing wider than the chapter, drawings' words 10 px or larger) |
| `tests/smoke.mjs` | the guide (chapters, Next, Back, focus, Watch buttons), the Story tab (moments, the situation line, the next run), the map switch (Köln by default, Neu-Frankfurt and back, links to a map, a run and a step) and the grid (a line along every cell edge on both maps, under the network, on the drawing's cells in both views, faint in both themes, the Grid switch and its memory) among the main flows |
