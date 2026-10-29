// The site's scenarios are the challenge's maps, unchanged: for every map, data/<id>/<file> byte for
// byte the challenge repository's data/maps/<file>, and its plan, the Python runner's scores and
// every reference trace recorded on that same file (their map_sha256). The three lists of maps (the
// page's js/maps.js, the tests' tests/lib/maps.mjs, the Python tools' tools/maps.py) name the same
// maps, files and runs, in the same order.
// Usage: node tests/data.mjs --challenge <checkout of the challenge repository>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAPS as PAGE_MAPS } from "../js/maps.js";
import { MAPS, MAP_IDS, fixturePath, mapPath, planPath, referencePath } from "./lib/maps.mjs";

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
    const plan = json(planPath(id));
    check(plan.map_sha256 === digest && plan.map === file, `${id}: the ${run} run's plan (${planPath(id)}) was made on that map`);
  }
  const reference = json(referencePath(id));
  check(reference.map_sha256 === digest && JSON.stringify(Object.keys(reference.runs)) === JSON.stringify(runs), `${id}: the Python runner's scores the page checks itself against (${referencePath(id)}) were computed on that map, for its ${runs.length} runs`);
  for (const name of runs) {
    const trace = json(fixturePath(id, `trace_${name}.json`));
    check(trace.map_sha256 === digest, `${id}: the ${name} reference trace was recorded on that map (flatland-rl ${trace.flatland})`);
    check(trace.reward === reference.runs[name].reward && trace.steps === reference.runs[name].steps, `${id}: the ${name} trace's score and length are the reference's (${trace.reward}, ${trace.steps} steps)`);
  }
  const rules = json(fixturePath(id, "rules.json"));
  check(rules.map === file && rules.max_episode_steps === JSON.parse(theirs.toString("utf8"))["flatland timetable"].max_episode_steps, `${id}: the penalty rules were written for that map's ${rules.max_episode_steps} steps`);
}
for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (results.some(([ok]) => !ok)) process.exit(1);
console.log(`MAP_DATA_IDENTICAL maps=${MAP_IDS.join(",")}`);
