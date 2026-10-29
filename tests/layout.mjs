// The layout from a 1920 × 1080 projector over a tablet down to a phone: no sideways scrolling, the header's badges
// never run into the KPI tiles, the control bar keeps one row on laptops and projectors and its step
// label is never cut, the map keeps a usable size, the caption, the views and the legend never cover
// each other or the drawing, station names never cover each other and stay on screen, and every
// control is large enough to hit: 40 × 40 px at least (WCAG 2.5.8 asks 24; projector use asks more),
// 44 px for the main ones. Each viewport is checked at five moments of a run (the start of the
// optimized run with its story, the baseline in its gridlock, the estimate with trains waiting at
// their entry, the estimate at its end with a train's timetable open, and the view around the Hbf
// with a train picked), and at four on Köln (its optimized run at the start, its baseline in the
// gridlock, its optimized run with trains held off the network, the view around Stop 14 with a train
// picked); then in each of the guide's seven chapters, on both maps: the dialog inside the window,
// nothing in a chapter wider than the chapter (no sideways scrolling), its drawings' labels large
// enough to read (10 px at least) and its buttons large enough to hit.
// Usage: node tests/layout.mjs [viewport ...]   (e.g. 1280x720)
import { APP_ROOT, SKIP_INTRO, launchBrowser, serveStatic, ONLY, outDir } from "./lib/harness.mjs";
import path from "node:path";

const VIEWPORTS = [[1920, 1080], [1600, 900], [1536, 864], [1366, 768], [1280, 720], [1024, 768], [768, 1024], [390, 844], [320, 640]];
// mustName: a station whose name has to be on the map in that state.
const STATES = [
  { name: "optimized at the start, its story", url: "?run=optimized&step=0", situation: false, mustName: "Hbf" },
  { name: "baseline in its gridlock", url: "?run=baseline&step=600", situation: "Gridlock", mustName: "Hbf" },
  { name: "estimate with trains waiting at their entry", url: "?run=estimate&step=100", situation: "wait at their entry", mustName: "Hbf" },
  { name: "estimate at the end, a timetable open", url: "?run=estimate&step=1248", mustName: "Hbf", act: async (page) => { await page.click("#tab-trains"); await page.click('tr[data-train="3"] .train-pick'); } },
  { name: "around the Hbf, a train picked", url: "?run=baseline&step=700", mustName: "Hbf", act: async (page) => { await page.click('.map-views button:has-text("Around the Hbf")'); await page.click("#tab-trains"); await page.click('tr[data-train="11"] .train-pick'); } },
  { name: "Köln, optimized at the start", url: "?map=koeln&run=optimized&step=0", situation: false, mustName: "Essen" },
  { name: "Köln, baseline in its gridlock", url: "?map=koeln&run=baseline&step=600", situation: "Gridlock", mustName: "Essen" },
  { name: "Köln, optimized with trains held off", url: "?map=koeln&run=optimized&step=600", situation: "wait at their entry", mustName: "Essen" },
  { name: "Köln, around Stop 14, a train picked", url: "?map=koeln&run=baseline&step=150", act: async (page) => { await page.click('.map-views button:has-text("Around Stop 14")'); await page.click("#tab-trains"); await page.click('tr[data-train="16"] .train-pick'); } }
];
const GUIDES = [{ map: "frankfurt", url: "?run=optimized&step=0" }, { map: "koeln", url: "?map=koeln&run=optimized&step=0" }];

const chosen = VIEWPORTS.filter(([w, h]) => !ONLY.length || ONLY.includes(`${w}x${h}`));
const failures = [];
const report = [];
const browser = await launchBrowser();
const server = await serveStatic(APP_ROOT, 8766);
const shots = await outDir("layout");

function inPage(mustName) {
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
  const labels = [...document.querySelectorAll(".map-svg .station-label")].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  if (map) {
    for (const a of labels) if (a.l < map.l - 1 || a.r > map.r + 1 || a.t < map.t - 1 || a.b > map.b + 1) out.problems.push(`the station name "${a.text}" is cut off by the edge of the map`);
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) if (overlap(labels[i], labels[j])) out.problems.push(`the station names "${labels[i].text}" and "${labels[j].text}" overlap`);
  }
  if (mustName && !labels.some((a) => a.text === mustName)) out.problems.push(`${mustName} has no name on the map`);
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
  // The run's title and the situation line under it, when there is one: never cut.
  const cut = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  const title = document.querySelector("#map-run");
  if (title && cut(title)) out.problems.push(`the run's title is cut ("${title.textContent}")`);
  const line = document.querySelector("#map-situation");
  const shownText = line && !line.hidden ? [...line.querySelectorAll(".sit-text")].filter((t) => getComputedStyle(t).display !== "none") : [];
  out.situation = shownText.map((t) => t.textContent).join("");
  if (line && !line.hidden && shownText.length !== 1) out.problems.push(`the situation line shows ${shownText.length} texts`);
  for (const t of shownText) if (cut(t)) out.problems.push(`the situation line is cut ("${t.textContent}")`);
  return out;
}

/** The guide's dialog with one chapter open. */
function inGuide() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const out = { problems: [], small: [], chapter: document.querySelector(".guide-chapter")?.dataset.chapter, smallest: Infinity };
  const dialog = document.querySelector(".guide-modal");
  if (!dialog) { out.problems.push("the guide is not open"); return out; }
  const d = dialog.getBoundingClientRect();
  if (d.left < -1 || d.top < -1 || d.right > vw + 1 || d.bottom > vh + 1) out.problems.push(`the dialog leaves the window (${Math.round(d.left)},${Math.round(d.top)}–${Math.round(d.right)},${Math.round(d.bottom)} of ${vw}×${vh})`);
  const scroll = document.querySelector(".guide-scroll");
  const sb = scroll.getBoundingClientRect();
  const pad = getComputedStyle(scroll);
  // the chapter's content box: its padding stays clear
  const s = { left: sb.left + parseFloat(pad.paddingLeft), right: sb.right - parseFloat(pad.paddingRight) - (scroll.offsetWidth - scroll.clientWidth), height: sb.height };
  if (scroll.scrollWidth > scroll.clientWidth + 1) out.problems.push(`the chapter scrolls sideways (${scroll.scrollWidth} px for ${scroll.clientWidth} px)`);
  if (s.height < 160) out.problems.push(`the chapter has too little room (${Math.round(s.height)} px high)`);
  for (const el of scroll.querySelectorAll(".guide-chapter > *, .guide-chapter figure, .guide-chapter table, .guide-chapter svg, .guide-chapter li")) {
    const r = el.getBoundingClientRect();
    if (r.width && (r.left < s.left - 1 || r.right > s.right + 1)) out.problems.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(" ")[0]} is wider than the chapter (${Math.round(r.left)}–${Math.round(r.right)} of ${Math.round(s.left)}–${Math.round(s.right)})`);
    if (el.matches("p, li, td, th, strong") && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") out.problems.push(`text is cut in ${el.tagName.toLowerCase()} ("${el.textContent.trim().slice(0, 30)}")`);
  }
  // Labels in the drawings: their rendered size.
  for (const t of scroll.querySelectorAll("svg text")) {
    const r = t.getBoundingClientRect();
    if (!r.height) continue;
    const px = parseFloat(getComputedStyle(t).fontSize) * (t.ownerSVGElement.getScreenCTM()?.a || 1);
    out.smallest = Math.min(out.smallest, px);
    if (px < 9.95) out.problems.push(`the label "${t.textContent.slice(0, 24)}" is drawn at ${px.toFixed(1)} px`);
  }
  // All seven chapter buttons in view: the list never needs scrolling sideways.
  const side = dialog.querySelector(".guide-side");
  if (side && side.scrollWidth > side.clientWidth + 1) out.problems.push(`the chapter list scrolls sideways (${side.scrollWidth} px for ${side.clientWidth} px)`);
  // The side nav and the footer inside the dialog; the footer's buttons visible.
  for (const sel of [".guide-side", ".vc-dialog__footer", ".guide-next", ".guide-back", ".vc-dialog__header"]) {
    const el = dialog.querySelector(sel);
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) { out.problems.push(`${sel} is missing`); continue; }
    if (r.left < d.left - 1 || r.right > d.right + 1 || r.top < d.top - 1 || r.bottom > d.bottom + 1) out.problems.push(`${sel} leaves the dialog`);
  }
  for (const el of dialog.querySelectorAll("button")) {
    const r = el.getBoundingClientRect();
    if (!r.width || el.closest("[hidden]")) continue;
    const need = el.matches(".guide-nav-btn, .guide-next, .dialog-close") ? 44 : 40;
    // the chapter buttons: 44 px high, and 40 wide on the smallest phones so that all seven fit
    const needW = el.matches(".guide-nav-btn") && vw <= 360 ? 40 : need;
    if (r.height < need - 0.5 || r.width < needW - 0.5) out.small.push(`button.${el.className.split(" ").join(".")} "${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)} (needs ${need})`);
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
      const r = await page.evaluate(inPage, s.mustName || null);
      if (s.situation === false && r.situation) r.problems.push(`a situation line where none belongs ("${r.situation}")`);
      if (s.situation && !r.situation.includes(s.situation)) r.problems.push(`the situation line should say "${s.situation}" ("${r.situation}")`);
      for (const p of r.problems) { failures.push(`${w}×${h}, ${s.name}: ${p}`); bad += 1; }
      for (const p of r.small) { failures.push(`${w}×${h}, ${s.name}: target too small: ${p}`); bad += 1; }
      await page.screenshot({ path: path.join(shots, `layout-${w}x${h}-${s.name.replace(/[^a-z0-9]+/gi, "-")}.png`) });
    }
    // The guide, chapter by chapter, on each map.
    let smallest = Infinity;
    let chapters = 0;
    for (const guide of GUIDES) {
      await page.goto(server.base + guide.url);
      await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
      await page.click("#btn-about");
      await page.waitForSelector(".guide-modal", { timeout: 5000 });
      const ids = await page.$$eval(".guide-nav-btn", (bs) => bs.map((b) => b.dataset.chapter));
      chapters += ids.length;
      for (const id of ids) {
        await page.click(`.guide-nav-btn[data-chapter="${id}"]`);
        await page.waitForTimeout(150);
        const g = await page.evaluate(inGuide);
        if (g.chapter !== id) g.problems.push(`chapter ${id} did not open (${g.chapter})`);
        smallest = Math.min(smallest, g.smallest);
        for (const p of g.problems) { failures.push(`${w}×${h}, ${guide.map} guide chapter ${id}: ${p}`); bad += 1; }
        for (const p of g.small) { failures.push(`${w}×${h}, ${guide.map} guide chapter ${id}: target too small: ${p}`); bad += 1; }
        await page.screenshot({ path: path.join(shots, `layout-${w}x${h}-${guide.map}-guide-${id}.png`) });
      }
    }
    report.push(`${bad ? "FAIL" : "PASS"}  ${w}×${h}: ${STATES.length} states on both maps, ${chapters} chapters of the two guides (smallest label ${smallest.toFixed(1)} px)${bad ? `, ${bad} problem(s)` : ""}`);
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
console.log(`\nScreenshots in ${shots}.\nLAYOUT_OK maps=frankfurt,koeln`);
