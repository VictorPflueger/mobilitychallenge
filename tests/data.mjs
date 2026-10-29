// The site's scenario is the challenge's map, unchanged: data/neufrankfurt_19agents.json byte for byte
// the challenge repository's data/maps/neufrankfurt_19agents.json, and the plan and every reference
// trace recorded on that same file (their map_sha256).
// Usage: node tests/data.mjs --challenge <checkout of the challenge repository>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv.indexOf("--challenge");
if (arg < 0 || !process.argv[arg + 1]) {
  console.error("Usage: node tests/data.mjs --challenge <checkout of the challenge repository>");
  process.exit(2);
}
const challenge = path.resolve(process.argv[arg + 1]);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const results = [];
const check = (ok, what) => results.push([ok, what]);
const ours = readFileSync(path.join(ROOT, "data/neufrankfurt_19agents.json"));
const theirs = readFileSync(path.join(challenge, "data/maps/neufrankfurt_19agents.json"));
check(ours.equals(theirs), `data/neufrankfurt_19agents.json is byte for byte the challenge's map (${ours.length} bytes, sha256 ${sha(ours).slice(0, 16)}…; challenge ${theirs.length} bytes, ${sha(theirs).slice(0, 16)}…)`);
const digest = sha(theirs);
const plan = JSON.parse(readFileSync(path.join(ROOT, "data/planner_actions.json"), "utf8"));
check(plan.map_sha256 === digest, "the optimized run's plan (data/planner_actions.json) was made on that map");
const estimate = JSON.parse(readFileSync(path.join(ROOT, "data/estimate_actions.json"), "utf8"));
check(estimate.map_sha256 === digest, "the estimate's plan (data/estimate_actions.json) was made on that map");
const reference = JSON.parse(readFileSync(path.join(ROOT, "data/reference.json"), "utf8"));
check(reference.map_sha256 === digest, `the Python runner's scores the page checks itself against (data/reference.json) were computed on that map`);
for (const name of ["baseline", "estimate", "optimized"]) {
  const trace = JSON.parse(readFileSync(path.join(ROOT, `tests/fixtures/trace_${name}.json`), "utf8"));
  check(trace.map_sha256 === digest, `the ${name} reference trace was recorded on that map (flatland-rl ${trace.flatland})`);
}
for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (results.some(([ok]) => !ok)) process.exit(1);
console.log("MAP_DATA_IDENTICAL");
