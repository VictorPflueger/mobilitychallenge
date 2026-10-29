// The maps the tests check, with their files: the same list as js/maps.js (the page) and
// tools/maps.py (the Python tools), which tests/data.mjs holds together. Paths are relative to the
// site's root: data/<id>/ holds the map, the plans and the Python runner's scores, and
// tests/fixtures/<id>/ the Python traces and the rules.

export const MAPS = {
  frankfurt: { id: "frankfurt", file: "neufrankfurt_19agents.json", runs: ["baseline", "estimate", "optimized"] },
  koeln: { id: "koeln", file: "kk_36agents.json", runs: ["baseline", "optimized"] }
};

export const MAP_IDS = Object.keys(MAPS);

/** data/<id>/<file>: the map as the site serves it. */
export const mapPath = (id) => `data/${id}/${MAPS[id].file}`;

/** The plan a replayed run reads: the estimate's or PlannerController's. */
export const planPath = (id, run) => `data/${id}/${run === "estimate" ? "estimate_actions" : "planner_actions"}.json`;

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
