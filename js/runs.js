// The runs the page shows, in plain words for readers who do not know the challenge: what each
// dispatcher does, and how the page gets it. A map lists the ones recorded on it (js/maps.js): the
// baseline and the optimized run, on both maps. The leaderboard's figure they are measured against
// is in js/maps.js.

export const RUNS = [
  {
    id: "baseline",
    label: "Baseline",
    title: "Baseline: drive straight, never wait",
    source: "live",
    does: "The challenge's starting point. Every train takes the shortest way to its destination and never waits: not for other trains, and not at its stations.",
    how: "Runs live in your browser: a port of the challenge's OrderedController reads the same view of the tracks ahead that the Python version reads."
  },
  {
    id: "optimized",
    label: "Optimized",
    title: "Optimized: routes, stops and times planned",
    source: "plan",
    does: "Plans every train's route, its stops and its timing together before the first step, so that no train ever blocks another and trains halt at their stops as close to their timetables as the track allows. A train it finds no such plan for stays off the network. Then it keeps improving the plan, a few trains at a time.",
    how: "Planned in Python by PlannerController (a few minutes of search) and replayed here: your browser simulates and scores every step of it."
  }
];

export const runById = (id) => RUNS.find((r) => r.id === id);
