// The guide's figures against their sources: the scenario file (trains, kinds and speeds, stations,
// stops, grid, crossings, the example timetable), the challenge's penalty rules as its own Python
// code sets them (tests/fixtures/rules.json) and the runs as the Python runner traced them
// (tests/lib/trace-facts.mjs). Each figure must also appear in the guide's text as stated.
// Usage: node tests/guide.mjs
import { loadScenario } from "../js/engine/env.js";
import { simulate } from "../js/sim.js";
import { describe } from "../js/network.js";
import { chapters, guideFacts } from "../js/guide-content.js";
import { OrderedController } from "../js/controllers/ordered.js";
import { ReplayController } from "../js/controllers/replay.js";
import { readJson, traceFacts } from "./lib/trace-facts.mjs";

const data = readJson("data/neufrankfurt_19agents.json");
const rules = readJson("tests/fixtures/rules.json");
const scenario = loadScenario(data);
const network = describe(data);
const runs = new Map([
  ["baseline", simulate(scenario, new OrderedController())],
  ["estimate", simulate(scenario, new ReplayController(readJson("data/estimate_actions.json"), "estimate"))],
  ["optimized", simulate(scenario, new ReplayController(readJson("data/planner_actions.json"), "optimized"))]
]);
const F = guideFacts({ scenario, network, runs });
const text = chapters(F).map((c) => [c.title, c.lead, JSON.stringify(c.blocks)].join(" ")).join(" ");
const py = { baseline: traceFacts("baseline", data), estimate: traceFacts("estimate", data), optimized: traceFacts("optimized", data) };

const results = [];
const check = (ok, what) => results.push([ok, what]);
const fmt = (v, digits = 0) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v).replace("-", "−");
const says = (s, what) => check(text.includes(s), `the guide says "${s}" (${what})`);

// The scenario file.
const classes = new Map(data.trainClasses.map((c) => [c.id, c]));
const pyRound = (x) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };
const kinds = {};
data.schedules.forEach((s, i) => {
  const c = classes.get(s.trainClassId);
  kinds[c.name] = kinds[c.name] || { count: 0, speed: 1 / pyRound(1 / data["flatland line"].agent_speeds[i]) };
  kinds[c.name].count += 1;
});
check(F.trains === data.schedules.length, `trains: ${F.trains} (file ${data.schedules.length})`);
says(`${data.schedules.length} trains`, "the number of trains");
for (const k of F.kinds) check(kinds[k.kind] && kinds[k.kind].count === k.count && kinds[k.kind].speed === k.speed, `${k.kind}: ${k.count} trains at ${k.speed} cells a step (file: ${JSON.stringify(kinds[k.kind])})`);
says(`${kinds.RB.count} regional trains (RB), ${kinds.ICE.count} ICEs and ${kinds["S-Bahn"].count} S-Bahns`, "trains by kind");
check(kinds.ICE.speed === 1 && kinds.RB.speed === 1 && kinds["S-Bahn"].speed === 0.5, "speeds: ICE and RB one cell a step, the S-Bahn one every second step (after flatland rounds 0.8 and 0.6)");
says("one cell every second step", "the S-Bahn's pace");
const stationIds = [...new Set(data.stations.map((s) => s.id))];
check(F.stations === stationIds.length, `stations: ${F.stations} (file ${stationIds.length})`);
says(`Neu-Frankfurt has ${stationIds.length}:`, "the number of stations");
const lineNames = data.lines.map((l) => l.name.toLowerCase()).join(" ");
const named = network.stations.filter((s) => !s.name.startsWith("Stop "));
const fromLines = named.filter((s) => s.name === "Hauptbahnhof" ? /hbf/.test(lineNames) : lineNames.includes(s.name.split(" ")[0].toLowerCase().slice(0, 4)));
check(fromLines.length === named.length, `every named station is named after a line (${named.map((s) => s.name).join(", ")})`);
says(`${named.length - 1} more named stations and ${stationIds.length - named.length} numbered stops`, "named and numbered stations");
const stops = data["flatland line"].agent_positions.reduce((s, p) => s + p.length - 1, 0);
check(F.stops === stops, `stops: ${F.stops} (file ${stops})`);
says(`${stops} stops to serve`, "the number of stops");
check(F.width === data.gridDimensions.cols && F.height === data.gridDimensions.rows, `grid ${F.width} × ${F.height} (file ${data.gridDimensions.cols} × ${data.gridDimensions.rows})`);
says(`${data.gridDimensions.cols} × ${data.gridDimensions.rows} cells`, "the grid");
check(F.levelFree === data.overpasses.length, `level-free crossings: ${F.levelFree} (file ${data.overpasses.length})`);
says(`${data.overpasses.length} times in Neu-Frankfurt`, "level-free crossings");
check(F.steps === data["flatland timetable"].max_episode_steps, `steps: ${F.steps}`);
says(`after ${fmt(data["flatland timetable"].max_episode_steps)} steps`, "the episode's length");

// The example timetable, row by row, from the file.
const ex = F.example;
const tt = data["flatland timetable"];
const sched = data.schedules[ex.train];
check(ex.name === sched.name.replace(/_/g, " "), `the example is ${ex.name}`);
ex.rows.forEach((r, k) => {
  const la = k === 0 ? null : tt.latest_arrivals[ex.train][k];
  const ed = k === ex.rows.length - 1 ? null : tt.earliest_departures[ex.train][k];
  check(r.arriveBy === la && r.leaveFrom === ed, `example row ${k + 1}, ${r.station}: arrive by ${r.arriveBy}, leave from ${r.leaveFrom} (file ${la}, ${ed})`);
});

// The penalties, as the challenge's code sets them.
const P = rules.balanced;
const pairs = [
  ["collision", F.penalty.crash, P.crash_penalty_factor, `${fmt(P.crash_penalty_factor)} × speed`],
  ["stop not served", F.penalty.notServed, P.intermediate_not_served_penalty, fmt(P.intermediate_not_served_penalty, 1)],
  ["cancellation factor", F.penalty.cancellationFactor, P.cancellation_factor, `${fmt(P.cancellation_factor)} × (trip + ${fmt(P.cancellation_time_buffer, 1)})`],
  ["cancellation buffer", F.penalty.cancellationBuffer, P.cancellation_time_buffer, null],
  ["late at a stop", F.penalty.lateArrival, P.intermediate_late_arrival_penalty_factor, `${P.intermediate_late_arrival_penalty_factor} per step`],
  ["leaving early", F.penalty.earlyDeparture, P.intermediate_early_departure_penalty_factor, `${P.intermediate_early_departure_penalty_factor} per step`]
];
for (const [what, mine, theirs, stated] of pairs) {
  check(Math.abs(mine - theirs) < 1e-9, `${what}: ${mine} (challenge ${theirs})`);
  if (stated) says(stated, what);
}
says(`${rules.target_late_per_step} per step`, "late at the destination");
says(`serves none of the ${stops} stops still loses ${fmt(stops * P.intermediate_not_served_penalty, 1)} points`, "all stops lost");
says(`${fmt(Math.round(P.intermediate_not_served_penalty))} steps late`, "a stop against a late arrival");
says(fmt(-37374), "the leaderboard's best");

// The runs, as the Python runner traced them.
const b = py.baseline;
const e = py.estimate;
const o = py.optimized;
says(`${b.collisions} collisions. From step ${b.gridlockFrom} on, ${b.stuck} trains block each other`, "the baseline's collisions and gridlock");
says(`${b.arrived} of ${b.n} trains arrive`, "the baseline's arrivals");
check(b.served === 0, "the baseline serves no stop");
says("not a single stop is served", "the baseline's stops");
says(fmt(b.score, 1), "the baseline's score");
check(e.arrived === e.n && e.collisions === 0 && e.gridlockFrom === null, `the estimate: every train arrives (${e.arrived}), no collision (${e.collisions}), no gridlock`);
says(`all ${e.n} trains arrive. All ${e.stops} stops are lost (${fmt(e.passed * P.intermediate_not_served_penalty, 1)} points)`, "the estimate's stops");
says(`up to ${e.longestWait.wait} steps at their entry`, "the estimate's longest wait");
says(`${fmt(e.lateSteps)} steps late in all`, "the estimate's late arrivals");
says(fmt(e.score, 1), "the estimate's score");
says(`All ${o.n} trains arrive by step ${o.lastArrival} and all ${o.served} stops are served`, "the optimized run");
says(fmt(o.score, 1), "the optimized score");
// The two S-Bahns: their trip at full speed through all their stations (the estimate drives exactly
// that, without halting) takes longer than their timetable allows; they carry nearly all of the
// optimized run's points.
const sb = data.schedules.map((s, i) => i).filter((i) => classes.get(data.schedules[i].trainClassId).name === "S-Bahn");
const tight = sb.filter((i) => e.arrival[i] - e.entered[i] > e.timetables[i].la - e.timetables[i].ed);
check(JSON.stringify(tight) === JSON.stringify(F.tight), `S-Bahns whose trip is longer than their timetable allows: ${tight.join(", ")} (guide: ${F.tight.join(", ")})`);
const sbPoints = -tight.reduce((s, i) => s + o.perTrain[i], 0);
says(`${fmt(sbPoints)} of the ${fmt(-o.score)} points left come from the two S-Bahns`, "the S-Bahns' share of the optimized run");

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) { console.log(`\n${failed} of ${results.length} guide check(s) failed.`); process.exit(1); }
console.log(`\nAll ${results.length} figures in the guide agree with their sources.\nGUIDE_FACTS_OK`);
