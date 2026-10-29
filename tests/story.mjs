// The page's story of each run against the Python runner's own traces: the facts js/story.js computes
// from the page's run (trains arrived, collisions, the gridlock, stops served and passed, waits, late
// arrivals) and the steps and trains of the moments it offers, compared with the same facts worked
// out independently from tests/fixtures/<map>/trace_*.json and the scenario file
// (tests/lib/trace-facts.mjs), on every map.
// Usage: node tests/story.mjs [frankfurt|koeln]
import { loadScenario } from "../js/engine/env.js";
import { simulate } from "../js/sim.js";
import { describe } from "../js/network.js";
import { moments, runFacts, situation } from "../js/story.js";
import { RUNS } from "../js/runs.js";
import { mapById } from "../js/maps.js";
import { OrderedController } from "../js/controllers/ordered.js";
import { ReplayController } from "../js/controllers/replay.js";
import { readJson, traceFacts } from "./lib/trace-facts.mjs";
import { MAP_IDS, mapPath, planPath } from "./lib/maps.mjs";

const results = [];
const check = (ok, what) => results.push([ok, what]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const maps = process.argv.slice(2).length ? process.argv.slice(2) : MAP_IDS;

for (const id of maps) {
const map = mapById(id);
const data = readJson(mapPath(id));
const scenario = loadScenario(data);
const network = describe(data, map);
const controllers = {
  baseline: () => new OrderedController(),
  estimate: () => new ReplayController(readJson(planPath(id, "estimate")), "estimate"),
  optimized: () => new ReplayController(readJson(planPath(id, "optimized")), "optimized")
};

for (const r of RUNS.filter((x) => map.runs.includes(x.id))) {
  const run = simulate(scenario, controllers[r.id]());
  const page = runFacts(run, scenario);
  const py = traceFacts(r.id, data, id);
  const tag = `${id} ${r.id}`;
  const pairs = [
    ["trains arrived", page.arrived, py.arrived],
    ["arrival steps", page.arrivals, py.arrival],
    ["collisions", page.collisions, py.collisions],
    ["first collision (step, train)", page.firstCollision && [page.firstCollision.step, page.firstCollision.train], py.firstCollision && [py.firstCollision.step, py.firstCollision.train]],
    ["gridlock from step", page.gridlockFrom, py.gridlockFrom],
    ["trains on the map at the end", page.stuck, py.stuck],
    ["stops in all", page.stops, py.stops],
    ["stops served", page.served, py.served],
    ["stops passed without stopping", page.passed, py.passed],
    ["stops never reached", page.missed, py.missed],
    ["longest wait at the entry (train, steps)", [page.longestWait.train, page.longestWait.wait], [py.longestWait.train, py.longestWait.wait]],
    ["trains late at their destination (trains, steps)", [page.lateTrains, page.lateSteps], [py.lateTrains, py.lateSteps]]
  ];
  for (const [what, a, b] of pairs) check(same(a, b), `${tag}: ${what}: page ${JSON.stringify(a)}, Python ${JSON.stringify(b)}`);

  // The moments: each step and train as the trace has it.
  const list = moments(run, scenario, network, page, r.why || {});
  const at = (kind) => list.find((m) => m.kind === kind);
  // the first train done as it entered (its first cell is its destination), and the first to arrive
  // by running there: the earliest step, then the lowest train number
  const firstOf = (trains) => trains.map((i) => ({ step: py.arrival[i], train: i })).sort((a, b) => a.step - b.step || a.train - b.train)[0] || null;
  const ran = py.arrival.map((s, i) => i).filter((i) => py.arrival[i] !== null && !py.atTarget.includes(i));
  const expect = [
    ["at-target", firstOf(py.atTarget)],
    ["arrive", firstOf(ran)],
    ["collision", py.firstCollision && { step: py.firstCollision.step, train: py.firstCollision.train }],
    ["pass", py.firstPass && { step: py.firstPass.step, train: py.firstPass.train }],
    ["stop", py.firstServed && { step: py.firstServed.step, train: py.firstServed.train }],
    ["gridlock", py.gridlockFrom !== null ? { step: py.gridlockFrom, train: null } : null],
    ["all-arrived", py.arrived === py.n ? { step: py.lastArrival, train: py.arrival.indexOf(py.lastArrival) } : null],
    ["end", { step: py.steps, train: null }]
  ];
  for (const [kind, want] of expect) {
    const m = at(kind);
    const got = m ? { step: m.step, train: m.train } : null;
    check(same(got, want), `${tag}: the moment "${kind}" ${want ? `at step ${want.step}` : "absent"} (page: ${got ? `step ${got.step}, train ${got.train}` : "absent"})`);
  }
  const sorted = list.every((m, j) => j === 0 || list[j - 1].step <= m.step);
  check(sorted, `${tag}: the moments are in the order of their steps`);
  // The end moment states the run's real figures.
  const end = at("end").text;
  check(end.includes(`${py.arrived} of ${py.n} trains arrived`) && end.includes(`${py.served} of ${py.stops} stops`), `${tag}: the last moment says ${py.arrived} of ${py.n} arrived and ${py.served} of ${py.stops} stops served`);
  // A train done as it entered: the moment names its lost stops, as the scenario file counts them.
  if (py.atTarget.length) {
    const m = at("at-target");
    const k = py.timetables[m.train].stops;
    const sameTarget = py.atTarget.every((i) => data["flatland line"].agent_targets[i][0].join() === data["flatland line"].agent_positions[i][0][0].join());
    check(sameTarget && m.text.includes(`all ${k} stops on its way are lost`) && (py.atTarget.length === 1 || m.text.includes(`${py.atTarget.length - 1} more trains`)),
      `${tag}: the trains done as they enter (${py.atTarget.length}) start on their destination's cell in the file, and the moment says ${k} stops lost and ${py.atTarget.length - 1} more (${m.text.slice(0, 90)}…)`);
  }

  // The situation line: gridlock from its first step on, never before; all arrived after the last arrival.
  if (py.gridlockFrom !== null) {
    const before = situation(run, scenario, page, py.gridlockFrom - 1);
    const from = situation(run, scenario, page, py.gridlockFrom);
    check(from && from.tone === "danger" && /^Gridlock/.test(from.text) && !(before && /^Gridlock/.test(before.text)), `${tag}: the map says "Gridlock" from step ${py.gridlockFrom} on, not before (${from?.text})`);
    check(from && from.text === `Gridlock since step ${py.gridlockFrom}: ${py.stuck} trains stuck for good` && from.short === `Gridlock: ${py.stuck} trains stuck`, `${tag}: in full and in short, the gridlock's step and its ${py.stuck} stuck trains (${from?.text} / ${from?.short})`);
  }
  if (py.arrived === py.n) {
    const s = situation(run, scenario, page, py.lastArrival);
    const before = situation(run, scenario, page, py.lastArrival - 1);
    check(s && s.text === `All ${py.n} trains have arrived` && s.short === `All ${py.n} trains arrived` && !(before && /^All/.test(before.text)), `${tag}: the map says all trains arrived from step ${py.lastArrival}, not before (${s?.text} / ${s?.short})`);
  }
}
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) { console.log(`\n${failed} of ${results.length} story check(s) failed.`); process.exit(1); }
console.log(`\nAll ${results.length} story checks agree with the Python traces.\nSTORY_FACTS_OK maps=${maps.join(",")}`);
