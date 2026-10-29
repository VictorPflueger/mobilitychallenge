// The runs the page shows, in plain words for readers who do not know the challenge: what each
// dispatcher does, and how the page gets it. A map lists the ones recorded on it (js/maps.js): all
// three on Neu-Frankfurt, the baseline and the optimized run on Köln. The leaderboard's figure, where
// a map has one, is in js/maps.js.

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
    id: "estimate",
    label: "Estimate",
    title: "Estimate: routes booked, stations skipped",
    source: "plan",
    ai: true,
    does: "A guess by Claude, Anthropic's AI model, at the kind of strategy behind the leaderboard's best. A planner books each train's whole route before letting it in, so no two trains ever meet. The route leads through all the train's stations, but the train never halts there.",
    how: "Planned in Python by EstimatePlanner and replayed here: your browser simulates and scores every step of it.",
    why: { wait: "its whole route is free" }
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

/** What Claude's AI label says about the estimate. */
export const ESTIMATE_NOTE = {
  title: "Claude's reconstruction",
  text: [
    "The leaderboard's −37,374 comes from code that is not public. Claude, Anthropic's AI model, rebuilt the kind of solution that scores in that range: every train gets through without ever meeting another, but no train halts at its stations, and each of those stops costs 499.2 points.",
    "It guesses the strategy, not the exact score. The planner and its score are real: the engine simulates and scores its actions like any other run. That the leaderboard entry works like this is the estimate."
  ]
};
