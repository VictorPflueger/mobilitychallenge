// The guide's content: what the challenge is, how it works and what each run does, for a reader who
// has never heard of it, told on the map on screen (Neu-Frankfurt or Köln). Every figure in it is
// computed here from the scenario, the reward rules and the runs the engine simulated; nothing is
// typed in. Where the two maps differ in kind, not only in figures (Neu-Frankfurt's terminus and its
// airport S-Bahns; Köln's hub and its S-Bahn loops), the words do too.
// js/ui/guide.js draws it; tests/guide.mjs checks the figures against each map's scenario file and
// the Python runner's results.

import { ACCELERATION, BRAKING, balancedPenalties } from "./engine/env.js";
import { runFacts } from "./story.js";
import { floorReasons, scoreFloor } from "./floor.js";
import { amount, count, plural, score } from "./format.js";

/**
 * How the guide names each kind of train: the plural it counts them with, the short plural of running
 * text, its card's label, and the singular it costs a collision with. Neu-Frankfurt's file names its
 * classes RB, ICE and S-Bahn; Köln's High-Speed, Express and Local (and its line names say which
 * lines run which: ICE lines high-speed, IC and Panorama lines express, RB and S lines local).
 */
const KIND_TEXT = {
  RB: { plural: "regional trains (RB)", short: "RBs", label: "RB · regional train", one: "RB", an: "an" },
  ICE: { plural: "ICEs", short: "ICEs", label: "ICE · intercity express", one: "ICE", an: "an" },
  "S-Bahn": { plural: "S-Bahns", short: "S-Bahns", label: "S-Bahn · commuter train", one: "S-Bahn", an: "an" },
  "High-Speed": { plural: "high-speed trains (the ICE lines)", short: "high-speed trains", label: "High-Speed · the ICE lines", one: "high-speed", an: "a" },
  Express: { plural: "express trains (the IC and Panorama lines)", short: "express trains", label: "Express · the IC and Panorama lines", one: "express", an: "an" },
  Local: { plural: "local trains (the RB and S lines)", short: "local trains", label: "Local · the RB and S lines", one: "local", an: "a" }
};
const kindText = (kind) => KIND_TEXT[kind] || { plural: `${kind} trains`, short: `${kind} trains`, label: kind, one: kind, an: "a" };

/** The label of a kind of train in the guide's list of kinds. */
export const kindLabel = (kind) => kindText(kind).label;

/** "an RB or ICE", "a high-speed or express train": the trains of these kinds, in one phrase. */
function kindsPhrase(kinds) {
  const t = kinds.map(kindText);
  const words = t.map((x) => x.one);
  const noun = words.every((w) => /^[A-Z]/.test(w)) ? "" : " train"; // "an RB", "a local train"
  return `${t[0].an} ${words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}` : words[0]}${noun}`;
}

/** The figures the guide states. ctx: { map, runList, scenario, network, runs, floor }. */
export function guideFacts({ map, runList, scenario, network, runs, floor }) {
  const agents = scenario.agents;
  const kinds = [];
  network.trains.forEach((t, i) => {
    let k = kinds.find((x) => x.kind === t.kind);
    if (!k) { k = { kind: t.kind, count: 0, speed: agents[i].maxSpeed }; kinds.push(k); }
    k.count += 1;
  });
  kinds.sort((a, b) => b.count - a.count);
  const named = network.stations.filter((s) => !s.name.startsWith("Stop "));
  // the speeds the scenario gives each kind, before Flatland rounds them
  const given = {};
  network.trains.forEach((t, i) => { given[t.kind] = agents[i].lineSpeed; });
  // stations without a name keep their number in the scenario ("Stop 17")
  const numbers = network.stations.filter((s) => s.name.startsWith("Stop ")).map((s) => s.id).sort((x, y) => x - y);
  // the line ends besides the Hauptbahnhof and the airport, for Neu-Frankfurt's caption
  const towns = named.map((s) => s.name).filter((n) => n !== "Hauptbahnhof" && !n.startsWith("Flughafen"));
  const stops = agents.reduce((s, a) => s + a.waypoints.length - 2, 0);
  const penalty = balancedPenalties(scenario.maxSteps);
  floor = floor || scoreFloor(scenario, penalty);

  // The hub: the station the most lines call at, and how many of them do.
  const lines = network.lines || [];
  const linesAt = new Map();
  for (const l of lines) for (const id of new Set(l.stationIds)) linesAt.set(id, (linesAt.get(id) || 0) + 1);
  const hubId = [...linesAt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];

  // The example timetable: the first train of the map's regional kind with a single stop on its way.
  const ex = network.trains.findIndex((t) => t.kind === (map.id === "koeln" ? "Local" : "RB") && t.stops.length === 3);
  const a = agents[ex];
  const example = {
    train: ex,
    name: network.trains[ex].name,
    line: network.trains[ex].line,
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
    // trains that never set off, and trains done the moment they entered (their first cell is their destination)
    const neverLeft = run.timetable.map((tt, i) => (tt.entered === null ? i : null)).filter((i) => i !== null);
    const atTarget = run.events.filter((e) => e.kind === "enter" && e.atTarget).map((e) => e.train);
    // the trains with a stop not served (never reached, or passed without stopping)
    const unservedBy = [...new Set(run.ledger.filter((e) => e.kind === "stop_missed" || e.kind === "stop_passed").map((e) => e.agent))];
    facts[id] = { ...f, score: run.score, worst, perTrain, neverLeft, atTarget, unservedBy };
  }

  // Why the floor is above zero; and the S-Bahns among the trains too slow for their own timetables:
  // even on empty track, at full speed and without halting, their trip takes longer than their
  // timetable allows (Neu-Frankfurt's two S-Bahns of the airport loop).
  const reasons = floorReasons(scenario, floor);
  const slowSBahns = reasons.slow.trains.filter((i) => network.trains[i].kind === "S-Bahn");

  return {
    map, runList,
    trains: agents.length, kinds,
    stations: network.stations.length, named: named.length, numbered: numbers.length, numberRange: [numbers[0], numbers[numbers.length - 1]], towns,
    namedNames: named.map((s) => s.name),
    lines: lines.length, hub: hubId === undefined ? null : { id: hubId, name: network.stationName(hubId), lines: linesAt.get(hubId) },
    stops, width: scenario.rail.width, height: scenario.rail.height, levelFree: scenario.levelFree.size,
    steps: scenario.maxSteps, penalty, example, runs: facts, leaderboard: map.leaderboard, slowSBahns,
    floor, reasons, trainNames: network.trains.map((t) => t.name), trainKinds: network.trains.map((t) => t.kind),
    givenSpeed: given, accel: ACCELERATION, brake: -BRAKING,
    // a train whose name has one place: on Neu-Frankfurt, a round trip from there to the Hauptbahnhof and back
    roundTrip: network.trains.map((t, i) => ({ i, name: t.name, places: t.name.split(" ").slice(1, -1) })).find((t) => t.places.length === 1 && network.trains[t.i].kind === "RB"),
    // on Köln, the S-Bahn loops: the same stations in opposite directions
    loops: ["S clock", "S counter"].map((p) => network.trains.filter((t) => t.name.startsWith(p)).map((t) => t.name))
  };
}

const cellsPerStep = (speed) => (speed === 1 ? "one cell per step" : speed === 0.5 ? "one cell every second step" : `${speed} of a cell per step`);
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n) => WORDS[n] || count(n);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The chapters: [{ id, nav, title, lead, blocks }]. Block types: points (title + text items),
 * diagram (a named drawing), timetable, kinds, commands, conflicts, penalties, results, howto, note.
 */
export function chapters(F) {
  const P = F.penalty;
  const M = F.map;
  const koeln = M.id === "koeln";
  const b = F.runs.baseline;
  const o = F.runs.optimized;
  const kindList = F.kinds.map((k) => `${count(k.count)} ${kindText(k.kind).plural}`);
  const sbahnNames = F.slowSBahns.map((i) => F.trainNames[i]);
  const sbahnPoints = F.slowSBahns.reduce((s, i) => s + o.worst.find((w) => w.train === i).value, 0);
  const lostStops = F.stops * P.notServed;
  const ex = F.example.rows;
  // trains at full speed and at half speed, after Flatland rounds their speeds
  const fullKinds = F.kinds.filter((k) => k.speed === 1).map((k) => k.kind);
  const halfKinds = F.kinds.filter((k) => k.speed === 0.5).map((k) => k.kind);
  const fullPhrase = kindsPhrase(fullKinds);
  const halfPhrase = kindsPhrase(halfKinds);
  // the speeds the scenario gives below one cell per step, before rounding
  const slowGiven = F.kinds.filter((k) => F.givenSpeed[k.kind] < 1).sort((x, y) => F.givenSpeed[y.kind] - F.givenSpeed[x.kind]);
  const givenText = slowGiven.map((k, j) => `${kindText(k.kind).short} ${F.givenSpeed[k.kind]}${j === 0 ? " of a cell per step" : ""}`);
  const roundedText = slowGiven.map((k) => (k.speed === 1
    ? `${kindText(k.kind).short} run as fast as ${fullKinds.filter((x) => F.givenSpeed[x] === 1).map((x) => kindText(x).short).join(" and ")}, one cell per step`
    : `${kindText(k.kind).short} take ${inWords(Math.round(1 / k.speed))} steps per cell`));
  // the trains no dispatcher can keep on time, and the least each of them loses
  const slow = F.floor.perTrain.map((v, i) => ({ i, v })).filter((x) => x.v > 0);
  const slowNames = slow.map((x) => F.trainNames[x.i]);
  const slowAllSBahn = slow.every((x) => F.trainKinds[x.i] === "S-Bahn");
  const slowWho = slow.length === 2 && slowAllSBahn ? `The two S-Bahns ${slowNames[0]} and ${slowNames[1]} are` : `${plural(slow.length, "train")} (${slowNames.join(", ")}) ${slow.length === 1 ? "is" : "are"}`;
  const slowLeast = Math.min(...slow.map((x) => x.v));
  const floorText = `No dispatcher can score better than −${amount(F.floor.total)}.`;
  const { atTarget, slow: tooSlow } = F.reasons;
  const nRuns = F.runList.length;
  const cards = nRuns + 1; // the runs, and the leaderboard's figure
  const hub = F.hub;

  // Why zero is out of reach: on Neu-Frankfurt two slow S-Bahns; on Köln also trains done as they enter.
  const zeroText = atTarget.trains.length
    ? `${capital(plural(atTarget.trains.length, "train"))} (${atTarget.trains.map((i) => F.trainNames[i]).join(", ")}) start on the cell that is their destination: the simulator finishes each the moment it enters, so all their ${count(atTarget.stops)} stops are lost (${amount(atTarget.points)} points), whatever the dispatcher does.${tooSlow.trains.length ? ` ${capital(plural(tooSlow.trains.length, "more train"))} are too slow for their own timetables, even on empty track, at full speed and without halting: at least ${amount(tooSlow.points)} points between them.` : ""} ${floorText}`
    : `${slowWho} too slow for their own timetables: even on empty track, at full speed and without halting, each loses at least ${amount(slowLeast)} points. ${floorText}`;

  // The baseline's card: its collisions, its gridlock (if it jams), arrivals and stops.
  const baselineHappens = `${count(b.collisions)} collisions.${b.gridlockFrom !== null ? ` From step ${count(b.gridlockFrom)} on, ${plural(b.stuck, "train")} block each other and nothing moves again:` : ""} ${count(b.arrived)} of ${count(b.n)} trains arrive${b.atTarget.length ? ` (${count(b.atTarget.length)} of them the moment they enter)` : ""}, and ${b.served ? `${count(b.served)} of ${count(b.stops)} stops are` : "not a single stop is"} served.`;
  // The optimized run's card: what it gets through, and where its points come from. On Neu-Frankfurt
  // every train and stop, and two slow S-Bahns; on Köln every train, and the stops of the trains done
  // as they enter, lost whatever the dispatcher does.
  const left = o.neverLeft;
  const leftPoints = -left.reduce((s, i) => s + o.perTrain[i], 0);
  const doneAtEntry = o.atTarget.slice().sort((x, y) => x - y);
  const doneAtEntryPoints = -doneAtEntry.reduce((s, i) => s + o.perTrain[i], 0);
  // the trains done as they enter are the ones the floor finds starting on their destination
  const onlyTheirStopsLost = doneAtEntry.length > 0 && doneAtEntry.join() === atTarget.trains.join()
    && o.served + atTarget.stops === o.stops && o.unservedBy.every((i) => doneAtEntry.includes(i));
  const opening = `${o.collisions ? `${count(o.collisions)} collisions.` : "No collision and no gridlock:"}`;
  const optimizedHappens = o.served === o.stops && o.arrived === o.n
    ? `All ${count(o.n)} trains arrive by step ${count(o.lastArrival)} and all ${count(o.served)} stops are served. ${sbahnNames.length === 2 ? `${amount(sbahnPoints)} of the ${amount(o.score)} points left come from the two S-Bahns ${sbahnNames[0]} and ${sbahnNames[1]}: even at full speed their trip takes longer than their timetable allows. ${floorText}` : floorText}`.trim()
    : o.arrived === o.n && onlyTheirStopsLost
      ? `${opening} ${o.collisions ? "All" : "all"} ${count(o.n)} trains arrive by step ${count(o.lastArrival)}, ${count(doneAtEntry.length)} of them the moment they enter, and ${count(o.served)} of ${count(o.stops)} stops are served. ${amount(doneAtEntryPoints)} of the ${amount(o.score)} points come from those ${inWords(doneAtEntry.length)} (${doneAtEntry.map((i) => F.trainNames[i]).join(", ")}): they start on their destination and lose all their ${count(atTarget.stops)} stops, whatever the dispatcher does. ${floorText}`
      : `${opening} ${count(o.arrived)} of ${count(o.n)} trains arrive by step ${count(o.lastArrival)} and ${count(o.served)} of ${count(o.stops)} stops are served.${left.length ? ` The planner finds no plan without conflicts for ${plural(left.length, "train")}: they never set off, which costs ${amount(leftPoints)} of the ${amount(o.score)} points.` : ""} ${floorText}`;

  return [
    {
      id: "challenge",
      nav: "The challenge",
      title: `Get ${F.trains} trains through a busy rail hub, on time`,
      lead: "The T-Brain Mobility Challenge is a coding challenge by Deutsche Telekom and T-Systems for their data scientists. The task: write a dispatcher, a program that tells every train on a rail network what to do, step by step.",
      blocks: [
        {
          type: "diagram", name: "network",
          caption: koeln
            ? `Köln, the larger of the two maps in the challenge's final: ${hub.name} in the middle, the hub where ${hub.lines} of its ${F.lines} lines meet, and lines out to ${F.namedNames.filter((n) => !n.includes("(")).join(" and ")}.`
            : `Neu-Frankfurt, the challenge's network: the Hauptbahnhof (Hbf) in the middle, lines to the airport (Flughafen), ${F.towns.slice(0, -1).join(", ")} and ${F.towns[F.towns.length - 1]}.`
        },
        {
          type: "points", items: [
            { icon: "flag", title: "Stop where the timetable says", text: `Each train has a timetable: the stations it must halt at on its way, and a time window at each. The ${F.trains} trains have ${F.stops} stops to serve between them.` },
            { icon: "clock", title: "Arrive on time", text: "Every train should reach its destination by the time its timetable gives." },
            { icon: "warning", title: "Never get in each other's way", text: "Two trains can't share a piece of track. A train held back by another costs points, and trains that block each other can jam the whole network." },
            { icon: "chart", title: "Lose as few points as possible", text: `Every mistake costs penalty points, and the score is minus their sum: the closer to zero, the better. The best score on the challenge's leaderboard (October 2026) is ${count(F.leaderboard)}: the target to beat.` }
          ]
        },
        {
          type: "note", tone: "note", title: "A simulation",
          text: koeln
            ? `The challenge runs on Flatland, an open-source railway simulator. The file of the Köln map mentions only ${F.namedNames.filter((n) => !n.includes("(")).join(" and ")}, in its line names, so most of its stations keep their number.`
            : "The challenge runs on Flatland, an open-source railway simulator. Neu-Frankfurt is a fictional network; its stations are named after its lines."
        }
      ]
    },
    {
      id: "network",
      nav: "The network",
      title: "A railway made of grid cells",
      lead: `Flatland lays the railway out on a grid of ${F.width} × ${F.height} cells. Each cell holds one piece of track, and a train always fills exactly one cell.`,
      blocks: [
        { type: "diagram", name: "pieces", caption: `The pieces of a Flatland railway (a made-up example, not part of ${M.name}).` },
        {
          type: "points", items: [
            {
              title: "Tracks",
              text: koeln
                ? "Trains follow the track. They can't turn around on the open line, only at the end of a track."
                : "Trains follow the track. They can't turn around on the open line, only at the end of a track: the Hauptbahnhof is a terminus, so trains that call there reverse and leave the way they came in."
            },
            { title: "Switches", text: "At a switch the track splits, and the dispatcher decides which way a train goes." },
            {
              title: "Stations",
              text: koeln
                ? `A station is a group of platforms. Köln has ${F.stations}: ${F.named} named after the places in its line names (${F.namedNames.join(", ")}) and ${F.numbered} without a name, which the map labels by their number in the scenario, between Stop ${F.numberRange[0]} and Stop ${F.numberRange[1]}. ${hub.name} is the hub: ${hub.lines} of the ${F.lines} lines call there.`
                : `A station is a group of platforms. Neu-Frankfurt has ${F.stations}: the Hauptbahnhof, ${F.named - 1} more named stations and ${F.numbered} smaller ones without a name, which the map labels by their number in the scenario, between Stop ${F.numberRange[0]} and Stop ${F.numberRange[1]}.`
            },
            { title: "Level-free crossings", text: `Where two tracks cross on a bridge (${F.levelFree} times in ${M.name}), trains pass each other freely.` },
            { title: "Buffer stops", text: "Trains enter the map at their first station, at the end of a line, and leave it as soon as they reach their destination." }
          ]
        }
      ]
    },
    {
      id: "timetable",
      nav: "Trains and timetables",
      title: "Every train has a timetable",
      lead: `${F.trains} trains run on the network: ${kindList.slice(0, -1).join(", ")} and ${kindList[kindList.length - 1]}. Each has its own route through the stations, and a time window at each one.`,
      blocks: [
        { type: "kinds", kinds: F.kinds.map((k) => ({ ...k, label: kindLabel(k.kind), pace: cellsPerStep(k.speed) })) },
        { type: "timetable", example: F.example },
        {
          type: "points", items: [
            { title: "Time runs in steps", text: `Everything happens in steps, like the ticks of a clock. The episode ends when every train has arrived, or after ${count(F.steps)} steps.` },
            { title: "A stop means stopping", text: `At each stop the train must come to a halt at one of the station's platforms. Driving through doesn't count: the stop is lost (${amount(P.notServed)} points).` },
            { title: "Two times per stop", text: `Arrive by: the latest step to reach the station; every step later costs ${amount(P.lateArrival)} points, ${count(1)} at the destination. Leave from: the earliest step to set off again; every step earlier costs ${amount(P.earlyDeparture)}.` },
            {
              title: "Train names",
              text: koeln
                ? `A name gives the train's line and a number: ${F.example.name} runs on the line ${F.example.line}, from ${ex[0].station} to ${ex[ex.length - 1].station}. The ICE lines are named after where they lead (Essen, Frankfurt), most others after a compass point in German (ost, west, süd and nord: east, west, south and north). ${F.loops[0][0].replace(/ \d+$/, "")} and ${F.loops[1][0].replace(/ \d+$/, "")} run the same S-Bahn loop from ${hub.name} and back, in opposite directions.`
                : `A name gives the train's kind, where it runs and a number: ${F.example.name} is a regional train from ${ex[0].station} to ${ex[ex.length - 1].station}. A name with one place, like ${F.roundTrip.name}, is a round trip from there to the Hauptbahnhof and back. Hbf stands for Hauptbahnhof, FF for Flughafen (the airport), Of for Offenbach.`
            },
            { title: "Speeds", text: `The scenario gives ${givenText.slice(0, -1).join(", ")}${givenText.length > 1 ? " and " : ""}${givenText[givenText.length - 1]}. Flatland rounds every speed so that a cell takes a whole number of steps: ${roundedText.slice(0, -1).join(", ")}${roundedText.length > 1 ? ", and " : ""}${roundedText[roundedText.length - 1]}.` }
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
        {
          type: "points", items: [
            { title: "Speeding up and braking", text: `Trains change speed gradually: moving off, a train gains ${amount(F.accel)} of a cell per step until it reaches its top speed, and braking takes ${amount(F.brake)} off per step. A train halts in the cell where its speed reaches zero, so the dispatcher has to brake in time to stop at a platform.` }
          ]
        },
        { type: "conflicts", taken: ` It costs ${amount(P.crash)} × the train's speed (${amount(P.crash)} points for ${fullPhrase} at full speed, ${amount(P.crash * 0.5)} for ${halfPhrase}), once each time a moving train is stopped this way; standing, it costs nothing more.` },
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
            { kind: "collision", tone: "danger", name: "Collision", cost: `${amount(P.crash)} × speed`, text: `A moving train is held back by another one. Speed: the share of a cell it was moving per step (1 for ${fullPhrase} at full speed, ½ for ${halfPhrase}).` },
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
            { icon: "warning", title: "Zero is out of reach here", text: zeroText },
            { icon: "chart", title: `The best on the leaderboard: ${count(F.leaderboard)}`, text: "The current best score on the challenge's leaderboard, as the project brief gives it. It is not simulated here; the page shows it on both maps as the target to beat." }
          ]
        }
      ]
    },
    {
      id: "results",
      nav: `${capital(inWords(cards))} results`,
      title: o.served === o.stops ? "From gridlock to every stop served"
        : o.arrived === o.n ? "From gridlock to every train at its destination"
          : o.collisions === 0 && o.gridlockFrom === null ? "From gridlock to a network without collisions" : "What each dispatcher gets",
      lead: `Dispatch Lab runs ${inWords(nRuns)} dispatchers on ${M.name}, the challenge's baseline and its own planner, and puts them next to the leaderboard's best, the target to beat. Each bar shows the points lost, on the baseline's scale: the shorter, the better.`,
      blocks: [
        {
          type: "results", cards: [
            {
              run: "baseline", name: "Baseline", score: score(b.score), source: "Simulated in your browser",
              does: "The challenge's starting point. Every train takes the shortest way to its destination and never waits: not for other trains, and not at its stations.",
              happens: baselineHappens,
              watch: b.gridlockFrom !== null ? "Watch the gridlock" : "Watch the baseline"
            },
            {
              run: "best", name: "Current best", score: count(F.leaderboard), source: "From the project brief, not simulated",
              labels: ["What it is", "Why it is here"],
              does: "The best entry on the challenge's leaderboard (October 2026), as the project brief gives it. Its code is not public, so it can't be replayed here.",
              happens: "It is the target to beat: the page shows the same figure on both maps. Only the score is known, not how it was reached."
            },
            {
              run: "optimized", name: "Optimized", score: score(o.score), source: "Planned in Python beforehand, replayed here",
              does: "This page's own planner, PlannerController v2, books every train's route, stops and timing together, then keeps improving the plan a few trains at a time.",
              happens: optimizedHappens,
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
      lead: `Your browser simulates every step of the ${inWords(nRuns)} runs with the challenge's rules and gets the same scores as the challenge's own Python runner, to the last digit. The baseline decides as it goes; the planner worked out its commands in Python beforehand, and the page replays them.`,
      blocks: [
        {
          type: "howto", items: [
            { area: "maps", title: "Two maps", text: "Köln, which the page opens on, and Neu-Frankfurt, the map the challenge's own runner loads: switch between them at the top of the page. Each has its own trains, timetables and runs." },
            { area: "runs", title: "Runs and playback", text: `Switch between the ${inWords(nRuns)} runs at the top. Play, step through or drag the timeline; the speed buttons go up to 16 times.` },
            { area: "map", title: "The map", text: "Each train is a hexagon. Its colour and outline show its state, as the legend under the map names them: on time, behind its timetable, standing, blocked (a dashed ring: a train is in its way right now) or stuck (a dashed ring: standing 40 steps or more past its time). The line under the run's name says what is going on. The faint squares under the tracks are the railway's cells (Grid, beside the views, switches them off); the honeycomb around them is only the page's background." },
            { area: "kpis", title: "The tiles", text: "The score so far, the run's final score against the leaderboard's best, the trains that have arrived and the stops served." },
            { area: "panel", title: "The panel", text: "Story: what happens in the run and when. Score: where the points go. Trains: each train's timetable as it ran. Events: everything, in order. Method: how the page computes it." }
          ]
        }
      ]
    }
  ];
}
