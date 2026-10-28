// The estimate of the leaderboard's current best (-37,374): a rule-based controller, the port of
// tools/estimate_controller.py (its Python reference, which tests/engine.mjs compares this with).
// The leaderboard entry's code is not public; this is a reconstruction of the kind of controller
// that lands there:
//   1. routing: the baseline's choice (the shortest branch to the final target);
//   2. no collisions: brake when the cell the action leads into is occupied;
//   3. timetable stops: on a platform of the next timetabled stop, brake until STOPPED there;
//   4. no early departure: stay until that stop's earliest departure, then go on.

import { STATE } from "../engine/env.js";
import { ACTION } from "../engine/rail.js";
import { orderedAction } from "./ordered.js";

export class EstimateController {
  constructor() {
    this.id = "estimate";
    this.nextStop = new Map();
  }

  reset() {
    this.nextStop = new Map();
  }

  act(handle, env) {
    const agent = env.agents[handle];

    // Rules 3 and 4.
    if (!this.nextStop.has(handle)) this.nextStop.set(handle, 1);
    const k = this.nextStop.get(handle);
    if (agent.pos !== -1 && k < agent.waypoints.length - 1) {
      const onPlatform = agent.waypoints[k].some((w) => w.cell === agent.pos && w.dir === agent.dir);
      if (onPlatform) {
        if (agent.state === STATE.STOPPED && env.elapsed >= agent.wpEd[k]) this.nextStop.set(handle, k + 1);
        else return ACTION.STOP_MOVING;
      }
    }

    // Rule 1.
    const action = orderedAction(env, handle);

    // Rule 2. The Python reference passes the action as a plain int, which RailEnvActions never
    // equals, so at a switch the cell checked is the one straight ahead (compareActions false).
    const onMap = agent.pos !== -1;
    const cell = onMap ? agent.pos : agent.initialPos;
    const direction = onMap ? agent.dir : agent.initialDir;
    const next = env.rail.checkActionOnAgent(action, cell, direction, false).position;
    const r = onMap ? next.r : env.rail.row(cell);
    const c = onMap ? next.c : env.rail.col(cell);
    const occupied = env.agents.some((o) => o.handle !== handle && o.pos !== -1
      && env.rail.row(o.pos) === r && env.rail.col(o.pos) === c);
    return occupied ? ACTION.STOP_MOVING : action;
  }
}
