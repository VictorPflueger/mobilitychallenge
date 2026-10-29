// The guide's drawings: the real network in miniature, the pieces a Flatland railway is made of, and
// three small scenes of what happens when trains meet. They use the map's own classes
// (css/map.css), so tracks, platforms and trains look as they do on the map, in both themes; the
// guide's own marks are in css/guide.css. Nothing in them is round. Their words stay 10 px or
// larger on any screen: the network's names are laid out again for the width they are drawn at, and
// on a narrow screen the pieces' labels give way to numbered markers and a key below the drawing.

import { h, svg } from "../dom.js";
import { trackDrawing } from "../network.js";
import { HEX, layoutLabels, stationBoxes, trainGlyph } from "./map.js";

/** Station names in the network drawing, on screen: 13 px, 11 px when the drawing is narrow. */
const NAME_PX = 13;
const NAME_PX_NARROW = 11;

/** The whole network, small: tracks, platforms and the names of its stations. */
export function networkDiagram(scenario, network) {
  const rail = scenario.rail;
  const W = rail.width;
  const H = rail.height;
  const box = [-1.5, -3.5, W + 3, H + 7];
  const drawing = trackDrawing(rail);
  const boxes = stationBoxes(rail, network);
  const occupied = new Uint8Array(W * H);
  for (let c = 0; c < rail.cells.length; c += 1) if (rail.cells[c]) occupied[c] = 1;
  const names = svg("g", { class: "diagram-names" });
  // The names, laid out for a drawing `width` px wide: placed where they are free of each other at
  // their size on screen.
  let laidOutFor = 0;
  const name = (width) => {
    const w = Math.round(width);
    if (!(w > 0) || w === laidOutFor) return;
    laidOutFor = w;
    const labels = layoutLabels({ boxes, occupied, W, H, shown: box, ppu: w / box[2], labelPx: w < 500 ? NAME_PX_NARROW : NAME_PX });
    names.replaceChildren(...labels.map((l) => svg("text", { class: "station-label", x: l.x, y: l.y, "font-size": l.font, "text-anchor": l.anchor, "dominant-baseline": "central" }, l.text)));
  };
  name(560);
  const el = svg("svg", { class: "diagram diagram-network", viewBox: box.join(" "), role: "img", "aria-label": `Map of the Neu-Frankfurt network: ${network.stations.length} stations on a grid of ${W} by ${H} cells` },
    svg("path", { class: "track", d: drawing.tracks, "vector-effect": "non-scaling-stroke" }),
    svg("path", { class: "buffer", d: drawing.buffers, "vector-effect": "non-scaling-stroke" }),
    boxes.map((b) => svg("rect", { class: "platform", x: b.x0 + 0.08, y: b.y0 + 0.08, width: b.x1 - b.x0 - 0.16, height: b.y1 - b.y0 - 0.16, rx: 0.12, "vector-effect": "non-scaling-stroke" })),
    names);
  // Drawn at another width (a phone, a resized window): the names again, for that width.
  if (typeof ResizeObserver === "function") {
    const watch = new ResizeObserver(() => {
      if (!el.isConnected) { watch.disconnect(); return; }
      const scale = el.getScreenCTM()?.a;
      if (scale) name(scale * box[2]);
    });
    watch.observe(el);
  }
  return el;
}

/**
 * The pieces of a Flatland railway, on a made-up stretch of 16 × 8 cells (10 units each): a buffer
 * stop where a train enters, a switch, a station with two platforms, a level-free crossing. Each
 * note names a thing at (x, y) from a label at (tx, ty), above or below the grid.
 */
const PIECES = [
  { x: 25, y: 15, tx: 25, ty: -14, lines: ["One cell"] },
  { x: 15, y: 60, tx: 15, ty: 88, lines: ["Buffer stop", "trains enter here"] },
  { x: 35, y: 49, tx: 45, ty: -14, lines: ["Train", "fills one cell"], anchor: "start" },
  { x: 56, y: 58, tx: 62, ty: 88, lines: ["Switch", "the dispatcher", "picks a branch"] },
  { x: 105, y: 31, tx: 105, ty: -14, lines: ["Station", "two platforms"] },
  { x: 138, y: 58, tx: 150, ty: 88, lines: ["Level-free", "crossing"] }
];
const PIECES_LABEL = "A made-up stretch of railway on a grid: a buffer stop, a train, a switch, a station with two platforms and a level-free crossing";

function stretch() {
  const grid = [];
  for (let x = 0; x <= 160; x += 10) grid.push(`M${x} 0 V80`);
  for (let y = 0; y <= 80; y += 10) grid.push(`M0 ${y} H160`);
  return [
    svg("path", { class: "diagram-grid", d: grid.join(" ") }),
    // main line from the buffer stop, the branch after the switch, the crossing line
    svg("path", { class: "track", d: "M15 55 H160 M55 55 L75 35 H160 M135 40 V80", "vector-effect": "non-scaling-stroke" }),
    svg("path", { class: "buffer", d: "M15 50 V60", "vector-effect": "non-scaling-stroke" }),
    svg("rect", { class: "platform", x: 91, y: 31, width: 28, height: 8, rx: 1, "vector-effect": "non-scaling-stroke" }),
    svg("rect", { class: "platform", x: 91, y: 51, width: 28, height: 8, rx: 1, "vector-effect": "non-scaling-stroke" }),
    svg("rect", { class: "level-free", x: 132, y: 52, width: 6, height: 6, rx: 0.8, "vector-effect": "non-scaling-stroke" }),
    svg("rect", { class: "diagram-cell", x: 20, y: 10, width: 10, height: 10 }),
    trainGlyph({ x: 35, y: 55, size: 4.2 }),
    svg("path", { class: "diagram-arrow", d: "M43 51 L47 55 L43 59" })
  ];
}

/** A label with a leader line to the thing it names (drawing units). */
function callout({ x, y, tx, ty, lines, anchor = "middle" }) {
  const lineHeight = 5.4;
  return svg("g", { class: "diagram-callout" },
    svg("path", { class: "diagram-leader", d: `M${x} ${y} L${tx} ${ty}` }),
    svg("text", { class: "diagram-label", x: tx, y: ty + (ty > y ? 5 : -2 - lineHeight * (lines.length - 1)), "text-anchor": anchor },
      lines.map((t, i) => svg("tspan", { x: tx, dy: i ? lineHeight : 0, class: i ? "" : "diagram-label-title" }, t))));
}

/** A numbered marker with a leader line to the thing it names, close to the grid (drawing units). */
const MARKER_R = 6.2;
function marker({ x, y, tx, ty }, n) {
  const above = ty < y;
  const cy = above ? -MARKER_R - 3.5 : 80 + MARKER_R + 3.5;
  const edge = cy + (above ? 1 : -1) * MARKER_R * 0.866;
  return svg("g", { class: "diagram-marker" },
    svg("path", { class: "diagram-leader", d: `M${x} ${y} L${tx} ${edge}` }),
    svg("polygon", { class: "diagram-marker-hex", points: HEX(MARKER_R), transform: `translate(${tx} ${cy})` }),
    svg("text", { class: "diagram-marker-num", x: tx, y: cy, "text-anchor": "middle", "dominant-baseline": "central" }, String(n)));
}

/**
 * The pieces drawing, twice: with its labels in the drawing, and for a narrow screen with numbered
 * markers and a key below it. The figure's width picks one (css/guide.css, a container query).
 */
export function piecesDiagram() {
  const labelled = svg("svg", { class: "diagram diagram-pieces diagram-pieces--labels", viewBox: "-6 -34 172 152", role: "img", "aria-label": PIECES_LABEL },
    stretch(), PIECES.map(callout));
  const keyed = svg("svg", { class: "diagram diagram-pieces diagram-pieces--key", viewBox: `-6 ${-2 * MARKER_R - 5} 172 ${80 + 4 * MARKER_R + 10}`, role: "img", "aria-label": PIECES_LABEL },
    stretch(), PIECES.map((p, i) => marker(p, i + 1)));
  const key = h("ol", { class: "diagram-key" }, PIECES.map((p, i) =>
    h("li", {}, h("span", { class: "diagram-key-num", "aria-hidden": "true" }, String(i + 1)),
      h("span", {}, h("strong", {}, p.lines[0]), p.lines.length > 1 ? ` ${p.lines.slice(1).join(" ")}` : ""))));
  return h("div", { class: "diagram-pieces-wrap" }, labelled, keyed, key);
}

/** One of the three conflict scenes: a single track of 7 cells with trains on it. */
function scene(trains, arrows = []) {
  const cells = [];
  for (let x = 0; x <= 70; x += 10) cells.push(`M${x} 0 V20`);
  cells.push("M0 0 H70 M0 20 H70");
  return svg("svg", { class: "diagram diagram-scene", viewBox: "-2 -4 74 28", "aria-hidden": "true" },
    svg("path", { class: "diagram-grid", d: cells.join(" ") }),
    svg("path", { class: "track", d: "M0 10 H70", "vector-effect": "non-scaling-stroke" }),
    arrows.map((a) => svg("path", { class: ["diagram-arrow", a.blocked ? "is-blocked" : ""].join(" "), d: a.d })),
    trains.map((t) => trainGlyph({ size: 3.6, ...t })));
}

/** Free track, a taken cell, two trains head to head. */
export function conflictScenes() {
  return [
    {
      id: "free", title: "Free track",
      drawing: scene([{ x: 15, y: 10 }], [{ d: "M23 6 L27 10 L23 14" }]),
      text: "The cell ahead is free: the train moves on."
    },
    {
      id: "taken", title: "Cell taken",
      drawing: scene([{ x: 25, y: 10, tone: "blocked" }, { x: 35, y: 10, motion: "standing" }], [{ d: "M31 7 L33 10 L31 13", blocked: true }]),
      text: "The cell ahead is taken: the simulator holds the moving train back. Nothing crashes, but the challenge counts it as a collision."
    },
    {
      id: "deadlock", title: "Head to head",
      drawing: scene([{ x: 25, y: 10, tone: "blocked", motion: "standing" }, { x: 45, y: 10, tone: "blocked", motion: "standing" }], [{ d: "M31 7 L33 10 L31 13", blocked: true }, { d: "M39 7 L37 10 L39 13", blocked: true }]),
      text: "Two trains face each other on a single track: neither can ever pass. Trains behind them get stuck too: a gridlock."
    }
  ];
}
