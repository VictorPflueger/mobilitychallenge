// Two charts on Vici's chart frame: the map's scores side by side (bars with square ends, starting
// at zero) and each run's score over the episode (lines in the runs' series colours, the
// leaderboard as a dashed reference where the map has one, a cursor at the step on screen). Plain SVG
// and HTML; colours come from classes.

import { h, svg } from "../dom.js";
import { count, score } from "../format.js";
import { aiLabel } from "./ailabel.js";
import { icon } from "../icons.js";
import { ESTIMATE_NOTE } from "../runs.js";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** "Two", "Four": a small count in words, for titles. */
export const inWords = (n) => WORDS[n] || count(n);

/**
 * The map's scores as bars of lost points (a longer bar is a worse score): its runs, and the
 * leaderboard's figure after the baseline where the map has one. ctx: { map, runList }.
 */
export function comparison(runs, { map, runList, selected, verified, onPick }) {
  const rows = runList.map((r) => ({ id: r.id, value: runs.get(r.id).score }));
  if (map.leaderboard !== null) rows.splice(1, 0, { id: "leaderboard", value: map.leaderboard });
  const max = Math.max(...rows.map((r) => Math.abs(r.value)));
  const list = h("ol", { class: "compare-list" });
  for (const r of rows) {
    const meta = runList.find((x) => x.id === r.id);
    const name = meta ? meta.label : "Current best";
    const bar = h("span", { class: "compare-bar", dataset: { run: r.id } });
    bar.style.setProperty("--w", `${Math.max(0.4, (Math.abs(r.value) / max) * 100).toFixed(2)}%`);
    const valueText = r.id === "leaderboard" ? count(r.value) : score(r.value);
    const head = meta
      ? h("button", { type: "button", class: "compare-pick", "aria-pressed": String(selected === r.id), on: { click: () => onPick(r.id) } },
        h("span", { class: "run-swatch", "aria-hidden": "true" }), h("span", {}, name))
      : h("span", { class: "compare-pick compare-static" }, h("span", { class: "ref-swatch", "aria-hidden": "true" }), h("span", {}, name));
    const note = meta
      ? (verified.get(r.id)
        ? h("span", { class: "compare-note verified" }, icon("check", 14), "same score as the Python runner")
        : h("span", { class: "compare-note" }, "simulated in your browser"))
      : h("span", { class: "compare-note" }, "the leaderboard's figure; not simulated here");
    list.appendChild(h("li", { class: "compare-row", dataset: { run: r.id, selected: String(selected === r.id) } },
      h("div", { class: "compare-head" }, head, r.id === "estimate" ? aiLabel(ESTIMATE_NOTE.title, ESTIMATE_NOTE.text) : null),
      h("div", { class: "compare-track" }, bar),
      h("strong", { class: "compare-value" }, valueText),
      note));
  }
  return h("figure", { class: "vc-chart compare" },
    h("figcaption", {}, h("span", { class: "vc-chart__title" }, `${inWords(rows.length)} scores on the same scenario`),
      h("span", { class: "vc-chart__subtitle" }, `Points lost on ${map.file.replace(/\.json$/, "")}; a shorter bar is better`)),
    list);
}

/**
 * The score over the episode for the map's runs. Returns { el, update(t, selected) }.
 * Drawn at the width it is shown (ResizeObserver), 11 px axis labels, horizontal grid only: a line
 * every 20,000 points, or every 50,000 or 100,000 where that would make more than seven.
 */
export function scoreOverTime(runs, { map, runList }) {
  const height = 230;
  const pad = { l: 64, r: 16, t: 14, b: 30 };
  const ref = map.leaderboard;
  const maxSteps = Math.max(...[...runs.values()].map((r) => r.steps));
  const low = Math.min(ref ?? 0, ...[...runs.values()].map((r) => Math.min(...r.frames.total.subarray(0, r.steps + 1))));
  const gridStep = [20000, 50000, 100000, 200000].find((g) => Math.ceil(-low / g) <= 7) || 500000;
  const bottom = -Math.max(1, Math.ceil(-low / gridStep)) * gridStep;
  const holder = h("div", { class: "vc-chart__plot score-plot" });
  const fig = h("figure", { class: "vc-chart score-chart" },
    h("figcaption", {}, h("span", { class: "vc-chart__title" }, "Score over the episode"),
      h("span", { class: "vc-chart__subtitle" }, "Points after each step; the line at the cursor is the step on screen")),
    holder,
    h("ul", { class: "vc-legend" }, runList.map((r) => h("li", { dataset: { run: r.id } }, h("span", { class: "run-swatch", "aria-hidden": "true" }), r.label)),
      ref !== null ? h("li", {}, h("span", { class: "ref-dash", "aria-hidden": "true" }), "Current best on the leaderboard") : null));

  let width = 0;
  let parts = null;
  let state = { t: 0, selected: "optimized" };

  function draw() {
    width = Math.max(260, Math.floor(holder.clientWidth));
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const x = (s) => pad.l + (s / maxSteps) * iw;
    const y = (v) => pad.t + (v / bottom) * ih;
    const grid = [];
    for (let v = 0; v >= bottom; v -= gridStep) {
      grid.push(svg("line", { class: "chart-grid", x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v) }));
      grid.push(svg("text", { class: "chart-axis", x: pad.l - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "central" }, score(v).replace(".0", "")));
    }
    const xt = [];
    for (let s = 0; s <= maxSteps; s += 250) {
      xt.push(svg("text", { class: "chart-axis", x: x(s), y: height - 8, "text-anchor": "middle" }, count(s)));
    }
    const lines = runList.map((r) => {
      const run = runs.get(r.id);
      const pts = [];
      const stride = Math.max(1, Math.floor(run.steps / iw));
      for (let s = 0; s <= run.steps; s += stride) pts.push(`${x(s).toFixed(1)},${y(run.frames.total[s]).toFixed(1)}`);
      pts.push(`${x(run.steps).toFixed(1)},${y(run.score).toFixed(1)}`);
      return svg("polyline", { class: "chart-line", points: pts.join(" "), dataset: { run: r.id } });
    });
    const refLine = ref !== null ? svg("line", { class: "chart-ref", x1: pad.l, x2: width - pad.r, y1: y(ref), y2: y(ref) }) : null;
    const refLabel = ref !== null ? svg("text", { class: "chart-ref-label", x: width - pad.r - 4, y: y(ref) - 6, "text-anchor": "end" }, `Current best ${count(ref)}`) : null;
    const cursor = svg("line", { class: "chart-cursor", y1: pad.t, y2: height - pad.b });
    const marker = svg("polygon", { class: "chart-marker", points: "" });
    const s = svg("svg", { class: "score-svg", width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `Score of the ${inWords(runList.length).toLowerCase()} runs over the episode` },
      ...grid, ...xt, refLine, refLabel, ...lines, cursor, marker);
    holder.replaceChildren(s);
    parts = { x, y, cursor, marker, lines };
    update(state.t, state.selected);
  }

  function update(t, selected) {
    state = { t, selected };
    if (!parts) return;
    const run = runs.get(selected);
    const step = Math.min(t, run.steps);
    const cx = parts.x(step);
    const cy = parts.y(run.frames.total[step]);
    parts.cursor.setAttribute("x1", cx.toFixed(1));
    parts.cursor.setAttribute("x2", cx.toFixed(1));
    const r = 6;
    parts.marker.setAttribute("points", [0, 1, 2, 3, 4, 5].map((k) => `${(cx + r * Math.cos(k * Math.PI / 3)).toFixed(1)},${(cy + r * Math.sin(k * Math.PI / 3)).toFixed(1)}`).join(" "));
    parts.marker.dataset.run = selected;
    for (const l of parts.lines) l.dataset.selected = String(l.dataset.run === selected);
  }

  const ro = new ResizeObserver(() => {
    if (Math.max(260, Math.floor(holder.clientWidth)) !== width) draw();
  });
  ro.observe(holder);
  document.addEventListener("vc:themechange", () => draw());
  return { el: fig, update, draw };
}
