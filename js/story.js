// What happens in a run, in words: the facts a reader needs (how many trains arrived, whether the
// network jammed, how long trains waited at their entry, which stops were served) and the moments
// worth watching, each with its step and its train. Everything is computed from the run the engine
// simulated and from the scenario; nothing here is typed in. tests/story.mjs checks these facts
// against the Python runner's own traces.

import { STATE } from "./engine/env.js";
import { stationName } from "./network.js";
import { amount, count, plural, score } from "./format.js";

/** The facts of a run. */
export function runFacts(run, scenario) {
  const f = run.frames;
  const n = f.n;
  const T = run.steps;
  const agents = scenario.agents;

  const arrivals = run.timetable.map((tt) => tt.doneAt);
  const arrived = arrivals.filter((s) => s !== null).length;
  const lastArrival = arrived ? Math.max(...arrivals.filter((s) => s !== null)) : null;

  const collisions = run.ledger.filter((e) => e.kind === "collision");

  // The last step at which any train changed cell (entering and leaving the map included). If
  // trains are still on the map at the end and nothing moved after that step, the network jammed.
  let lastChange = 0;
  for (let t = 1; t <= T; t += 1) {
    for (let i = 0; i < n; i += 1) if (f.pos[t * n + i] !== f.pos[(t - 1) * n + i]) { lastChange = t; break; }
  }
  const leftOver = [];
  for (let i = 0; i < n; i += 1) if (arrivals[i] === null) leftOver.push(i);
  const onMapAtEnd = leftOver.filter((i) => f.pos[T * n + i] >= 0);
  const gridlockFrom = onMapAtEnd.length && lastChange < T ? lastChange + 1 : null;

  // Stops: served (halted at a platform), passed (ran through), missed (never reached).
  let stops = 0;
  let served = 0;
  let passed = 0;
  run.timetable.forEach((tt, i) => {
    for (let k = 1; k < agents[i].waypoints.length - 1; k += 1) {
      stops += 1;
      if (tt.stopped[k] !== null) served += 1;
      else if (tt.arrived[k] !== null) passed += 1;
    }
  });

  // Waiting at the entry: a train may enter from the step after its earliest departure (the step it
  // becomes ready, never before step 1).
  const waits = agents.map((a, i) => {
    const ready = Math.max(a.earliestDeparture, 1);
    const entered = run.timetable[i].entered;
    return { train: i, ready, entered, wait: (entered ?? T + 1) - (ready + 1) };
  });
  const longestWait = waits.reduce((best, w) => (w.wait > best.wait ? w : best), waits[0]);

  let lateTrains = 0;
  let lateSteps = 0;
  agents.forEach((a, i) => {
    if (arrivals[i] !== null && arrivals[i] > a.latestArrival) { lateTrains += 1; lateSteps += arrivals[i] - a.latestArrival; }
  });

  return {
    n, steps: T, arrived, lastArrival, arrivals,
    collisions: collisions.length,
    firstCollision: collisions.length ? { step: collisions[0].step, train: collisions[0].agent, value: collisions[0].value } : null,
    lastChange, gridlockFrom, stuck: onMapAtEnd.length, notDeparted: leftOver.length - onMapAtEnd.length,
    stops, served, passed, missed: stops - served - passed,
    waits, longestWait, lateTrains, lateSteps
  };
}

const trainName = (network, i) => network.trains[i].name;
const stopName = (network, i, k) => stationName(network.trains[i].stops[k]);

/**
 * The moments worth watching in a run, in order: [{ step, kind, train, title, text }]. Steps are the
 * ones the timeline shows; train is the train to pick (or null). why.wait, when given, says why
 * trains wait at their entry in this run (the estimate: its whole route has to be free).
 */
export function moments(run, scenario, network, facts = runFacts(run, scenario), why = {}) {
  const out = [];
  const firstEvent = (kind) => run.events.find((e) => e.kind === kind);

  const enter = firstEvent("enter");
  if (enter) {
    out.push({
      step: enter.step, kind: "enter", train: enter.train, title: "The first train enters",
      text: `${trainName(network, enter.train)} sets off from ${stationName(network.trains[enter.train].stops[0])}. ${plural(facts.n, "train")} have ${count(facts.stops)} stops to serve between them.`
    });
  }

  if (facts.firstCollision) {
    const c = facts.firstCollision;
    out.push({
      step: c.step, kind: "collision", train: c.train, title: "The first collision",
      text: `${trainName(network, c.train)} runs into a train in its way and is held back: ${amount(c.value)} points.${facts.collisions > 1 ? ` ${count(facts.collisions - 1)} more collisions follow.` : ""}`
    });
  }

  const pass = firstEvent("pass");
  if (pass) {
    out.push({
      step: pass.step, kind: "pass", train: pass.train, title: "A station passed without stopping",
      text: `${trainName(network, pass.train)} runs through ${stopName(network, pass.train, pass.stop)} without halting. A stop counts only if the train halts at a platform, so this one is lost: 499.2 points.`
    });
  }

  const stop = firstEvent("stop");
  if (stop) {
    out.push({
      step: stop.step, kind: "stop", train: stop.train, title: "The first stop served",
      text: `${trainName(network, stop.train)} halts at ${stopName(network, stop.train, stop.stop)}${stop.late ? `, ${plural(stop.late, "step")} late` : ", on time"}.`
    });
  }

  const w = facts.longestWait;
  if (w && w.wait >= 100) {
    out.push({
      step: Math.min(w.entered ?? facts.steps, facts.steps), kind: "wait", train: w.train, title: "The longest wait",
      text: w.entered === null
        ? `${trainName(network, w.train)} could have set off at step ${count(w.ready + 1)}, but never enters the network.`
        : why.wait
          ? `${trainName(network, w.train)} could have set off at step ${count(w.ready + 1)}, but ${why.wait} only from step ${count(w.entered)}: it waits ${plural(w.wait, "step")} at its entry.`
          : `${trainName(network, w.train)} could have set off at step ${count(w.ready + 1)} and enters at step ${count(w.entered)}: it waits ${plural(w.wait, "step")} at its entry.`
    });
  }

  if (facts.gridlockFrom !== null) {
    out.push({
      step: facts.gridlockFrom, kind: "gridlock", train: null, title: "Gridlock",
      text: `From here on no train can move: ${plural(facts.stuck, "train")} block each other and stay where they are for the remaining ${plural(facts.steps - facts.gridlockFrom + 1, "step")}.`
    });
  }

  const arrive = firstEvent("arrive");
  if (arrive) {
    const dest = network.trains[arrive.train].to;
    out.push({
      step: arrive.step, kind: "arrive", train: arrive.train, title: "The first arrival",
      text: `${trainName(network, arrive.train)} reaches ${dest}${arrive.late ? `, ${plural(arrive.late, "step")} late` : " on time"}.`
    });
  }

  if (facts.arrived === facts.n) {
    const last = facts.arrivals.indexOf(facts.lastArrival);
    out.push({
      step: facts.lastArrival, kind: "all-arrived", train: last, title: "Every train has arrived",
      text: `The last one, ${trainName(network, last)}, reaches ${network.trains[last].to}. ${facts.lateTrains ? `${plural(facts.lateTrains, "train")} arrived late, ${plural(facts.lateSteps, "step")} in all.` : "All of them on time."}`
    });
  }

  out.push({
    step: facts.steps, kind: "end", train: null, title: "The end",
    text: `${count(facts.arrived)} of ${count(facts.n)} trains arrived and ${count(facts.served)} of ${count(facts.stops)} stops were served. Score: ${score(run.score)}.`
  });

  const order = { enter: 0, collision: 1, pass: 2, stop: 2, wait: 3, gridlock: 4, arrive: 5, "all-arrived": 6, end: 7 };
  out.sort((a, b) => a.step - b.step || order[a.kind] - order[b.kind]);
  return out;
}

/** The situation on the map at step t, in one line: { tone, text }, or null when nothing stands out. */
export function situation(run, scenario, facts, t) {
  const n = facts.n;
  if (facts.gridlockFrom !== null && t >= facts.gridlockFrom) {
    return { tone: "danger", text: `Gridlock since step ${count(facts.gridlockFrom)}: ${plural(facts.stuck, "train")} stuck for good`, short: `Gridlock: ${plural(facts.stuck, "train")} stuck` };
  }
  if (facts.arrived === n && t >= facts.lastArrival) {
    return { tone: "success", text: `All ${count(n)} trains have arrived`, short: `All ${count(n)} trains arrived` };
  }
  const f = run.frames;
  const step = Math.min(t, run.steps);
  let blocked = 0;
  for (let i = 0; i < n; i += 1) if (f.blocked[step * n + i]) blocked += 1;
  if (blocked >= 2) {
    return { tone: "danger", text: `${plural(blocked, "train")} held back by trains in their way`, short: `${plural(blocked, "train")} held back` };
  }
  let waiting = 0;
  facts.waits.forEach((w) => {
    const i = w.train;
    const o = step * n + i;
    if (t > w.ready && f.pos[o] === -1 && f.state[o] !== STATE.DONE) waiting += 1;
  });
  if (waiting) {
    const text = `${plural(waiting, "train")} ${waiting === 1 ? "waits" : "wait"} at ${waiting === 1 ? "its" : "their"} entry`;
    return { tone: "waiting", text, short: text };
  }
  return null;
}
