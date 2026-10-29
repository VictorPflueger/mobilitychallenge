// The challenge's environment in the browser: flatland-rl 4.2.2 RailEnv.step (envs/rail_env.py)
// with its train state machine and speed counter (envs/step_utils/), the challenge's reward
// function (src/rewards_fix.py) and its "balanced" penalties (src/scaled_penalties.py), loaded the
// way src/scenario_loader.py loads a map. Ported line by line; tests/engine.mjs compares every
// step with the Python environment. Malfunctions are off, as in the challenge's runner.

import { ACTION, Rail, computeDistanceMaps, shortestPathLength } from "./rail.js";
import { MotionCheck } from "./motion.js";
import { add, float, int, pyRound, pySum } from "./py.js";

export const STATE = { WAITING: 0, READY_TO_DEPART: 1, MALFUNCTION_OFF_MAP: 2, MOVING: 3, STOPPED: 4, MALFUNCTION: 5, DONE: 6 };
const { WAITING, READY_TO_DEPART, MALFUNCTION_OFF_MAP, MOVING, STOPPED, MALFUNCTION, DONE } = STATE;
export const isOffMap = (s) => s === WAITING || s === READY_TO_DEPART || s === MALFUNCTION_OFF_MAP;
export const isOnMap = (s) => s === MOVING || s === STOPPED || s === MALFUNCTION;
const isMovingAction = (a) => a === ACTION.MOVE_LEFT || a === ACTION.MOVE_FORWARD || a === ACTION.MOVE_RIGHT;

/** RailEnvActions.from_value for the values a controller returns: 0 to 4, anything else DO_NOTHING. */
const fromValue = (a) => (Number.isInteger(a) && a >= 0 && a <= 4 ? a : ACTION.DO_NOTHING);

/** get_scaled_penalties(max_episode_steps, profile="balanced"), the scenario loader's choice. */
export function balancedPenalties(maxSteps) {
  return {
    crash: 0.75 * maxSteps,
    cancellationFactor: 4.0,
    cancellationBuffer: 0.30 * maxSteps,
    notServed: 0.40 * maxSteps,
    earlyDeparture: 1.75,
    lateArrival: 0.5
  };
}

/** scenario_loader.load: the rail, the trains with their waypoints and timetable, the crossings. */
export function loadScenario(data) {
  const rail = new Rail(data.grid);
  const cellOf = ([r, c]) => r * rail.width + c;
  const line = data["flatland line"];
  const timetable = data["flatland timetable"];
  const agents = line.agent_positions.map((positions, i) => {
    const directions = line.agent_directions[i];
    const waypoints = positions.map((alternatives, k) => {
      const n = Math.min(alternatives.length, directions[k].length); // zip()
      return alternatives.slice(0, n).map((p, j) => ({ cell: cellOf(p), dir: directions[k][j] }));
    });
    waypoints.push([{ cell: cellOf(line.agent_targets[i][0]), dir: null }]);
    const speed = 1 / pyRound(1 / line.agent_speeds[i]); // SpeedCounter(speed)
    const ed = timetable.earliest_departures[i];
    const la = timetable.latest_arrivals[i];
    return {
      handle: i,
      initialPos: waypoints[0][0].cell,
      initialDir: waypoints[0][0].dir,
      target: waypoints[waypoints.length - 1][0].cell,
      waypoints,
      wpEd: ed,
      wpLa: la,
      earliestDeparture: ed[0],
      latestArrival: la[la.length - 1],
      maxSpeed: speed,
      lineSpeed: line.agent_speeds[i]
    };
  });
  return {
    rail,
    agents,
    levelFree: new Set(data.overpasses.map(cellOf)),
    maxSteps: timetable.max_episode_steps
  };
}

/** The scenario loader's speed changes per step: a train speeds up by 0.3, brakes by 0.5. */
export const ACCELERATION = 0.3;
export const BRAKING = -0.5;

export class RailEnv {
  constructor(scenario, { accelerationDelta = ACCELERATION, brakingDelta = BRAKING } = {}) {
    this.scenario = scenario;
    this.rail = scenario.rail;
    this.levelFree = scenario.levelFree;
    this.maxSteps = scenario.maxSteps;
    this.penalty = balancedPenalties(scenario.maxSteps);
    this.accelerationDelta = accelerationDelta;
    this.brakingDelta = brakingDelta;
    this.distanceMaps = computeDistanceMaps(this.rail, scenario.agents.map((a) => a.target));
    this.ledger = null;
  }

  reset() {
    this.agents = this.scenario.agents.map((a) => ({
      ...a,
      pos: -1,
      dir: a.initialDir,
      oldPos: -1,
      oldDir: null,
      state: WAITING,
      prevState: null,
      speed: a.maxSpeed,
      distance: 0,
      isCellEntry: true,
      arrivalTime: null,
      malfunctionDown: 0,
      sig: { inMalfunction: false, earliestDepartureReached: false, stopActionGiven: false, movementActionGiven: false, targetReached: false, movementAllowed: false, newSpeedZero: false }
    }));
    this.elapsed = 0;
    this.dones = this.agents.map(() => false);
    this.allDone = false;
    this.book = this.agents.map(() => ({ arrivals: new Map(), departures: new Map(), states: new Map() }));
    this.ambiguous = [];
    this.lastStep = null;
  }

  /**
   * Optional record of every reward component, for the interface's breakdown: an array that the
   * reward functions append { step, agent, kind, value, stop } to. It changes no computation.
   */
  note(agent, kind, value, stop = null) {
    if (this.ledger) this.ledger.push({ step: this.elapsed, agent: agent.handle, kind, value, stop });
  }

  // ---- speed counter (envs/step_utils/speed_counter.py) --------------------------------------------
  isCellExit(agent, speed) {
    const s = Math.max(Math.min(speed, agent.maxSpeed), 0.0);
    return agent.distance + s >= 1.0;
  }

  speedStep(agent, speed) {
    agent.speed = Math.max(Math.min(speed, agent.maxSpeed), 0.0);
    agent.distance += agent.speed;
    agent.distance %= 1.0;
    agent.isCellEntry = agent.distance < agent.speed;
  }

  // ---- state machine (envs/step_utils/state_machine.py) --------------------------------------------
  static canGetMovingIndependent(state, inMalfunction, movementActionGiven, newSpeed, stopActionGiven) {
    let can = state === MOVING && !(stopActionGiven && newSpeed === 0.0);
    can = can || (state === MALFUNCTION && !inMalfunction && movementActionGiven);
    can = can || (state === STOPPED && movementActionGiven);
    return can && !inMalfunction;
  }

  static nextState(state, g) {
    switch (state) {
      case WAITING:
        return g.inMalfunction ? MALFUNCTION_OFF_MAP : g.earliestDepartureReached ? READY_TO_DEPART : WAITING;
      case READY_TO_DEPART:
        return g.inMalfunction ? MALFUNCTION_OFF_MAP : g.movementActionGiven && g.movementAllowed ? MOVING : READY_TO_DEPART;
      case MALFUNCTION_OFF_MAP:
        if (g.inMalfunction) return MALFUNCTION_OFF_MAP;
        if (!g.earliestDepartureReached) return WAITING;
        if (g.movementActionGiven && g.movementAllowed) return MOVING;
        if (g.stopActionGiven && g.movementAllowed) return STOPPED;
        return READY_TO_DEPART;
      case MOVING:
        if (g.inMalfunction) return MALFUNCTION;
        if (g.targetReached) return DONE;
        if ((g.stopActionGiven && g.newSpeedZero) || !g.movementAllowed) return STOPPED;
        return MOVING;
      case STOPPED:
        return g.inMalfunction ? MALFUNCTION : g.movementActionGiven && g.movementAllowed ? MOVING : STOPPED;
      case MALFUNCTION:
        if (g.inMalfunction) return MALFUNCTION;
        return g.movementActionGiven && g.movementAllowed ? MOVING : STOPPED;
      case DONE:
        return DONE;
      default:
        throw new Error(`unexpected state ${state}`);
    }
  }

  static setState(agent, state) {
    agent.prevState = agent.state;
    agent.state = state;
  }

  /** A cell, or one axis of a level-free cell, as MotionCheck's resource; null when off the map. */
  resource(cell, direction) {
    if (cell === -1) return null;
    const rc = `${this.rail.row(cell)},${this.rail.col(cell)}`;
    return this.levelFree.has(cell) ? `${rc}|${direction % 2}` : rc;
  }

  // ---- one step (RailEnv.step) -----------------------------------------------------------------------
  /** actions: the raw action of every train. Returns each train's reward as { v, isFloat }. */
  step(actions) {
    this.elapsed += 1;
    if (this.allDone) throw new Error("Episode is done, cannot call step()");
    const rewards = this.agents.map(() => int(0));
    const motion = new MotionCheck();
    const data = new Array(this.agents.length);

    for (const agent of this.agents) {
      const i = agent.handle;
      agent.oldPos = agent.pos;
      agent.oldDir = agent.dir;
      const raw = fromValue(actions[i]);
      let cell = agent.pos;
      let direction = agent.dir;
      if (cell === -1) { cell = agent.initialPos; direction = agent.initialDir; }
      const independent = this.rail.checkActionOnAgent(raw, cell, direction);
      const preprocessed = independent.action;
      const stopActionGiven = preprocessed === ACTION.STOP_MOVING;
      const inMalfunction = agent.malfunctionDown > 0;
      const movementActionGiven = isMovingAction(preprocessed);
      const earliestDepartureReached = agent.earliestDeparture <= this.elapsed;
      let newSpeed = agent.speed;
      const state = agent.state;
      if ((state === STOPPED || state === MALFUNCTION) && movementActionGiven) newSpeed += this.accelerationDelta;
      else if (preprocessed === ACTION.MOVE_FORWARD && raw === ACTION.MOVE_FORWARD) newSpeed += this.accelerationDelta;
      else if (stopActionGiven) newSpeed += this.brakingDelta;
      newSpeed = Math.max(0.0, Math.min(agent.maxSpeed, newSpeed));

      let newPos;
      let newDir;
      if (state === READY_TO_DEPART && movementActionGiven) {
        newPos = agent.initialPos; newDir = agent.initialDir;
      } else if (state === MALFUNCTION_OFF_MAP && !inMalfunction && earliestDepartureReached && (movementActionGiven || stopActionGiven)) {
        newPos = agent.initialPos; newDir = agent.initialDir;
      } else if (isOnMap(state)) {
        newPos = agent.pos; newDir = agent.dir;
        if (this.isCellExit(agent, newSpeed)
          && RailEnv.canGetMovingIndependent(state, inMalfunction, movementActionGiven, newSpeed, stopActionGiven)) {
          const { r, c } = independent.position;
          if (!this.rail.inBounds(r, c)) throw new Error(`train ${i} would leave the grid at step ${this.elapsed}`);
          newPos = this.rail.index(r, c);
          newDir = independent.direction;
        }
      } else {
        newPos = -1; newDir = null;
      }
      if (newPos !== -1 && !this.rail.transitions(newPos, newDir).some(Boolean)) {
        throw new Error(`train ${i}: (${this.rail.row(newPos)}, ${this.rail.col(newPos)}) facing ${newDir} is not valid on the grid`);
      }

      const sig = agent.sig;
      sig.inMalfunction = agent.malfunctionDown > 0;
      sig.earliestDepartureReached = this.elapsed >= agent.earliestDeparture;
      sig.stopActionGiven = stopActionGiven;
      sig.movementActionGiven = movementActionGiven;
      sig.targetReached = null;
      sig.movementAllowed = null;
      sig.newSpeedZero = newSpeed === 0.0;
      const current = this.resource(agent.pos, agent.dir);
      data[i] = { speed: agent.speed, newPos, newDir, newSpeed, current, raw, preprocessed };
      motion.addAgent(i, current, this.resource(newPos, newDir));
    }

    motion.findConflicts();

    let allEnded = true;
    for (const agent of this.agents) {
      const i = agent.handle;
      const d = data[i];
      const motionOk = motion.checkMotion(i);
      agent.sig.movementAllowed = (isOnMap(agent.state) && !this.isCellExit(agent, d.newSpeed)) || motionOk;
      d.blocked = !motionOk && d.newPos !== -1 && d.newPos !== agent.pos;
      RailEnv.setState(agent, RailEnv.nextState(agent.state, agent.sig));
      if (agent.state === MOVING) {
        agent.pos = d.newPos;
        agent.dir = d.newDir;
        if (!(agent.prevState === READY_TO_DEPART || agent.prevState === MALFUNCTION_OFF_MAP)) this.speedStep(agent, d.newSpeed);
        agent.sig.targetReached = agent.pos === agent.target; // update_if_reached
        if (agent.sig.targetReached) RailEnv.setState(agent, DONE);
      } else if (agent.prevState === MALFUNCTION_OFF_MAP && agent.state === STOPPED) {
        agent.pos = agent.initialPos;
        agent.dir = agent.initialDir;
      }
      if (isOnMap(agent.state) && agent.state !== MOVING) this.speedStep(agent, 0);
      if (agent.state === DONE && agent.arrivalTime === null) { // handle_done_state
        agent.arrivalTime = this.elapsed;
        this.dones[i] = true;
        agent.pos = -1; // remove_agents_at_target
      }
      allEnded = allEnded && agent.state === DONE;
      rewards[i] = pySum([rewards[i], this.stepReward(agent, d)]); // rewards.cumulate
      if (agent.malfunctionDown > 0) agent.malfunctionDown -= 1;
    }

    if (allEnded || this.elapsed >= this.maxSteps) { // end_of_episode_update
      for (const agent of this.agents) {
        rewards[agent.handle] = pySum([rewards[agent.handle], this.endOfEpisodeReward(agent)]);
        this.dones[agent.handle] = true;
      }
      this.allDone = true;
    }
    this.verifyResources();
    this.lastStep = data;
    return rewards;
  }

  verifyResources() {
    const seen = new Set();
    for (const a of this.agents) {
      if (a.pos === -1) continue;
      const r = this.resource(a.pos, a.dir);
      if (seen.has(r)) throw new Error(`two trains on resource ${r} at step ${this.elapsed}`);
      seen.add(r);
    }
  }

  // ---- rewards (src/rewards_fix.py, DefaultRewards) ------------------------------------------------
  static wpKey(cell, direction) {
    return cell === -1 ? -10 - (direction ?? 0) : cell * 4 + direction;
  }

  stepReward(agent, d) {
    let reward = int(0);
    const book = this.book[agent.handle];
    if (agent.pos !== -1) {
      const key = RailEnv.wpKey(agent.pos, agent.dir);
      let states = book.states.get(key);
      if (!states) { states = new Set(); book.states.set(key, states); }
      states.add(agent.state);
      if (!book.arrivals.has(key)) {
        book.arrivals.set(key, this.elapsed);
        book.departures.set(RailEnv.wpKey(agent.oldPos, agent.oldDir), this.elapsed);
      } else if (RailEnv.wpKey(agent.oldPos, agent.oldDir) !== key) {
        throw new Error(`Agent ${agent.handle} revisiting waypoint at step ${this.elapsed} (the reward function rejects this)`);
      }
    }
    if (agent.prevState === MOVING && agent.state === STOPPED && !agent.sig.stopActionGiven) {
      const crash = float((-1 * d.speed) * this.penalty.crash);
      reward = add(reward, crash);
      this.note(agent, "collision", crash.v);
    }
    if (agent.state === DONE && agent.prevState !== DONE) reward = add(reward, this.doneOrMaxStepsReward(agent));
    return reward;
  }

  endOfEpisodeReward(agent) {
    if (agent.state === DONE) return int(0);
    return this.doneOrMaxStepsReward(agent);
  }

  /** get_travel_time_on_shortest_path: ceil(waypoints on the shortest path / max speed). */
  travelTime(agent) {
    let cell;
    if (isOffMap(agent.state)) cell = agent.initialPos;
    else if (isOnMap(agent.state)) cell = agent.pos;
    else cell = agent.target;
    const length = shortestPathLength(this.rail, this.distanceMaps[agent.handle], cell, agent.dir, agent.target);
    return Math.ceil((length ?? 0) / agent.maxSpeed);
  }

  /** The stop of waypoint k as served: the arrival key, or null when it was not reached. */
  stopArrival(agent, k) {
    const book = this.book[agent.handle];
    const hits = [];
    for (const w of agent.waypoints[k]) {
      if (w.dir === null || w.dir < 0 || w.dir > 3) continue;
      const key = RailEnv.wpKey(w.cell, w.dir);
      if (book.arrivals.has(key) && !hits.includes(key)) hits.push(key);
    }
    if (hits.length > 1) this.ambiguous.push({ agent: agent.handle, stop: k });
    return hits.length ? hits[0] : null;
  }

  doneOrMaxStepsReward(agent) {
    let reward = int(0);
    if (agent.state === DONE) {
      reward = int(Math.min(agent.latestArrival - agent.arrivalTime, 0));
      this.note(agent, "target_late", reward.v);
    } else {
      if (isOffMap(agent.state)) {
        reward = float((-1 * this.penalty.cancellationFactor) * (this.travelTime(agent) + this.penalty.cancellationBuffer));
        this.note(agent, "cancelled", reward.v);
      }
      if (isOnMap(agent.state)) {
        reward = int((agent.latestArrival - this.elapsed) - this.travelTime(agent));
        this.note(agent, "not_arrived", reward.v);
      }
    }
    const book = this.book[agent.handle];
    for (let k = 1; k < agent.waypoints.length - 1; k += 1) {
      const wp = this.stopArrival(agent, k);
      if (wp === null || !book.states.get(wp).has(STOPPED)) {
        reward = add(reward, float(-1 * this.penalty.notServed));
        this.note(agent, wp === null ? "stop_missed" : "stop_passed", -1 * this.penalty.notServed, k);
      } else {
        const late = float(this.penalty.lateArrival * Math.min(agent.wpLa[k] - book.arrivals.get(wp), 0));
        reward = add(reward, late);
        this.note(agent, "stop_late", late.v, k);
        if (book.departures.has(wp)) {
          const early = float(this.penalty.earlyDeparture * Math.min(book.departures.get(wp) - agent.wpEd[k], 0));
          reward = add(reward, early);
          this.note(agent, "stop_early", early.v, k);
        }
      }
    }
    return reward;
  }
}

/**
 * run_episode of src/tbrain-simulation.py without rendering: every step, a train that is done
 * gets STOP_MOVING (4), every other train the controller's action, in handle order; the score is
 * the running sum of each step's rewards. onStep(env, actions, rewards, total) runs after a step.
 */
export function runEpisode(env, controller, onStep = null) {
  env.reset();
  if (controller.reset) controller.reset(env);
  const maxSteps = Math.min(100000, 100 * (env.rail.height + env.rail.width) - 1);
  let total = int(0);
  for (let step = 0; step < maxSteps; step += 1) {
    const actions = env.agents.map((a) => (env.dones[a.handle] ? ACTION.STOP_MOVING : controller.act(a.handle, env)));
    const rewards = env.step(actions);
    total = add(total, pySum(rewards));
    if (onStep) onStep(env, actions, rewards, total.v);
    if (env.allDone) break;
  }
  return { reward: total.v, steps: env.elapsed };
}
