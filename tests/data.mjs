// The site's scenarios are the challenge's maps, unchanged: for every map, data/<id>/<file> byte for
// byte the challenge repository's data/maps/<file>, and its plans, the Python runner's scores and
// every reference trace recorded on that same file (their map_sha256). The three lists of maps (the
// page's js/maps.js, the tests' tests/lib/maps.mjs, the Python tools' tools/maps.py) name the same
// maps, files and runs.
// With malfunctions: data/<id>/malfunctions.json holds the loader's parameters, the seed of
// tools/maps.py and the generator's draws, well formed and with their digest; the plan under them, the
// traces and reference.json's "malfunctions" name the same seed and scores; every draw does in the
// Python traces exactly what flatland's MalfunctionHandler does with it (read from the traces'
// malfunction counters alone, not from the engine); and data/<id>/malfunction_test.json covers the
// seeds the page cites, its row for the page's seed giving the reference's scores.
// Usage: node tests/data.mjs --challenge <checkout of the challenge repository>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAPS as PAGE_MAPS } from "../js/maps.js";
import { MAPS, MAP_IDS, fixturePath, malfunctionTestPath, malfunctionsPath, mapPath, planPath, referencePath, runFile } from "./lib/maps.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.indexOf("--challenge");
if (arg < 0 || !process.argv[arg + 1]) {
  console.error("Usage: node tests/data.mjs --challenge <checkout of the challenge repository>");
  process.exit(2);
}
const challenge = path.resolve(process.argv[arg + 1]);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const json = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const results = [];
const check = (ok, what) => results.push([ok, what]);

// The three lists of maps agree.
const pageList = PAGE_MAPS.map((m) => ({ id: m.id, file: m.file, runs: m.runs }));
const testList = MAP_IDS.map((id) => ({ id, file: MAPS[id].file, runs: MAPS[id].runs }));
check(JSON.stringify(pageList) === JSON.stringify(testList), `js/maps.js and tests/lib/maps.mjs list the same maps, files and runs (${testList.map((m) => `${m.id}: ${m.file}, ${m.runs.join("/")}`).join("; ")})`);
const py = readFileSync(path.join(ROOT, "tools/maps.py"), "utf8");
const pyList = [...py.matchAll(/'(\w+)': \{'file': '([^']+)', 'runs': \(([^)]*)\)\}/g)].map((m) => ({ id: m[1], file: m[2], runs: [...m[3].matchAll(/'(\w+)'/g)].map((x) => x[1]) }));
check(JSON.stringify(pyList) === JSON.stringify(testList), `tools/maps.py lists the same maps, files and runs (${pyList.map((m) => m.id).join(", ")})`);

for (const id of MAP_IDS) {
  const { file, runs } = MAPS[id];
  const ours = readFileSync(path.join(ROOT, mapPath(id)));
  const theirs = readFileSync(path.join(challenge, "data/maps", file));
  check(ours.equals(theirs), `${mapPath(id)} is byte for byte the challenge's data/maps/${file} (${ours.length} bytes, sha256 ${sha(ours).slice(0, 16)}…; challenge ${theirs.length} bytes, ${sha(theirs).slice(0, 16)}…)`);
  const digest = sha(theirs);
  for (const run of runs.filter((r) => r !== "baseline")) {
    const plan = json(planPath(id, run));
    check(plan.map_sha256 === digest && plan.map === file, `${id}: the ${run} run's plan (${planPath(id, run)}) was made on that map`);
  }
  const reference = json(referencePath(id));
  check(reference.map_sha256 === digest && JSON.stringify(Object.keys(reference.runs)) === JSON.stringify(runs), `${id}: the Python runner's scores the page checks itself against (${referencePath(id)}) were computed on that map, for its ${runs.length} runs`);
  for (const name of runs) {
    const trace = json(fixturePath(id, `trace_${name}.json`));
    check(trace.map_sha256 === digest, `${id}: the ${name} reference trace was recorded on that map (flatland-rl ${trace.flatland})`);
    check(trace.reward === reference.runs[name].reward && trace.steps === reference.runs[name].steps, `${id}: the ${name} trace's score and length are the reference's (${trace.reward}, ${trace.steps} steps)`);
  }
  // With malfunctions.
  const steps = JSON.parse(theirs.toString("utf8"))["flatland timetable"].max_episode_steps;
  const trains = JSON.parse(theirs.toString("utf8"))["flatland line"].agent_positions.length;
  const mal = json(malfunctionsPath(id));
  const seedPy = Number((py.match(/^MALFUNCTION_SEED = (\d+)$/m) || [])[1]);
  check(mal.map === file && mal.map_sha256 === digest && mal.seed === seedPy && mal.steps === steps && mal.trains === trains,
    `${id}: ${malfunctionsPath(id)} was drawn on that map, for its ${steps} steps and ${trains} trains, with tools/maps.py's MALFUNCTION_SEED (${seedPy})`);
  check(mal.rate === 0.04 && mal.min_duration === 2 && mal.max_duration === 10 && mal.broken_steps.join() === "3,11" && Math.abs(mal.probability - (1 - Math.exp(-0.04))) < 1e-15,
    `${id}: the loader's malfunction parameters (rate 0.04, 2 to 10 steps, which flatland makes 3 to 11; a train breaks down with probability ${mal.probability.toFixed(5)} a step)`);
  const wellFormed = mal.draws.every(([t, i, n], j) => Number.isInteger(t) && t >= 1 && t <= steps && Number.isInteger(i) && i >= 0 && i < trains && Number.isInteger(n) && n >= 3 && n <= 11
    && (j === 0 || mal.draws[j - 1][0] < t || (mal.draws[j - 1][0] === t && mal.draws[j - 1][1] < i)));
  check(wellFormed && sha(JSON.stringify(mal.draws)) === mal.sha256, `${id}: ${mal.draws.length} draws, each [step, train, 3 to 11 steps], in the generator's order, matching their digest ${mal.sha256.slice(0, 16)}…`);
  check(mal.draws.length > 0.03 * steps * trains && mal.draws.length < 0.05 * steps * trains,
    `${id}: about one draw in 25 breaks a train down (${(mal.draws.length / (steps * trains) * 100).toFixed(2)} % of ${steps * trains} draws; flatland's rate gives 3.92 %)`);
  const malPlan = json(planPath(id, "malfunctions"));
  check(malPlan.map_sha256 === digest && malPlan.malfunction_seed === mal.seed && reference.malfunctions?.seed === mal.seed,
    `${id}: the plan under malfunctions (${planPath(id, "malfunctions")}) and reference.json's runs with malfunctions name the same map and seed`);
  check(JSON.stringify(Object.keys(reference.malfunctions?.runs || {})) === JSON.stringify(runs), `${id}: reference.json has the Python runner's scores of the ${runs.length} runs with malfunctions`);
  const byStep = new Map();
  for (const [t, i, n] of mal.draws) { if (!byStep.has(t)) byStep.set(t, new Map()); byStep.get(t).set(i, n); }
  for (const name of runs) {
    const trace = json(fixturePath(id, `trace_${runFile(name, "malfunctions")}.json`));
    const r = reference.malfunctions.runs[name];
    check(trace.map_sha256 === digest && trace.malfunction_seed === mal.seed && trace.reward === r.reward && trace.steps === r.steps,
      `${id}: the ${name} trace with malfunctions was recorded on that map with that seed; its score and length are the reference's (${trace.reward}, ${trace.steps} steps)`);
    // Every draw, against the trace's counters: a draw breaks a train down exactly when its counter
    // was 0 before the step, and then leaves broken − 1 after it; without a draw, a counter only
    // counts down. A train broken down is in a malfunction state, unless it is done.
    const rows = [trace.initial, ...trace.trace];
    let bad = null;
    let applied = 0;
    for (let t = 1; t < rows.length && !bad; t += 1) {
      for (let i = 0; i < trains && !bad; i += 1) {
        const before = rows[t - 1].malf ? rows[t - 1].malf[i] : 0;
        const after = rows[t].malf[i];
        const n = byStep.get(t)?.get(i);
        const expected = n !== undefined && before === 0 ? n - 1 : Math.max(before - 1, 0);
        if (after !== expected) bad = `step ${t}, train ${i}: counter ${before} → ${after}, the draw ${n ?? "none"} gives ${expected}`;
        if (n !== undefined && before === 0) {
          applied += 1;
          const st = rows[t].state[i];
          if (st !== 6 && st !== 2 && st !== 5) bad = `step ${t}, train ${i}: broken down but in state ${st}`;
        }
      }
    }
    check(!bad, `${id}: the ${name} run with malfunctions met every draw as flatland applies it (${applied} breakdowns started over ${rows.length - 1} steps${bad ? `; ${bad}` : ""})`);
  }
  // The test over many seeds (tools/malfunction_test.py), which the Method tab summarises.
  const test = json(malfunctionTestPath(id));
  const seeds = test.seeds.map((x) => x.seed);
  const row1 = test.seeds.find((x) => x.seed === mal.seed);
  check(test.map === file && seeds.length >= 2 && seeds.every((x, j) => x === j + 1) && test.seeds.every((x) => x.optimized && x.optimized.trains === trains),
    `${id}: the malfunction test (${malfunctionTestPath(id)}) ran the optimized run on seeds 1 to ${seeds.length}, ${test.seeds.filter((x) => x.baseline).length} of them with the baseline too`);
  check(row1 && row1.optimized.reward === reference.malfunctions.runs.optimized.reward && row1.optimized.steps === reference.malfunctions.runs.optimized.steps
    && (!row1.baseline || (row1.baseline.reward === reference.malfunctions.runs.baseline.reward && row1.baseline.steps === reference.malfunctions.runs.baseline.steps)),
    `${id}: the test's seed ${mal.seed} is the page's runs with malfunctions (optimized ${row1?.optimized.reward}${row1?.baseline ? `, baseline ${row1.baseline.reward}` : ""})`);
  check(Object.entries(test.undisturbed).every(([k, v]) => reference.runs[k]?.reward === v), `${id}: the test's runs without malfunctions are the reference's (${Object.entries(test.undisturbed).map(([k, v]) => `${k} ${v}`).join(", ")})`);

  const rules = json(fixturePath(id, "rules.json"));
  check(rules.map === file && rules.max_episode_steps === JSON.parse(theirs.toString("utf8"))["flatland timetable"].max_episode_steps, `${id}: the penalty rules were written for that map's ${rules.max_episode_steps} steps`);
}
for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (results.some(([ok]) => !ok)) process.exit(1);
console.log(`MAP_DATA_IDENTICAL maps=${MAP_IDS.join(",")}`);
