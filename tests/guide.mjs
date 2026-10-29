// The guide's figures against their sources: the scenario file (trains, kinds and speeds, stations,
// stops, grid, crossings, the example timetable and its line), the challenge's penalty rules as its
// own Python code sets them and the floor no dispatcher can beat, computed on flatland's own rail
// (tests/fixtures/rules.json, written by tools/export_fixtures.py and tools/score_floor.py), and the
// runs as the Python runner traced them (tests/lib/trace-facts.mjs): when each penalty is booked,
// trains turning round at the Hauptbahnhof. Each figure must also appear in the guide's text as
// stated.
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
says(`${named.length - 1} more named stations and ${stationIds.length - named.length} smaller ones without a name`, "named and numbered stations");
const numbered = network.stations.filter((st) => st.name.startsWith("Stop "));
check(numbered.every((st) => st.name === `Stop ${st.id}` && data.stations.some((x) => x.id === st.id)), "every station without a name is labelled by its number in the scenario file");
const nums = numbered.map((st) => st.id).sort((x, y) => x - y);
says(`between Stop ${nums[0]} and Stop ${nums[nums.length - 1]}`, "the numbered stations' range");
const stops = data["flatland line"].agent_positions.reduce((s, p) => s + p.length - 1, 0);
check(F.stops === stops, `stops: ${F.stops} (file ${stops})`);
says(`${stops} stops to serve`, "the number of stops");
check(F.width === data.gridDimensions.cols && F.height === data.gridDimensions.rows, `grid ${F.width} × ${F.height} (file ${data.gridDimensions.cols} × ${data.gridDimensions.rows})`);
says(`${data.gridDimensions.cols} × ${data.gridDimensions.rows} cells`, "the grid");
check(F.levelFree === data.overpasses.length, `level-free crossings: ${F.levelFree} (file ${data.overpasses.length})`);
says(`${data.overpasses.length} times in Neu-Frankfurt`, "level-free crossings");
check(F.steps === data["flatland timetable"].max_episode_steps, `steps: ${F.steps}`);
says(`after ${fmt(data["flatland timetable"].max_episode_steps)} steps`, "the episode's length");

// The example timetable, row by row, from the file; its name, read from its line.
const ex = F.example;
const tt = data["flatland timetable"];
const sched = data.schedules[ex.train];
check(ex.name === sched.name.replace(/_/g, " "), `the example is ${ex.name}`);
const line = data.lines.find((l) => l.id === sched.lineId);
const [from, to] = [line.name.split("-")[0], line.name.split("-").slice(-1)[0]];
check(ex.rows[0].station === from && ex.rows[ex.rows.length - 1].station === to, `the example runs on the line ${line.name}, from ${from} to ${to}`);
says(`${ex.name} is a regional train from ${from} to ${to}`, "the example's name explained");
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
says(`a lost stop, for example, costs ${fmt(P.intermediate_not_served_penalty / rules.max_episode_steps, 1)} × ${fmt(rules.max_episode_steps)} = ${fmt(P.intermediate_not_served_penalty, 1)} points`, "the penalties' scale");
says(`every step later costs ${P.intermediate_late_arrival_penalty_factor} points, ${rules.target_late_per_step} at the destination`, "lateness beside the timetable");
says(`every step earlier costs ${P.intermediate_early_departure_penalty_factor}`, "early departure beside the timetable");

// Speeds as the scenario gives them, and how trains change speed (the loader's settings).
const givenOf = (kind) => data["flatland line"].agent_speeds[data.schedules.findIndex((x) => classes.get(x.trainClassId).name === kind)];
says(`The scenario gives RBs ${givenOf("RB")} of a cell per step and S-Bahns ${givenOf("S-Bahn")}`, "the speeds before rounding");
check(F.accel === rules.acceleration_delta && F.brake === -rules.braking_delta, `speeding up ${F.accel} and braking ${F.brake} per step, as the loader sets them (${rules.acceleration_delta}, ${rules.braking_delta})`);
says(`a train gains ${rules.acceleration_delta} of a cell per step`, "speeding up");
says(`braking takes ${-rules.braking_delta} off per step`, "braking");
// A collision: booked once, when a moving train is brought to a halt without being told to stop.
for (const name of ["baseline", "estimate", "optimized"]) {
  const fx = readJson(`tests/fixtures/trace_${name}.json`);
  const rows = [fx.initial, ...fx.trace];
  const booked = new Set(fx.terms.filter((x) => x[2] === "collision").map((x) => `${x[0]}:${x[1]}`));
  const halted = new Set();
  for (let t = 1; t < rows.length; t += 1) {
    for (let i = 0; i < rows[t].state.length; i += 1) if (rows[t - 1].state[i] === 3 && rows[t].state[i] === 4 && fx.actions[t - 1][i] !== 4) halted.add(`${t}:${i}`);
  }
  check(booked.size === halted.size && [...booked].every((k) => halted.has(k)), `${name}: each of its ${booked.size} collisions is a moving train halted without a stop command, once`);
}
says(`It costs ${fmt(P.crash_penalty_factor)} × the train's speed (${fmt(P.crash_penalty_factor)} points for an RB or ICE at full speed, ${fmt(P.crash_penalty_factor * kinds["S-Bahn"].speed)} for an S-Bahn), once each time a moving train is stopped this way`, "a collision's cost");
// Names: two places, from one to the other; one place, a round trip to the Hauptbahnhof and back.
const places = (x) => x.name.split("_").slice(1, -1);
const stationsOf = (x) => x.stops.map((st) => st.stationId);
// the short forms the guide explains, and the stations the other places name (the scenario's names)
const placeIds = { Hbf: [1], FF: [2, 3], Of: [8] };
for (const st of named) placeIds[st.name.split(" ")[0]] = placeIds[st.name.split(" ")[0]] || [st.id];
const oneWay = data.schedules.filter((x) => places(x).length >= 2);
const round = data.schedules.filter((x) => places(x).length === 1);
check(round.every((x) => stationsOf(x)[0] === stationsOf(x).slice(-1)[0] && stationsOf(x).includes(1) && placeIds[places(x)[0]].includes(stationsOf(x)[0])), `every train named after one place is a round trip from there through the Hauptbahnhof (${round.map((x) => x.name).join(", ")})`);
check(oneWay.every((x) => placeIds[places(x)[0]]?.includes(stationsOf(x)[0]) && placeIds[places(x).slice(-1)[0]]?.includes(stationsOf(x).slice(-1)[0])), `every train named after several places runs from the first to the last (${oneWay.length} trains)`);
check(round.some((x) => x.name.replace(/_/g, " ") === F.roundTrip.name), `the guide's example of a one-place name, ${F.roundTrip.name}, is one of them`);
says(`A name with one place, like ${F.roundTrip.name}, is a round trip from there to the Hauptbahnhof and back`, "one-place names");

// The floor: the page's own computation (js/floor.js) against flatland's rail (tools/score_floor.py).
check(Math.abs(F.floor.total - rules.floor.total) < 1e-9 && F.floor.perTrain.every((v, i) => Math.abs(v - rules.floor.per_train[i]) < 1e-9),
  `the floor: the page's ${F.floor.total} (${F.floor.perTrain.filter((v) => v).join(" + ")}) equals flatland's ${rules.floor.total}`);
const slowest = rules.floor.per_train.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
check(slowest.length === 2 && slowest.every((x) => classes.get(data.schedules[x.i].trainClassId).name === "S-Bahn"), `only two trains, both S-Bahns, are bound to lose points (${slowest.map((x) => data.schedules[x.i].name).join(", ")})`);
says(`each loses at least ${fmt(Math.min(...slowest.map((x) => x.v)))} points`, "each slow S-Bahn's least loss");
says(`No dispatcher can score better than −${fmt(rules.floor.total)}`, "the floor");
check(-py.optimized.score >= rules.floor.total, `the optimized run (${py.optimized.score}) does not beat the floor (−${rules.floor.total})`);
for (const x of slowest) check(-py.optimized.perTrain[x.i] >= x.v, `${data.schedules[x.i].name} loses ${-py.optimized.perTrain[x.i]} in the optimized run, at least its floor ${x.v}`);

// When points count: a collision at once, a train's stops and delay when it arrives (or at the end).
for (const name of ["baseline", "estimate", "optimized"]) {
  const fx = readJson(`tests/fixtures/trace_${name}.json`);
  const f = py[name];
  const wrong = fx.terms.filter(([step, agent, kind]) => kind !== "collision" && step !== (f.arrival[agent] ?? f.steps));
  const late = fx.terms.filter(([step, agent, kind]) => kind === "collision" && f.arrival[agent] !== null && step > f.arrival[agent]);
  check(!wrong.length && !late.length, `${name}: every stop and delay term is booked at its train's arrival or at the end, collisions on the way (${wrong.length + late.length} exceptions)`);
}
says("A collision counts at once. A train's stops and its delay count when it reaches its destination, or when the episode ends", "when points count");

// The Hauptbahnhof is a terminus: trains that call there turn round on its platforms.
const hbf = new Set(data.stations.filter((x) => x.id === 1).map((x) => `${x.r},${x.c}`));
const turners = new Set();
for (const name of ["baseline", "estimate", "optimized"]) {
  const fx = readJson(`tests/fixtures/trace_${name}.json`);
  const rows = [fx.initial, ...fx.trace];
  for (let t = 1; t < rows.length; t += 1) {
    rows[t].pos.forEach((p, i) => {
      const q = rows[t - 1].pos[i];
      if (p && q && (hbf.has(`${p[0]},${p[1]}`) || hbf.has(`${q[0]},${q[1]}`)) && (rows[t].dir[i] - rows[t - 1].dir[i] + 4) % 4 === 2) turners.add(i);
    });
  }
}
check(turners.size >= 5, `trains turn round on the Hauptbahnhof's platforms in the Python runs (${turners.size} trains)`);
says("the Hauptbahnhof is a terminus, so trains that call there reverse", "reversing at the Hbf");
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
