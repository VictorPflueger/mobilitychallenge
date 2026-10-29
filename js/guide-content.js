// The guide's content: what the challenge is, how it works and what each run does, for a reader who
// has never heard of it. Every figure in it is computed here from the scenario, the reward rules and
// the runs the engine simulated; nothing is typed in. js/ui/guide.js draws it; tests/guide.mjs
// checks the figures against the scenario file and the Python runner's results.

import { balancedPenalties } from "./engine/env.js";
import { runFacts } from "./story.js";
import { scoreFloor } from "./floor.js";
import { LEADERBOARD } from "./runs.js";
import { amount, count, plural, score } from "./format.js";

/** The figures the guide states. */
export function guideFacts({ scenario, network, runs }) {
  const agents = scenario.agents;
  const kinds = [];
  network.trains.forEach((t, i) => {
    let k = kinds.find((x) => x.kind === t.kind);
    if (!k) { k = { kind: t.kind, count: 0, speed: agents[i].maxSpeed }; kinds.push(k); }
    k.count += 1;
  });
  kinds.sort((a, b) => b.count - a.count);
  const named = network.stations.filter((s) => !s.name.startsWith("Stop "));
  // stations without a name keep their number in the scenario ("Stop 17")
  const numbers = network.stations.filter((s) => s.name.startsWith("Stop ")).map((s) => s.id).sort((x, y) => x - y);
  // the line ends besides the Hauptbahnhof and the airport, for the network's caption
  const towns = named.map((s) => s.name).filter((n) => n !== "Hauptbahnhof" && !n.startsWith("Flughafen"));
  const stops = agents.reduce((s, a) => s + a.waypoints.length - 2, 0);
  const penalty = balancedPenalties(scenario.maxSteps);
  const floor = scoreFloor(scenario, penalty);

  // The example timetable: the first regional train with a single stop on its way.
  const ex = network.trains.findIndex((t) => t.kind === "RB" && t.stops.length === 3);
  const a = agents[ex];
  const example = {
    train: ex,
    name: network.trains[ex].name,
    rows: network.trains[ex].stops.map((id, k) => ({
      station: network.stations.find((s) => s.id === id).name,
      role: k === 0 ? "start" : k === a.waypoints.length - 1 ? "destination" : "stop",
      arriveBy: k === 0 ? null : a.wpLa[k],
      leaveFrom: k === a.waypoints.length - 1 ? null : a.wpEd[k]
    }))
  };

  const facts = {};
  for (const [id, run] of runs) {
    const f = runFacts(run, scenario);
    const perTrain = new Array(f.n).fill(0);
    for (const e of run.ledger) perTrain[e.agent] += e.value;
    const worst = perTrain.map((v, i) => ({ train: i, value: v })).sort((x, y) => x.value - y.value);
    facts[id] = { ...f, score: run.score, worst };
  }

  // The S-Bahns' trip in the estimate run: at full speed through all their stations, without halting.
  const sbahns = network.trains.map((t, i) => i).filter((i) => network.trains[i].kind === "S-Bahn");
  const estimate = runs.get("estimate");
  const tight = sbahns.filter((i) => {
    const tt = estimate.timetable[i];
    return tt.entered !== null && tt.doneAt !== null && tt.doneAt - tt.entered > agents[i].latestArrival - agents[i].earliestDeparture;
  });

  return {
    trains: agents.length, kinds,
    stations: network.stations.length, named: named.length, numbered: numbers.length, numberRange: [numbers[0], numbers[numbers.length - 1]], towns,
    stops, width: scenario.rail.width, height: scenario.rail.height, levelFree: scenario.levelFree.size,
    steps: scenario.maxSteps, penalty, example, runs: facts, leaderboard: LEADERBOARD, tight,
    floor, trainNames: network.trains.map((t) => t.name), trainKinds: network.trains.map((t) => t.kind)
  };
}

const cellsPerStep = (speed) => (speed === 1 ? "one cell per step" : speed === 0.5 ? "one cell every second step" : `${speed} of a cell per step`);

/**
 * The chapters: [{ id, nav, title, lead, blocks }]. Block types: points (title + text items),
 * diagram (a named drawing), timetable, kinds, commands, conflicts, penalties, results, howto, note.
 */
export function chapters(F) {
  const P = F.penalty;
  const b = F.runs.baseline;
  const e = F.runs.estimate;
  const o = F.runs.optimized;
  const kindText = F.kinds.map((k) => `${count(k.count)} ${k.kind === "RB" ? "regional trains (RB)" : k.kind === "ICE" ? "ICEs" : "S-Bahns"}`);
  const sbahnNames = F.tight.map((i) => F.trainNames[i]);
  const sbahnPoints = F.tight.reduce((s, i) => s + o.worst.find((w) => w.train === i).value, 0);
  const lostStops = F.stops * P.notServed;
  const ex = F.example.rows;
  // the trains no dispatcher can keep on time, and the least each of them loses
  const slow = F.floor.perTrain.map((v, i) => ({ i, v })).filter((x) => x.v > 0);
  const slowNames = slow.map((x) => F.trainNames[x.i]);
  const slowAllSBahn = slow.every((x) => F.trainKinds[x.i] === "S-Bahn");
  const slowWho = slow.length === 2 && slowAllSBahn ? `The two S-Bahns ${slowNames[0]} and ${slowNames[1]} are` : `${plural(slow.length, "train")} (${slowNames.join(", ")}) ${slow.length === 1 ? "is" : "are"}`;
  const slowLeast = Math.min(...slow.map((x) => x.v));
  const floorText = `No dispatcher can score better than −${amount(F.floor.total)}.`;

  return [
    {
      id: "challenge",
      nav: "The challenge",
      title: `Get ${F.trains} trains through a busy rail hub, on time`,
      lead: "The T-Brain Mobility Challenge is a coding challenge by Deutsche Telekom and T-Systems for their data scientists. The task: write a dispatcher, a program that tells every train on a rail network what to do, step by step.",
      blocks: [
        { type: "diagram", name: "network", caption: `Neu-Frankfurt, the challenge's network: the Hauptbahnhof (Hbf) in the middle, lines to the airport (Flughafen), ${F.towns.slice(0, -1).join(", ")} and ${F.towns[F.towns.length - 1]}.` },
        {
          type: "points", items: [
            { icon: "flag", title: "Stop where the timetable says", text: `Each train has a timetable: the stations it must halt at on its way, and a time window at each. The ${F.trains} trains have ${F.stops} stops to serve between them.` },
            { icon: "clock", title: "Arrive on time", text: "Every train should reach its destination by the time its timetable gives." },
            { icon: "warning", title: "Never get in each other's way", text: "Two trains can't share a piece of track. A train held back by another costs points, and trains that block each other can jam the whole network." },
            { icon: "chart", title: "Lose as few points as possible", text: `Every mistake costs penalty points, and the score is minus their sum: the closer to zero, the better. The best score on the challenge's leaderboard is ${count(F.leaderboard)}.` }
          ]
        },
        { type: "note", tone: "note", title: "A simulation", text: "The challenge runs on Flatland, an open-source railway simulator. Neu-Frankfurt is a fictional network; its stations are named after its lines." }
      ]
    },
    {
      id: "network",
      nav: "The network",
      title: "A railway made of grid cells",
      lead: `Flatland lays the railway out on a grid of ${F.width} × ${F.height} cells. Each cell holds one piece of track, and a train always fills exactly one cell.`,
      blocks: [
        { type: "diagram", name: "pieces", caption: "The pieces of a Flatland railway (a made-up example, not part of Neu-Frankfurt)." },
        {
          type: "points", items: [
            { title: "Tracks", text: "Trains follow the track. They can't turn around on the open line, only at the end of a track: the Hauptbahnhof is a terminus, so trains that call there reverse and leave the way they came in." },
            { title: "Switches", text: "At a switch the track splits, and the dispatcher decides which way a train goes." },
            { title: "Stations", text: `A station is a group of platforms. Neu-Frankfurt has ${F.stations}: the Hauptbahnhof, ${F.named - 1} more named stations and ${F.numbered} smaller ones without a name, which the map labels by their number in the scenario (Stop ${F.numberRange[0]} to Stop ${F.numberRange[1]}).` },
            { title: "Level-free crossings", text: `Where two tracks cross on a bridge (${F.levelFree} times in Neu-Frankfurt), trains pass each other freely.` },
            { title: "Buffer stops", text: "Trains enter the map at their first station, at the end of a line, and leave it as soon as they reach their destination." }
          ]
        }
      ]
    },
    {
      id: "timetable",
      nav: "Trains and timetables",
      title: "Every train has a timetable",
      lead: `${F.trains} trains run on the network: ${kindText.slice(0, -1).join(", ")} and ${kindText[kindText.length - 1]}. Each has its own route through the stations, and a time window at each one.`,
      blocks: [
        { type: "kinds", kinds: F.kinds.map((k) => ({ ...k, pace: cellsPerStep(k.speed) })) },
        { type: "timetable", example: F.example },
        {
          type: "points", items: [
            { title: "Time runs in steps", text: `Everything happens in steps, like the ticks of a clock. The episode ends when every train has arrived, or after ${count(F.steps)} steps.` },
            { title: "A stop means stopping", text: `At each stop the train must come to a halt at one of the station's platforms. Driving through doesn't count: the stop is lost (${amount(P.notServed)} points).` },
            { title: "Two times per stop", text: `Arrive by: the latest step to reach the station; every step later costs ${amount(P.lateArrival)} points, ${count(1)} at the destination. Leave from: the earliest step to set off again; every step earlier costs ${amount(P.earlyDeparture)}.` },
            { title: "Train names", text: `A name gives the train's kind, its line and a number: ${F.example.name} is a regional train from ${ex[0].station} to ${ex[ex.length - 1].station}. Hbf stands for Hauptbahnhof, FF for Flughafen (the airport), Of for Offenbach.` }
          ]
        }
      ]
    },
    {
      id: "decisions",
      nav: "Decisions and conflicts",
      title: "One decision per train, every step",
      lead: "At every step the dispatcher gives each train one of five commands. Then the simulator moves all trains at the same time, each by at most one cell, wherever the cell ahead is free.",
      blocks: [
        { type: "commands" },
        { type: "conflicts", crash: P.crash },
        { type: "note", tone: "tip", title: "What the dispatcher sees", text: "The challenge offers each train a view of the tracks ahead, or a view of the whole network. A dispatcher can also plan ahead: it knows every timetable from the start." }
      ]
    },
    {
      id: "score",
      nav: "The score",
      title: "Penalty points: the closer to zero, the better",
      lead: `Every mistake costs penalty points, and the score is minus their sum. The challenge scales its penalties to the episode's ${count(F.steps)} steps: a lost stop, for example, costs ${amount(P.notServed / F.steps)} × ${count(F.steps)} = ${amount(P.notServed)} points.`,
      blocks: [
        {
          type: "penalties", rows: [
            { kind: "collision", tone: "danger", name: "Collision", cost: `${amount(P.crash)} × speed`, text: "A moving train is held back by another one. Speed: the share of a cell it moves per step, 1 at full speed." },
            { kind: "stop", tone: "danger", name: "Stop not served", cost: amount(P.notServed), text: "The train never reached the station, or drove through without halting." },
            { kind: "not_arrived", tone: "danger", name: "Not arrived by the end", cost: "its delay", text: "Counted at the end: how late it would arrive from where it stands, by the shortest way at full speed." },
            { kind: "cancelled", tone: "danger", name: "Never set off", cost: `${amount(P.cancellationFactor)} × (trip + ${amount(P.cancellationBuffer)})`, text: "The train never entered the network. Trip: the steps its shortest journey takes." },
            { kind: "target_late", tone: "warning", name: "Late at the destination", cost: "1 per step", text: "For each step after its arrival time." },
            { kind: "stop_late", tone: "warning", name: "Late at a stop", cost: `${amount(P.lateArrival)} per step`, text: "For each step after a stop's arrive-by time." },
            { kind: "stop_early", tone: "warning", name: "Leaving a stop early", cost: `${amount(P.earlyDeparture)} per step`, text: "For each step before a stop's leave-from time." }
          ]
        },
        {
          type: "note", tone: "tip", title: "Stops matter most",
          text: `Skipping one stop costs as much as arriving ${count(Math.round(P.notServed))} steps late at the destination. A dispatcher that gets every train through but serves none of the ${F.stops} stops still loses ${amount(lostStops)} points.`
        },
        {
          type: "points", items: [
            { icon: "clock", title: "When points count", text: "A collision counts at once. A train's stops and its delay count when it reaches its destination, or when the episode ends: during a run, the score lags behind what the map shows." },
            { icon: "warning", title: "Zero is out of reach here", text: `${slowWho} too slow for their own timetables: even on empty track, at full speed and without halting, each loses at least ${amount(slowLeast)} points. ${floorText}` },
            { icon: "chart", title: `The best on the leaderboard: ${count(F.leaderboard)}`, text: "The current best score on the challenge's leaderboard for Neu-Frankfurt." }
          ]
        }
      ]
    },
    {
      id: "results",
      nav: "Four results",
      title: "From gridlock to every stop on time",
      lead: "Dispatch Lab runs three dispatchers on the same scenario and puts them next to the leaderboard's best. Each bar shows the points lost, on the baseline's scale: the shorter, the better.",
      blocks: [
        {
          type: "results", cards: [
            {
              run: "baseline", name: "Baseline", score: score(b.score),
              does: "The challenge's starting point. Every train takes the shortest way to its destination and never waits: not for other trains, and not at its stations.",
              happens: `${count(b.collisions)} collisions. From step ${count(b.gridlockFrom)} on, ${plural(b.stuck, "train")} block each other and nothing moves again: ${count(b.arrived)} of ${count(b.n)} trains arrive, and ${b.served ? `${count(b.served)} of ${count(b.stops)} stops are` : "not a single stop is"} served.`,
              watch: "Watch the gridlock"
            },
            {
              run: "best", name: "Current best", score: count(F.leaderboard),
              does: "The best entry on the challenge's leaderboard.",
              happens: `Its code is not public, so it can't be replayed here. Its score fits a dispatcher that gets the trains through but serves few stops or none: losing all ${count(F.stops)} stops alone costs ${amount(lostStops)} points. The estimate below is such a dispatcher: it guesses the strategy, not the exact score.`
            },
            {
              run: "estimate", name: "Estimate", score: score(e.score), ai: true,
              does: "Claude's guess at the kind of strategy behind the best score. A planner books each train's whole route before letting it in, so trains never meet. The route leads through the stations, but no train halts there.",
              happens: `No collision, no gridlock: all ${count(e.n)} trains arrive. All ${count(e.stops)} stops are lost (${amount(e.passed * P.notServed)} points), and trains wait up to ${count(e.longestWait.wait)} steps at their entry for a free route (${plural(e.lateSteps, "step")} late in all).`,
              watch: "Watch the estimate"
            },
            {
              run: "optimized", name: "Optimized", score: score(o.score),
              does: "Our planner (PlannerController) books every train's route, stops and timing together, then keeps improving the plan a few trains at a time.",
              happens: `All ${count(o.n)} trains arrive by step ${count(o.lastArrival)} and all ${count(o.served)} stops are served. ${sbahnNames.length === 2 ? `${amount(sbahnPoints)} of the ${amount(o.score)} points left come from the two S-Bahns ${sbahnNames[0]} and ${sbahnNames[1]}: even at full speed their trip takes longer than their timetable allows. ${floorText}` : floorText}`.trim(),
              watch: "Watch the optimized run"
            }
          ]
        }
      ]
    },
    {
      id: "page",
      nav: "Using this page",
      title: "How to read this page",
      lead: "Everything on the page is computed in your browser: it simulates every step of the three runs and gets the same scores as the challenge's Python runner, to the last digit.",
      blocks: [
        {
          type: "howto", items: [
            { area: "runs", title: "Runs and playback", text: "Switch between the three runs at the top. Play, step through or drag the timeline; the speed buttons go up to 16 times." },
            { area: "map", title: "The map", text: "Each train is a hexagon: filled while it runs, hollow while it stands. Its colour says on time, behind its timetable, blocked (a train is in its way right now) or stuck (standing 40 steps or more past its time); the strip under the map is the legend. The line under the run's name says what is going on. The honeycomb behind the map is only the page's background: the railway's cells are square." },
            { area: "kpis", title: "The tiles", text: "The score so far, the run's final score against the leaderboard's best, the trains that have arrived and the stops served." },
            { area: "panel", title: "The panel", text: "Story: what happens in the run and when. Score: where the points go. Trains: each train's timetable as it ran. Events: everything, in order. Method: how the page computes it." }
          ]
        }
      ]
    }
  ];
}
