// Negative controls for tests/engine.mjs: the parity check must fail when the engine is wrong.
// Each case plants one small change (in the train dynamics, the map, the conflict rule, the reward
// function, either plan, the distance map or the score breakdown) and the parity check must report
// a difference. The unchanged engine must pass first, so a failure is the check's doing, not a
// broken harness.
// Usage: node tests/engine-negctl.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { distanceMapParity, parity, termsParity } from "./engine.mjs";
import { RailEnv } from "../js/engine/env.js";
import { MotionCheck } from "../js/engine/motion.js";
import { Rail } from "../js/engine/rail.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

/** Runs fn with obj[key] replaced by value, then restores it. */
function patched(obj, key, value, fn) {
  const original = obj[key];
  obj[key] = value;
  try { return fn(); } finally { obj[key] = original; }
}

const results = [];
function expectDifference(what, run) {
  let r;
  try { r = run(); } catch (err) { r = { ok: false, message: `threw: ${err.message}` }; }
  results.push([!r.ok, `${what}: ${r.ok ? "NOT detected" : `detected (${r.message || `distance map of trains ${r.bad.join(", ")}`})`}`]);
}

// Positive control: the unchanged engine passes all three runs and the distance map.
for (const name of ["baseline", "estimate", "optimized"]) {
  const r = parity(name);
  results.push([r.ok, `unchanged engine, ${name}: ${r.ok ? "passes" : `FAILS (${r.message})`}`]);
}
const dm = distanceMapParity();
results.push([dm.ok, `unchanged engine, distance map: ${dm.ok ? "passes" : "FAILS"}`]);
for (const name of ["baseline", "estimate", "optimized"]) {
  const r = termsParity(name);
  results.push([r.ok, `unchanged page, the score breakdown of ${name}: ${r.ok ? "passes" : `FAILS (${r.message})`}`]);
}

// Train dynamics: braking and acceleration, each checked across the three runs (the baseline never
// brakes, so a run that does must catch it).
const anyRun = (options) => ["baseline", "estimate", "optimized"].map((n) => parity(n, options)).find((r) => !r.ok) || { ok: true };
expectDifference("braking 0.4 per step instead of 0.5", () => anyRun({ env: { brakingDelta: -0.4 } }));
expectDifference("acceleration 0.25 per step instead of 0.3", () => anyRun({ env: { accelerationDelta: 0.25 } }));

// The map: a switch loses the transition a train of the optimized run takes through it.
expectDifference("one used transition removed from a switch", () => {
  const data = readJson("data/neufrankfurt_19agents.json");
  const trace = readJson("tests/fixtures/trace_optimized.json").trace;
  const rail = new Rail(data.grid);
  const bits = (x) => x.toString(2).replace(/0/g, "").length;
  for (let s = 0; s + 1 < trace.length; s += 1) {
    for (let t = 0; t < trace[s].pos.length; t += 1) {
      const a = trace[s].pos[t];
      const b = trace[s + 1].pos[t];
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      const code = data.grid[a[0]][a[1]];
      if (bits(code) <= 2 || rail.isCrossing(rail.index(a[0], a[1]))) continue;
      const bit = (3 - trace[s].dir[t]) * 4 + (3 - trace[s + 1].dir[t]);
      data.grid[a[0]][a[1]] = code & ~(1 << bit);
      return parity("optimized", { mapData: data });
    }
  }
  return { ok: true, message: "no switch found" };
});

// Level-free crossings: without them, trains crossing at the same time would conflict.
expectDifference("level-free crossings treated as ordinary cells", () => {
  return anyRun({ mutateScenario: (sc) => { sc.levelFree = new Set(); } });
});

// The conflict rule: the higher index wins a contested cell.
expectDifference("the higher index wins a contested cell", () => patched(MotionCheck.prototype, "fixConflicts", function (conflicts) {
  for (let head = 0; head < conflicts.length; head += 1) {
    const [u, v] = conflicts[head];
    const [uPos, uTarget] = this.agents.get(u);
    const [vPos, vTarget] = this.agents.get(v);
    if (vPos === vTarget) this.stopAndUpdate(conflicts, u, uPos, uTarget);
    else if (uTarget === vTarget) {
      if (uPos === uTarget) this.stopAndUpdate(conflicts, v, vPos, vTarget); // u stays: v is blocked
      else this.stopAndUpdate(conflicts, u, uPos, uTarget); // both want the cell: the higher index wins
    }
  }
}, () => parity("baseline")));

// The reward function.
expectDifference("crash penalty 935 instead of 936", () => parity("baseline", { mutateEnv: (env) => { env.penalty.crash = 935; } }));
expectDifference("late arrival at a stop 0.6 per step instead of 0.5", () => anyRun({ mutateEnv: (env) => { env.penalty.lateArrival = 0.6; } }));
expectDifference("a missed stop 499 instead of 499.2", () => parity("baseline", { mutateEnv: (env) => { env.penalty.notServed = 499; } }));

// The plan: one action changed from MOVE_FORWARD to DO_NOTHING.
expectDifference("one action of the plan changed", () => parity("optimized", {
  mutatePlan: (plan) => {
    const step = plan.actions.findIndex((a) => a.includes(2));
    plan.actions[step][plan.actions[step].indexOf(2)] = 0;
  }
}));

// The estimate's plan: one train enters the network a step earlier than booked.
expectDifference("one train of the estimate enters a step early", () => parity("estimate", {
  mutatePlan: (plan) => {
    const enter = plan.actions.findIndex((a, t) => t > 0 && a[2] !== 0); // train 2 waits longest at its entry
    plan.actions[enter - 1][2] = plan.actions[enter][2];
  }
}));

// The distance map: one reachable value off by one.
expectDifference("one distance-map value off by one", () => distanceMapParity({
  mutateEnv: (env) => {
    const m = env.distanceMaps[5];
    const i = m.findIndex((v) => Number.isFinite(v) && v > 0);
    m[i] += 1;
  }
}));

// The score breakdown: the total stays right, but a term is booked under the wrong heading or stop.
const relabel = (change) => {
  const note = RailEnv.prototype.note;
  return function (agent, kind, value, stop = null) { return note.call(this, agent, ...change(kind, value, stop)); };
};
expectDifference("a stop passed without stopping listed as never reached", () =>
  patched(RailEnv.prototype, "note", relabel((kind, value, stop) => [kind === "stop_passed" ? "stop_missed" : kind, value, stop]), () => termsParity("baseline")));
expectDifference("a late arrival booked against the next stop", () =>
  patched(RailEnv.prototype, "note", relabel((kind, value, stop) => [kind, value, kind === "stop_late" && value < 0 ? stop + 1 : stop]), () => termsParity("optimized")));
expectDifference("a crash listed as a train not arrived", () =>
  patched(RailEnv.prototype, "note", relabel((kind, value, stop) => [kind === "collision" ? "not_arrived" : kind, value, stop]), () => termsParity("baseline")));

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
const failed = results.filter(([ok]) => !ok).length;
if (failed) {
  console.log(`\n${failed} negative-control check(s) failed.`);
  process.exit(1);
}
console.log("\nEvery planted change was caught, and the unchanged engine passes.\nNEGATIVE_CONTROL_OK");
