// The maps the tests check, with their files: the same list as js/maps.js (the page) and
// tools/maps.py (the Python tools), which tests/data.mjs holds together. Paths are relative to the
// site's root: data/<id>/ holds the map, the plans and the Python runner's scores, and
// tests/fixtures/<id>/ the Python traces and the rules.

export const MAPS = {
  frankfurt: { id: "frankfurt", file: "neufrankfurt_19agents.json", runs: ["baseline", "optimized"] },
  koeln: { id: "koeln", file: "kk_36agents.json", runs: ["baseline", "optimized"] }
};

export const MAP_IDS = Object.keys(MAPS);

/** data/<id>/<file>: the map as the site serves it. */
export const mapPath = (id) => `data/${id}/${MAPS[id].file}`;

/**
 * The two ways a map's runs are recorded: as the challenge's runner runs them ("normal"), and with
 * the challenge's malfunctions on ("malfunctions", the page's Malfunctions switch).
 */
export const VARIANTS = ["normal", "malfunctions"];

/** The name a run's files carry: baseline, or baseline_malfunctions. */
export const runFile = (name, variant = "normal") => (variant === "malfunctions" ? `${name}_malfunctions` : name);

/** The plan the optimized run replays: PlannerController's actions, without or with malfunctions. */
export const planPath = (id, variant = "normal") => (variant === "malfunctions" ? `data/${id}/planner_actions_malfunctions.json` : `data/${id}/planner_actions.json`);

/** The malfunctions' seed and the generator's draws the page replays with malfunctions on. */
export const malfunctionsPath = (id) => `data/${id}/malfunctions.json`;

/** The test of both runs with malfunctions over many seeds (tools/malfunction_test.py). */
export const malfunctionTestPath = (id) => `data/${id}/malfunction_test.json`;

/** The Python runner's scores for the map. */
export const referencePath = (id) => `data/${id}/reference.json`;

/** A file in tests/fixtures/<id>/: trace_<run>.json or rules.json. */
export const fixturePath = (id, name) => `tests/fixtures/${id}/${name}`;

/**
 * Splits test case arguments like "koeln:baseline" or "--map koeln" into the maps to run and the
 * cases: { maps, cases }. No map named: every map.
 */
export function parseCases(argv, allCases) {
  const maps = [];
  const cases = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--map") { maps.push(argv[i + 1]); i += 1; continue; }
    if (a.includes(":")) { const [m, c] = a.split(":"); maps.push(m); cases.push(c); continue; }
    if (MAP_IDS.includes(a)) { maps.push(a); continue; }
    cases.push(a);
  }
  for (const m of maps) if (!MAP_IDS.includes(m)) throw new Error(`unknown map ${m} (maps: ${MAP_IDS.join(", ")})`);
  return { maps: maps.length ? [...new Set(maps)] : MAP_IDS, cases: cases.length ? [...new Set(cases)] : allCases };
}
