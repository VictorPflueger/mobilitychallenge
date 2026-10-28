// The three runs on screen, and the leaderboard's figure they are measured against.

/** The leaderboard's current best on neufrankfurt_19agents, as the project brief gives it. */
export const LEADERBOARD = -37374;

export const RUNS = [
  {
    id: "baseline",
    label: "Baseline",
    title: "Baseline: OrderedController",
    source: "live",
    summary: "The challenge's default controller. Every train takes the shortest branch towards its destination and never stops on its own, so trains run into each other and through their stops.",
    how: "Runs live in your browser: a port of OrderedController reads the same tree observation the Python version reads."
  },
  {
    id: "estimate",
    label: "Estimate",
    title: "Estimate of the current best",
    source: "live",
    ai: true,
    summary: "A rule-based dispatcher of the kind that lands near the leaderboard's −37,374: the baseline's routing, no driving into an occupied cell, a stop at the next timetabled station, and no early departure.",
    how: "Runs live in your browser. Claude reconstructed it from the challenge's rules; the leaderboard entry's own code is not public."
  },
  {
    id: "optimized",
    label: "Optimized",
    title: "Optimized: PlannerController",
    source: "plan",
    summary: "Plans every train through all its stops in time and space before the first step, so no two trains ever want the same cell, then improves the plan train group by train group.",
    how: "The plan was computed in Python (about two minutes of search); your browser replays its actions and the engine simulates and scores them."
  }
];

export const runById = (id) => RUNS.find((r) => r.id === id);

/** What Claude's AI label says about the estimate. */
export const ESTIMATE_NOTE = {
  title: "Claude's reconstruction",
  text: [
    "The leaderboard's −37,374 comes from code that is not public. Claude rebuilt the kind of controller that lands there from the challenge's rules: the baseline's routing, no driving into an occupied cell, a stop at the next timetabled station, and no early departure.",
    "Your browser runs these rules live. The score is the engine's, not a guess; that the leaderboard entry worked this way is the estimate."
  ]
};
