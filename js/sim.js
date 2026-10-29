// Runs a controller through the engine and keeps what the interface shows: every train's place and
// state at every step (the frames), where the map draws it between steps (the paths, js/glide.js),
// each reward component (the ledger), the timetable as the reward function counted it, and a
// readable log of events. The engine computes the score; this module only watches (it reads the
// environment after each step and changes nothing).

import { RailEnv, STATE, isOffMap, runEpisode } from "./engine/env.js";
import { amount } from "./format.js";
import { trainPaths } from "./glide.js";

/**
 * Reward components, in the order the score breakdown lists them. hint(P) says what each costs, with
 * the penalties as the challenge scales them to the map's episode (balancedPenalties in
 * js/engine/env.js: Neu-Frankfurt's 1,248 steps make a lost stop 499.2, Köln's 1,710 make it 684).
 */
export const KINDS = [
  { id: "collision", label: "Collisions", hint: (P) => `A moving train ran into an occupied cell and was stopped: ${amount(P.crash)} × its speed`, tone: "danger" },
  { id: "stop_missed", label: "Stops never reached", hint: (P) => `${amount(P.notServed)} per stop the train never came to`, tone: "danger" },
  { id: "stop_passed", label: "Stops passed without stopping", hint: (P) => `${amount(P.notServed)} per stop the train ran through`, tone: "danger" },
  { id: "not_arrived", label: "Not arrived by the end", hint: () => "The delay still ahead of a train on the map when time runs out", tone: "danger" },
  { id: "cancelled", label: "Never departed", hint: (P) => `${amount(P.cancellationFactor)} × (the trip's travel time + ${amount(P.cancellationBuffer)}) for a train that never entered`, tone: "danger" },
  { id: "stop_late", label: "Late at stops", hint: (P) => `${amount(P.lateArrival)} per step after a stop's latest arrival`, tone: "warning" },
  { id: "stop_early", label: "Early departures", hint: (P) => `${amount(P.earlyDeparture)} per step before a stop's earliest departure`, tone: "warning" },
  { id: "target_late", label: "Late at the destination", hint: () => "1 per step after the latest arrival", tone: "warning" }
];

/** The platforms of waypoint k of a train: the set of (cell, direction) keys it counts at. */
const platformKeys = (agent, k) => new Set(agent.waypoints[k].filter((w) => w.dir !== null && w.dir >= 0).map((w) => w.cell * 4 + w.dir));

/**
 * opts.bookings: for a run replayed from Python, the stops it booked in Python's hash order
 * (data/<map>/reference.json), which the engine books where Python did (js/engine/env.js).
 */
export function simulate(scenario, controller, { bookings = [] } = {}) {
  const env = new RailEnv(scenario, { bookings });
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
    platform: new Int8Array(cap * n), // the stop whose platform the train stands on, 0 for none
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
  // The platform each train stands on, as one visit: the stops it counts for (the stop the train
  // calls at first, see below), when the train got there and when it stood still there first; null
  // off a platform. called: the stops a train has called at, for its progress along the timetable.
  // stoppedAt: per platform (cell and direction), the first step the train stood still on it.
  const visit = agents.map(() => null);
  const called = agents.map((a) => a.waypoints.map(() => false));
  const stoppedAt = agents.map(() => new Map());
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
      } else if (tt.entered === null && tt.doneAt === null && a.state === STATE.DONE) {
        // A train whose first cell is its destination (Köln's S-Bahn loops) enters and is done in the
        // same step: the simulator finishes it at once and removes it, so it never shows on the map.
        tt.entered = t;
        events.push({ step: t, train: i, kind: "enter", late: Math.max(0, t - a.earliestDeparture), atTarget: true });
      }
      // leaving a platform
      if (visit[i] && a.pos !== prevPos) {
        const k = visit[i].stops[0];
        events.push({ step: t, train: i, kind: visit[i].stopped === null ? "pass" : "leave", stop: k, early: Math.max(0, a.wpEd[k] - t) });
        visit[i] = null;
      }
      // On a platform of one of its stops: the stop it calls at is the first whose platforms include
      // this one. A station called at twice may list some platforms for both calls (Köln's RB süd and
      // RB nord at Stop 2); the events and the train's progress follow the stop it calls at, the
      // timetable the platform the reward function counts for each stop (below).
      if (a.pos !== -1 && !visit[i]) {
        const key = a.pos * 4 + a.dir;
        const ks = [];
        platforms[i].forEach((p, k) => { if (k > 0 && p.has(key)) ks.push(k); });
        if (ks.length) {
          visit[i] = { stops: ks, arrived: t, stopped: null };
          called[i][ks[0]] = true;
          events.push({ step: t, train: i, kind: "reach", stop: ks[0], late: Math.max(0, t - a.wpLa[ks[0]]) });
        }
      }
      if (a.pos !== -1 && a.state === STATE.STOPPED) {
        const key = a.pos * 4 + a.dir;
        if (!stoppedAt[i].has(key)) stoppedAt[i].set(key, t);
        if (visit[i] && visit[i].stopped === null) {
          visit[i].stopped = t;
          const k = visit[i].stops[0];
          events.push({ step: t, train: i, kind: "stop", stop: k, late: Math.max(0, visit[i].arrived - a.wpLa[k]) });
        }
      }
      if (a.state === STATE.DONE && tt.doneAt === null) {
        tt.doneAt = t;
        visit[i] = null;
        events.push({ step: t, train: i, kind: "arrive", late: Math.max(0, t - a.latestArrival) });
      }
      frames.platform[o] = visit[i] ? visit[i].stops[0] : 0;

      // How far behind the timetable the train is now.
      let late = 0;
      if (a.state !== STATE.DONE && !(isOffMap(a.state) && t < a.earliestDeparture)) {
        if (visit[i]) {
          late = Math.max(0, visit[i].arrived - a.wpLa[visit[i].stops[0]]);
        } else {
          // the next timetable point after the last stop it called at (a stop it skipped is gone)
          let k = 1;
          for (let j = a.waypoints.length - 2; j >= 1; j -= 1) if (called[i][j]) { k = j + 1; break; }
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
  // The timetable as the reward function counts it: each stop at the platform the engine booked it
  // at (js/engine/env.js, stopArrival), when the train got there, first stood still there and left.
  // A platform listed for both calls at a station counts for both; where the train stood on two
  // listed platforms, the stop is the one the Python run booked.
  agents.forEach((a, i) => {
    const tt = timetable[i];
    const book = env.book[i];
    for (let k = 1; k < a.waypoints.length - 1; k += 1) {
      const key = env.bookedAt.get(`${i}:${k}`) ?? null;
      if (key === null) continue;
      tt.arrived[k] = book.arrivals.get(key);
      tt.stopped[k] = stoppedAt[i].get(key) ?? null;
      tt.departed[k] = book.departures.get(key) ?? null;
    }
  });
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
    paths: trainPaths(frames, steps, agents), // where the map draws each train (js/glide.js)
    ledger: env.ledger,
    timetable,
    events,
    ambiguous: env.ambiguous, // stops the engine could not book as the Python run did
    choices: env.choices, // stops it booked as recorded, among two or more platforms the train stood on
    bookedAt: env.bookedAt, // "train:stop" → the platform's key the stop is booked at (null: never reached)
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
  const platform = f.platform[o] || null;
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
