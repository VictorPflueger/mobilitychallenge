# Dispatch Lab — design

How the page looks and why. It follows Rebate Hunter (VictorPflueger/PROC-Rebate-Hunter), Victor Pflüger's reference prototype, on his design system Vici v1.0.0 (`vici/`, unchanged). Where Dispatch Lab departs from either, §7 says so.

## 1. The brief

One page that a jury, a team or a curious engineer can open and understand in a minute: where a dispatching strategy loses its points on the Neu-Frankfurt scenario, and why the optimized planner loses almost none. It has to read on a projector (1920 × 1080 down to 1280 × 720) and still work on a phone. Every figure on it must be the engine's, and the engine must be the challenge's.

## 2. The shell (Rebate Hunter's)

- **Header**: the page icon (Vici's flag in a lilac hexagon cell, the colour of a prototype's card on Victor's website), the name, the black-and-white tape badge with the word SIMULATION, *How it works* (the intro window), the theme toggle, and four KPI tiles: the score so far, the distance to the leaderboard's −37,374, trains arrived, stops served.
- **Control bar**: the run switch (each run with its series colour and final score), Play (the one solid merlot button), four step buttons, three speeds, the timeline with its step label, and the playback status as a Vici tag with a hexagon pip.
- **Workspace**: the network map (62 %) and a tabbed panel (38 %): Score, Trains, Events, Method.
- **Footer**: how the numbers come about (checked against the Python runner) and Vici's byline with Victor's LinkedIn and website. The app links to its author, never to its own source code.
- **Boot screen** while the browser simulates the three runs, with what it is doing and, if a file is missing, why it stopped.
- **Intro window** on the first visit: the four scores on Vici's stepper and three things to know, with *Play the optimized run*.

## 3. Colour grammar

Every colour is one of Vici's semantic tokens, so both themes follow from one set of rules. JavaScript draws no colour; it sets data attributes that the CSS maps to tokens.

1. **Merlot** (`--vc-accent`) is the person at the controls: the Play button and the focus ring. It never encodes a state, and a selection is always ink, never merlot.
2. **Danger, warning, success** are the trains' outcomes: blocked, stuck and lost (danger), behind the timetable (warning), on time and served (success). Every state also differs in form, so no state depends on colour alone (below).
3. **Lilac**, Vici's feature tone, is the AI's voice: the estimate is Claude's reconstruction, and it carries Vici's AI label.
4. **Fjord**, the info tone, is checking: "same score as the Python runner".
5. **Each run keeps one series colour** from Vici's chart palette: baseline `data-8` (the baselines' grey-brown), estimate `data-5` (lilac, the AI's), optimized `data-2` (teal). The leaderboard's figure, which is not simulated, is a dashed outline.
6. **Ink** carries everything else: the network, labels, a train on time.

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
- Tracks scale with the panel; train markers (14–26 px, 1.35 cells) and station names (13 px) keep their size on screen, so they stay legible on a projector and on a laptop.
- Station names sit beside their platforms where they cover no other name, no platform and as few tracks as possible. Numbered stops lose their name before anything overlaps; the stops' names appear from about 7 px per cell.
- Two views: the whole network, and the busy middle around the Hauptbahnhof, where the numbers show.
- The **legend** is a strip under the map, always visible, with short names; the Method tab explains every symbol in full. The map's drawing area ends above it, so it never covers a station or a train.
- Playback interpolates between steps unless the reader prefers reduced motion; then trains jump from cell to cell.

## 5. The panel

- **Score**: the four scores as bars on one scale (a shorter bar is better), each simulated one with its check; where the points go, as a table of the eight penalty kinds with count, the value so far and the final value; the score over time for all three runs with a line at −37,374.
- **Trains**: all 19 with their state at the step on screen, stops served and points; picking one frames its stops on the map and opens its timetable as run (due, arrived, earliest departure, left).
- **Events**: newest first, up to the step on screen; each jumps to its step and picks its train.
- **Method**: what runs in the browser, how it is checked, the runs, reading the map, how the score works, and the limits.

## 6. Built for the room

- 44 px targets for the main controls (Play, the step buttons, tabs, the trains' rows, events, the byline's links), 40 px for the header's theme toggle and *How it works* (Rebate Hunter's sizes).
- The control bar stays on one row from 1280 px; the run switch drops its scores below 1400 px (the KPI tiles and the Score tab keep them).
- Fluid root size: 15 px at 1280 px wide, about 17 px at 1920 px, never more than 18 px.
- Keyboard: Vici's tabs with the arrow keys, Escape closes the intro and the AI label, the skip link, visible focus. Forced colours keep tracks and trains visible.
- A strict Content Security Policy: scripts, styles, fonts and data from this site only; no `innerHTML` anywhere.

## 7. Deviations

From Rebate Hunter:
- The legend is a strip under the map instead of a foldable card on it: the network fills the panel, and a card on top would cover stations.
- No live agent and no API key: everything is computed in the browser from the scenario.
- The playback status is a Vici tag at control height (44 px), so it lines up with the bar.

From Vici:
- Train markers on the map are not keyboard-focusable; the Trains tab is the keyboard path to every train (the same picks, the same timetable).
- Platforms and level-free crossings use small corner radii (well under half their size), which the hexagon rule allows; nothing is round.

## 8. The checks

| Check | What it guards |
|---|---|
| `tests/tokens.mjs` | the colour grammar's contrast, both themes, and that every token exists |
| `tests/hexagon.mjs` | nothing round, in the files and in the rendered app, both themes |
| `tests/page-icon.mjs` | the page icon in the header, the boot screen and `favicon.svg` |
| `tests/vici-files.mjs` | `vici/` is Vici v1.0.0, unchanged |
| `tests/layout.mjs` | eight viewports from 1920 × 1080 to 320 × 640: no overflow, one-row control bar, nothing covering the drawing or another name, target sizes |
