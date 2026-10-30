// The browser engine against the official Python environment, step for step (Node.js only), on
// every map (tests/lib/maps.mjs: Neu-Frankfurt and Köln).
//   baseline | optimized   runs the JavaScript engine with that controller and compares every step
//                          with tests/fixtures/<map>/trace_<name>.json, which
//                          tools/export_fixtures.py records from flatland-rl 4.2.2 through the
//                          challenge's runner: each train's action, position, direction, state,
//                          speed, distance in the cell, reward and done flag, and the final score,
//                          compared exactly (no tolerance). A map without that run skips it
//   terms                  the score breakdown the page shows (js/sim.js, as the page runs it):
//                          every term of every reward (a crash, a stop not served, a delay, ...)
//                          against the terms the Python reward function itself computed
//                          (tools/export_fixtures.py, Decomposer), for every run, and the
//                          breakdown's totals and counts per kind
//   distance-map           the distance map of every train, cell and direction, by digest
//   bookings               the stops a run's Python record says were booked in hash order
//                          (data/<map>/reference.json): each a stop the engine finds reached on two
//                          or more listed platforms, the booked platform among them, and for every
//                          platform the train stood on, what booking it there adds to the score in
//                          the engine, as recorded. Then the scores the page says the run can have
//                          (js/hashorder.js): the stops grouped here from the map file (each call's
//                          listed platforms, in order) and the record (the platforms the train
//                          stood on), each group booked alike in the record, and the engine's score
//                          for every choice of platform per group, all the group's stops booked
//                          there; the page must state exactly these
//   python                 sum(), set order and round() against CPython 3.13 on random inputs
//                          (once, for both maps)
// The runs are replayed with the bookings their Python record gives (js/engine/env.js, stopArrival);
// a stop reached on two or more listed platforms without one fails the run.
// Every run is checked twice: as the challenge's runner runs it, and with the challenge's malfunctions
// on (the page's Malfunctions switch): trace_<run>_malfunctions.json, the generator's draws in
// data/<map>/malfunctions.json, the optimized run's plan under them and their scores and bookings in
// reference.json's "malfunctions"; those traces also hold every train's malfunction counter (malf).
// Usage: node tests/engine.mjs [case ...] [--map frankfurt|koeln] [koeln:baseline ...]
//        (no case: all of them; no map: every map)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RailEnv, loadScenario, runEpisode } from "../js/engine/env.js";
import { PySmallIntSet, pyRound, pySum } from "../js/engine/py.js";
import { OrderedController } from "../js/controllers/ordered.js";
import { ReplayController } from "../js/controllers/replay.js";
import { KINDS, breakdown, simulate } from "../js/sim.js";
import { hashOrder } from "../js/hashorder.js";
import { MAPS, VARIANTS, fixturePath, malfunctionsPath, mapPath, parseCases, planPath, referencePath, runFile } from "./lib/maps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

/** The Python runner's record of the map's runs: without malfunctions, or with them (options.variant). */
const recordOf = (options = {}) => {
  const ref = read(referencePath(options.map || "frankfurt"));
  return options.variant === "malfunctions" ? ref.malfunctions.runs : ref.runs;
};

/** The stops a run booked in Python's hash order, as its record gives them (or options.bookings). */
export const bookingsOf = (name, options = {}) => options.bookings ?? recordOf(options)[name]?.bookings ?? [];

/**
 * With options.variant "malfunctions": the malfunction generator's draws the engine replays
 * (data/<map>/malfunctions.json, or options.draws); otherwise null, malfunctions off.
 */
export const drawsOf = (options = {}) => (options.variant === "malfunctions" ? options.draws ?? read(malfunctionsPath(options.map || "frankfurt")).draws : null);

export function makeEnv(options = {}) {
  const data = options.mapData || read(mapPath(options.map || "frankfurt"));
  const scenario = loadScenario(data);
  if (options.mutateScenario) options.mutateScenario(scenario);
  const env = new RailEnv(scenario, { ...(options.env || {}), bookings: options.bookings || [], malfunctions: options.malfunctions ?? null });
  if (options.mutateEnv) options.mutateEnv(env);
  return env;
}

export function makeController(name, options = {}) {
  if (name === "baseline") return new OrderedController();
  if (name === "optimized") {
    const plan = read(planPath(options.map || "frankfurt", options.variant));
    if (options.mutatePlan) options.mutatePlan(plan);
    return new ReplayController(plan, name);
  }
  throw new Error(`unknown controller ${name}`);
}

/** The engine's state of every train in the fixture's shape (malf: the malfunction counter). */
function snapshot(env, rewards) {
  const rail = env.rail;
  return {
    pos: env.agents.map((a) => (a.pos === -1 ? null : [rail.row(a.pos), rail.col(a.pos)])),
    dir: env.agents.map((a) => a.dir),
    state: env.agents.map((a) => a.state),
    speed: env.agents.map((a) => a.speed),
    dist: env.agents.map((a) => a.distance),
    rew: env.agents.map((a) => (rewards ? rewards[a.handle].v : 0)),
    done: env.agents.map((a) => env.dones[a.handle]),
    malf: env.agents.map((a) => a.malfunctionDown)
  };
}

function firstDifference(expected, actual) {
  for (const field of Object.keys(expected)) {
    for (let i = 0; i < expected[field].length; i += 1) {
      const e = expected[field][i];
      const a = actual[field][i];
      const same = Array.isArray(e) ? Array.isArray(a) && e[0] === a[0] && e[1] === a[1] : e === a;
      if (!same) return `train ${i} ${field}: Python ${JSON.stringify(e)}, engine ${JSON.stringify(a)}`;
    }
  }
  return null;
}

/**
 * Runs `name` in the engine and compares it with its fixture. Returns { ok, message, reward }.
 * options lets tests/engine-negctl.mjs plant a change in the engine.
 */
export function parity(name, options = {}) {
  const fixture = read(fixturePath(options.map || "frankfurt", `trace_${runFile(name, options.variant)}.json`));
  if (options.variant === "malfunctions" && !fixture.trace[0]?.malf) return { ok: false, message: "the trace with malfunctions records no malfunction counter" };
  const env = makeEnv({ ...options, bookings: bookingsOf(name, options), malfunctions: drawsOf(options) });
  const controller = makeController(name, options);
  let step = 0;
  let problem = null;
  const original = env.reset.bind(env);
  env.reset = () => {
    original();
    const diff = firstDifference(fixture.initial, snapshot(env, null));
    if (diff) problem = `after reset: ${diff}`;
  };
  let result;
  try {
    result = runEpisode(env, controller, (e, actions, rewards) => {
      if (problem) return;
      const expectedActions = fixture.actions[step];
      if (!expectedActions) { problem = `the engine ran past Python's last step ${fixture.steps}`; return; }
      const a = expectedActions.findIndex((x, i) => x !== actions[i]);
      if (a >= 0) { problem = `step ${step + 1}: train ${a} action: Python ${expectedActions[a]}, engine ${actions[a]}`; return; }
      const diff = firstDifference(fixture.trace[step], snapshot(e, rewards));
      if (diff) problem = `step ${step + 1}: ${diff}`;
      step += 1;
    });
  } catch (err) {
    return { ok: false, message: problem || `the engine failed at step ${step + 1}: ${err.message}` };
  }
  if (!problem && result.steps !== fixture.steps) problem = `episode length: Python ${fixture.steps}, engine ${result.steps}`;
  if (!problem && result.reward !== fixture.reward) problem = `score: Python ${fixture.reward}, engine ${result.reward}`;
  if (!problem && env.ambiguous.length) problem = `a stop reached on two or more listed platforms the engine could not book as Python did: ${JSON.stringify(env.ambiguous)}`;
  return problem ? { ok: false, message: problem } : { ok: true, reward: result.reward, steps: result.steps };
}

/**
 * The page's own run of `name` (simulate() in js/sim.js) against the Python reward function's terms:
 * the same terms in the same order (step, train, kind, value, stop), the breakdown's value and count
 * per kind as the Score tab lists them, and the final score. Returns { ok, message, kinds }.
 */
export function termsParity(name, options = {}) {
  const map = options.map || "frankfurt";
  const fixture = read(fixturePath(map, `trace_${runFile(name, options.variant)}.json`));
  const scenario = loadScenario(read(mapPath(map)));
  const run = simulate(scenario, makeController(name, options), { bookings: bookingsOf(name, options), malfunctions: drawsOf(options) });
  if (run.ambiguous.length) return { ok: false, message: `a stop reached on two or more listed platforms the engine could not book as Python did: ${JSON.stringify(run.ambiguous)}` };
  const mine = run.ledger.map((e) => [e.step, e.agent, e.kind, e.value, e.stop]);
  const theirs = fixture.terms;
  for (let i = 0; i < Math.max(mine.length, theirs.length); i += 1) {
    const a = mine[i];
    const b = theirs[i];
    if (!a || !b || a.some((x, j) => x !== b[j])) {
      return { ok: false, message: `term ${i + 1} of ${theirs.length}: Python ${JSON.stringify(b)}, page ${JSON.stringify(a)}` };
    }
  }
  // The breakdown as the Score tab shows it, against Python's terms summed per kind in their order.
  const shown = breakdown(run, run.steps);
  const kinds = {};
  for (const k of KINDS) kinds[k.id] = { value: 0, count: 0 };
  for (const [, , kind, value] of theirs) {
    if (!kinds[kind]) return { ok: false, message: `Python booked a term of an unknown kind ${kind}` };
    kinds[kind].value += value;
    if (value !== 0 || kind === "stop_missed" || kind === "stop_passed") kinds[kind].count += 1;
  }
  for (const k of KINDS) {
    if (shown[k.id].value !== kinds[k.id].value || shown[k.id].count !== kinds[k.id].count) {
      return { ok: false, message: `${k.label}: Python ${kinds[k.id].count} for ${kinds[k.id].value}, page ${shown[k.id].count} for ${shown[k.id].value}` };
    }
  }
  if (run.score !== fixture.reward) return { ok: false, message: `score: Python ${fixture.reward}, page ${run.score}` };
  return { ok: true, terms: theirs.length, kinds };
}

/**
 * The stops the run's record says Python booked in hash order, against the engine: the engine books
 * exactly these stops among two or more listed platforms the train reached, the record's options are
 * those platforms and its booked one is among them, and booking the stop at each option adds exactly
 * the recorded value to the score. Returns { ok, message, count }.
 */
export function bookingsParity(name, options = {}) {
  const map = options.map || "frankfurt";
  const recorded = bookingsOf(name, options);
  const scenario = loadScenario(read(mapPath(map)));
  const key = ([r, c, d]) => (r * scenario.rail.width + c) * 4 + d;
  const sorted = (xs) => [...xs].sort((a, b) => a - b).join(",");
  const runWith = (bookings) => simulate(scenario, makeController(name, options), { bookings, malfunctions: drawsOf(options) });
  const stopValue = (run, b) => run.ledger.filter((e) => e.agent === b.agent && e.stop === b.stop).reduce((s, e) => s + e.value, 0);
  const base = runWith(recorded);
  if (base.ambiguous.length) return { ok: false, message: `stops the engine could not book as recorded: ${JSON.stringify(base.ambiguous)}` };
  const chosen = base.choices.map((c) => `${c.agent}:${c.stop}`).sort().join(" ");
  const listed = recorded.map((b) => `${b.agent}:${b.stop}`).sort().join(" ");
  if (chosen !== listed) return { ok: false, message: `the engine chose among platforms at ${chosen || "no stop"}, the record lists ${listed || "none"}` };
  for (const b of recorded) {
    const c = base.choices.find((x) => x.agent === b.agent && x.stop === b.stop);
    if (sorted(b.options.map((o) => key(o.platform))) !== sorted(c.platforms)) return { ok: false, message: `train ${b.agent} stop ${b.stop}: the record's platforms are not the ones the train stood on` };
    if (!b.options.some((o) => key(o.platform) === key(b.booked)) || c.booked !== key(b.booked)) return { ok: false, message: `train ${b.agent} stop ${b.stop}: the booked platform is not one of them` };
    for (const o of b.options) {
      const run = key(o.platform) === key(b.booked) ? base : runWith(recorded.map((x) => (x === b ? { ...x, booked: o.platform } : x)));
      const value = stopValue(run, b);
      if (run.ambiguous.length || value !== o.value) return { ok: false, message: `train ${b.agent} stop ${b.stop} booked at ${o.platform.join(",")}: the engine books ${value}, the record ${o.value}` };
      if (Math.abs(run.score - (base.score - stopValue(base, b) + o.value)) > 1e-9) return { ok: false, message: `train ${b.agent} stop ${b.stop}: the score does not move by the stop's value` };
    }
  }
  return { ok: true, count: recorded.length, options: recorded.reduce((s, b) => s + b.options.length, 0) };
}

/**
 * The scores the page says run `name` can have (js/hashorder.js), against the engine. The recorded
 * stops booked in hash order are grouped here, independently of the page, by what one interpreter
 * books alike: the call's listed platforms in the map file's order ("flatland line") and the
 * platforms the train stood on (the record's options). Every group must be booked at one platform in
 * the record, as one interpreter books it. The engine then replays the run once for every choice of
 * platform per group, every stop of the group booked there, and the page's scores must be exactly
 * the scores these replays give. Returns { ok, message, groups, scores }.
 */
export function scoresParity(name, options = {}) {
  const map = options.map || "frankfurt";
  const recorded = bookingsOf(name, options);
  const data = read(mapPath(map));
  const scenario = loadScenario(data);
  const line = data["flatland line"];
  const byKey = new Map();
  for (const b of recorded) {
    const key = JSON.stringify([line.agent_positions[b.agent][b.stop], line.agent_directions[b.agent][b.stop], b.options.map((o) => o.platform)]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(b);
  }
  const groups = [...byKey.values()];
  const split = groups.find((g) => !g.every((b) => b.booked.join() === g[0].booked.join()));
  if (split) return { ok: false, message: `the record books the stops ${split.map((b) => `${b.agent}:${b.stop}`).join(", ")}, which one interpreter books alike, at different platforms` };
  let choices = [[]];
  for (const g of groups) choices = choices.flatMap((c) => g[0].options.map((o) => [...c, o.platform]));
  const scores = [];
  for (const choice of choices) {
    const bookings = recorded.map((b) => ({ ...b, booked: choice[groups.findIndex((g) => g.includes(b))] }));
    const run = simulate(scenario, makeController(name, options), { bookings, malfunctions: drawsOf(options) });
    if (run.ambiguous.length) return { ok: false, message: `the engine could not book ${JSON.stringify(run.ambiguous)}` };
    if (!scores.includes(run.score)) scores.push(run.score);
  }
  scores.sort((x, y) => x - y);
  const base = simulate(scenario, makeController(name, options), { bookings: recorded, malfunctions: drawsOf(options) });
  const page = hashOrder.scores(base.score, hashOrder.groups(recorded, scenario));
  if (page.join(" ") !== scores.join(" ")) return { ok: false, message: `the page says the run can score ${page.join(", ")}; the engine, booking each group alike, ${scores.join(", ")}` };
  return { ok: true, groups: groups.length, stops: recorded.length, scores };
}

export function distanceMapParity(options = {}) {
  const fixture = read(fixturePath(options.map || "frankfurt", "trace_baseline.json")).distance_map;
  const env = makeEnv(options);
  const perAgent = env.distanceMaps.map((dm) => createHash("sha256").update(Buffer.from(dm.buffer, dm.byteOffset, dm.byteLength)).digest("hex"));
  const all = createHash("sha256");
  for (const dm of env.distanceMaps) all.update(Buffer.from(dm.buffer, dm.byteOffset, dm.byteLength));
  const digest = all.digest("hex");
  const bad = perAgent.map((d, i) => (d === fixture.per_agent[i] ? null : i)).filter((i) => i !== null);
  const [n, h, w, k] = fixture.shape;
  const shapeOk = n === env.distanceMaps.length && h === env.rail.height && w === env.rail.width && k === 4;
  return { ok: shapeOk && !bad.length && digest === fixture.sha256, bad, shape: fixture.shape };
}

function pythonSemantics() {
  const fx = read("tests/fixtures/python_semantics.json");
  const problems = [];
  fx.sums.forEach((s, i) => {
    const got = pySum(s.items.map(([v, isFloat]) => ({ v, isFloat })));
    if (got.v !== s.sum || got.isFloat !== s.sum_is_float) problems.push(`sum #${i}: Python ${s.sum}, engine ${got.v}`);
  });
  fx.sets.forEach((s, i) => {
    const set = new PySmallIntSet();
    for (const k of s.insert) set.add(k);
    const order = set.values();
    if (order.join(",") !== s.order.join(",")) problems.push(`set #${i}: Python [${s.order}], engine [${order}]`);
  });
  for (const r of fx.rounds) if (pyRound(r.x) !== r.round) problems.push(`round(${r.x}): Python ${r.round}, engine ${pyRound(r.x)}`);
  return { ok: !problems.length, problems, counts: [fx.sums.length, fx.sets.length, fx.rounds.length], python: fx.python };
}

const CASES = ["python", "distance-map", "baseline", "optimized", "terms", "bookings"];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { maps, cases: wanted } = parseCases(process.argv.slice(2), CASES);
  let failed = 0;
  const covered = new Set();
  for (const name of wanted) {
    if (name === "python") {
      const r = pythonSemantics();
      if (r.ok) console.log(`PASS  Python ${r.python} semantics: ${r.counts[0]} sums, ${r.counts[1]} set orders, ${r.counts[2]} roundings identical\nPYTHON_SEMANTICS_OK`);
      else { failed += 1; console.log(`FAIL  Python semantics: ${r.problems.length} differences, first: ${r.problems.slice(0, 3).join("; ")}`); }
      continue;
    }
    if (!CASES.includes(name)) {
      failed += 1;
      console.log(`FAIL  unknown case ${name}`);
      continue;
    }
    for (const map of maps) {
      const runs = MAPS[map].runs;
      if (name === "distance-map") {
        const r = distanceMapParity({ map });
        if (r.ok) console.log(`PASS  ${map}: distance map ${r.shape.join(" x ")} (trains, rows, columns, directions) identical to flatland's\nDISTANCE_MAP_PARITY_OK ${map}`);
        else { failed += 1; console.log(`FAIL  ${map}: distance map differs for trains ${r.bad.join(", ") || "(shape or overall digest)"}`); }
      } else if (name === "terms") {
        let bad = 0;
        for (const variant of VARIANTS) {
          for (const run of runs) {
            const label = runFile(run, variant);
            const r = termsParity(run, { map, variant });
            if (r.ok) {
              const listed = Object.entries(r.kinds).filter(([, v]) => v.count).map(([k, v]) => `${k} ${v.count} × ${Math.round(v.value * 100) / 100}`);
              console.log(`PASS  ${map} ${label}: ${r.terms} terms identical to the Python reward function's (${listed.join(", ")})`);
            } else { bad += 1; console.log(`FAIL  ${map} ${label}: ${r.message}`); }
          }
        }
        if (bad) failed += 1; else console.log(`TERMS_PARITY_OK ${map}`);
      } else if (name === "bookings") {
        let bad = 0;
        for (const variant of VARIANTS) {
          for (const run of runs) {
            const label = runFile(run, variant);
            const r = bookingsParity(run, { map, variant });
            if (r.ok) console.log(`PASS  ${map} ${label}: ${r.count ? `${r.count} stops booked in hash order as recorded; booked at any of the ${r.options} platforms their trains stood on, they add what the record says` : "no stop booked in hash order, as recorded"}`);
            else { bad += 1; console.log(`FAIL  ${map} ${label}: ${r.message}`); }
            const sc = scoresParity(run, { map, variant });
            if (sc.ok) console.log(`PASS  ${map} ${label}: ${sc.stops ? `${sc.stops} stops in ${sc.groups} ${sc.groups === 1 ? "group" : "groups"} booked alike; the page's possible scores (${sc.scores.join(", ")}) are exactly the engine's for each choice of platform per group` : `one possible score (${sc.scores[0]}), as the page says`}`);
            else { bad += 1; console.log(`FAIL  ${map} ${label}: ${sc.message}`); }
          }
        }
        if (bad) failed += 1; else console.log(`BOOKINGS_PARITY_OK ${map}`);
      } else {
        if (!runs.includes(name)) { console.log(`skip  ${map}: no ${name} run on this map`); continue; }
        for (const variant of VARIANTS) {
          const label = runFile(name, variant);
          const t0 = Date.now();
          const r = parity(name, { map, variant });
          if (r.ok) console.log(`PASS  ${map} ${label}: ${r.steps} steps identical to the Python environment${variant === "malfunctions" ? ", every malfunction counter included" : ""}, score ${r.reward} (${Date.now() - t0} ms)\nENGINE_PARITY_OK ${map}:${label}`);
          else { failed += 1; console.log(`FAIL  ${map} ${label}: ${r.message}`); }
        }
      }
      covered.add(map);
    }
  }
  // The suite's marker: every case passed, on every map named (all of them by default).
  if (!failed && wanted.length === CASES.length && maps.every((m) => covered.has(m))) console.log(`ENGINE_SUITE_OK maps=${maps.join(",")}`);
  process.exit(failed ? 1 : 0);
}
