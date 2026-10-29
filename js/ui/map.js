// The rail network of the map on screen and its trains, drawn in SVG on Vici's honeycomb canvas.
// Tracks, platforms and buffer stops scale with the panel; train markers and labels keep their size
// on screen, so they stay legible on a projector and on a laptop. Colours come from classes in
// css/map.css (Vici's tokens), so a theme change repaints the map. Nothing in it is round: trains are
// flat-top hexagons and curves are 45-degree chamfers.

import { h, svg, prefersReducedMotion } from "../dom.js";
import { trackDrawing } from "../network.js";
import { trainStatus } from "../sim.js";
import { trainPoint } from "../glide.js";
import { networkBox } from "../maps.js";

export const HEX = (r) => [0, 1, 2, 3, 4, 5].map((k) => {
  const a = (Math.PI / 3) * k;
  return `${+(r * Math.cos(a)).toFixed(4)},${+(r * Math.sin(a)).toFixed(4)}`;
}).join(" ");

const MARKER_MIN = 14;  // a train's width on screen: 1.35 cells, at least 14 px, at most 26 px, so
const MARKER_MAX = 26;  // trains on neighbouring tracks barely overlap
const NUMBER_MIN = 17;  // below this width the number is left out (the title and the table name it)
const LABEL_PX = 13;    // station label size on screen

/**
 * The two views of a map (js/maps.js): the whole network, and its busy middle (around Neu-Frankfurt's
 * Hauptbahnhof, around Köln's hub, Stop 14). Boxes in cell units [x, y, width, height].
 */
function viewsOf(map, rail) {
  return {
    network: { label: "Whole network", box: networkBox(rail, map) },
    middle: { label: map.views.middle.label, box: map.views.middle.box }
  };
}

export function createMap(root, { map, scenario, network, onSelect }) {
  const rail = scenario.rail;
  const W = rail.width;
  const H = rail.height;
  const VIEWS = viewsOf(map, rail);
  const drawing = trackDrawing(rail);
  const reduced = prefersReducedMotion();

  const tracks = svg("g", { class: "map-tracks" },
    svg("path", { class: "track", d: drawing.tracks, "vector-effect": "non-scaling-stroke" }),
    svg("path", { class: "buffer", d: drawing.buffers, "vector-effect": "non-scaling-stroke" }));
  const crossings = svg("g", { class: "map-crossings" }, [...scenario.levelFree].map((cell) => {
    const x = rail.col(cell);
    const y = rail.row(cell);
    return svg("rect", { class: "level-free", x: x + 0.22, y: y + 0.22, width: 0.56, height: 0.56, rx: 0.08, "vector-effect": "non-scaling-stroke" });
  }));
  const stations = svg("g", { class: "map-stations" });
  const boxes = stationBoxes(rail, network).map((box) => {
    const rect = svg("rect", {
      class: "platform", x: box.x0 + 0.08, y: box.y0 + 0.08, width: box.x1 - box.x0 - 0.16, height: box.y1 - box.y0 - 0.16,
      rx: 0.12, "vector-effect": "non-scaling-stroke", dataset: { station: box.id }
    });
    stations.appendChild(rect);
    box.rect = rect;
    return box;
  });
  const labels = svg("g", { class: "map-labels", "aria-hidden": "true" });
  const trainsLayer = svg("g", { class: "map-trains" });
  const markers = scenario.agents.map((a) => {
    const g = svg("g", { class: "train", dataset: { train: a.handle, tone: "ontime", motion: "moving" } },
      svg("polygon", { class: "train-ring", points: HEX(1.42) }),
      svg("polygon", { class: "train-alert", points: HEX(1.32) }),
      svg("polygon", { class: "train-hex", points: HEX(1) }),
      svg("text", { class: "train-num", x: 0, y: 0.05, "text-anchor": "middle", "dominant-baseline": "central" }, String(a.handle)),
      svg("title", {}, ""));
    g.addEventListener("click", () => onSelect?.(a.handle));
    g.style.display = "none";
    trainsLayer.appendChild(g);
    return g;
  });

  let viewId = "network";
  let box = VIEWS.network.box;
  const view = svg("svg", {
    class: "map-svg", viewBox: box.join(" "), preserveAspectRatio: "xMidYMid meet",
    role: "img", "aria-labelledby": "map-title map-desc"
  },
  svg("title", { id: "map-title" }, `Rail network of ${map.name}`),
  svg("desc", { id: "map-desc" }, `${network.stations.length} stations and ${scenario.agents.length} trains on a ${H} by ${W} cell grid. The Trains tab lists every train with its state.`),
  tracks, crossings, stations, labels, trainsLayer);

  // The situation in full, and short for a narrow map (css/map.css shows one of them).
  const situationLong = h("span", { class: "sit-text sit-long" }, "");
  const situationShort = h("span", { class: "sit-text sit-short" }, "");
  const situationLine = h("div", { class: "cap-situation", id: "map-situation", role: "status", hidden: true }, h("span", { class: "cap-dot", "aria-hidden": "true" }), situationLong, situationShort);
  const caption = h("div", { class: "map-caption" },
    h("div", { class: "cap-line" }, h("span", { class: "run-swatch", "aria-hidden": "true" }), h("strong", { id: "map-run" }, "")),
    h("div", { class: "cap-sub", id: "map-sub" }, ""),
    situationLine);
  const legend = buildLegend();
  const viewButtons = new Map();
  const tools = h("div", { class: "segmented map-views", role: "group", "aria-label": "Map view" },
    Object.entries(VIEWS).map(([id, v]) => {
      const b = h("button", { type: "button", "aria-pressed": String(id === viewId) }, v.label);
      b.addEventListener("click", () => setView(id));
      viewButtons.set(id, b);
      return b;
    }));
  root.dataset.map = map.id;
  root.append(view, caption, tools, legend);

  function setView(id) {
    viewId = id;
    box = VIEWS[id].box;
    view.setAttribute("viewBox", box.join(" "));
    root.dataset.view = id;
    for (const [vid, b] of viewButtons) b.setAttribute("aria-pressed", String(vid === id));
    placedFor = null;
    layout();
  }

  // ---- layout: marker and label sizes in user units ---------------------------------------------
  let ppu = 10; // screen pixels per cell
  let markerPx = MARKER_MIN;
  let placedFor = null;
  let shown = box; // the part of the drawing on screen: the view box widened to the panel's shape
  function layout() {
    root.style.setProperty("--legend-h", `${legend.offsetHeight}px`);
    const r = view.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ppu = Math.min(r.width / box[2], r.height / box[3]);
    const w = r.width / ppu;
    const hh = r.height / ppu;
    shown = [box[0] - (w - box[2]) / 2, box[1] - (hh - box[3]) / 2, w, hh];
    markerPx = Math.max(MARKER_MIN, Math.min(MARKER_MAX, 1.35 * ppu));
    view.dataset.numbers = String(markerPx >= NUMBER_MIN);
    placeLabels();
    render(lastT, true);
  }

  // Station labels (layoutLabels below), placed again whenever the view or its size changes.
  const occupied = new Uint8Array(W * H);
  for (let c = 0; c < rail.cells.length; c += 1) if (rail.cells[c]) occupied[c] = 1;
  function placeLabels() {
    const key = `${viewId}|${ppu.toFixed(2)}|${shown.map((v) => v.toFixed(1)).join(",")}`;
    if (placedFor === key) return;
    placedFor = key;
    while (labels.firstChild) labels.removeChild(labels.firstChild);
    for (const l of layoutLabels({ boxes, occupied, W, H, shown, ppu })) {
      labels.appendChild(svg("text", {
        class: ["station-label", l.minor ? "minor" : ""].join(" "),
        x: l.x, y: l.y, "font-size": l.font, "text-anchor": l.anchor, "dominant-baseline": "central", dataset: { station: l.id }
      }, l.text));
    }
  }

  // ---- trains ----------------------------------------------------------------------------------
  let run = null;
  let lastT = 0;
  let selected = null;
  const center = (cell) => [rail.col(cell) + 0.5, rail.row(cell) + 0.5];

  /**
   * Draws the trains at fractional step t (between steps while it plays): each where js/glide.js
   * places it, so that it moves at its own speed and a standing train stays at the centre of its
   * cell. With reduced motion every train sits at the centre of its cell and jumps from cell to cell.
   */
  function render(t, force = false) {
    if (!run) return;
    const f = run.frames;
    const n = f.n;
    const step = Math.max(0, Math.min(Math.floor(t), run.steps));
    const frac = reduced ? 0 : Math.min(1, Math.max(0, t - step));
    if (!force && t === lastT) return;
    lastT = t;
    const s = markerPx / 2 / ppu;
    let onMap = 0;
    for (let i = 0; i < n; i += 1) {
      const g = markers[i];
      const cell = f.pos[step * n + i];
      if (cell < 0) {
        g.style.display = "none";
        continue;
      }
      onMap += 1;
      const [x, y] = (!reduced && trainPoint(run.paths, rail, i, step + frac)) || center(cell);
      g.style.display = "";
      g.setAttribute("transform", `translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${s.toFixed(4)})`);
      const st = trainStatus(run, scenario, i, step);
      g.dataset.tone = st.tone;
      g.dataset.motion = st.standing ? "standing" : "moving";
      g.dataset.selected = String(selected === i);
      const title = g.lastChild;
      const text = `Train ${i}, ${network.trains[i].name}: ${st.word}`;
      if (title.textContent !== text) title.textContent = text;
    }
    view.dataset.onMap = String(onMap);
  }

  function setRun(r, meta) {
    run = r;
    root.dataset.run = meta.id;
    caption.dataset.run = meta.id;
    caption.querySelector("#map-run").textContent = meta.title;
    render(lastT, true);
  }

  function setCaption(text) {
    caption.querySelector("#map-sub").textContent = text;
  }

  /** The situation line under the caption: { tone, text, short }, or null to hide it. */
  function setSituation(s) {
    const text = s ? s.text : "";
    if (situationLong.textContent === text && situationLine.dataset.tone === (s?.tone || "")) return;
    situationLine.hidden = !s;
    situationLine.dataset.tone = s?.tone || "";
    situationLong.textContent = text;
    situationShort.textContent = s ? s.short || s.text : "";
  }

  function select(i) {
    selected = i;
    for (const b of boxes) b.rect.dataset.stop = "false";
    if (i !== null) {
      const stops = new Set(network.trains[i].stops.slice(1));
      for (const b of boxes) if (stops.has(b.id)) b.rect.dataset.stop = "true";
    }
    render(lastT, true);
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  ro.observe(legend);
  document.addEventListener("vc:themechange", () => render(lastT, true));
  requestAnimationFrame(layout);

  return { setRun, render, select, setCaption, setSituation, layout, setView };
}

/** The stations' platform boxes in cell units: [{ id, x0, x1, y0, y1, station }]. */
export function stationBoxes(rail, network) {
  return network.stations.map((s) => {
    const rows = s.cells.map((c) => rail.row(c));
    const cols = s.cells.map((c) => rail.col(c));
    return { id: s.id, x0: Math.min(...cols), x1: Math.max(...cols) + 1, y0: Math.min(...rows), y1: Math.max(...rows) + 1, station: s };
  });
}

/**
 * Station labels: beside the platforms, where they cover no other label, no platform and as few
 * tracks as possible, inside the part of the drawing on screen (shown, in cells). A numbered stop
 * whose label would cover another label or a platform is left unnamed (its platforms are still
 * drawn), and numbered stops are left out below 7 px per cell; a named station gets its name in
 * the least crowded place, unless every place would cover another name or leave the screen (a
 * phone's tiny map, a station at the edge of the Hbf view). ppu: screen pixels per cell.
 * Returns [{ id, text, x, y, anchor, font, minor }] in cell units.
 */
export function layoutLabels({ boxes, occupied, W, H, shown, ppu, labelPx = LABEL_PX }) {
  const font = labelPx / ppu;
  const hideMinor = ppu < 7;
  const placed = [];
  const out = [];
  const hits = (a, b, pad = 0) => a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
  const order = [...boxes].sort((a, b) => (a.station.name.startsWith("Stop") ? 1 : 0) - (b.station.name.startsWith("Stop") ? 1 : 0) || a.id - b.id);
  for (const b of order) {
    const text = b.station.short;
    const isMinor = text.startsWith("Stop");
    if (hideMinor && isMinor) continue;
    if (b.x1 < shown[0] || b.x0 > shown[0] + shown[2] || b.y1 < shown[1] || b.y0 > shown[1] + shown[3]) continue;
    const w = (text.length * 0.6 + 0.5) * font;
    const hgt = 1.25 * font;
    const cy = (b.y0 + b.y1) / 2;
    const cx = (b.x0 + b.x1) / 2;
    // Beside the platforms (centred, or level with their top or bottom) and above or below them
    // (centred, or flush with either end), close by first, then a line further out.
    const candidates = [];
    const near = Math.max(0.45, 4 / ppu);
    for (const gap of [near, near + hgt]) {
      for (const y of [cy - hgt / 2, b.y0, b.y1 - hgt]) {
        candidates.push({ x: b.x1 + gap, y, anchor: "start" }, { x: b.x0 - gap - w, y, anchor: "end" });
      }
      for (const y of [b.y0 - gap - hgt, b.y1 + gap]) {
        candidates.push({ x: cx - w / 2, y, anchor: "middle" }, { x: b.x1 - w, y, anchor: "end" }, { x: b.x0, y, anchor: "start" });
      }
    }
    let best = null;
    candidates.forEach((c, i) => {
      const rect = { x: c.x, y: c.y, w, h: hgt };
      let cost = i >= 12 ? 2 : 0; // the near places first
      if (c.x < shown[0] || c.y < shown[1] || c.x + w > shown[0] + shown[2] || c.y + hgt > shown[1] + shown[3]) cost += 1000;
      for (let y = Math.floor(c.y); y < c.y + hgt; y += 1) {
        for (let x = Math.floor(c.x); x < c.x + w; x += 1) {
          if (x >= 0 && y >= 0 && x < W && y < H && occupied[y * W + x]) cost += 6;
        }
      }
      for (const p of placed) {
        if (hits(rect, p)) cost += 500;
        else if (hits(rect, p, 0.6 * font)) cost += 40; // too close to read as two names
      }
      for (const o of boxes) if (o !== b && hits(rect, { x: o.x0, y: o.y0, w: o.x1 - o.x0, h: o.y1 - o.y0 })) cost += 200;
      if (!best || cost < best.cost) best = { ...c, cost };
    });
    if (best.cost >= 500 || (isMinor && best.cost >= 200)) continue;
    placed.push({ x: best.x, y: best.y, w, h: hgt });
    const tx = best.anchor === "start" ? best.x : best.anchor === "end" ? best.x + w : best.x + w / 2;
    out.push({ id: b.id, text, x: tx, y: best.y + hgt / 2, anchor: best.anchor, font, minor: isMinor });
  }
  return out;
}

/**
 * A train as the map draws it, for drawings outside the map: a flat-top hexagon of radius `size` at
 * (x, y) in the drawing's units, with the map's tones (css/map.css) and, if given, its number.
 */
export function trainGlyph({ x, y, size, tone = "ontime", motion = "moving", number = null, selected = false }) {
  return svg("g", { class: "train", transform: `translate(${x} ${y}) scale(${size})`, dataset: { tone, motion, selected: String(selected) }, "aria-hidden": "true" },
    svg("polygon", { class: "train-ring", points: HEX(1.42) }),
    svg("polygon", { class: "train-alert", points: HEX(1.32) }),
    svg("polygon", { class: "train-hex", points: HEX(1) }),
    number === null ? null : svg("text", { class: "train-num", x: 0, y: 0.05, "text-anchor": "middle", "dominant-baseline": "central" }, String(number)));
}

/** A train's symbol as the map draws it, for the legend and the Method tab. */
export function trainSwatch(tone, motion) {
  return svg("svg", { class: "legend-swatch", viewBox: "-1.4 -1.25 2.8 2.5", "aria-hidden": "true", dataset: { tone, motion } },
    svg("polygon", { class: "train-alert", points: HEX(1.32) }),
    svg("polygon", { class: "train-hex", points: HEX(1) }));
}

/** The network's symbols: a track with a switch, a level-free crossing, platforms, a buffer stop. */
export function trackGlyph(kind) {
  if (kind === "platform") {
    return svg("svg", { class: "legend-line platform", viewBox: "0 0 28 12", "aria-hidden": "true" }, svg("rect", { x: 3, y: 1, width: 22, height: 10, rx: 1.5 }));
  }
  if (kind === "crossing") {
    return svg("svg", { class: "legend-line crossing", viewBox: "0 0 28 12", "aria-hidden": "true" },
      svg("path", { d: "M2 6 H26 M14 -2 V14" }), svg("rect", { class: "level-free", x: 10.5, y: 2.5, width: 7, height: 7, rx: 1 }));
  }
  const d = kind === "buffer" ? "M2 6 H20 M20 1 V11" : "M2 9 H26 M8 9 L14 3 H26";
  return svg("svg", { class: `legend-line ${kind}`, viewBox: "0 0 28 12", "aria-hidden": "true" }, svg("path", { d }));
}

/**
 * The legend: a strip under the map that is always there and never covers it (the map's drawing
 * area ends above it). Short names; the Method tab explains each symbol in full.
 */
function buildLegend() {
  const item = (glyph, text) => h("li", { class: "legend-item" }, glyph, h("span", {}, text));
  return h("section", { class: "map-legend", "aria-label": "Legend" },
    h("ul", { class: "legend-items" },
      item(trainSwatch("ontime", "moving"), "On time"),
      item(trainSwatch("late", "moving"), "Behind timetable"),
      item(trainSwatch("ontime", "standing"), "Standing"),
      item(trainSwatch("blocked", "moving"), "Blocked"),
      item(trainSwatch("blocked", "standing"), "Stuck"),
      h("li", { class: "legend-sep", "aria-hidden": "true" }),
      item(trackGlyph("platform"), "Platforms"),
      item(trackGlyph("buffer"), "Buffer stop")));
}
