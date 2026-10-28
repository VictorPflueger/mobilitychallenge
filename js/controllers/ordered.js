// The challenge's baseline, OrderedController (src/controller/orderedcontroller.py), with the part of
// flatland's tree observation (TreeObsForRailEnv, envs/observations.py) it reads: for each branch
// from the train's cell, left, forward, right and back, the distance to the target at the end of
// the branch (dist_min_to_target of the first-level nodes). The rest of the tree is not needed.

import { STATE, isOffMap, isOnMap } from "../engine/env.js";
import { distanceAt } from "../engine/rail.js";
import { pyMod } from "../engine/py.js";

const popcount = (x) => { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
const argmax = (t) => (t[0] === 1 ? 0 : t[1] === 1 ? 1 : t[2] === 1 ? 2 : 3);

/** _explore_branch(handle, position, direction, 1, 1), reduced to its dist_min_to_target. */
function branchDistance(env, agent, cell, direction) {
  const rail = env.rail;
  const dm = env.distanceMaps[agent.handle];
  const visited = new Set();
  let lastIsTarget = false;
  let lastIsDeadEnd = false;
  let exploring = true;
  while (exploring) {
    const transitions = rail.transitions(cell, direction);
    let total = popcount(rail.fullTransitions(cell));
    const key = cell * 4 + direction;
    if (visited.has(key)) break; // a cycle: terminal
    visited.add(key);
    if (cell === agent.target) { lastIsTarget = true; break; }
    if (rail.isCrossing(cell)) total = 2;
    const count = transitions[0] + transitions[1] + transitions[2] + transitions[3];
    exploring = false;
    if (count === 1) {
      if (total === 1) lastIsDeadEnd = true;
      if (!lastIsDeadEnd) {
        exploring = true;
        direction = argmax(transitions);
        cell = rail.next(cell, direction);
      }
    } else {
      break; // a switch, or a cell without transitions (terminal)
    }
  }
  return lastIsTarget ? 0 : distanceAt(dm, cell, direction);
}

/** The four first-level distances [L, F, R, B]; Infinity where the tree has no branch. */
export function childDistances(env, handle) {
  const agent = env.agents[handle];
  let cell;
  if (isOffMap(agent.state)) cell = agent.initialPos;
  else if (isOnMap(agent.state)) cell = agent.pos;
  else if (agent.state === STATE.DONE) cell = agent.target;
  const possible = env.rail.transitions(cell, agent.dir);
  const count = possible[0] + possible[1] + possible[2] + possible[3];
  const orientation = count === 1 ? argmax(possible) : agent.dir;
  const out = [Infinity, Infinity, Infinity, Infinity];
  for (let i = 0; i < 4; i += 1) {
    const branch = pyMod(orientation + i - 1, 4);
    if (possible[branch]) out[i] = branchDistance(env, agent, env.rail.next(cell, branch), branch);
  }
  return out;
}

/** OrderedController.act: the branch with the smallest distance; ties go to the last one. */
export function orderedAction(env, handle) {
  const distance = childDistances(env, handle);
  let best = Infinity;
  for (let i = distance.length - 1; i >= 0; i -= 1) if (distance[i] >= 0 && distance[i] < best) best = distance[i];
  const ties = [];
  distance.forEach((d, i) => { if (d === best) ties.push(i); });
  return (ties.length > 1 ? ties[ties.length - 1] : ties[0]) + 1;
}

export class OrderedController {
  constructor() {
    this.id = "baseline";
  }

  act(handle, env) {
    return orderedAction(env, handle);
  }
}
