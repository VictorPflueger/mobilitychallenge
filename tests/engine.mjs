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
//   python                 sum(), set order and round() against CPython 3.13 on random inputs
//                          (once, for both maps)
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
import { MAPS, fixturePath, mapPath, parseCases, planPath } from "./lib/maps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

export function makeEnv(options = {}) {
  const data = options.mapData || read(mapPath(options.map || "frankfurt"));
  const scenario = loadScenario(data);
  if (options.mutateScenario) options.mutateScenario(scenario);
  const env = new RailEnv(scenario, options.env || {});
  if (options.mutateEnv) options.mutateEnv(env);
  return env;
}

export function makeController(name, options = {}) {
  if (name === "baseline") return new OrderedController();
  if (name === "optimized") {
    const plan = read(planPath(options.map || "frankfurt"));
    if (options.mutatePlan) options.mutatePlan(plan);
    return new ReplayController(plan, name);
  }
  throw new Error(`unknown controller ${name}`);
}

/** The engine's state of every train in the fixture's shape. */
function snapshot(env, rewards) {
  const rail = env.rail;
  return {
    pos: env.agents.map((a) => (a.pos === -1 ? null : [rail.row(a.pos), rail.col(a.pos)])),
    dir: env.agents.map((a) => a.dir),
    state: env.agents.map((a) => a.state),
    speed: env.agents.map((a) => a.speed),
    dist: env.agents.map((a) => a.distance),
    rew: env.agents.map((a) => (rewards ? rewards[a.handle].v : 0)),
    done: env.agents.map((a) => env.dones[a.handle])
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
  const fixture = read(fixturePath(options.map || "frankfurt", `trace_${name}.json`));
  const env = makeEnv(options);
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
  if (!problem && env.ambiguous.length) problem = `a stop was reached on two platforms: ${JSON.stringify(env.ambiguous)}`;
  return problem ? { ok: false, message: problem } : { ok: true, reward: result.reward, steps: result.steps };
}

/**
 * The page's own run of `name` (simulate() in js/sim.js) against the Python reward function's terms:
 * the same terms in the same order (step, train, kind, value, stop), the breakdown's value and count
 * per kind as the Score tab lists them, and the final score. Returns { ok, message, kinds }.
 */
export function termsParity(name, options = {}) {
  const map = options.map || "frankfurt";
  const fixture = read(fixturePath(map, `trace_${name}.json`));
  const scenario = loadScenario(read(mapPath(map)));
  const run = simulate(scenario, makeController(name, options));
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

const CASES = ["python", "distance-map", "baseline", "optimized", "terms"];

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
        for (const run of runs) {
          const r = termsParity(run, { map });
          if (r.ok) {
            const listed = Object.entries(r.kinds).filter(([, v]) => v.count).map(([k, v]) => `${k} ${v.count} × ${Math.round(v.value * 10) / 10}`);
            console.log(`PASS  ${map} ${run}: ${r.terms} terms identical to the Python reward function's (${listed.join(", ")})`);
          } else { bad += 1; console.log(`FAIL  ${map} ${run}: ${r.message}`); }
        }
        if (bad) failed += 1; else console.log(`TERMS_PARITY_OK ${map}`);
      } else {
        if (!runs.includes(name)) { console.log(`skip  ${map}: no ${name} run on this map`); continue; }
        const t0 = Date.now();
        const r = parity(name, { map });
        if (r.ok) console.log(`PASS  ${map} ${name}: ${r.steps} steps identical to the Python environment, score ${r.reward} (${Date.now() - t0} ms)\nENGINE_PARITY_OK ${map}:${name}`);
        else { failed += 1; console.log(`FAIL  ${map} ${name}: ${r.message}`); }
      }
      covered.add(map);
    }
  }
  // The suite's marker: every case passed, on every map named (all of them by default).
  if (!failed && wanted.length === CASES.length && maps.every((m) => covered.has(m))) console.log(`ENGINE_SUITE_OK maps=${maps.join(",")}`);
  process.exit(failed ? 1 : 0);
}
