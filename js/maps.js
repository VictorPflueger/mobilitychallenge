// The maps Dispatch Lab shows, and what the page needs to know about each beyond its file: the runs
// recorded on it, the leaderboard's figure it is measured against, names for its stations (the files
// number them) and the two views of the map. tools/maps.py lists the same maps for the Python tools
// and tests/lib/maps.mjs for the tests; tests/data.mjs holds the three lists together.
//
// Station names come from the scenario's own line names, as the README says: a station at the end of
// a line named after a place gets that place's name; every other station keeps its number
// ("Stop 14"). Köln's lines name only Essen and Frankfurt (ICE_Essen, ICE_Frankfurt,
// ICE_Frankfurt_nebenstrecke); its other line names are compass points and loops, not places.

// The leaderboard's current best, as the project brief gives it (October 2026). Not computed and not
// simulated: the page shows it on both maps as the target to beat.
const CURRENT_BEST = -37374;

export const MAPS = [
  {
    id: "frankfurt",
    name: "Neu-Frankfurt",
    file: "neufrankfurt_19agents.json",
    // The challenge's runner loads this map (src/tbrain-simulation.py on main).
    runs: ["baseline", "optimized"],
    leaderboard: CURRENT_BEST,
    stations: {
      names: { 1: "Hauptbahnhof", 2: "Flughafen (RB, S)", 3: "Flughafen (ICE)", 7: "Langen", 8: "Offenbach", 9: "Maintal", 10: "Taunus", 11: "Höchst" },
      short: { 1: "Hbf", 2: "Flughafen (RB, S)", 3: "Flughafen (ICE)", 7: "Langen", 8: "Offenbach", 9: "Maintal", 10: "Taunus", 11: "Höchst" }
    },
    // The whole grid (its tracks fill it), and the busy middle around the Hauptbahnhof.
    views: { network: "grid", middle: { label: "Around the Hbf", box: [24, 8.5, 59, 29] } }
  },
  {
    id: "koeln",
    name: "Köln",
    file: "kk_36agents.json",
    // The larger of the two maps the challenge's final ran on (T-Systems' whitepaper, October 2026:
    // "Im Finale liefen die Lösungen auf Karten von Frankfurt und Köln"); the file never names it.
    runs: ["baseline", "optimized"],
    leaderboard: CURRENT_BEST,
    stations: {
      names: { 12: "Essen", 16: "Frankfurt (branch line)", 18: "Frankfurt" },
      short: { 12: "Essen", 16: "Frankfurt (branch)", 18: "Frankfurt" }
    },
    // The tracks fill only part of the grid, so the whole network is the tracks' extent; the middle
    // is the hub (Stop 14) and the stations east of it.
    views: { network: "tracks", middle: { label: "Around Stop 14", box: [47.5, 35, 56, 41] } }
  }
];

// The map a page opens on when its address names none (or one this list does not have).
export const DEFAULT_MAP = "koeln";

export const mapById = (id) => MAPS.find((m) => m.id === id);

/** The map the address asks for (?map=frankfurt, ?map=koeln), or the default one, Köln. */
export function mapFromSearch(search) {
  const id = new URLSearchParams(search).get("map");
  return mapById(id) || mapById(DEFAULT_MAP);
}

/** data/<id>/<file>: where the page loads a map's files from. */
export const dataPath = (map, name) => `data/${map.id}/${name}`;

/**
 * The whole network's view box in cell units [x, y, width, height], with room above and below the
 * outermost lines for the names of the stations there: the whole grid, or the tracks' extent.
 */
export function networkBox(rail, map) {
  if (map.views.network !== "tracks") return [-1.5, -3.5, rail.width + 3, rail.height + 7];
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (let cell = 0; cell < rail.cells.length; cell += 1) {
    if (!rail.cells[cell]) continue;
    const r = rail.row(cell);
    const c = rail.col(cell);
    if (r < r0) r0 = r;
    if (r > r1) r1 = r;
    if (c < c0) c0 = c;
    if (c > c1) c1 = c;
  }
  return [c0 - 1.5, r0 - 3.5, c1 - c0 + 1 + 3, r1 - r0 + 1 + 7];
}
