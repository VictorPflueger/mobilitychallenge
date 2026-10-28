// Runs a controller through the engine and keeps what the interface shows: every train's place and
// state at every step (the frames), each reward component (the ledger), the timetable as it was
// actually run, and a readable log of events. The engine computes the score; this module only
// watches (it reads the environment after each step and changes nothing).

import { RailEnv, STATE, isOffMap, runEpisode } from "./engine/env.js";

/** Reward components, in the order the score breakdown lists them. */
export const KINDS = [
  { id: "collision", label: "Collisions", hint: "A moving train ran into an occupied cell and was stopped: 936 × its speed", tone: "danger" },
  { id: "stop_missed", label: "Stops never reached", hint: "499.2 per stop the train never came to", tone: "danger" },
  { id: "stop_passed", label: "Stops passed without stopping", hint: "499.2 per stop the train ran through", tone: "danger" },
  { id: "not_arrived", label: "Not arrived by the end", hint: "The delay still ahead of a train on the map when time runs out", tone: "danger" },
  { id: "cancelled", label: "Never departed", hint: "4 × (the trip's travel time + 374.4) for a train that never entered", tone: "danger" },
  { id: "stop_late", label: "Late at stops", hint: "0.5 per step after a stop's latest arrival", tone: "warning" },
  { id: "stop_early", label: "Early departures", hint: "1.75 per step before a stop's earliest departure", tone: "warning" },
  { id: "target_late", label: "Late at the destination", hint: "1 per step after the latest arrival", tone: "warning" }
];

/** The platforms of waypoint k of a train: the set of (cell, direction) keys it counts at. */
const platformKeys = (agent, k) => new Set(agent.waypoints[k].filter((w) => w.dir !== null && w.dir >= 0).map((w) => w.cell * 4 + w.dir));

export function simulate(scenario, controller) {
  const env = new RailEnv(scenario);
  env.ledger = [];
  const agents = scenario.agents;
  const n = agents.length;
  const cap = scenario.maxSteps + 1;
  const frames = {
    n,
    pos: new Int32Array(cap * n).fill(-1),
    dir: new Int8Array(cap * n),
    state: new Int8Array(cap * n),
    blocked: new Uint8Array(cap * n),
    speed: new Float32Array(cap * n),
    action: new Int8Array(cap * n),
    lateBy: new Int16Array(cap * n),
    idle: new Int16Array(cap * n),
    total: new Float64Array(cap),
    trainTotal: new Float64Array(cap * n)
  };
  agents.forEach((a, i) => { frames.dir[i] = a.initialDir; frames.speed[i] = a.maxSpeed; });

  const platforms = agents.map((a) => a.waypoints.map((_, k) => (k === 0 || k === a.waypoints.length - 1 ? new Set() : platformKeys(a, k))));
  const timetable = agents.map((a) => ({
    arrived: a.waypoints.map(() => null),
    stopped: a.waypoints.map(() => null),
    departed: a.waypoints.map(() => null),
    entered: null,
    doneAt: null
  }));
  const events = [];
  const at = new Array(n).fill(-1); // the stop whose platform each train stands on, -1 if none
  const t0 = performance.now();

  runEpisode(env, controller, (e, actions, rewards, total) => {
    const t = e.elapsed;
    frames.total[t] = total;
    for (const a of e.agents) {
      const i = a.handle;
      const o = t * n + i;
      frames.pos[o] = a.pos;
      frames.dir[o] = a.dir ?? -1;
      frames.state[o] = a.state;
      frames.speed[o] = a.speed;
      frames.action[o] = actions[i];
      frames.blocked[o] = e.lastStep[i].blocked ? 1 : 0;
      frames.trainTotal[o] = frames.trainTotal[o - n] + rewards[i].v;
      const tt = timetable[i];
      const prevPos = frames.pos[o - n];

      if (prevPos === -1 && a.pos !== -1) {
        tt.entered = t;
        events.push({ step: t, train: i, kind: "enter", late: Math.max(0, t - a.earliestDeparture) });
      }
      // leaving a platform
      if (at[i] >= 0 && a.pos !== prevPos) {
        const k = at[i];
        tt.departed[k] = t;
        events.push({ step: t, train: i, kind: tt.stopped[k] === null ? "pass" : "leave", stop: k, early: Math.max(0, a.wpEd[k] - t) });
        at[i] = -1;
      }
      // on a platform of one of its stops
      if (a.pos !== -1 && at[i] < 0) {
        const key = a.pos * 4 + a.dir;
        const k = platforms[i].findIndex((p) => p.has(key));
        if (k > 0) {
          at[i] = k;
          if (tt.arrived[k] === null) {
            tt.arrived[k] = t;
            events.push({ step: t, train: i, kind: "reach", stop: k, late: Math.max(0, t - a.wpLa[k]) });
          }
        }
      }
      if (at[i] >= 0 && a.state === STATE.STOPPED && tt.stopped[at[i]] === null) {
        tt.stopped[at[i]] = t;
        events.push({ step: t, train: i, kind: "stop", stop: at[i], late: Math.max(0, tt.arrived[at[i]] - a.wpLa[at[i]]) });
      }
      if (a.state === STATE.DONE && tt.doneAt === null) {
        tt.doneAt = t;
        at[i] = -1;
        events.push({ step: t, train: i, kind: "arrive", late: Math.max(0, t - a.latestArrival) });
      }

      // How far behind the timetable the train is now.
      let late = 0;
      if (a.state !== STATE.DONE && !(isOffMap(a.state) && t < a.earliestDeparture)) {
        if (at[i] >= 0) {
          late = Math.max(0, tt.arrived[at[i]] - a.wpLa[at[i]]);
        } else {
          // the next timetable point after the last stop it reached (a stop it skipped is gone)
          let k = 1;
          for (let j = a.waypoints.length - 2; j >= 1; j -= 1) if (tt.arrived[j] !== null) { k = j + 1; break; }
          late = Math.max(0, t - (k < a.waypoints.length - 1 ? a.wpLa[k] : a.latestArrival));
        }
      } else if (a.state === STATE.DONE) {
        late = Math.max(0, tt.doneAt - a.latestArrival);
      }
      frames.lateBy[o] = Math.min(late, 32767);
      // How long the train has stood in the same cell (0 while it moves or is off the map).
      frames.idle[o] = a.pos !== -1 && a.pos === prevPos ? Math.min(frames.idle[o - n] + 1, 32767) : 0;
    }
    for (const entry of e.ledger) {
      if (entry.step === t && entry.kind === "collision" && !entry.logged) {
        entry.logged = true;
        events.push({ step: t, train: entry.agent, kind: "collision", value: entry.value });
      }
    }
  });

  const steps = env.elapsed;
  // Reward components booked at a train's arrival or at the end: one event per train and moment.
  const booked = new Map();
  for (const entry of env.ledger) {
    if (entry.kind === "collision") continue;
    const k = `${entry.step}|${entry.agent}`;
    if (!booked.has(k)) booked.set(k, { step: entry.step, train: entry.agent, kind: "account", items: [] });
    booked.get(k).items.push(entry);
  }
  events.push(...booked.values());
  const order = { enter: 0, reach: 1, stop: 2, leave: 3, pass: 3, collision: 4, arrive: 5, account: 6 };
  events.sort((x, y) => x.step - y.step || order[x.kind] - order[y.kind] || x.train - y.train);

  return {
    id: controller.id,
    steps,
    score: frames.total[steps],
    frames,
    ledger: env.ledger,
    timetable,
    events,
    ambiguous: env.ambiguous,
    millis: performance.now() - t0
  };
}

/** The score's components up to and including step t: { kind: { value, count } }. */
export function breakdown(run, t) {
  const out = Object.fromEntries(KINDS.map((k) => [k.id, { value: 0, count: 0 }]));
  for (const e of run.ledger) {
    if (e.step > t) continue;
    const b = out[e.kind];
    b.value += e.value;
    if (e.value !== 0 || e.kind === "stop_missed" || e.kind === "stop_passed") b.count += 1;
  }
  return out;
}

/** Steps a train may stand still, beyond its departure time, before it counts as stuck. */
export const STUCK_STEPS = 40;

/** What a train is doing at step t, in words and as a tone for the map. */
export function trainStatus(run, scenario, i, t) {
  const f = run.frames;
  const o = t * f.n + i;
  const a = scenario.agents[i];
  const state = f.state[o];
  const late = f.lateBy[o];
  const tt = run.timetable[i];
  const last = t >= run.steps;
  if (state === STATE.DONE) return { word: late ? `Arrived ${late} late` : "Arrived on time", tone: late ? "late" : "done", short: "arrived" };
  if (isOffMap(state)) {
    if (last) return { word: "Never departed", tone: "lost", short: "cancelled" };
    if (t < a.earliestDeparture) return { word: `Departs at step ${a.earliestDeparture}`, tone: "waiting", short: "waiting" };
    return { word: f.blocked[o] ? "Ready, origin occupied" : "Ready to depart", tone: late ? "late" : "waiting", short: "ready" };
  }
  if (last) return { word: "Did not arrive", tone: "lost", short: "lost" };
  if (f.blocked[o]) return { word: "Blocked by a train ahead", tone: "blocked", short: "blocked" };
  const standing = state === STATE.STOPPED;
  let platform = null;
  for (let k = 1; k < a.waypoints.length - 1; k += 1) {
    if (tt.arrived[k] !== null && tt.arrived[k] <= t && (tt.departed[k] === null || tt.departed[k] > t)) platform = k;
  }
  // Standing still long after it should have left: stuck (a dwell before the departure time is not).
  const idle = f.idle[o];
  const dueOut = platform ? a.wpEd[platform] : -Infinity;
  if (standing && idle >= STUCK_STEPS && t - dueOut >= STUCK_STEPS) {
    return { word: `Stuck for ${idle} steps`, tone: "blocked", standing: true, platform, short: "stuck" };
  }
  const behind = late ? ` · ${late} behind` : "";
  if (standing) return { word: platform ? `At a platform${behind}` : `Holding${behind}`, tone: late ? "late" : "ontime", standing: true, platform, short: "standing" };
  return { word: `Running${behind}`, tone: late ? "late" : "ontime", platform, short: "running" };
}
