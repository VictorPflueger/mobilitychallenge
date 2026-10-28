// The layout from a 1920 × 1080 projector down to a phone: no sideways scrolling, the header's badges
// never run into the KPI tiles, the control bar keeps one row on laptops and projectors and its step
// label is never cut, the map keeps a usable size, the caption, the views and the legend never cover
// each other or the drawing, station names never cover each other and stay on screen, and every
// control is large enough to hit: 40 × 40 px at least (WCAG 2.5.8 asks 24; projector use asks more),
// 44 px for the main ones. Each viewport is checked at four moments of a run (the start of the
// optimized run, the baseline in its jam, the estimate at its end with a train's timetable open, and
// the view around the Hbf with a train picked).
// Usage: node tests/layout.mjs [viewport ...]   (e.g. 1280x720)
import { APP_ROOT, SKIP_INTRO, launchBrowser, serveStatic, ONLY, outDir } from "./lib/harness.mjs";
import path from "node:path";

const VIEWPORTS = [[1920, 1080], [1600, 900], [1536, 864], [1366, 768], [1280, 720], [1024, 768], [390, 844], [320, 640]];
const STATES = [
  { name: "optimized at the start", url: "?run=optimized&step=0" },
  { name: "baseline in its jam", url: "?run=baseline&step=600" },
  { name: "estimate at the end, a timetable open", url: "?run=estimate&step=1248", act: async (page) => { await page.click("#tab-trains"); await page.click('tr[data-train="3"] .train-pick'); } },
  { name: "around the Hbf, a train picked", url: "?run=baseline&step=700", act: async (page) => { await page.click('.map-views button:has-text("Around the Hbf")'); await page.click("#tab-trains"); await page.click('tr[data-train="11"] .train-pick'); } }
];

const chosen = VIEWPORTS.filter(([w, h]) => !ONLY.length || ONLY.includes(`${w}x${h}`));
const failures = [];
const report = [];
const browser = await launchBrowser();
const server = await serveStatic(APP_ROOT, 8766);
const shots = await outDir("layout");

function inPage() {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const overlap = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  const vw = document.documentElement.clientWidth;
  const out = { problems: [], small: [] };
  if (document.documentElement.scrollWidth > vw + 1) out.problems.push(`the page scrolls sideways (${document.documentElement.scrollWidth} px for ${vw} px)`);
  // Header: badges vs KPI tiles.
  const badges = [...document.querySelectorAll(".header-badges > *")].map((e) => e.getBoundingClientRect());
  const kpis = [...document.querySelectorAll(".kpi")].map((e) => e.getBoundingClientRect());
  for (const b of badges) for (const k of kpis) if (b.left < k.right - 1 && k.left < b.right - 1 && b.top < k.bottom - 1 && k.top < b.bottom - 1) out.problems.push("a header badge overlaps a KPI tile");
  // Everything inside the window horizontally (the panel's own scrollers excepted).
  for (const sel of [".app-header", ".controls", ".map-panel", ".side-panel", ".app-footer", ".map-caption", ".map-views", ".map-legend"]) {
    const r = rect(sel);
    if (r && (r.l < -1 || r.r > vw + 1)) out.problems.push(`${sel} leaves the window (${Math.round(r.l)}–${Math.round(r.r)} of ${vw})`);
  }
  // The map keeps a usable size; caption, views and legend do not cover each other.
  const map = rect(".map-svg");
  if (!map || map.w < 240 || map.h < 150) out.problems.push(`the map is too small (${map ? `${Math.round(map.w)}×${Math.round(map.h)}` : "missing"})`);
  const cap = rect(".map-caption");
  const views = rect(".map-views");
  const legend = rect(".map-legend");
  if (overlap(cap, views)) out.problems.push("the map caption and the views overlap");
  if (overlap(cap, legend)) out.problems.push("the map caption and the legend overlap");
  if (overlap(views, legend)) out.problems.push("the views and the legend overlap");
  for (const [name, r] of [["caption", cap], ["views", views], ["legend", legend]]) if (overlap(map, r)) out.problems.push(`the ${name} covers the drawing`);
  if (!legend) out.problems.push("the legend is missing");
  // Station names: inside the drawing, never on top of each other.
  const labels = [...document.querySelectorAll(".station-label")].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  if (map) {
    for (const a of labels) if (a.l < map.l - 1 || a.r > map.r + 1 || a.t < map.t - 1 || a.b > map.b + 1) out.problems.push(`the station name "${a.text}" is cut off by the edge of the map`);
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) if (overlap(labels[i], labels[j])) out.problems.push(`the station names "${labels[i].text}" and "${labels[j].text}" overlap`);
  }
  if (!labels.some((a) => a.text === "Hbf")) out.problems.push("the Hauptbahnhof has no name on the map");
  // The step label: never cut, never under the slider.
  const step = document.querySelector("#step-label");
  const slider = rect("#timeline");
  if (step && slider) {
    const sr = step.getBoundingClientRect();
    if (step.scrollWidth > step.clientWidth + 1) out.problems.push(`the step label is cut ("${step.textContent}")`);
    if (sr.right > slider.l + 1 && sr.top < slider.b && slider.t < sr.bottom) out.problems.push(`the step label runs under the slider ("${step.textContent}")`);
  }
  // Wide screens: the control bar keeps one row.
  if (vw >= 1280) {
    const kids = [...document.querySelectorAll(".controls > *")].map((e) => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    if (Math.max(...kids) - Math.min(...kids) > 6) out.problems.push("the control bar wraps to a second row");
  }
  // Targets: every visible HTML control at least 40 × 40 (the byline's links and the main controls 44).
  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role='tab']")].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !el.closest("[hidden], .vc-skip-link, svg");
  });
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    // The header's theme toggle and "How it works" are 40 px, as in Rebate Hunter (the header keeps
    // its height); everything else that is a main control is 44.
    const need = el.matches(".vc-byline__icon, .vc-icon-button:not(.theme-toggle), #btn-play, [role='tab'], .train-pick, .event") ? 44 : 40;
    const isRange = el.matches("input[type='range']");
    if ((r.height < need - 0.5) || (!isRange && r.width < need - 0.5)) {
      out.small.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)} (needs ${need})`);
    }
  }
  return out;
}

try {
  for (const [w, h] of chosen) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.addInitScript(SKIP_INTRO);
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
    const page = await context.newPage();
    let bad = 0;
    for (const s of STATES) {
      await page.goto(server.base + s.url);
      await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
      if (s.act) await s.act(page);
      await page.waitForTimeout(350);
      const r = await page.evaluate(inPage);
      for (const p of r.problems) { failures.push(`${w}×${h}, ${s.name}: ${p}`); bad += 1; }
      for (const p of r.small) { failures.push(`${w}×${h}, ${s.name}: target too small: ${p}`); bad += 1; }
      await page.screenshot({ path: path.join(shots, `layout-${w}x${h}-${s.name.replace(/[^a-z0-9]+/gi, "-")}.png`) });
    }
    report.push(`${bad ? "FAIL" : "PASS"}  ${w}×${h}: ${STATES.length} states${bad ? `, ${bad} problem(s)` : ""}`);
    await context.close();
  }
} finally {
  await server.close();
  await browser.close();
}

console.log(report.join("\n"));
if (failures.length) {
  console.log(`\n${[...new Set(failures)].map((f) => `✗ ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`\nScreenshots in ${shots}.\nLAYOUT_OK`);
