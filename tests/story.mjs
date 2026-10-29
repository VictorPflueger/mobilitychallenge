// The page's story of each run against the Python runner's own traces: the facts js/story.js computes
// from the page's run (trains arrived, collisions, the gridlock, stops served and passed, waits, late
// arrivals) and the steps and trains of the moments it offers, compared with the same facts worked
// out independently from tests/fixtures/trace_*.json and the scenario file (tests/lib/trace-facts.mjs).
// Usage: node tests/story.mjs
import { loadScenario } from "../js/engine/env.js";
import { simulate } from "../js/sim.js";
import { describe } from "../js/network.js";
import { moments, runFacts, situation } from "../js/story.js";
import { RUNS } from "../js/runs.js";
import { OrderedController } from "../js/controllers/ordered.js";
import { ReplayController } from "../js/controllers/replay.js";
import { readJson, traceFacts } from "./lib/trace-facts.mjs";

const data = readJson("data/neufrankfurt_19agents.json");
const scenario = loadScenario(data);
const network = describe(data);
const controllers = {
  baseline: () => new OrderedController(),
  estimate: () => new ReplayController(readJson("data/estimate_actions.json"), "estimate"),
  optimized: () => new ReplayController(readJson("data/planner_actions.json"), "optimized")
};

const results = [];
const check = (ok, what) => results.push([ok, what]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const r of RUNS) {
  const run = simulate(scenario, controllers[r.id]());
  const page = runFacts(run, scenario);
  const py = traceFacts(r.id, data);
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
  for (const [what, a, b] of pairs) check(same(a, b), `${r.id}: ${what}: page ${JSON.stringify(a)}, Python ${JSON.stringify(b)}`);

  // The moments: each step and train as the trace has it.
  const list = moments(run, scenario, network, page, r.why || {});
  const at = (kind) => list.find((m) => m.kind === kind);
  const expect = [
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
    check(same(got, want), `${r.id}: the moment "${kind}" ${want ? `at step ${want.step}` : "absent"} (page: ${got ? `step ${got.step}, train ${got.train}` : "absent"})`);
  }
  const sorted = list.every((m, j) => j === 0 || list[j - 1].step <= m.step);
  check(sorted, `${r.id}: the moments are in the order of their steps`);
  // The end moment states the run's real figures.
  const end = at("end").text;
  check(end.includes(`${py.arrived} of ${py.n} trains arrived`) && end.includes(`${py.served} of ${py.stops} stops`), `${r.id}: the last moment says ${py.arrived} of ${py.n} arrived and ${py.served} of ${py.stops} stops served`);

  // The situation line: gridlock from its first step on, never before; all arrived after the last arrival.
  if (py.gridlockFrom !== null) {
    const before = situation(run, scenario, page, py.gridlockFrom - 1);
    const from = situation(run, scenario, page, py.gridlockFrom);
    check(from && from.tone === "danger" && /^Gridlock/.test(from.text) && !(before && /^Gridlock/.test(before.text)), `${r.id}: the map says "Gridlock" from step ${py.gridlockFrom} on, not before (${from?.text})`);
    check(from && from.text === `Gridlock since step ${py.gridlockFrom}: ${py.stuck} trains stuck for good` && from.short === `Gridlock: ${py.stuck} trains stuck`, `${r.id}: in full and in short, the gridlock's step and its ${py.stuck} stuck trains (${from?.text} / ${from?.short})`);
  }
  if (py.arrived === py.n) {
    const s = situation(run, scenario, page, py.lastArrival);
    const before = situation(run, scenario, page, py.lastArrival - 1);
    check(s && s.text === `All ${py.n} trains have arrived` && s.short === `All ${py.n} trains arrived` && !(before && /^All/.test(before.text)), `${r.id}: the map says all trains arrived from step ${py.lastArrival}, not before (${s?.text} / ${s?.short})`);
  }
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) { console.log(`\n${failed} of ${results.length} story check(s) failed.`); process.exit(1); }
console.log(`\nAll ${results.length} story checks agree with the Python traces.\nSTORY_FACTS_OK`);
