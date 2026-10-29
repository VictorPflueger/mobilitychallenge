// How the map moves trains between steps (js/glide.js), for every run of both maps as the page
// simulates them, against the Python runner's own record of each run (tests/fixtures/<map>/
// trace_*.json: every train's cell, state, speed and distance in the cell after every step). The
// point where the map draws a train is sampled eight times per step.
//   moving    a train Python has moving is drawn moving in that step, unless it is inching forward
//             inside one cell between two halts (it never leaves that cell): such steps are counted
//   standing  a train Python has standing is drawn still, at the centre of its cell
//   speed     in every run a train running at full speed is drawn a cell per step, through the
//             centre of each cell at each step, and a train running steadily at half speed
//             (Neu-Frankfurt's S-Bahns, Köln's local trains) exactly half a cell per step: as far
//             as Python moves it
//   way       a train is drawn less than a cell from the centre of the cell Python has it in, never
//             backwards along its way and never more than a cell in a step (no train is faster); it
//             glides into its destination in the step it arrives
//   control   the old drawing (from cell centre to cell centre, only in a step in which the train
//             changed cells) fails the moving check in every run, and a drawing at the distance
//             Python's speed counter has covered in the cell fails the standing check
// Köln's six S-Bahn loops start on their destination and are done the moment they enter: they are
// never on the map, in Python's record or in the drawing.
// Usage: node tests/glide.mjs [--map frankfurt|koeln]
import { loadScenario } from "../js/engine/env.js";
import { simulate } from "../js/sim.js";
import { trainPoint } from "../js/glide.js";
import { describe } from "../js/network.js";
import { OrderedController } from "../js/controllers/ordered.js";
import { ReplayController } from "../js/controllers/replay.js";
import { readJson } from "./lib/trace-facts.mjs";
import { MAPS, fixturePath, mapPath, parseCases, planPath, referencePath } from "./lib/maps.mjs";

const MOVING = 3;
const DONE = 6;
const SAMPLES = 8;
const EPS = 1e-9;

const { maps } = parseCases(process.argv.slice(2), []);
const results = [];
const check = (ok, what) => results.push([ok, what]);
const centre = (p) => [p[1] + 0.5, p[0] + 0.5]; // Python's [row, column] to the map's (x, y)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The drawn path of train i in step t → t + 1: its points at t, t + 1/8, …, t + 1, and its length. */
function stepPath(point, i, t) {
  const pts = [];
  for (let k = 0; k <= SAMPLES; k += 1) pts.push(point(i, t + k / SAMPLES));
  let length = 0;
  for (let k = 1; k < pts.length; k += 1) if (pts[k] && pts[k - 1]) length += dist(pts[k], pts[k - 1]);
  return { pts, length };
}

/**
 * Steps in which a train inches forward inside one cell between two halts: Python has it moving in
 * a cell it neither leaves in that step nor left since it last halted there (or since it entered
 * the map there), and it halts in that cell again before leaving it.
 */
function inchingSteps(rows, T, i) {
  const out = new Set();
  const key = (p) => (p ? `${p[0]},${p[1]}` : "-");
  for (let t = 1; t <= T; t += 1) {
    const p = rows[t].pos[i];
    if (!p || key(rows[t - 1].pos[i]) !== key(p) || rows[t].state[i] !== MOVING) continue;
    let before = false;
    for (let u = t - 1; u >= 0 && key(rows[u].pos[i]) === key(p); u -= 1) {
      if (rows[u].state[i] !== MOVING || u === 0 || !rows[u - 1].pos[i]) { before = true; break; }
    }
    let after = false;
    for (let u = t + 1; u <= T && key(rows[u].pos[i]) === key(p); u += 1) if (rows[u].state[i] !== MOVING) { after = true; break; }
    if (before && after) out.add(t);
  }
  return out;
}

/** The moving check on any drawing: the steps a train Python moves is drawn standing, not counting inching. */
function movingCheck(point, rows, T, n, inching) {
  let moving = 0;
  const shownStanding = [];
  let inchingShownStanding = 0;
  for (let t = 0; t < T; t += 1) {
    for (let i = 0; i < n; i += 1) {
      const a = rows[t];
      const b = rows[t + 1];
      if (!a.pos[i]) continue;
      const arrives = !b.pos[i] && b.state[i] === DONE;
      if (!(arrives || (b.pos[i] && b.state[i] === MOVING && b.speed[i] > 0))) continue;
      moving += 1;
      if (stepPath(point, i, t).length > EPS) continue;
      if (inching[i].has(t + 1)) inchingShownStanding += 1;
      else shownStanding.push(`train ${i} step ${t + 1}`);
    }
  }
  return { moving, shownStanding, inchingShownStanding };
}

/** The standing check on any drawing: the steps a train Python has standing is drawn moving or off its cell's centre. */
function standingCheck(point, rows, T, n) {
  let standing = 0;
  const moved = [];
  const off = [];
  for (let t = 0; t < T; t += 1) {
    for (let i = 0; i < n; i += 1) {
      const q = rows[t + 1].pos[i];
      if (!rows[t].pos[i] || !q || rows[t + 1].state[i] === MOVING) continue;
      standing += 1;
      const { pts, length } = stepPath(point, i, t);
      if (length > EPS) moved.push(`train ${i} step ${t + 1}`);
      else if (pts.some((x) => !x || dist(x, centre(q)) > EPS)) off.push(`train ${i} step ${t + 1}`);
    }
  }
  return { standing, moved, off };
}

for (const mapId of maps) checkMap(mapId);

function checkMap(mapId) {
  const data = readJson(mapPath(mapId));
  const scenario = loadScenario(data);
  const rail = scenario.rail;
  const network = describe(data);
  const cellOf = (p) => rail.index(p[0], p[1]);
  const controllers = {
    baseline: () => new OrderedController(),
    optimized: () => new ReplayController(readJson(planPath(mapId)), "optimized")
  };
  // The trains at half a cell per step: Neu-Frankfurt's three S-Bahns; on Köln every Local train
  // (0.6 in the file, which Flatland rounds to 0.5), the S-Bahn loops among them.
  const slowKind = mapId === "frankfurt" ? "S-Bahn" : "Local";
  const sbahns = network.trains.filter((t) => t.kind === slowKind).map((t) => t.handle);
  const halfSpeed = scenario.agents.filter((a) => a.maxSpeed === 0.5).map((a) => a.handle);
  if (mapId === "frankfurt") check(sbahns.length === 3 && sbahns.every((i) => scenario.agents[i].maxSpeed === 0.5), `the scenario's S-Bahns (trains ${sbahns.join(", ")}) run at half a cell per step`);
  else check(sbahns.length > 0 && JSON.stringify(sbahns) === JSON.stringify(halfSpeed), `${mapId}: the scenario's ${sbahns.length} ${slowKind} trains (trains ${sbahns[0]}–${sbahns[sbahns.length - 1]}), and only they, run at half a cell per step`);
  const atTarget = scenario.agents.filter((a) => a.initialPos === a.target).map((a) => a.handle);
  check(mapId === "frankfurt" ? atTarget.length === 0 : atTarget.length === 6, `${mapId}: ${atTarget.length ? `trains ${atTarget.join(", ")} start on their destination` : "no train starts on its destination"}`);
  const reference = readJson(referencePath(mapId));
  for (const id of MAPS[mapId].runs) checkRun(mapId, id, { scenario, rail, cellOf, sbahns, atTarget, run: simulate(scenario, controllers[id](), { bookings: reference.runs[id].bookings }) });
}

function checkRun(mapId, runId, { scenario, rail, cellOf, sbahns, atTarget, run }) {
  // On Neu-Frankfurt the messages name the run alone, as before Köln was added.
  const id = mapId === "frankfurt" ? runId : `${mapId} ${runId}`;
  const fx = readJson(fixturePath(mapId, `trace_${runId}.json`));
  const rows = [fx.initial, ...fx.trace];
  const T = fx.steps;
  const n = scenario.agents.length;
  check(run.steps === T, `${id}: the page's run is as long as Python's (${run.steps} and ${T} steps)`);
  const drawn = (i, t) => trainPoint(run.paths, rail, i, t);
  const inching = Array.from({ length: n }, (_, i) => inchingSteps(rows, T, i));
  const inchingCount = inching.reduce((s, x) => s + x.size, 0);

  // moving
  const mv = movingCheck(drawn, rows, T, n, inching);
  check(mv.shownStanding.length === 0, `${id}: of ${mv.moving} steps in which Python moves a train, none is drawn standing (${mv.shownStanding.slice(0, 5).join("; ") || "none"}); ${mv.inchingShownStanding} of ${inchingCount} steps inching inside a cell between two halts are drawn standing`);

  // standing, way, full speed
  const missing = [];
  let farthest = 0, longestStep = 0, backwards = [], fullSteps = 0, fullBad = [], halfSteps = 0, halfBad = [], arrivals = 0, arrivalsStill = [];
  for (let t = 0; t <= T; t += 1) {
    for (let i = 0; i < n; i += 1) {
      const p = rows[t].pos[i];
      if (p) {
        const at = drawn(i, t);
        if (!at) { missing.push(`train ${i} step ${t}`); continue; }
        farthest = Math.max(farthest, Math.max(Math.abs(at[0] - centre(p)[0]), Math.abs(at[1] - centre(p)[1])));
      }
      if (t === T || !p) continue;
      const q = rows[t + 1].pos[i];
      const { pts, length } = stepPath(drawn, i, t);
      if (q || rows[t + 1].state[i] === DONE) longestStep = Math.max(longestStep, length);
      const place = run.paths.at[t * n + i];
      const next = run.paths.at[(t + 1) * n + i];
      if (!Number.isNaN(next) && next < place - EPS) backwards.push(`train ${i} step ${t + 1}`);
      if (!q && rows[t + 1].state[i] === DONE) {
        arrivals += 1;
        const target = scenario.agents[i].target;
        const goal = [rail.col(target) + 0.5, rail.row(target) + 0.5];
        if (!(dist(pts[SAMPLES / 2], goal) < dist(pts[0], goal) - EPS)) arrivalsStill.push(`train ${i} step ${t + 1}`);
        continue;
      }
      // full speed in the step before, this one and the next two: through cell centres, a cell per step
      const full = (u) => u >= 1 && u <= T && rows[u].pos[i] && rows[u - 1].pos[i] && rows[u].state[i] === MOVING && rows[u].speed[i] === 1;
      if (full(t) && full(t + 1) && full(t + 2) && full(t - 1)) {
        fullSteps += 1;
        if (Math.abs(length - 1) > EPS || dist(pts[0], centre(p)) > EPS || dist(pts[SAMPLES], centre(q)) > EPS) fullBad.push(`train ${i} step ${t + 1}`);
      }
      // half speed, steadily from two steps before this one to four after it (so the cells it
      // enters on either side of this step, and the one after, are entered and left at that speed):
      // half a cell per step, exactly as far as Python moves it
      const half = (u) => u >= 1 && u <= T && rows[u].pos[i] && rows[u - 1].pos[i] && rows[u].state[i] === MOVING && rows[u].speed[i] === 0.5;
      if ([-2, -1, 0, 1, 2, 3, 4].every((k) => half(t + k))) {
        halfSteps += 1;
        if (!sbahns.includes(i) || Math.abs(length - 0.5) > EPS) halfBad.push(`train ${i} step ${t + 1}: ${length.toFixed(3)}`);
      }
    }
  }
  check(missing.length === 0, `${id}: every train on the map in Python's record is drawn (${missing.slice(0, 5).join("; ") || "all"})`);
  const st = standingCheck(drawn, rows, T, n);
  check(st.moved.length === 0 && st.off.length === 0, `${id}: in all ${st.standing} steps Python has a train standing, it is drawn still at the centre of its cell (${[...st.moved, ...st.off].slice(0, 5).join("; ") || "none off"})`);
  check(fullSteps > 0 && fullBad.length === 0, `${id}: in all ${fullSteps} steps of running at full speed a train is drawn a cell per step, at the centre of its cell at each step (${fullBad.slice(0, 5).join("; ") || "none off"})`);
  check(halfSteps > 0 && halfBad.length === 0, `${id}: in all ${halfSteps} steps of running steadily at half speed (only ${mapId === "frankfurt" ? "the S-Bahns" : "the local trains"} do), a train is drawn exactly half a cell per step, as far as Python moves it (${halfBad.slice(0, 5).join("; ") || "all exact"})`);
  check(farthest < 1, `${id}: at every step a train is drawn less than a cell from the centre of the cell Python has it in (farthest ${farthest.toFixed(3)})`);
  check(backwards.length === 0, `${id}: no train is ever drawn going back along its way (${backwards.slice(0, 5).join("; ") || "none"})`);
  check(longestStep <= 1 + EPS, `${id}: no train is drawn moving more than a cell in one step, as none can (longest ${longestStep.toFixed(3)})`);
  check(arrivals > 0 && arrivalsStill.length === 0, `${id}: in each of the ${arrivals} steps a train reaches its destination, it is drawn gliding towards it (${arrivalsStill.slice(0, 5).join("; ") || "all"})`);

  // Trains that start on their destination: never on the map, neither in Python's record nor drawn.
  if (atTarget.length) {
    const shown = [];
    for (let t = 0; t <= T; t += 1) for (const i of atTarget) if (rows[t].pos[i] || trainPoint(run.paths, rail, i, t)) shown.push(`train ${i} step ${t}`);
    check(shown.length === 0 && atTarget.every((i) => run.paths.routes[i].length === 0), `${id}: the ${atTarget.length} trains that start on their destination are never on the map, in Python's record or drawn (${shown.slice(0, 5).join("; ") || "none"})`);
  }

  // control 1: the old drawing shows moving trains standing
  const old = (i, t) => {
    const s = Math.max(0, Math.min(Math.floor(t), T));
    const p = rows[s].pos[i];
    if (!p) return null;
    const [x, y] = centre(p);
    const f = t - s;
    const q = s < T ? rows[s + 1].pos[i] : null;
    if (f > 0 && q && cellOf(q) !== cellOf(p)) { const [x2, y2] = centre(q); return [x + (x2 - x) * f, y + (y2 - y) * f]; }
    return [x, y];
  };
  const oldMv = movingCheck(old, rows, T, n, inching);
  check(oldMv.shownStanding.length > 0, `${id}: control: the moving check finds the old drawing showing moving trains standing in ${oldMv.shownStanding.length} steps`);

  // control 2: drawn where Python's speed counter has the train in its cell (the centre plus the
  // distance covered, towards the way it faces), standing trains leave the centre of their cell
  const STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // north, east, south, west as (x, y)
  const counter = (i, t) => {
    const s = Math.max(0, Math.min(Math.floor(t), T));
    const at = (u) => {
      const p = rows[u].pos[i];
      if (!p) return null;
      const [x, y] = centre(p);
      const [dx, dy] = STEP[rows[u].dir[i]];
      return [x + dx * rows[u].dist[i], y + dy * rows[u].dist[i]];
    };
    const a = at(s);
    const f = t - s;
    if (!a || f === 0 || s >= T) return a;
    const b = at(s + 1);
    return b ? [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] : a;
  };
  const cst = standingCheck(counter, rows, T, n);
  check(cst.standing > 0 && cst.off.length > 0, `${id}: control: the standing check finds a drawing at the speed counter's distance leaving standing trains off centre in ${cst.off.length} of ${cst.standing} steps`);
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) { console.log(`\n${failed} of ${results.length} glide check(s) failed.`); process.exit(1); }
console.log(`\nAll ${results.length} glide checks passed.\nGLIDE_OK maps=${maps.join(",")}`);
