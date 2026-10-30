// The page's story of each run against the Python runner's own traces: the facts js/story.js computes
// from the page's run (trains arrived, collisions, the gridlock, stops served and passed, waits, late
// arrivals) and the steps and trains of the moments it offers, compared with the same facts worked
// out independently from tests/fixtures/<map>/trace_*.json and the scenario file
// (tests/lib/trace-facts.mjs), on every map, without and with malfunctions (then also the
// breakdowns: how many, the first and the first on the network, every one the Events tab lists with
// its place, the train-steps broken down, and the map's "broken down" line).
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
import { MAP_IDS, VARIANTS, malfunctionsPath, mapPath, planPath, referencePath } from "./lib/maps.mjs";

const results = [];
const check = (ok, what) => results.push([ok, what]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const maps = process.argv.slice(2).length ? process.argv.slice(2) : MAP_IDS;

for (const id of maps) {
const map = mapById(id);
const data = readJson(mapPath(id));
// the stops each run booked in Python's hash order, booked where it booked them (as the page does)
const reference = readJson(referencePath(id));
const scenario = loadScenario(data);
const network = describe(data, map);
for (const variant of VARIANTS) {
const malf = variant === "malfunctions";
const controllers = {
  baseline: () => new OrderedController(),
  optimized: () => new ReplayController(readJson(planPath(id, variant)), "optimized")
};
const record = malf ? reference.malfunctions.runs : reference.runs;
const draws = malf ? readJson(malfunctionsPath(id)).draws : null;

for (const r of RUNS.filter((x) => map.runs.includes(x.id))) {
  const run = simulate(scenario, controllers[r.id](), { bookings: record[r.id].bookings, malfunctions: draws });
  const page = runFacts(run, scenario);
  const py = traceFacts(r.id, data, id, variant);
  const tag = `${id} ${r.id}${malf ? " with malfunctions" : ""}`;
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
    ["trains late at their destination (trains, steps)", [page.lateTrains, page.lateSteps], [py.lateTrains, py.lateSteps]],
    ["breakdowns", page.breakdowns, py.breakdowns],
    ["first breakdown (step, train, steps, before entering)", page.firstBreakdown && [page.firstBreakdown.step, page.firstBreakdown.train, page.firstBreakdown.steps, page.firstBreakdown.offMap], py.firstBreakdown && [py.firstBreakdown.step, py.firstBreakdown.train, py.firstBreakdown.steps, py.firstBreakdown.offMap]],
    ["first breakdown on the network (step, train, steps)", page.firstBreakdownOnMap && [page.firstBreakdownOnMap.step, page.firstBreakdownOnMap.train, page.firstBreakdownOnMap.steps], py.firstBreakdownOnMap && [py.firstBreakdownOnMap.step, py.firstBreakdownOnMap.train, py.firstBreakdownOnMap.steps]],
    ["train-steps broken down", page.brokenSteps, py.brokenSteps],
    ["the train broken down most often (train, times)", page.mostBroken && [page.mostBroken.train, page.mostBroken.count], py.mostBroken && [py.mostBroken.train, py.mostBroken.count]]
  ];
  if (malf) {
    check(py.breakdowns > 0, `${tag}: the Python run with malfunctions has breakdowns (${py.breakdowns})`);
    // Every breakdown the Events tab lists (js/sim.js): its step, train, length, and where it happened
    // (before entering, on a platform of the stop the train calls at, or elsewhere), as the trace has it.
    const where = (offMap, stop) => (offMap ? "before entering" : stop > 0 ? `stop ${stop}` : "on the line");
    const pageList = run.events.filter((e) => e.kind === "breakdown").map((e) => [e.step, e.train, e.steps, where(e.offMap, e.onPlatform)]);
    const pyList = py.breakdownList.map((x) => [x.step, x.train, x.steps, where(x.offMap, x.stop)]);
    const firstDiff = pyList.findIndex((x, j) => !same(x, pageList[j]));
    const atStops = pyList.filter((x) => x[3].startsWith("stop")).length;
    check(pageList.length === pyList.length && firstDiff < 0,
      `${tag}: every breakdown in the events (${pageList.length}; ${atStops} of them at a stop's platform) is the trace's: step, train, length and place${firstDiff >= 0 ? `; first difference: page ${JSON.stringify(pageList[firstDiff])}, Python ${JSON.stringify(pyList[firstDiff])}` : ""}`);
  }
  for (const [what, a, b] of pairs) check(same(a, b), `${tag}: ${what}: page ${JSON.stringify(a)}, Python ${JSON.stringify(b)}`);

  // The moments: each step and train as the trace has it.
  const list = moments(run, scenario, network, page);
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
    // the longest wait at an entry, when it lasts 100 steps or more: at the step the train enters
    ["wait", py.longestWait.wait >= 100 ? { step: Math.min(py.entered[py.longestWait.train] ?? py.steps, py.steps), train: py.longestWait.train } : null],
    ["all-arrived", py.arrived === py.n ? { step: py.lastArrival, train: py.arrival.indexOf(py.lastArrival) } : null],
    // the first breakdown on the network, the first to see on the map (else the first of all)
    ["breakdown", (py.firstBreakdownOnMap || py.firstBreakdown) && { step: (py.firstBreakdownOnMap || py.firstBreakdown).step, train: (py.firstBreakdownOnMap || py.firstBreakdown).train }],
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
  // With malfunctions: wherever no gridlock, no arrival of all and fewer than two blocked trains say
  // more, the map says how many trains stand broken down on the network, as Python's states count them.
  if (malf) {
    let said = 0;
    let wrong = null;
    for (let t = 1; t <= py.steps && !wrong; t += 1) {
      const s = situation(run, scenario, page, t);
      const tone = s?.tone;
      if (tone === "danger" || tone === "success") continue;
      const k = py.brokenOnMap[t];
      if (k > 0) {
        const want = `${k} ${k === 1 ? "train" : "trains"} broken down on the network`;
        if (!s || s.text !== want || s.tone !== "broken") wrong = `step ${t}: "${s?.text}", Python has ${k} broken down`;
        said += 1;
      } else if (s && s.tone === "broken") wrong = `step ${t}: "${s.text}", Python has none broken down`;
    }
    check(!wrong && said > 0, `${tag}: the map's line counts the trains broken down on the network as Python does, at ${said} steps${wrong ? `; ${wrong}` : ""}`);
    // The moment: the train, where it breaks down (the station whose platform it stands on, as the
    // trace has it, or between stations), for how long, and the run's breakdowns in all.
    const m = at("breakdown");
    const b = py.firstBreakdownOnMap;
    const where = b ? (b.stop > 0 ? ` at ${network.stationName(network.trains[b.train].stops[b.stop])}` : " between stations") : " before it enters the network";
    const want = b
      ? `${network.trains[b.train].name} breaks down${where} and stands where it is for ${b.steps} steps. In all ${py.breakdowns.toLocaleString("en-US")} breakdowns hit the run's trains${py.firstBreakdown !== b ? ", the first of them while trains still waited to enter" : ""}:`
      : `${network.trains[py.firstBreakdown.train].name} breaks down${where} and cannot enter for ${py.firstBreakdown.steps} steps.`;
    check(m && m.title === (b ? "The first breakdown on the network" : "The first breakdown") && m.text.startsWith(want), `${tag}: the breakdown's moment says "${want}" (${m?.text.slice(0, 160)}…)`);
  } else {
    check(!page.breakdowns && !list.some((m) => m.kind === "breakdown"), `${tag}: no breakdown without malfunctions`);
  }
}
}
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) { console.log(`\n${failed} of ${results.length} story check(s) failed.`); process.exit(1); }
console.log(`\nAll ${results.length} story checks agree with the Python traces.\nSTORY_FACTS_OK maps=${maps.join(",")}`);
