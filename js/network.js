// What the scenario file says beyond the engine's needs: station and train names, train classes,
// routes, and the drawing of the rail network. Everything comes from data/neufrankfurt_19agents.json
// (the challenge's map): its stations, lines, schedules and train classes.

/**
 * Station names. The file names stations by number only; these names come from its line names
 * ("Offenbach-Hbf-Flughafen", "Langen", "Taunus", "Höchst", "Maintal" and the stations at the ends
 * of those lines). Flughafen appears twice: the ICE lines end at station 3, the RB and S-Bahn lines
 * at station 2. Stations no line name mentions keep their number.
 */
const NAMED = {
  1: "Hauptbahnhof",
  2: "Flughafen (RB, S)",
  3: "Flughafen (ICE)",
  7: "Langen",
  8: "Offenbach",
  9: "Maintal",
  10: "Taunus",
  11: "Höchst"
};
const SHORT = { 1: "Hbf", 2: "Flughafen (RB, S)", 3: "Flughafen (ICE)", 7: "Langen", 8: "Offenbach", 9: "Maintal", 10: "Taunus", 11: "Höchst" };

export const stationName = (id) => NAMED[id] || `Stop ${id}`;
export const stationShort = (id) => SHORT[id] || `Stop ${id}`;

/** The network's descriptive layer: stations with their cells, trains with names and routes. */
export function describe(data) {
  const cols = data.gridDimensions.cols;
  const stations = new Map();
  for (const s of data.stations) {
    if (!stations.has(s.id)) stations.set(s.id, { id: s.id, name: stationName(s.id), short: stationShort(s.id), cells: [] });
    stations.get(s.id).cells.push(s.r * cols + s.c);
  }
  const lines = new Map(data.lines.map((l) => [l.id, l]));
  const classes = new Map(data.trainClasses.map((c) => [c.id, c.name]));
  const trains = data.schedules.map((s, i) => {
    const line = lines.get(s.lineId);
    const stops = s.stops.map((x) => x.stationId);
    return {
      handle: i,
      name: s.name.replace(/_/g, " "),
      kind: classes.get(s.trainClassId) || "Train",
      line: line ? line.name : "",
      stops,
      from: stationName(stops[0]),
      to: stationName(stops[stops.length - 1])
    };
  });
  return { stations: [...stations.values()], trains };
}

const MOVES = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/**
 * The track drawing, in cell units (x = column, y = row; a cell's centre at +0.5): for every
 * transition a segment from the edge the train enters by to the edge it leaves by. Straight
 * transitions run through the centre, turns cut the corner at 45 degrees (Vici's chamfer, no
 * arcs), and a dead end gets a stub with a buffer stop. Segments both directions share are
 * drawn once.
 */
export function trackDrawing(rail) {
  const segments = new Map();
  const buffers = [];
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pt = (x, y) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
  for (let cell = 0; cell < rail.cells.length; cell += 1) {
    if (!rail.cells[cell]) continue;
    const cx = rail.col(cell) + 0.5;
    const cy = rail.row(cell) + 0.5;
    for (let o = 0; o < 4; o += 1) {
      const t = rail.transitions(cell, o);
      for (let d = 0; d < 4; d += 1) {
        if (!t[d]) continue;
        const entry = pt(cx - 0.5 * MOVES[o][1], cy - 0.5 * MOVES[o][0]);
        if (d === (o + 2) % 4) { // a dead end: the train turns back here
          segments.set(key(entry, pt(cx, cy)), [entry, pt(cx, cy)]);
          const [dy, dx] = MOVES[o];
          buffers.push([pt(cx - 0.32 * dy, cy - 0.32 * dx), pt(cx + 0.32 * dy, cy + 0.32 * dx)]);
          continue;
        }
        const exit = pt(cx + 0.5 * MOVES[d][1], cy + 0.5 * MOVES[d][0]);
        segments.set(key(entry, exit), [entry, exit]);
      }
    }
  }
  const tracks = [...segments.values()].map(([a, b]) => `M${a}L${b}`).join("");
  const stops = buffers.map(([a, b]) => `M${a}L${b}`).join("");
  return { tracks, buffers: stops };
}
