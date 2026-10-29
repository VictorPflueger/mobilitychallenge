// The guide's figures against their sources, on every map: the scenario file (trains, kinds and
// speeds, stations, stops, grid, crossings, the example timetable and its line), the challenge's
// penalty rules as its own Python code sets them and the floor no dispatcher can beat, computed on
// flatland's own rail (tests/fixtures/<map>/rules.json, written by tools/export_fixtures.py and
// tools/score_floor.py), the runs as the Python runner traced them (tests/lib/trace-facts.mjs):
// when each penalty is booked, trains turning round at Neu-Frankfurt's Hauptbahnhof, Köln's trains
// done as they enter and the trains its planner leaves out; and the leaderboard's figure from the
// project brief, the same on both maps. Each figure must also appear in the guide's text as stated.
// Usage: node tests/guide.mjs [frankfurt|koeln]
import { loadScenario } from "../js/engine/env.js";
import { simulate } from "../js/sim.js";
import { describe } from "../js/network.js";
import { chapters, guideFacts } from "../js/guide-content.js";
import { RUNS } from "../js/runs.js";
import { mapById } from "../js/maps.js";
import { OrderedController } from "../js/controllers/ordered.js";
import { ReplayController } from "../js/controllers/replay.js";
import { readJson, traceFacts } from "./lib/trace-facts.mjs";
import { MAP_IDS, fixturePath, mapPath, planPath, referencePath } from "./lib/maps.mjs";

const results = [];
const check = (ok, what) => results.push([ok, what]);
const fmt = (v, digits = 0) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v).replace("-", "−");
// an amount as the guide writes it in running text: as exact as it is, without a needless ".0"
const amt = (v) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v).replace("-", "−");
const pyRound = (x) => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };

/** One map's guide as the page builds it, and its sources. */
function setup(id) {
  const map = mapById(id);
  const data = readJson(mapPath(id));
  const rules = readJson(fixturePath(id, "rules.json"));
  const scenario = loadScenario(data);
  const network = describe(data, map);
  const runList = RUNS.filter((r) => map.runs.includes(r.id));
  const reference = readJson(referencePath(id));
  const runs = new Map(runList.map((r) => [r.id, simulate(scenario, r.id === "baseline" ? new OrderedController() : new ReplayController(readJson(planPath(id)), r.id), { bookings: reference.runs[r.id].bookings })]));
  const F = guideFacts({ map, runList, scenario, network, runs });
  const text = chapters(F).map((c) => [c.nav, c.title, c.lead, JSON.stringify(c.blocks)].join(" ")).join(" ");
  const py = Object.fromEntries(runList.map((r) => [r.id, traceFacts(r.id, data, id)]));
  const says = (str, what) => check(text.includes(str), `${id}: the guide says "${str}" (${what})`);
  const traces = Object.fromEntries(runList.map((r) => [r.id, readJson(fixturePath(id, `trace_${r.id}.json`))]));
  return { id, map, data, rules, scenario, network, runList, runs, F, text, py, says, traces };
}

// The leaderboard's current best, as the project brief gives it (October 2026): not simulated, and
// shown on both maps as the target to beat.
const BRIEF_BEST = -37374;

/** On every map: the brief's figure, where it comes from, and the results it stands among. */
function checkLeaderboard({ id, F, runList, says }) {
  check(F.leaderboard === BRIEF_BEST, `${id}: the guide measures the runs against the brief's ${fmt(BRIEF_BEST)} (${F.leaderboard})`);
  says(`The best score on the challenge's leaderboard (October 2026) is ${fmt(BRIEF_BEST)}: the target to beat`, "the leaderboard's best in the first chapter");
  says(`The best on the leaderboard: ${fmt(BRIEF_BEST)}`, "the leaderboard's best in the score chapter");
  says("as the project brief gives it", "where the figure comes from");
  says("the page shows it on both maps as the target to beat", "the same figure on both maps");
  says("From the project brief, not simulated", "the figure is not simulated");
  check(runList.length === 2, `${id}: two runs, the baseline and the optimized run (${runList.map((r) => r.id).join(", ")})`);
  says("Three results", "three results: the two runs and the leaderboard's figure");
}

function checkFrankfurt({ data, rules, network, F, text, py, says, traces }) {
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
for (const name of Object.keys(traces)) {
  const fx = traces[name];
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
for (const name of Object.keys(traces)) {
  const fx = traces[name];
  const f = py[name];
  const wrong = fx.terms.filter(([step, agent, kind]) => kind !== "collision" && step !== (f.arrival[agent] ?? f.steps));
  const late = fx.terms.filter(([step, agent, kind]) => kind === "collision" && f.arrival[agent] !== null && step > f.arrival[agent]);
  check(!wrong.length && !late.length, `${name}: every stop and delay term is booked at its train's arrival or at the end, collisions on the way (${wrong.length + late.length} exceptions)`);
}
says("A collision counts at once. A train's stops and its delay count when it reaches its destination, or when the episode ends", "when points count");

// The Hauptbahnhof is a terminus: trains that call there turn round on its platforms.
const hbf = new Set(data.stations.filter((x) => x.id === 1).map((x) => `${x.r},${x.c}`));
const turners = new Set();
for (const name of Object.keys(traces)) {
  const fx = traces[name];
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

// The runs, as the Python runner traced them.
const b = py.baseline;
const o = py.optimized;
says(`${b.collisions} collisions. From step ${b.gridlockFrom} on, ${b.stuck} trains block each other`, "the baseline's collisions and gridlock");
says(`${b.arrived} of ${b.n} trains arrive`, "the baseline's arrivals");
check(b.served === 0, "the baseline serves no stop");
says("not a single stop is served", "the baseline's stops");
says(fmt(b.score, 1), "the baseline's score");
says(`All ${o.n} trains arrive by step ${o.lastArrival} and all ${o.served} stops are served`, "the optimized run");
says(fmt(o.score, 1), "the optimized score");
// The two S-Bahns the floor holds back (flatland's rail, above): their trip at full speed through all
// their stations, without halting, takes longer than their timetable allows; they carry nearly all
// of the optimized run's points.
const slowSBahns = slowest.map((x) => x.i);
check(JSON.stringify(slowSBahns) === JSON.stringify(F.slowSBahns), `S-Bahns too slow for their timetables on flatland's rail: ${slowSBahns.join(", ")} (guide: ${F.slowSBahns.join(", ")})`);
const sbPoints = -slowSBahns.reduce((s, i) => s + o.perTrain[i], 0);
says(`${fmt(sbPoints)} of the ${fmt(-o.score)} points left come from the two S-Bahns ${slowSBahns.map((i) => data.schedules[i].name.replace(/_/g, " ")).join(" and ")}: even at full speed their trip takes longer than their timetable allows`, "the S-Bahns' share of the optimized run");
}

function checkKoeln({ data, rules, network, F, text, py, says, traces }) {
  // The scenario file: trains, kinds and speeds.
  const classes = new Map(data.trainClasses.map((c) => [c.id, c]));
  const kindOf = (i) => classes.get(data.schedules[i].trainClassId).name;
  const kinds = {};
  data.schedules.forEach((x, i) => {
    const k = kindOf(i);
    kinds[k] = kinds[k] || { count: 0, given: data["flatland line"].agent_speeds[i], speed: 1 / pyRound(1 / data["flatland line"].agent_speeds[i]) };
    kinds[k].count += 1;
  });
  check(F.trains === data.schedules.length, `koeln: trains: ${F.trains} (file ${data.schedules.length})`);
  says(`${data.schedules.length} trains`, "the number of trains");
  for (const k of F.kinds) check(kinds[k.kind] && kinds[k.kind].count === k.count && kinds[k.kind].speed === k.speed, `koeln: ${k.kind}: ${k.count} trains at ${k.speed} cells a step (file: ${JSON.stringify(kinds[k.kind])})`);
  const lineOf = (i) => data.lines.find((l) => l.id === data.schedules[i].lineId).name;
  const prefixes = { "High-Speed": ["ICE"], Express: ["IC_", "Panorama"], Local: ["RB_", "S_"] };
  for (const [k, pre] of Object.entries(prefixes)) {
    const lines = data.schedules.map((x, i) => i).filter((i) => kindOf(i) === k).map(lineOf);
    check(lines.length && lines.every((l) => pre.some((p) => l.startsWith(p))), `koeln: every ${k} train runs on a line named ${pre.join(" or ")}… (${[...new Set(lines)].join(", ")})`);
  }
  says(`${kinds.Local.count} local trains (the RB and S lines), ${kinds.Express.count} express trains (the IC and Panorama lines) and ${kinds["High-Speed"].count} high-speed trains (the ICE lines)`, "trains by kind");
  check(kinds["High-Speed"].speed === 1 && kinds.Express.speed === 1 && kinds.Local.speed === 0.5, "koeln: speeds: high-speed and express one cell a step, local one every second step (after flatland rounds 0.8 and 0.6)");
  says("one cell every second step", "the local trains' pace");
  says(`The scenario gives express trains ${kinds.Express.given} of a cell per step and local trains ${kinds.Local.given}`, "the speeds before rounding");
  says("express trains run as fast as high-speed trains, one cell per step, and local trains take two steps per cell", "the speeds after rounding");

  // Stations: named after the places in the line names, the others numbered; the hub.
  const stationIds = [...new Set(data.stations.map((x) => x.id))];
  check(F.stations === stationIds.length, `koeln: stations: ${F.stations} (file ${stationIds.length})`);
  says(`Köln has ${stationIds.length}:`, "the number of stations");
  const named = network.stations.filter((x) => !x.name.startsWith("Stop "));
  const endsAt = (st) => data.lines.filter((l) => l.stationIds[l.stationIds.length - 1] === st.id).map((l) => l.name.toLowerCase());
  const fromLines = named.filter((st) => endsAt(st).some((l) => l.includes(st.name.split(" ")[0].toLowerCase()) && (st.name.includes("(branch line)") ? l.includes("neben") : !l.includes("neben") || st.name === "Essen")));
  check(fromLines.length === named.length && named.length === 3, `koeln: every named station is the end of a line named after it (${named.map((x) => `${x.name}: ${endsAt(x).join("/")}`).join("; ")})`);
  says(`${named.length} named after the places in its line names (${named.map((x) => x.name).join(", ")}) and ${stationIds.length - named.length} without a name`, "named and numbered stations");
  const numbered = network.stations.filter((x) => x.name.startsWith("Stop "));
  check(numbered.every((x) => x.name === `Stop ${x.id}`), "koeln: every station without a name is labelled by its number in the scenario file");
  const nums = numbered.map((x) => x.id).sort((a, b) => a - b);
  says(`between Stop ${nums[0]} and Stop ${nums[nums.length - 1]}`, "the numbered stations' range");
  const linesAt = new Map();
  for (const l of data.lines) for (const st of new Set(l.stationIds)) linesAt.set(st, (linesAt.get(st) || 0) + 1);
  const [hubId, hubLines] = [...linesAt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  check(F.hub.id === hubId && F.hub.lines === hubLines, `koeln: the hub is Stop ${hubId}, called at by ${hubLines} of ${data.lines.length} lines (guide: Stop ${F.hub.id}, ${F.hub.lines})`);
  says(`Stop ${hubId} is the hub: ${hubLines} of the ${data.lines.length} lines call there`, "the hub");
  says(`the hub where ${hubLines} of its ${data.lines.length} lines meet`, "the hub in the network's caption");
  says("The file of the Köln map mentions only Essen and Frankfurt, in its line names", "the only places the file names");
  check(!/k(ö|oe)ln|cologne/i.test(JSON.stringify(data)), "koeln: the file itself names no Köln (the map's name comes from the challenge's final)");
  // "The larger of the two maps": more trains and more cells than Neu-Frankfurt's file. (That the
  // final ran on Frankfurt and Köln is the whitepaper's, js/maps.js; it cannot be computed.)
  const other = readJson(mapPath("frankfurt"));
  const cells = (d) => d.gridDimensions.rows * d.gridDimensions.cols;
  check(data.schedules.length > other.schedules.length && cells(data) > cells(other), `koeln: larger than Neu-Frankfurt: ${data.schedules.length} trains and ${cells(data)} cells, against ${other.schedules.length} and ${cells(other)}`);
  says("Köln, the larger of the two maps in the challenge's final", "the map in the network's caption");

  // Stops, grid, crossings, steps.
  const stops = data["flatland line"].agent_positions.reduce((t, p) => t + p.length - 1, 0);
  check(F.stops === stops, `koeln: stops: ${F.stops} (file ${stops})`);
  says(`${stops} stops to serve`, "the number of stops");
  says(`${data.gridDimensions.cols} × ${data.gridDimensions.rows} cells`, "the grid");
  check(F.levelFree === data.overpasses.length, `koeln: level-free crossings: ${F.levelFree} (file ${data.overpasses.length})`);
  says(`${data.overpasses.length} times in Köln`, "level-free crossings");
  says(`after ${fmt(data["flatland timetable"].max_episode_steps)} steps`, "the episode's length");

  // The example timetable: the first local train with a single stop, row by row from the file.
  const ex = F.example;
  const first = data.schedules.findIndex((x, i) => kindOf(i) === "Local" && x.stops.length === 3);
  check(ex.train === first && ex.name === data.schedules[first].name.replace(/_/g, " "), `koeln: the example is the first local train with one stop: ${ex.name}`);
  const tt = data["flatland timetable"];
  ex.rows.forEach((r, k) => {
    const la = k === 0 ? null : tt.latest_arrivals[ex.train][k];
    const ed = k === ex.rows.length - 1 ? null : tt.earliest_departures[ex.train][k];
    check(r.arriveBy === la && r.leaveFrom === ed, `koeln: example row ${k + 1}, ${r.station}: arrive by ${r.arriveBy}, leave from ${r.leaveFrom} (file ${la}, ${ed})`);
  });
  says(`${ex.name} runs on the line ${lineOf(first)}, from ${ex.rows[0].station} to ${ex.rows[ex.rows.length - 1].station}`, "the example's line");

  // Names: ICE lines lead to Essen and Frankfurt; most others carry a compass point; the S-Bahn loops.
  const iceLines = data.lines.filter((l) => l.name.startsWith("ICE"));
  check(iceLines.every((l) => { const end = network.stationName(l.stationIds[l.stationIds.length - 1]); return l.name.includes(end.split(" ")[0]); }), `koeln: every ICE line ends where its name says (${iceLines.map((l) => `${l.name} → ${network.stationName(l.stationIds[l.stationIds.length - 1])}`).join(", ")})`);
  const others = data.lines.filter((l) => !l.name.startsWith("ICE"));
  const compass = others.filter((l) => /_(ost|west|süd|nord)/.test(l.name));
  check(compass.length * 2 > others.length, `koeln: most other lines are named after a compass point (${compass.length} of ${others.length})`);
  const loop = (p) => data.schedules.filter((x) => x.name.startsWith(p)).map((x) => x.stops.map((y) => y.stationId));
  const cw = loop("S_clock");
  const ccw = loop("S_counter");
  check(cw.length && ccw.length && cw.every((x) => JSON.stringify(x) === JSON.stringify(cw[0])) && ccw.every((x) => JSON.stringify(x) === JSON.stringify([...cw[0]].reverse())) && cw[0][0] === hubId && cw[0][cw[0].length - 1] === hubId,
    `koeln: S clock and S counter run the same loop from the hub and back, in opposite directions (${cw[0].join("→")})`);
  says(`S clock and S counter run the same S-Bahn loop from Stop ${hubId} and back, in opposite directions`, "the S-Bahn loops");

  // The penalties, as the challenge's code sets them for 1,710 steps.
  const P = rules.balanced;
  const pairs = [
    ["collision", F.penalty.crash, P.crash_penalty_factor, `${amt(P.crash_penalty_factor)} × speed`],
    ["stop not served", F.penalty.notServed, P.intermediate_not_served_penalty, `Driving through doesn't count: the stop is lost (${amt(P.intermediate_not_served_penalty)} points)`],
    ["cancellation", F.penalty.cancellationFactor, P.cancellation_factor, `${amt(P.cancellation_factor)} × (trip + ${amt(P.cancellation_time_buffer)})`],
    ["cancellation buffer", F.penalty.cancellationBuffer, P.cancellation_time_buffer, null],
    ["late at a stop", F.penalty.lateArrival, P.intermediate_late_arrival_penalty_factor, `${P.intermediate_late_arrival_penalty_factor} per step`],
    ["leaving early", F.penalty.earlyDeparture, P.intermediate_early_departure_penalty_factor, `${P.intermediate_early_departure_penalty_factor} per step`]
  ];
  for (const [what, mine, theirs, stated] of pairs) {
    check(Math.abs(mine - theirs) < 1e-9, `koeln: ${what}: ${mine} (challenge ${theirs})`);
    if (stated) says(stated, what);
  }
  says(`a lost stop, for example, costs ${amt(P.intermediate_not_served_penalty / rules.max_episode_steps)} × ${fmt(rules.max_episode_steps)} = ${amt(P.intermediate_not_served_penalty)} points`, "the penalties' scale");
  says(`It costs ${amt(P.crash_penalty_factor)} × the train's speed (${amt(P.crash_penalty_factor)} points for an express or high-speed train at full speed, ${amt(P.crash_penalty_factor * kinds.Local.speed)} for a local train), once each time a moving train is stopped this way`, "a collision's cost");
  says(`serves none of the ${stops} stops still loses ${amt(stops * P.intermediate_not_served_penalty)} points`, "all stops lost");
  says(`a train gains ${rules.acceleration_delta} of a cell per step`, "speeding up");
  says(`braking takes ${-rules.braking_delta} off per step`, "braking");
  for (const name of Object.keys(traces)) {
    const fx = traces[name];
    const rows = [fx.initial, ...fx.trace];
    const booked = new Set(fx.terms.filter((x) => x[2] === "collision").map((x) => `${x[0]}:${x[1]}`));
    const halted = new Set();
    for (let t = 1; t < rows.length; t += 1) for (let i = 0; i < rows[t].state.length; i += 1) if (rows[t - 1].state[i] === 3 && rows[t].state[i] === 4 && fx.actions[t - 1][i] !== 4) halted.add(`${t}:${i}`);
    check(booked.size === halted.size && [...booked].every((k) => halted.has(k)), `koeln ${name}: each of its ${booked.size} collisions is a moving train halted without a stop command, once`);
    const f = py[name];
    const wrong = fx.terms.filter(([step, agent, kind]) => kind !== "collision" && step !== (f.arrival[agent] ?? f.steps));
    check(!wrong.length, `koeln ${name}: every stop and delay term is booked at its train's arrival or at the end (${wrong.length} exceptions)`);
  }

  // The floor: the page's own computation against flatland's rail, and why it is so high here.
  check(Math.abs(F.floor.total - rules.floor.total) < 1e-9 && F.floor.perTrain.every((v, i) => Math.abs(v - rules.floor.per_train[i]) < 1e-9), `koeln: the floor: the page's ${F.floor.total} equals flatland's ${rules.floor.total}`);
  const L = data["flatland line"];
  const atTarget = L.agent_positions.map((p, i) => i).filter((i) => L.agent_targets[i][0].join() === L.agent_positions[i][0][0].join());
  const atTargetStops = atTarget.reduce((t, i) => t + L.agent_positions[i].length - 1, 0);
  check(JSON.stringify(atTarget) === JSON.stringify(F.reasons.atTarget.trains) && atTarget.every((i) => rules.floor.per_train[i] === (L.agent_positions[i].length - 1) * P.intermediate_not_served_penalty),
    `koeln: the trains that start on their destination's cell (${atTarget.join(", ")}) lose every stop at the floor, ${atTargetStops} stops`);
  check(JSON.stringify(py.baseline.atTarget) === JSON.stringify(atTarget), `koeln: in flatland's baseline run exactly those trains are done in the step they enter, never on the map (${py.baseline.atTarget.join(", ")})`);
  says(`start on the cell that is their destination: the simulator finishes each the moment it enters, so all their ${atTargetStops} stops are lost (${amt(atTargetStops * P.intermediate_not_served_penalty)} points)`, "the trains done as they enter");
  const slow = rules.floor.per_train.map((v, i) => ({ v, i })).filter((x) => x.v > 0 && !atTarget.includes(x.i));
  says(`${slow.length} more trains are too slow for their own timetables`, "the slow trains");
  says(`at least ${amt(slow.reduce((t, x) => t + x.v, 0))} points between them`, "the slow trains' least loss");
  says(`No dispatcher can score better than −${amt(rules.floor.total)}`, "the floor");
  check(-py.optimized.score >= rules.floor.total, `koeln: the optimized run (${py.optimized.score}) does not beat the floor (−${rules.floor.total})`);

  // The runs, as the Python runner traced them.
  const b = py.baseline;
  const o = py.optimized;
  says(`${b.collisions} collisions. From step ${b.gridlockFrom} on, ${b.stuck} trains block each other`, "the baseline's collisions and gridlock");
  says(`${b.arrived} of ${b.n} trains arrive (${b.atTarget.length} of them the moment they enter)`, "the baseline's arrivals");
  says(`${b.served} of ${b.stops} stops are served`, "the baseline's stops");
  says(fmt(b.score, 1), "the baseline's score");
  // The optimized run: every train departs and arrives, no collision; the only stops it does not
  // serve are those of the trains done as they enter, which no dispatcher can serve.
  check(o.collisions === 0 && o.gridlockFrom === null, `koeln: the optimized run has no collision (${o.collisions}) and no gridlock`);
  const cancelled = traces.optimized.terms.filter((x) => x[2] === "cancelled").map((x) => x[1]);
  const left = o.entered.map((e, i) => (e === null ? i : null)).filter((i) => i !== null);
  check(cancelled.length === 0 && left.length === 0, `koeln: in the optimized run every train sets off (${left.length} never do; ${cancelled.length} booked as never departed)`);
  check(o.arrived === o.n && JSON.stringify(o.atTarget) === JSON.stringify(atTarget), `koeln: every train arrives (${o.arrived} of ${o.n}), the trains that start on their destination (${o.atTarget.join(", ")}) the moment they enter`);
  says(`No collision and no gridlock: all ${o.n} trains arrive by step ${fmt(o.lastArrival)}, ${o.atTarget.length} of them the moment they enter, and ${o.served} of ${o.stops} stops are served`, "the optimized run");
  const unserved = [...new Set(traces.optimized.terms.filter((x) => x[2] === "stop_missed" || x[2] === "stop_passed").map((x) => x[1]))].sort((x, y) => x - y);
  check(JSON.stringify(unserved) === JSON.stringify(atTarget) && o.served + atTargetStops === o.stops, `koeln: the stops the optimized run does not serve are all those of the trains that start on their destination (${unserved.join(", ")}; ${o.stops - o.served} stops)`);
  const atTargetPoints = -atTarget.reduce((t, i) => t + o.perTrain[i], 0);
  says(`${amt(atTargetPoints)} of the ${amt(-o.score)} points come from those ${atTarget.length === 6 ? "six" : atTarget.length} (${atTarget.map((i) => data.schedules[i].name.replace(/_/g, " ")).join(", ")}): they start on their destination and lose all their ${atTargetStops} stops, whatever the dispatcher does`, "the trains done as they enter, in the optimized run");
  says(fmt(o.score, 1), "the optimized score");
  says("From gridlock to every train at its destination", "the results' title");
}

const maps = process.argv.slice(2).length ? process.argv.slice(2) : MAP_IDS;
for (const id of maps) {
  const s = setup(id);
  (id === "koeln" ? checkKoeln : checkFrankfurt)(s);
  checkLeaderboard(s);
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) { console.log(`\n${failed} of ${results.length} guide check(s) failed.`); process.exit(1); }
console.log(`\nAll ${results.length} figures in the guide agree with their sources.\nGUIDE_FACTS_OK maps=${maps.join(",")}`);
