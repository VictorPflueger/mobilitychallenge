// What happened in a run, worked out from the Python runner's own trace (tests/fixtures/trace_*.json,
// recorded by tools/export_fixtures.py) and the scenario file alone: no code of the page is used, so
// tests/story.mjs and tests/guide.mjs can hold the page's story and guide against it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const readJson = (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

const DONE = 6;
const STOPPED = 4;

/** Per train, from the scenario file: earliest departure, latest arrival, stops' platforms. */
export function timetables(data) {
  const line = data["flatland line"];
  const tt = data["flatland timetable"];
  return line.agent_positions.map((positions, i) => {
    const ed = tt.earliest_departures[i];
    const la = tt.latest_arrivals[i];
    const platforms = positions.map((alts, k) => alts.map((p, j) => `${p[0]},${p[1]},${line.agent_directions[i][k][j]}`));
    // positions: the origin, then the intermediate stops (the destination is agent_targets)
    return { ed: ed[0], la: la[la.length - 1], stopEd: ed, stopLa: la, platforms, stops: positions.length - 1 };
  });
}

/** The facts of one run from its Python trace. */
export function traceFacts(name, data = readJson("data/neufrankfurt_19agents.json")) {
  const fx = readJson(`tests/fixtures/trace_${name}.json`);
  const tts = timetables(data);
  const n = tts.length;
  const rows = [fx.initial, ...fx.trace]; // rows[t]: the state at the end of step t
  const T = fx.steps;
  const key = (p) => (p ? `${p[0]},${p[1]}` : "-");

  const arrival = new Array(n).fill(null);
  const entered = new Array(n).fill(null);
  let lastChange = 0;
  for (let t = 1; t <= T; t += 1) {
    for (let i = 0; i < n; i += 1) {
      if (key(rows[t].pos[i]) !== key(rows[t - 1].pos[i])) lastChange = t;
      if (entered[i] === null && rows[t].pos[i]) entered[i] = t;
      if (arrival[i] === null && rows[t].state[i] === DONE) arrival[i] = t;
    }
  }
  const onMapAtEnd = rows[T].pos.filter((p) => p !== null).length;
  const gridlockFrom = onMapAtEnd && lastChange < T ? lastChange + 1 : null;

  const collisions = fx.terms.filter((x) => x[2] === "collision");
  const kinds = {};
  for (const [, , kind, value] of fx.terms) {
    kinds[kind] = kinds[kind] || { count: 0, value: 0 };
    kinds[kind].count += 1;
    kinds[kind].value += value;
  }
  const stops = tts.reduce((s, t) => s + t.stops, 0);
  const served = kinds.stop_late ? kinds.stop_late.count : 0; // every served stop books a late term (maybe 0)

  // Platform events, from positions, directions and states alone: a train on a platform of one of
  // its stops that it has not reached before; it serves the stop if it is STOPPED there, and passes
  // it if it moves on without that.
  let firstPass = null;
  let firstServed = null;
  for (let i = 0; i < n; i += 1) {
    const reached = new Set();
    let at = -1;
    let stopped = false;
    for (let t = 1; t <= T; t += 1) {
      const p = rows[t].pos[i];
      const here = p ? `${p[0]},${p[1]},${rows[t].dir[i]}` : null;
      if (at >= 0 && key(p) !== key(rows[t - 1].pos[i])) {
        if (!stopped && (!firstPass || t < firstPass.step || (t === firstPass.step && i < firstPass.train))) firstPass = { step: t, train: i, stop: at };
        at = -1;
      }
      if (here && at < 0) {
        const k = tts[i].platforms.findIndex((alts, kk) => kk > 0 && alts.includes(here));
        if (k > 0 && !reached.has(k)) { reached.add(k); at = k; stopped = false; }
      }
      if (at >= 0 && rows[t].state[i] === STOPPED && !stopped) {
        stopped = true;
        if (!firstServed || t < firstServed.step || (t === firstServed.step && i < firstServed.train)) firstServed = { step: t, train: i, stop: at };
      }
    }
  }

  const waits = tts.map((tt, i) => ({ train: i, wait: (entered[i] ?? T + 1) - (Math.max(tt.ed, 1) + 1) }));
  const longestWait = waits.reduce((b, w) => (w.wait > b.wait ? w : b), waits[0]);
  let lateTrains = 0;
  let lateSteps = 0;
  arrival.forEach((s, i) => { if (s !== null && s > tts[i].la) { lateTrains += 1; lateSteps += s - tts[i].la; } });
  const perTrain = new Array(n).fill(0);
  for (const [, agent, , value] of fx.terms) perTrain[agent] += value;
  const arrived = arrival.filter((s) => s !== null).length;

  return {
    name, n, steps: T, score: fx.reward, arrived, arrival, entered,
    lastArrival: arrived ? Math.max(...arrival.filter((s) => s !== null)) : null,
    collisions: collisions.length,
    firstCollision: collisions.length ? { step: collisions[0][0], train: collisions[0][1], value: collisions[0][3] } : null,
    gridlockFrom, stuck: onMapAtEnd, stops, served,
    passed: kinds.stop_passed ? kinds.stop_passed.count : 0,
    missed: kinds.stop_missed ? kinds.stop_missed.count : 0,
    firstPass, firstServed, longestWait, lateTrains, lateSteps, perTrain, kinds, timetables: tts
  };
}
