// flatland-rl 4.2.2 MotionCheck (envs/agent_chains.py, after Bochatay 2024), line by line: which
// trains may enter the cell they want this step. No swaps (head-on), at most one train per
// resource (a cell, or one axis of a level-free crossing), the lower index wins a contested cell,
// and a train behind a train that stays also stays. Resources are strings here: "r,c" for a cell,
// "r,c|axis" for one axis of a level-free cell, "N<i>" for a train not on the map.

import { PySmallIntSet } from "./py.js";

export class MotionCheck {
  constructor() {
    this.agents = new Map();        // handle -> [current resource, desired resource]
    this.reverseTarget = new Map(); // resource -> handles that want it, in insertion order
    this.stopped = new Set();
    this.deadlocked = new PySmallIntSet();
  }

  addAgent(i, r1, r2) {
    if (r1 === null) r1 = `N${i}`;
    if (r2 === null) r2 = `N${i}`;
    this.agents.set(i, [r1, r2]);
    const wanting = this.reverseTarget.get(r2);
    if (wanting === undefined) this.reverseTarget.set(r2, [i]);
    else wanting.push(i);
  }

  findConflicts() {
    const conflicts = this.constructGraph();
    for (const a of this.deadlocked.values()) {
      const [aPos, aTarget] = this.agents.get(a);
      this.agents.set(a, [aPos, aPos]);
      this.stopAndUpdate(conflicts, a, aPos, aTarget);
    }
    this.fixConflicts(conflicts);
  }

  constructGraph() {
    const conflicts = [];
    for (const [i, [pos, target]] of this.agents) {
      const holders = this.reverseTarget.get(pos);
      if (holders !== undefined) {
        for (const a2 of holders) {
          if (i >= a2) continue;
          const [a2Pos, a2Target] = this.agents.get(a2);
          if (pos === a2Target && target === a2Pos) {
            this.stopped.add(i);
            this.stopped.add(a2);
            this.deadlocked.add(i);
            this.deadlocked.add(a2);
          }
        }
      }
      for (const a2 of this.reverseTarget.get(target)) {
        if (i >= a2) continue;
        conflicts.push([i, a2]);
      }
      if (pos === target) this.stopped.add(i);
    }
    return conflicts;
  }

  fixConflicts(conflicts) {
    for (let head = 0; head < conflicts.length; head += 1) {
      const [u, v] = conflicts[head];
      const [uPos, uTarget] = this.agents.get(u);
      const [vPos, vTarget] = this.agents.get(v);
      if (vPos === vTarget) {
        this.stopAndUpdate(conflicts, u, uPos, uTarget);
      } else if (uTarget === vTarget) {
        this.stopAndUpdate(conflicts, v, vPos, vTarget);
      }
    }
  }

  stopAndUpdate(conflicts, v, vPos, vTarget) {
    this.agents.set(v, [vPos, vPos]);
    this.stopped.add(v);
    const wanting = this.reverseTarget.get(vPos);
    if (wanting !== undefined) {
      for (const other of wanting) if (other !== v) conflicts.push(v < other ? [v, other] : [other, v]);
      wanting.push(v);
    } else {
      this.reverseTarget.set(vPos, [v]);
    }
    const list = this.reverseTarget.get(vTarget);
    const at = list.indexOf(v);
    if (at < 0) throw new Error(`MotionCheck: train ${v} is not among those wanting ${vTarget}`);
    list.splice(at, 1);
  }

  /** Will the train move: it wants to and nothing stops it. */
  checkMotion(i) {
    return !this.stopped.has(i);
  }
}
