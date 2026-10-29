// Dispatch Lab in Chromium, end to end: the page boots over http on Köln, its default map, simulates
// its two runs itself, shows their scores (and the Python runner's are the same) beside the
// leaderboard's figure, plays them back, and every control does its job exactly once; the map
// switch leads to Neu-Frankfurt (?map=frankfurt), on which most cases run, and back. No request
// leaves the page's own server, and no console error appears.
//   boot      Köln, with no map in the address: scores in the run switch, the comparison (the
//             leaderboard's −37,374 among them), the score chart and the KPI tiles; no external
//             request
//   playback  Play, Pause, speed, step buttons, the timeline, the end of a run
//   runs      switching runs, their final figures against the leaderboard, the address that
//             remembers the map, the run and the step
//   panel     the tabs by keyboard, the trains table, a train's timetable, the events and a jump
//             to one, the method
//   map       views, the legend strip, a train picked on the map
//   grid      the grid of cells under the map, on both maps: one line per cell edge, under the
//             network, its cells on the drawing's cells in both views, faint in both themes; the
//             Grid switch hides and shows it, and the browser remembers the choice
//   guide     opens on a first visit; its seven chapters by Next, Back and the chapter list; the
//             drawings, the penalties and the three results (the two runs with the Python runner's
//             scores, and the leaderboard's figure); a run's Watch button plays that run with its
//             story beside it
//   story     the Story tab first; a run's moments jump to their step, the map's situation line
//             (gridlock, waiting trains, all arrived), the way on to the next run
//   once      the theme toggle and the speed buttons act once per click (vici.js acts on some
//             controls by itself), the guide closes with Escape, is remembered and reopens
//   glide     trains move at their own speed (js/glide.js): an S-Bahn at half a cell per step moves
//             evenly at every quarter step and in every frame while the run plays; a standing
//             train stays at the centre of its cell
//   motion    with reduced motion the trains jump from cell to cell (no animation between steps)
//   failure   a missing data file ends on the boot screen with the reason; a score the Python
//             runner did not compute raises a banner and loses its "same score" note
//   maps      the map switch: Köln first, Neu-Frankfurt from the header and back, the address of
//             each (no map for Köln, map=frankfurt for Neu-Frankfurt); both maps' runs and scores
//             against the Python runner's and the leaderboard's figure on both; Köln's tiles,
//             views, guide and story; links to a map, a run and a step, and the older ?map=koeln;
//             an unknown map or a run the map does not have falls back
// Usage: node tests/smoke.mjs [case ...]
import { APP_ROOT, SKIP_INTRO, launchBrowser, serveStatic, wanted, NETWORK_NOISE } from "./lib/harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { traceFacts } from "./lib/trace-facts.mjs";
import { fixturePath, referencePath } from "./lib/maps.mjs";

const json = (rel) => JSON.parse(readFileSync(path.join(APP_ROOT, rel), "utf8"));
// The Python runner's scores: Köln's, the page's default map, and Neu-Frankfurt's (?map=frankfurt).
const kReference = json(referencePath("koeln"));
const reference = json(referencePath("frankfurt"));
// The leaderboard's current best as the brief gives it (js/maps.js), on both maps.
const LEADERBOARD = -37374;
const results = [];
const check = (ok, what) => { results.push([ok, what]); if (!ok) console.log(`FAIL  ${what}`); };
// a score to one decimal, halves away from zero, as the page and Python's reports round it
const fmt = (v) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v).replace("-", "−");
// a difference as the KPI tile shows it: +36,360.0, −28,838.5
const signedFmt = (v) => `${v > 0 ? "+" : ""}${fmt(v)}`;

const browser = await launchBrowser();
const server = await serveStatic(APP_ROOT, 8765);

async function open({ intro = false, url = "", viewport = { width: 1600, height: 900 }, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const external = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => { external.push(route.request().url()); route.abort("blockedbyclient"); });
  if (!intro) await context.addInitScript(SKIP_INTRO);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => { if (m.type() === "error" && !NETWORK_NOISE.test(m.text())) errors.push(m.text()); });
  await page.goto(server.base + url);
  return { context, page, errors, external };
}

const ready = (page) => page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
const stepOnScreen = (page) => page.evaluate(() => Math.floor(window.dispatchLab.state.t));
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());

/**
 * The grid under the map as the page draws it: its lines and canvas, whether it shows, its place
 * under the network, how far its cell corners land from the drawing's (screen pixels), and its
 * line and canvas colours as the browser resolves them (sRGB bytes).
 */
const gridFacts = (page) => page.evaluate(() => {
  const root = document.querySelector("#map");
  const layer = root.querySelector(".map-grid");
  const view = root.querySelector(".map-svg");
  const lines = layer.querySelector(".grid-lines");
  const canvas = layer.querySelector(".grid-canvas");
  const d = lines.getAttribute("d");
  const rgb = (css) => {
    const c = document.createElement("canvas").getContext("2d");
    c.fillStyle = css;
    c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const shown = getComputedStyle(layer).display !== "none" && getComputedStyle(layer).visibility === "visible";
  const a = view.getScreenCTM();
  const b = shown ? layer.getScreenCTM() : null;
  let apart = null;
  if (a && b) {
    apart = 0;
    const { W, H } = { W: +canvas.getAttribute("width"), H: +canvas.getAttribute("height") };
    for (const [x, y] of [[0, 0], [W, H], [Math.round(W / 3), Math.round(H / 2)], [Math.round(W * 0.7), Math.round(H * 0.3)]]) {
      const p = new DOMPoint(x, y).matrixTransform(a);
      const q = new DOMPoint(x, y).matrixTransform(b);
      apart = Math.max(apart, Math.hypot(p.x - q.x, p.y - q.y));
    }
  }
  const button = root.querySelector(".grid-button");
  return {
    state: root.dataset.grid, shown, pressed: button?.getAttribute("aria-pressed"), label: button?.textContent,
    down: (d.match(/V/g) || []).length, across: (d.match(/H/g) || []).length,
    canvas: ["x", "y", "width", "height"].map((k) => +canvas.getAttribute(k)),
    under: !!(layer.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING) && getComputedStyle(layer).zIndex === "auto" && getComputedStyle(layer).pointerEvents === "none",
    apart, line: rgb(getComputedStyle(lines).stroke), ground: rgb(getComputedStyle(canvas).fill),
    stored: localStorage.getItem("dl.grid"), theme: document.documentElement.dataset.theme
  };
});
// OKLab lightness of sRGB bytes (Björn Ottosson's OKLab, as CSS Color 4 uses it).
const oklabL = ([r, g, b]) => {
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
};

try {
  if (wanted("boot")) {
    // The page's own address, with no map in it: Köln.
    const { context, page, errors, external } = await open();
    await ready(page);
    const lab = await page.evaluate(() => ({ map: window.dispatchLab.map, runs: Object.fromEntries([...window.dispatchLab.runs].map(([id, r]) => [id, { score: r.score, steps: r.steps }])) }));
    check(lab.map === "koeln" && JSON.stringify(Object.keys(lab.runs)) === JSON.stringify(["baseline", "optimized"]) && (await text(page, "#brand-sub")).endsWith("Köln, 36 trains"),
      `boot: with no map in the address the page opens on Köln, with its two runs (${lab.map}: ${Object.keys(lab.runs).join(", ")})`);
    check(await page.getAttribute("#tab-story", "aria-selected") === "true", "boot: the panel opens on the Story tab");
    await page.click("#tab-score");
    for (const id of ["baseline", "optimized"]) {
      const ref = kReference.runs[id];
      check(lab.runs[id].score === ref.reward && lab.runs[id].steps === ref.steps,
        `boot: the browser's ${id} run scores ${lab.runs[id].score} in ${lab.runs[id].steps} steps; the Python runner ${ref.reward} in ${ref.steps}`);
      const shown = await text(page, `.run-switch button[data-run="${id}"] .run-score`);
      check(shown === fmt(ref.reward), `boot: the run switch shows ${id} as ${shown}`);
      const value = await text(page, `.compare-row[data-run="${id}"] .compare-value`);
      check(value === fmt(ref.reward), `boot: the comparison shows ${id} as ${value}`);
    }
    const rows = await page.$$eval(".compare-row", (l) => l.map((r) => r.dataset.run));
    check(JSON.stringify(rows) === JSON.stringify(["baseline", "leaderboard", "optimized"]) && await text(page, '.compare-row[data-run="leaderboard"] .compare-value') === "−37,374" && await text(page, ".compare .vc-chart__title") === "Three scores side by side",
      `boot: the comparison shows the leaderboard's −37,374 after the baseline (${rows.join(", ")})`);
    check(await text(page, '.compare-row[data-run="leaderboard"] .compare-note') === "the leaderboard's figure; not simulated here", "boot: the leaderboard's figure is marked as not simulated");
    const chart = await page.evaluate(() => ({ line: !!document.querySelector(".score-chart .chart-ref"), label: document.querySelector(".score-chart .chart-ref-label")?.textContent, legend: [...document.querySelectorAll(".score-chart .vc-legend li")].map((li) => li.textContent) }));
    check(chart.line && chart.label === "Current best −37,374" && chart.legend.includes("Current best on the leaderboard"), `boot: the score chart draws the leaderboard's figure as a dashed line, in its legend too (${chart.label}; ${chart.legend.join(", ")})`);
    check((await page.$$(".compare-note.verified")).length === 2, "boot: both runs carry 'same score as the Python runner'");
    check((await text(page, "#map-run")).startsWith("Optimized"), "boot: the optimized run is on screen first");
    const gap = kReference.runs.optimized.reward - LEADERBOARD;
    check(await text(page, ".kpi:has(#kpi-best-value) .kpi-label") === "Final vs. the best" && await text(page, "#kpi-best-value") === signedFmt(gap) && await text(page, "#kpi-best-sub") === `${fmt(kReference.runs.optimized.reward)} vs −37,374`,
      `boot: the KPI tile measures Köln's optimized run against the leaderboard's −37,374 (${await text(page, "#kpi-best-value")}, ${await text(page, "#kpi-best-sub")})`);
    const gone = await page.waitForSelector("#boot", { state: "detached", timeout: 3000 }).then(() => true, () => false);
    check(gone, "boot: the boot screen is gone");
    check(!errors.length, `boot: no console errors (${errors.join(" | ")})`);
    check(!external.length, `boot: no request left the site (${external.join(", ")})`);
    await context.close();
  }

  if (wanted("playback")) {
    const { context, page, errors } = await open({ url: "?map=frankfurt" });
    await ready(page);
    await page.click('.speed button:has-text("×16")');
    check(await page.getAttribute('.speed button:has-text("×16")', "aria-pressed") === "true", "playback: ×16 is pressed");
    await page.click("#btn-play");
    await page.waitForTimeout(1500);
    const playing = await text(page, ".status-pill .text");
    const mid = await stepOnScreen(page);
    check(playing === "Playing" && mid > 20, `playback: Play runs the episode (status ${playing}, step ${mid} after 1.5 s at ×16)`);
    const label = await text(page, "#step-label");
    check(/^Step [\d,]+ of 597$/.test(label), `playback: the step label follows (${label})`);
    // Playback started inside a frame whose time stamp lies before the click (the browser stamps a
    // frame before it handles input): time must not run backwards past the first step.
    await page.click("#btn-play");
    const early = await page.evaluate(() => new Promise((resolve) => {
      const lab = window.dispatchLab;
      lab.pause();
      lab.seek(0);
      const real = performance.now.bind(performance);
      performance.now = () => real() + 80;
      lab.play();
      performance.now = real;
      // Watch every frame for 250 ms: the lowest step on screen and any train drawn at NaN.
      let low = Infinity;
      let bad = 0;
      const until = real() + 250;
      const watch = () => {
        low = Math.min(low, lab.state.t);
        bad += [...document.querySelectorAll(".train")].filter((g) => /NaN/.test(g.getAttribute("transform") || "")).length;
        if (real() < until) requestAnimationFrame(watch);
        else { lab.pause(); resolve({ low, bad, t: lab.state.t }); }
      };
      requestAnimationFrame(watch);
    }));
    check(early.low >= 0 && early.bad === 0 && early.t > 0, `playback: a frame stamped before the click does not run time backwards (lowest step ${early.low.toFixed(3)}, ${early.bad} trains drawn at NaN, then step ${early.t.toFixed(1)})`);
    await page.click("#btn-play");
    await page.waitForTimeout(300);
    // A button whose content is replaced on every frame loses clicks (mousedown and mouseup land on
    // different nodes), so Pause must keep its nodes while the run plays.
    const kept = await page.evaluate(() => new Promise((resolve) => {
      const button = document.querySelector("#btn-play");
      const before = button.firstElementChild;
      setTimeout(() => resolve(before.isConnected && button.firstElementChild === before), 400);
    }));
    check(kept, "playback: the Pause button keeps its content while the run plays (no lost clicks)");
    await page.click("#btn-play");
    const paused = await stepOnScreen(page);
    await page.waitForTimeout(500);
    check(await text(page, ".status-pill .text") === "Paused" && await stepOnScreen(page) === paused, "playback: Pause holds the step");
    await page.click("#btn-forward");
    check(await stepOnScreen(page) === paused + 1, "playback: one step on");
    await page.click("#btn-back");
    await page.click("#btn-back");
    check(await stepOnScreen(page) === paused - 1, "playback: one step back, twice");
    await page.click("#btn-end");
    check(await stepOnScreen(page) === 597, "playback: to the last step (597 for the optimized run)");
    check(await text(page, "#kpi-trains-value") === "19 / 19" && await page.getAttribute(".kpi:has(#kpi-trains-value)", "data-tone") === "resolved", "playback: at the end all 19 trains arrived (success tone)");
    check(await text(page, "#kpi-stops-value") === "59 / 59", "playback: at the end all 59 stops were served with a stop");
    check(await text(page, "#kpi-score-value") === "−1,014.0", `playback: the score tile ends at −1,014.0 (${await text(page, "#kpi-score-value")})`);
    check(await text(page, ".status-pill .text") === "Finished", "playback: the status says Finished");
    await page.click("#btn-start");
    check(await stepOnScreen(page) === 0, "playback: back to the first step");
    // the timeline
    await page.$eval("#timeline", (el) => { el.value = "300"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    check(await stepOnScreen(page) === 300, "playback: the timeline moves to step 300");
    // Play from the end starts again from the first step.
    await page.click("#btn-end");
    await page.click("#btn-play");
    await page.waitForTimeout(300);
    const restarted = await stepOnScreen(page);
    check(restarted < 100, `playback: Play at the end replays from the start (step ${restarted})`);
    await page.click("#btn-play");
    check(!errors.length, `playback: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("runs")) {
    const { context, page, errors } = await open({ url: "?map=frankfurt&run=baseline&step=900" });
    await ready(page);
    check(await page.evaluate(() => window.dispatchLab.map) === "frankfurt" && (await text(page, "#map-run")).startsWith("Baseline") && await stepOnScreen(page) === 900, "runs: the address opens Neu-Frankfurt's baseline at step 900");
    await page.click("#btn-end");
    check(await text(page, "#kpi-score-value") === "−74,022.6", "runs: the baseline ends at −74,022.6");
    check(await text(page, "#kpi-trains-value") === "7 / 19", `runs: 7 baseline trains arrive (${await text(page, "#kpi-trains-value")})`);
    await page.click('.run-switch button[data-run="optimized"]');
    check(await page.getAttribute('.run-switch button[data-run="optimized"]', "aria-pressed") === "true" && (await text(page, "#map-run")).startsWith("Optimized"), "runs: Optimized is on screen");
    await page.click("#btn-end");
    const opt = reference.runs.optimized.reward;
    const gap = opt - LEADERBOARD;
    check(await text(page, "#kpi-score-value") === fmt(opt), `runs: the optimized run ends at ${fmt(opt)} (${await text(page, "#kpi-score-value")})`);
    check(await text(page, "#kpi-best-value") === signedFmt(gap) && await page.getAttribute(".kpi:has(#kpi-best-value)", "data-tone") === "resolved", `runs: the optimized run's gap to the leaderboard is ${signedFmt(gap)}, in the success tone (${await text(page, "#kpi-best-value")})`);
    check(await text(page, "#kpi-trains-value") === "19 / 19" && await stepOnScreen(page) === reference.runs.optimized.steps, `runs: in the optimized run every train arrives, by step ${reference.runs.optimized.steps} (${await text(page, "#kpi-trains-value")})`);
    await page.waitForTimeout(600);
    const remembered = new URL(page.url()).searchParams;
    check(remembered.get("map") === "frankfurt" && remembered.get("run") === "optimized" && remembered.get("step") === String(reference.runs.optimized.steps), `runs: the address remembers the map, the run and the step (${new URL(page.url()).search})`);
    check(!errors.length, `runs: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("panel")) {
    const { context, page, errors } = await open({ url: "?map=frankfurt&run=baseline&step=700" });
    await ready(page);
    // The tabs by keyboard (Vici's tabs: the arrow keys move between them).
    await page.focus("#tab-score");
    await page.keyboard.press("ArrowRight");
    const keyed = await page.evaluate(() => [document.activeElement?.id, document.querySelector("#tab-trains").getAttribute("aria-selected"), document.querySelector("#panel-trains")?.hidden]);
    check(keyed[0] === "tab-trains" && keyed[1] === "true" && keyed[2] === false, `panel: the arrow key moves to the Trains tab and shows it (${keyed.join(", ")})`);
    await page.keyboard.press("ArrowLeft");
    check(await page.getAttribute("#tab-score", "aria-selected") === "true", "panel: and back to Score");
    await page.click("#tab-trains");
    check((await page.$$("table.trains tbody tr")).length === 19, "panel: the trains table lists 19 trains");
    await page.click('tr[data-train="11"] .train-pick');
    check(await page.isVisible(".train-detail") && (await text(page, ".train-detail h3")) === "RB FF Of 1", "panel: picking train 11 opens its timetable");
    check((await page.$$(".timetable tbody tr")).length === 4, "panel: the timetable has its origin, two stops and its destination");
    check(await page.getAttribute('.train[data-train="11"]', "data-selected") === "true", "panel: the map rings the picked train");
    await page.click(".train-close");
    check(!(await page.isVisible(".train-detail")), "panel: the timetable closes");
    await page.click("#tab-events");
    const items = await page.$$(".events-list .event");
    check(items.length > 10, `panel: events up to the step on screen (${items.length})`);
    const first = await page.$eval(".events-list .event .event-step", (el) => Number(el.textContent.replace(/,/g, "")));
    await page.click(".events-list .event >> nth=3");
    const jumped = await stepOnScreen(page);
    check(jumped <= first && jumped > 0, `panel: an event jumps to its step (${jumped})`);
    await page.click("#tab-method");
    check((await text(page, "#panel-method")).includes("The scores match to the last digit"), "panel: the method explains the check");
    check((await page.$$(".method-symbols > li")).length === 10, "panel: the method explains the map's ten symbols, its grid cells among them");
    await page.click("#tab-score");
    check((await page.$$(".kinds tbody tr")).length === 8, "panel: the breakdown lists eight penalty kinds");
    check(!errors.length, `panel: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("map")) {
    const { context, page, errors } = await open({ url: "?map=frankfurt&run=optimized&step=250" });
    await ready(page);
    const before = await page.getAttribute(".map-svg", "viewBox");
    await page.click('.map-views button:has-text("Around the Hbf")');
    const after = await page.getAttribute(".map-svg", "viewBox");
    check(before !== after && await page.getAttribute('.map-views button:has-text("Around the Hbf")', "aria-pressed") === "true", "map: the Hbf view zooms in");
    await page.click('.map-views button:has-text("Whole network")');
    check(await page.getAttribute(".map-svg", "viewBox") === before, "map: back to the whole network");
    const legend = await page.evaluate(() => {
      const strip = document.querySelector(".map-legend").getBoundingClientRect();
      const area = document.querySelector(".map-svg").getBoundingClientRect();
      return { items: document.querySelectorAll(".map-legend .legend-item").length, swatches: document.querySelectorAll(".map-legend .legend-swatch").length, gap: strip.top - area.bottom };
    });
    check(legend.items === 7 && legend.swatches === 5, `map: the legend strip names the five train states and two track symbols (${legend.items} items)`);
    check(legend.gap >= 0, `map: the legend strip lies below the drawing, never over it (${legend.gap.toFixed(1)} px apart)`);
    const shown = await page.$$eval(".train", (els) => els.filter((e) => e.style.display !== "none").length);
    check(shown === 18, `map: 18 trains on the map at step 250 of the optimized run (${shown})`);
    const box = await page.$eval('.train:not([style*="none"])', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: el.dataset.train }; });
    await page.mouse.click(box.x, box.y);
    check(await page.getAttribute(`.train[data-train="${box.id}"]`, "data-selected") === "true" && await page.isVisible(".train-detail"), `map: a click on train ${box.id} picks it`);
    check(!errors.length, `map: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("grid")) {
    const before = results.length;
    const { context, page, errors } = await open({ url: "?map=frankfurt&run=optimized&step=250" });
    await ready(page);
    const size = () => page.evaluate(() => ({ W: window.dispatchLab.scenario.rail.width, H: window.dispatchLab.scenario.rail.height }));
    const f = await size();
    let g = await gridFacts(page);
    check(g.state === "on" && g.shown && g.pressed === "true" && g.label === "Grid" && g.stored === null, `grid: on a first visit the grid shows and Grid is pressed (${g.state}, pressed ${g.pressed})`);
    check(g.down === f.W + 1 && g.across === f.H + 1 && g.canvas.join(",") === `0,0,${f.W},${f.H}`, `grid: Neu-Frankfurt's ${f.W} × ${f.H} cells, a line along every cell edge (${g.down} down, ${g.across} across) on a canvas the grid's size (${g.canvas.join(", ")})`);
    check(g.under, "grid: it lies under the network and lets every click through");
    check(g.apart !== null && g.apart < 0.05, `grid: its cells sit on the drawing's cells in the whole network (${g.apart?.toFixed(3)} px apart at most)`);
    await page.click('.map-views button:has-text("Around the Hbf")');
    g = await gridFacts(page);
    check(g.apart !== null && g.apart < 0.05, `grid: and around the Hbf (${g.apart?.toFixed(3)} px)`);
    // Faint in both themes: a small step in lightness from the canvas, about the same in each.
    const light = oklabL(g.line) - oklabL(g.ground);
    await page.click(".theme-toggle");
    g = await gridFacts(page);
    const dark = oklabL(g.line) - oklabL(g.ground);
    const faint = (v) => Math.abs(v) >= 0.03 && Math.abs(v) <= 0.08;
    check(g.theme === "dark" && faint(light) && faint(dark), `grid: its lines stay faint in both themes, a lightness step of ${light.toFixed(3)} from the canvas in the light theme and ${dark.toFixed(3)} in the dark one (OKLab; 0.03 to 0.08 wanted)`);
    await page.click(".theme-toggle");
    // The switch: off, remembered, and on again.
    await page.click(".grid-button");
    g = await gridFacts(page);
    check(g.state === "off" && !g.shown && g.pressed === "false" && g.stored === "off", `grid: Grid hides it and is no longer pressed (${g.state}, pressed ${g.pressed}, stored ${g.stored})`);
    await page.reload();
    await ready(page);
    g = await gridFacts(page);
    check(g.state === "off" && !g.shown && g.pressed === "false", "grid: the browser remembers it off on the next visit");
    // Köln, from the header: the choice carries over, then Köln's own grid.
    await Promise.all([page.waitForNavigation(), page.click('#map-switch button[data-map="koeln"]')]);
    await ready(page);
    g = await gridFacts(page);
    check(g.state === "off" && !g.shown && g.pressed === "false", "grid: off on Köln too");
    await page.click(".grid-button");
    g = await gridFacts(page);
    check(g.state === "on" && g.shown && g.pressed === "true" && g.stored === null, `grid: Grid shows it again and forgets the choice (${g.state}, stored ${g.stored})`);
    const k = await size();
    check(g.down === k.W + 1 && g.across === k.H + 1 && g.canvas.join(",") === `0,0,${k.W},${k.H}`, `grid: Köln's ${k.W} × ${k.H} cells, a line along every cell edge (${g.down} down, ${g.across} across)`);
    check(g.apart !== null && g.apart < 0.05, `grid: Köln's cells sit on the drawing's cells in the whole network (${g.apart?.toFixed(3)} px)`);
    await page.click('.map-views button:has-text("Around Stop 14")');
    g = await gridFacts(page);
    check(g.apart !== null && g.apart < 0.05, `grid: and around Stop 14 (${g.apart?.toFixed(3)} px)`);
    // A train in view, on top at its centre, still takes a click with the grid under it.
    await page.click('.run-switch button[data-run="baseline"]');
    await page.evaluate(() => window.dispatchLab.seek(150));
    const train = await page.evaluate(() => {
      for (const el of document.querySelectorAll('.train:not([style*="none"])')) {
        const r = el.getBoundingClientRect();
        const [x, y] = [r.x + r.width / 2, r.y + r.height / 2];
        if (document.elementFromPoint(x, y)?.closest(".train") === el) return { x, y, id: el.dataset.train };
      }
      return null;
    });
    if (train) await page.mouse.click(train.x, train.y);
    check(train && await page.getAttribute(`.train[data-train="${train.id}"]`, "data-selected") === "true", `grid: with the grid on, a click on train ${train?.id} around Stop 14 still picks it`);
    check(!errors.length, `grid: no console errors (${errors.join(" | ")})`);
    await context.close();
    if (results.slice(before).every(([ok]) => ok)) console.log("GRID_OK maps=frankfurt,koeln");
  }

  if (wanted("once")) {
    const { context, page, errors } = await open({ intro: true });
    await ready(page);
    await page.waitForSelector(".guide-modal", { timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".guide-modal", { state: "detached", timeout: 5000 });
    check(await page.evaluate(() => localStorage.getItem("dl.guideSeen")) === "1", "once: closing the guide remembers it");
    await page.reload();
    await ready(page);
    await page.waitForTimeout(300);
    check(!(await page.isVisible(".guide-modal")), "once: on the next visit the guide stays closed");
    await page.click("#btn-about");
    check(await page.isVisible(".guide-modal"), "once: How it works reopens it");
    await page.click('.guide-nav-btn[data-chapter="results"]');
    await page.click('.guide-watch[data-run="optimized"]');
    await page.waitForTimeout(400);
    check(await text(page, ".status-pill .text") === "Playing" && (await text(page, "#map-run")).startsWith("Optimized") && await page.getAttribute("#tab-story", "aria-selected") === "true", "once: the guide's Watch button plays the optimized run, with its story");
    await page.click("#btn-play");
    const theme0 = await page.getAttribute("html", "data-theme");
    await page.click(".theme-toggle");
    const theme1 = await page.getAttribute("html", "data-theme");
    await page.click(".theme-toggle");
    const theme2 = await page.getAttribute("html", "data-theme");
    check(theme0 === "light" && theme1 === "dark" && theme2 === "light", `once: the theme toggle flips once per click (${theme0} → ${theme1} → ${theme2})`);
    const pressed = () => page.$$eval(".speed button", (bs) => bs.map((b) => b.getAttribute("aria-pressed")).join(","));
    await page.click('.speed button:has-text("×1")');
    const speed1 = await pressed();
    await page.click('.speed button:has-text("×16")');
    const speed16 = await pressed();
    check(speed1 === "true,false,false" && speed16 === "false,false,true", `once: the speed buttons keep one pressed per click (${speed1} → ${speed16})`);
    check(!errors.length, `once: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("guide")) {
    const { context, page, errors } = await open({ intro: true, url: "?map=frankfurt" });
    await ready(page);
    await page.waitForSelector(".guide-modal", { timeout: 5000 });
    check(await page.isVisible(".guide-modal"), "guide: it opens by itself on a first visit");
    const chaptersCount = await page.$$eval(".guide-nav-btn", (bs) => bs.length);
    check(chaptersCount === 7, `guide: seven chapters (${chaptersCount})`);
    const chapter = () => page.getAttribute(".guide-chapter", "data-chapter");
    check(await chapter() === "challenge" && (await text(page, ".guide-title")).includes("19 trains"), "guide: it starts with the challenge, 19 trains");
    const labels = await page.$$eval(".diagram-network .station-label", (els) => els.map((e) => e.textContent));
    check(labels.includes("Hbf") && labels.length >= 8, `guide: chapter 1 draws the real network with its stations (${labels.join(", ")})`);
    check(await page.evaluate(() => document.activeElement?.classList.contains("guide-next")), "guide: the focus starts on Next");
    await page.click(".guide-next");
    check(await chapter() === "network" && await page.isVisible(".diagram-pieces"), "guide: Next opens chapter 2 with the pieces of a railway");
    check(await page.evaluate(() => document.activeElement?.id === "guide-title"), "guide: the focus moves to the new chapter's heading");
    await page.click(".guide-back");
    check(await chapter() === "challenge" && await page.isDisabled(".guide-back"), "guide: Back returns to chapter 1, where Back is off");
    await page.click('.guide-nav-btn[data-chapter="timetable"]');
    const rows = await page.$$eval(".guide-timetable tbody tr", (r) => r.length);
    check(await chapter() === "timetable" && rows === 3, `guide: the chapter list opens chapter 3, with an example timetable (${rows} rows)`);
    await page.click('.guide-nav-btn[data-chapter="decisions"]');
    const scenes = await page.$$eval(".guide-scenes > li", (l) => l.map((x) => x.dataset.scene).join(","));
    const commands = await page.$$eval(".guide-commands > li", (l) => l.length);
    check(scenes === "free,taken,deadlock" && commands === 5, `guide: chapter 4 shows the five commands and three scenes (${commands}; ${scenes})`);
    await page.click('.guide-nav-btn[data-chapter="score"]');
    const penalties = await page.$$eval(".guide-penalties tbody tr", (r) => r.length);
    check(penalties === 7 && (await text(page, ".guide-penalties")).includes("936 × speed"), `guide: chapter 5 lists the seven penalties (${penalties})`);
    await page.click('.guide-nav-btn[data-chapter="results"]');
    const cards = await page.$$eval(".guide-result", (l) => l.map((x) => [x.dataset.run, x.querySelector(".guide-result-score").textContent]));
    const want = [["baseline", fmt(reference.runs.baseline.reward)], ["best", "−37,374"], ["optimized", fmt(reference.runs.optimized.reward)]];
    check(JSON.stringify(cards) === JSON.stringify(want) && await text(page, '.guide-nav-btn[data-chapter="results"] .vc-step__label') === "Three results",
      `guide: chapter 6 puts the three results, the two runs with the Python runner's scores and the leaderboard's figure (${cards.map((c) => c.join(" ")).join(", ")})`);
    check(!(await page.$('.guide-result[data-run="best"] .guide-watch')) && (await page.$$(".guide-watch")).length === 2, "guide: each run has its Watch button, the leaderboard's figure none");
    await page.click('.guide-nav-btn[data-chapter="page"]');
    check((await text(page, ".guide-next")).includes("Watch the baseline"), "guide: the last chapter offers to watch the baseline");
    await page.click(".guide-next");
    await page.waitForSelector(".guide-modal", { state: "detached", timeout: 5000 });
    await page.waitForTimeout(400);
    check((await text(page, "#map-run")).startsWith("Baseline") && await text(page, ".status-pill .text") === "Playing" && await page.getAttribute("#tab-story", "aria-selected") === "true", "guide: Watch the baseline closes the guide and plays the baseline, its story beside it");
    await page.click("#btn-play");
    check(!errors.length, `guide: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("story")) {
    const { context, page, errors } = await open({ url: "?map=frankfurt&run=baseline&step=0" });
    await ready(page);
    const base = traceFacts("baseline");
    check(await page.getAttribute("#tab-story", "aria-selected") === "true", "story: the Story tab comes first");
    const kinds = await page.$$eval(".story-moments .moment", (l) => l.map((m) => m.dataset.kind));
    check(kinds.includes("collision") && kinds.includes("gridlock") && kinds[kinds.length - 1] === "end", `story: the baseline's moments run from the first train to the end (${kinds.join(", ")})`);
    await page.click('.moment[data-kind="gridlock"]');
    check(await stepOnScreen(page) === base.gridlockFrom, `story: the gridlock moment jumps to step ${base.gridlockFrom} (${await stepOnScreen(page)})`);
    const line = await text(page, "#map-situation .sit-long");
    check(line.startsWith(`Gridlock since step ${base.gridlockFrom}`) && await page.getAttribute("#map-situation", "data-tone") === "danger", `story: the map says so (${line})`);
    check(await page.getAttribute('.moment[data-kind="gridlock"]', "data-state") === "current", "story: the moment on screen is marked");
    await page.evaluate((s) => window.dispatchLab.seek(s), base.gridlockFrom - 30);
    check(!(await text(page, "#map-situation .sit-long")).startsWith("Gridlock"), "story: before the gridlock, the map does not say gridlock");
    const toNext = await text(page, ".story-next");
    await page.click(".story-next");
    check(toNext === "Next: how the optimized run serves every stop" && (await text(page, "#map-run")).startsWith("Optimized"), `story: the next button moves on to the optimized run (${toNext})`);
    const opt = traceFacts("optimized");
    const wait = await text(page, '.moment[data-kind="wait"]');
    check(wait.includes(`${opt.longestWait.wait} steps`), `story: the optimized run's longest wait at an entry, ${opt.longestWait.wait} steps (${wait.slice(0, 90)})`);
    await page.evaluate(() => window.dispatchLab.seek(100));
    check(/trains? waits? at (its|their) entry$/.test(await text(page, "#map-situation .sit-long")), `story: at step 100 the map says trains wait at their entry (${await text(page, "#map-situation .sit-long")})`);
    const entered = await page.$eval('.moment[data-kind="enter"]', (b) => b.textContent);
    await page.click('.moment[data-kind="enter"]');
    const ringed = await page.$$eval('.train[data-selected="true"]', (l) => l.map((g) => g.dataset.train));
    check(await page.getAttribute("#tab-story", "aria-selected") === "true" && ringed.length === 1 && await stepOnScreen(page) === Number(entered.match(/Step ([\d,]+)/)[1].replace(/,/g, "")),
      `story: a moment with a train jumps to its step and rings the train on the map, and the story stays (train ${ringed.join(", ")})`);
    await page.click('.moment[data-kind="all-arrived"]');
    check(await text(page, "#map-situation .sit-long") === "All 19 trains have arrived" && await page.getAttribute("#map-situation", "data-tone") === "success", "story: in the optimized run the map says when all trains have arrived");
    const toScores = await text(page, ".story-next");
    await page.click(".story-next");
    check(toScores === "Compare all three scores" && await page.getAttribute("#tab-score", "aria-selected") === "true", `story: after the optimized run, the next button compares all three scores, the leaderboard's among them (${toScores})`);
    check(!errors.length, `story: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("glide")) {
    // Neu-Frankfurt's optimized run: S-Bahn 17 runs at half a cell per step. On a straight stretch
    // where it runs on at that speed, without braking or halting, it must move an eighth of a cell
    // every quarter step, and while the run plays at ×1 it must move in every frame (drawn from cell
    // to cell it held still every other step).
    const { context, page, errors } = await open({ url: "?map=frankfurt&run=optimized" });
    await ready(page);
    const sb = await page.evaluate(() => {
      const at = (i) => { const m = document.querySelector(`.train[data-train="${i}"]`).getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/); return [Number(m[1]), Number(m[2])]; };
      const lab = window.dispatchLab;
      const run = lab.runs.get("optimized");
      const { n, pos, state, speed } = run.frames;
      const W = lab.scenario.rail.width;
      // the first step from which train 17 moves on at half a cell per step (state 3, moving) from
      // the step before for 14 steps, and its next six cells lie in one row or one column
      let from = -1;
      for (let t = 2; t + 13 <= run.steps && from < 0; t += 1) {
        const steady = Array.from({ length: 14 }, (_, k) => t - 1 + k).every((u) => pos[u * n + 17] >= 0 && state[u * n + 17] === 3 && speed[u * n + 17] === 0.5);
        if (!steady) continue;
        const cells = [0, 1, 2, 3, 4, 5, 6].map((k) => pos[(t + k) * n + 17]);
        if (cells.every((c) => Math.floor(c / W) === Math.floor(cells[0] / W)) || cells.every((c) => c % W === cells[0] % W)) from = t;
      }
      const pts = [];
      for (let k = 0; k <= 16; k += 1) { lab.seek(from + k / 4); pts.push(at(17)); }
      return { from, moves: pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1])) };
    });
    check(sb.from > 0 && sb.moves.length === 16 && sb.moves.every((d) => Math.abs(d - 0.125) < 0.002), `glide: S-Bahn 17 moves an eighth of a cell every quarter step from step ${sb.from} on (${sb.moves.map((d) => d.toFixed(3)).join(" ")})`);
    await page.click('.speed button:text-is("×1")');
    const played = await page.evaluate((from) => new Promise((resolve) => {
      const at = (i) => { const m = document.querySelector(`.train[data-train="${i}"]`).getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/); return [Number(m[1]), Number(m[2])]; };
      const lab = window.dispatchLab;
      lab.seek(from);
      lab.play();
      const seen = [];
      const until = performance.now() + 1200;
      const tick = () => {
        seen.push({ t: lab.state.t, p: at(17) });
        if (performance.now() < until) requestAnimationFrame(tick);
        else { lab.pause(); resolve(seen); }
      };
      requestAnimationFrame(tick);
    }), sb.from);
    let advanced = 0;
    let held = 0;
    for (let k = 1; k < played.length; k += 1) {
      if (played[k].t <= played[k - 1].t) continue;
      advanced += 1;
      if (played[k].p[0] === played[k - 1].p[0] && played[k].p[1] === played[k - 1].p[1]) held += 1;
    }
    check(advanced >= 20 && held === 0, `glide: playing at ×1, S-Bahn 17 moves in every one of ${advanced} frames in which time advances (${held} held still)`);
    // A train standing for three steps stays at the centre of its cell throughout.
    const still = await page.evaluate(() => {
      const at = (i) => { const m = document.querySelector(`.train[data-train="${i}"]`).getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/); return [Number(m[1]), Number(m[2])]; };
      const lab = window.dispatchLab;
      const run = lab.runs.get("optimized");
      const { n, pos, state } = run.frames;
      const W = lab.scenario.rail.width;
      for (let t = 1; t + 2 <= run.steps; t += 1) {
        for (let i = 0; i < n; i += 1) {
          if (![0, 1, 2].every((k) => pos[(t + k) * n + i] >= 0 && state[(t + k) * n + i] === 4)) continue;
          const c = pos[t * n + i];
          const centre = [c % W + 0.5, Math.floor(c / W) + 0.5];
          const pts = [];
          for (let k = 0; k <= 8; k += 1) { lab.seek(t + k / 4); pts.push(at(i)); }
          return { train: i, step: t, centre, pts };
        }
      }
      return null;
    });
    check(still && still.pts.every((p) => Math.abs(p[0] - still.centre[0]) < 1e-6 && Math.abs(p[1] - still.centre[1]) < 1e-6), `glide: train ${still?.train}, standing from step ${still?.step} for three steps, stays at the centre of its cell (${still?.centre.join(", ")}) throughout`);
    check(!errors.length, `glide: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("motion")) {
    const { context, page, errors } = await open({ url: "?run=baseline&step=40", reducedMotion: "reduce" });
    await ready(page);
    await page.click("#btn-play");
    let fractional = false;
    for (let i = 0; i < 15; i += 1) {
      await page.waitForTimeout(70);
      const xs = await page.$$eval(".train", (els) => els.filter((e) => e.style.display !== "none").map((e) => e.getAttribute("transform")));
      for (const tr of xs) {
        const m = tr.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
        if (m && (Math.abs((Number(m[1]) - 0.5) % 1) > 0.001 || Math.abs((Number(m[2]) - 0.5) % 1) > 0.001)) fractional = true;
      }
    }
    await page.click("#btn-play");
    check(!fractional, "motion: with reduced motion the trains jump from cell to cell");
    check(!errors.length, `motion: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("failure")) {
    // On the page's default map, Köln.
    server.blockLocal.add("/data/koeln/reference.json");
    const { context, page } = await open();
    await page.waitForSelector('#boot[data-state="failed"]', { timeout: 20000 });
    const detail = await text(page, "#boot-detail");
    check(/koeln\/reference\.json: HTTP 404/.test(detail) && await page.isVisible(".boot-help"), `failure: a missing data file ends on the boot screen with the reason (${detail})`);
    server.blockLocal.delete("/data/koeln/reference.json");
    await context.close();
    // A Python score the engine does not reproduce: the page says so instead of claiming a match.
    const wrong = await open();
    const altered = JSON.parse(JSON.stringify(kReference));
    altered.runs.baseline.reward += 1;
    await wrong.context.route(/\/data\/koeln\/reference\.json$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(altered) }));
    await wrong.page.reload();
    await ready(wrong.page);
    await wrong.page.click("#tab-score");
    const banner = await wrong.page.isVisible(".banner");
    const bannerText = banner ? await text(wrong.page, ".banner") : "";
    const notes = await wrong.page.$$eval(".compare-note.verified", (els) => els.map((e) => e.closest(".compare-row")?.dataset.run));
    check(banner && /differs from the Python runner/.test(bannerText), `failure: a score that differs from the Python runner's raises a banner (${bannerText.slice(0, 60)})`);
    check(notes.length === 1 && notes[0] === "optimized", `failure: the baseline then loses "same score as the Python runner", the optimized run keeps it (${notes.join(", ")})`);
    await wrong.context.close();
  }
  if (wanted("maps")) {
    const kRules = json(fixturePath("koeln", "rules.json"));
    const before = results.length;
    const lab = (page) => page.evaluate(() => ({ map: window.dispatchLab.map, runs: Object.fromEntries([...window.dispatchLab.runs].map(([id, r]) => [id, { score: r.score, steps: r.steps }])) }));
    const switchButtons = (page) => page.$$eval("#map-switch button", (bs) => bs.map((b) => [b.dataset.map, b.textContent, b.getAttribute("aria-pressed")]));
    const compared = (page) => page.$$eval(".compare-row", (l) => l.map((r) => [r.dataset.run, r.querySelector(".compare-value").textContent]));
    // The page's own address: Köln, first in the header's switch.
    const { context, page, errors, external } = await open();
    await ready(page);
    const buttons = await switchButtons(page);
    check(JSON.stringify(buttons) === JSON.stringify([["koeln", "Köln", "true"], ["frankfurt", "Neu-Frankfurt", "false"]]), `maps: the header offers Köln first, on screen, then Neu-Frankfurt (${JSON.stringify(buttons)})`);
    const k = await lab(page);
    check(k.map === "koeln" && JSON.stringify(Object.keys(k.runs)) === JSON.stringify(["baseline", "optimized"]), `maps: Köln has its two runs, the baseline and the optimized run (${Object.keys(k.runs).join(", ")})`);
    for (const id of ["baseline", "optimized"]) {
      check(k.runs[id].score === kReference.runs[id].reward && k.runs[id].steps === kReference.runs[id].steps, `maps: Köln's ${id} scores ${k.runs[id].score} in ${k.runs[id].steps} steps in the browser; the Python runner ${kReference.runs[id].reward} in ${kReference.runs[id].steps}`);
      const shown = await text(page, `.run-switch button[data-run="${id}"] .run-score`);
      check(shown === fmt(kReference.runs[id].reward), `maps: the run switch shows Köln's ${id} as ${shown}`);
    }
    check((await text(page, "#brand-sub")).endsWith("Köln, 36 trains") && (await page.$$(".run-switch button")).length === 2, `maps: the header says Köln, and the run switch offers its two runs (${await text(page, "#brand-sub")})`);
    // The leaderboard's figure on Köln, as on Neu-Frankfurt: the tile and the comparison.
    const kGap = kReference.runs.optimized.reward - LEADERBOARD;
    check(await text(page, ".kpi:has(#kpi-best-value) .kpi-label") === "Final vs. the best" && await text(page, "#kpi-best-value") === signedFmt(kGap) && await page.getAttribute(".kpi:has(#kpi-best-value)", "data-tone") === "affected",
      `maps: Köln's tile measures the optimized run against the leaderboard's −37,374, in the danger tone (${await text(page, "#kpi-best-value")})`);
    await page.click("#tab-score");
    const rows = await compared(page);
    check(JSON.stringify(rows) === JSON.stringify([["baseline", fmt(kReference.runs.baseline.reward)], ["leaderboard", "−37,374"], ["optimized", fmt(kReference.runs.optimized.reward)]]), `maps: Köln's scores compared, the leaderboard's figure among them (${rows.map((r) => r.join(" ")).join(", ")})`);
    check((await page.$$(".compare-note.verified")).length === 2, "maps: both Köln runs carry 'same score as the Python runner'");
    const before0 = await page.getAttribute(".map-svg", "viewBox");
    await page.click('.map-views button:has-text("Around Stop 14")');
    check(await page.getAttribute(".map-svg", "viewBox") !== before0, "maps: Köln's middle view zooms in around Stop 14");
    await page.click('.map-views button:has-text("Whole network")');
    const labels = await page.$$eval(".map-labels .station-label", (l) => l.map((x) => x.textContent));
    check(["Essen", "Frankfurt"].every((n) => labels.includes(n)), `maps: Köln's map names its stations (${labels.join(", ")})`);
    await page.click("#tab-method");
    const method = await text(page, "#panel-method");
    check(method.includes("data/maps/kk_36agents.json") && method.includes(`No dispatcher can score better than −${fmt(kRules.floor.total)}`) && method.includes("The leaderboard's −37,374 is a figure from the brief, which names no map for it"),
      "maps: the method names Köln's file, the best score any dispatcher can reach there and where the leaderboard's figure comes from");
    // The guide on Köln: Köln's figures and its three results, and Watch plays the run.
    await page.click("#btn-about");
    await page.waitForSelector(".guide-modal");
    check((await text(page, ".guide-title")).includes("36 trains"), `maps: the guide on Köln starts with its 36 trains (${await text(page, ".guide-title")})`);
    await page.click('.guide-nav-btn[data-chapter="results"]');
    const cards = await page.$$eval(".guide-result", (l) => l.map((x) => [x.dataset.run, x.querySelector(".guide-result-score").textContent]));
    check(JSON.stringify(cards) === JSON.stringify([["baseline", fmt(kReference.runs.baseline.reward)], ["best", "−37,374"], ["optimized", fmt(kReference.runs.optimized.reward)]]), `maps: the guide's results on Köln are its two runs with the Python runner's scores and the leaderboard's figure (${cards.map((c) => c.join(" ")).join(", ")})`);
    await page.click('.guide-watch[data-run="baseline"]');
    await page.waitForSelector(".guide-modal", { state: "detached", timeout: 5000 });
    check((await text(page, "#map-run")).startsWith("Baseline") && await text(page, ".status-pill .text") === "Playing", "maps: Watch the gridlock plays Köln's baseline");
    await page.click("#btn-play");
    // Köln's story: a train done the moment it enters, then the gridlock.
    const kb = traceFacts("baseline", null, "koeln");
    await page.click('.moment[data-kind="at-target"]');
    check(await stepOnScreen(page) === Math.min(...kb.atTarget.map((i) => kb.arrival[i])), `maps: the story's "Done before it moves" jumps to step ${await stepOnScreen(page)}`);
    await page.click('.moment[data-kind="gridlock"]');
    check(await text(page, "#map-situation .sit-long") === `Gridlock since step ${kb.gridlockFrom}: ${kb.stuck} trains stuck for good`, `maps: on Köln the map says when it jams (${await text(page, "#map-situation .sit-long")})`);
    check(!errors.length, `maps: no console errors on Köln (${errors.join(" | ")})`);
    check(!external.length, `maps: no request left the site (${external.join(", ")})`);
    // Neu-Frankfurt from the header: map=frankfurt in the address, and the run on screen stays.
    await Promise.all([page.waitForNavigation(), page.click('#map-switch button[data-map="frankfurt"]')]);
    await ready(page);
    const there = new URL(page.url());
    check(there.searchParams.get("map") === "frankfurt" && there.searchParams.get("run") === "baseline" && await page.evaluate(() => window.dispatchLab.map) === "frankfurt" && (await text(page, "#map-run")).startsWith("Baseline"),
      `maps: Neu-Frankfurt from the header, at map=frankfurt with the baseline kept (${there.search})`);
    const f = await lab(page);
    const fButtons = await switchButtons(page);
    check(JSON.stringify(Object.keys(f.runs)) === JSON.stringify(["baseline", "optimized"]) && JSON.stringify(fButtons) === JSON.stringify([["koeln", "Köln", "false"], ["frankfurt", "Neu-Frankfurt", "true"]]),
      `maps: Neu-Frankfurt has its two runs, and the header marks it (${Object.keys(f.runs).join(", ")}; ${JSON.stringify(fButtons)})`);
    for (const id of ["baseline", "optimized"]) {
      check(f.runs[id].score === reference.runs[id].reward && f.runs[id].steps === reference.runs[id].steps, `maps: Neu-Frankfurt's ${id} scores ${f.runs[id].score} in ${f.runs[id].steps} steps in the browser; the Python runner ${reference.runs[id].reward} in ${reference.runs[id].steps}`);
    }
    await page.click("#tab-score");
    const fRows = await compared(page);
    check(JSON.stringify(fRows) === JSON.stringify([["baseline", fmt(reference.runs.baseline.reward)], ["leaderboard", "−37,374"], ["optimized", fmt(reference.runs.optimized.reward)]]), `maps: Neu-Frankfurt's scores compared, with the same leaderboard figure (${fRows.map((r) => r.join(" ")).join(", ")})`);
    // Back to Köln from the header: no map in the address, and the run on screen stays.
    await Promise.all([page.waitForNavigation(), page.click('#map-switch button[data-map="koeln"]')]);
    await ready(page);
    const back = new URL(page.url());
    check(!back.searchParams.has("map") && back.searchParams.get("run") === "baseline" && await page.evaluate(() => window.dispatchLab.map) === "koeln" && (await text(page, "#map-run")).startsWith("Baseline"), `maps: Köln from the header, with no map in the address and the baseline kept (${back.search})`);
    await page.evaluate(() => window.dispatchLab.seek(300));
    await page.waitForTimeout(600);
    check(new URL(page.url()).search === "?run=baseline&step=300", `maps: on Köln the address remembers the run and the step, with no map (${new URL(page.url()).search})`);
    check(!errors.length, `maps: no console errors on either map (${errors.join(" | ")})`);
    await context.close();
    // Links: a map, a run and a step; no map; the older ?map=koeln; a run the map does not have; an
    // unknown map. Each opens its moment, and the address then names it as the page does.
    const links = [
      { url: "?map=frankfurt&run=baseline&step=400", map: "frankfurt", run: "Baseline", step: 400, address: "?map=frankfurt&run=baseline&step=400", what: "a link opens Neu-Frankfurt's baseline at step 400" },
      { url: "?run=baseline&step=400", map: "koeln", run: "Baseline", step: 400, address: "?run=baseline&step=400", what: "a link with no map opens Köln's baseline at step 400" },
      { url: "?map=koeln&run=baseline&step=400", map: "koeln", run: "Baseline", step: 400, address: "?run=baseline&step=400", what: "an older link, with ?map=koeln, still opens Köln's baseline at step 400, and the address drops the map" },
      { url: "?map=frankfurt&run=fastest", map: "frankfurt", run: "Optimized", step: 0, address: "?map=frankfurt&run=optimized&step=0", what: "a run the map does not have opens its optimized run instead" },
      { url: "?map=atlantis", map: "koeln", run: "Optimized", step: 0, address: "?run=optimized&step=0", what: "an unknown map opens Köln" }
    ];
    for (const l of links) {
      const o = await open({ url: l.url });
      await ready(o.page);
      await o.page.waitForTimeout(600);
      const got = { map: await o.page.evaluate(() => window.dispatchLab.map), run: await text(o.page, "#map-run"), step: await stepOnScreen(o.page), address: new URL(o.page.url()).search };
      check(got.map === l.map && got.run.startsWith(l.run) && got.step === l.step && got.address === l.address, `maps: ${l.what} (${l.url}: ${got.map}, ${got.run.split(":")[0]}, step ${got.step}, then ${got.address})`);
      check(!o.errors.length, `maps: no console errors at ${l.url} (${o.errors.join(" | ")})`);
      await o.context.close();
    }
    if (results.slice(before).every(([ok]) => ok)) console.log("MAPS_SWITCH_OK");
  }
} finally {
  await server.close();
  await browser.close();
}

const failed = results.filter(([ok]) => !ok);
for (const [ok, what] of results) if (ok) console.log(`PASS  ${what}`);
if (failed.length) {
  console.log(`\n${failed.length} of ${results.length} smoke check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} smoke checks passed.\nSMOKE_OK`);
