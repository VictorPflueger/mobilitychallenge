// Dispatch Lab in Chromium, end to end: the page boots over http, simulates the three runs itself,
// shows their scores (and the Python runner's are the same), plays them back, and every control does
// its job exactly once. No request leaves the page's own server, and no console error appears.
//   boot      scores in the run switch, the comparison and the KPI tiles; no external request
//   playback  Play, Pause, speed, step buttons, the timeline, the end of a run
//   runs      switching runs, their final figures, the address that remembers the moment
//   panel     the tabs by keyboard, the trains table, a train's timetable, the events and a jump
//             to one, the method
//   map       views, the legend strip, a train picked on the map
//   once      the theme toggle and the speed buttons act once per click (vici.js acts on some
//             controls by itself), the intro opens on a first visit, closes with Escape, reopens
//   motion    with reduced motion the trains jump from cell to cell (no animation between steps)
//   failure   a missing data file ends on the boot screen with the reason; a score the Python
//             runner did not compute raises a banner and loses its "same score" note
// Usage: node tests/smoke.mjs [case ...]
import { APP_ROOT, SKIP_INTRO, launchBrowser, serveStatic, wanted, NETWORK_NOISE } from "./lib/harness.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

const reference = JSON.parse(readFileSync(path.join(APP_ROOT, "data/reference.json"), "utf8"));
const results = [];
const check = (ok, what) => { results.push([ok, what]); if (!ok) console.log(`FAIL  ${what}`); };
const fmt = (v) => {
  const r = Math.round(v * 10) / 10;
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(r).replace("-", "−");
};

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

try {
  if (wanted("boot")) {
    const { context, page, errors, external } = await open();
    await ready(page);
    const scores = await page.evaluate(() => Object.fromEntries([...window.dispatchLab.runs].map(([id, r]) => [id, { score: r.score, steps: r.steps }])));
    for (const id of ["baseline", "estimate", "optimized"]) {
      check(scores[id].score === reference.runs[id].reward && scores[id].steps === reference.runs[id].steps,
        `boot: the browser's ${id} run scores ${scores[id].score} in ${scores[id].steps} steps; the Python runner ${reference.runs[id].reward} in ${reference.runs[id].steps}`);
      const shown = await text(page, `.run-switch button[data-run="${id}"] .run-score`);
      check(shown === fmt(reference.runs[id].reward), `boot: the run switch shows ${id} as ${shown}`);
      const value = await text(page, `.compare-row[data-run="${id}"] .compare-value`);
      check(value === fmt(reference.runs[id].reward), `boot: the comparison shows ${id} as ${value}`);
    }
    check(await text(page, '.compare-row[data-run="leaderboard"] .compare-value') === "−37,374", "boot: the comparison shows the leaderboard's −37,374");
    check((await page.$$(".compare-note.verified")).length === 3, "boot: all three runs carry 'same score as the Python runner'");
    check((await text(page, "#map-run")).startsWith("Optimized"), "boot: the optimized run is on screen first");
    check(await text(page, "#kpi-best-value") === "+36,360.0", `boot: the KPI tile puts the optimized run +36,360.0 ahead of the leaderboard (${await text(page, "#kpi-best-value")})`);
    const gone = await page.waitForSelector("#boot", { state: "detached", timeout: 3000 }).then(() => true, () => false);
    check(gone, "boot: the boot screen is gone");
    check(!errors.length, `boot: no console errors (${errors.join(" | ")})`);
    check(!external.length, `boot: no request left the site (${external.join(", ")})`);
    await context.close();
  }

  if (wanted("playback")) {
    const { context, page, errors } = await open();
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
    const { context, page, errors } = await open({ url: "?run=estimate&step=900" });
    await ready(page);
    check((await text(page, "#map-run")).startsWith("Estimate") && await stepOnScreen(page) === 900, "runs: the address opens the estimate at step 900");
    await page.click('.run-switch button[data-run="baseline"]');
    check(await page.getAttribute('.run-switch button[data-run="baseline"]', "aria-pressed") === "true" && (await text(page, "#map-run")).startsWith("Baseline"), "runs: Baseline is on screen");
    await page.click("#btn-end");
    check(await text(page, "#kpi-score-value") === "−74,022.6", "runs: the baseline ends at −74,022.6");
    check(await text(page, "#kpi-trains-value") === "7 / 19", `runs: 7 baseline trains arrive (${await text(page, "#kpi-trains-value")})`);
    await page.click('.run-switch button[data-run="estimate"]');
    check(await text(page, "#kpi-score-value") === "−36,576.6", "runs: the estimate ends at −36,576.6");
    check(await text(page, "#kpi-best-value") === "+797.4", `runs: the estimate is 797.4 better than the leaderboard (${await text(page, "#kpi-best-value")})`);
    await page.waitForTimeout(600);
    check(new URL(page.url()).searchParams.get("run") === "estimate", "runs: the address remembers the run");
    check(!errors.length, `runs: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("panel")) {
    const { context, page, errors } = await open({ url: "?run=baseline&step=700" });
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
    check((await page.$$(".method-symbols > li")).length === 9, "panel: the method explains the map's nine symbols");
    await page.click("#tab-score");
    check((await page.$$(".kinds tbody tr")).length === 8, "panel: the breakdown lists eight penalty kinds");
    check(!errors.length, `panel: no console errors (${errors.join(" | ")})`);
    await context.close();
  }

  if (wanted("map")) {
    const { context, page, errors } = await open({ url: "?run=optimized&step=250" });
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

  if (wanted("once")) {
    const { context, page, errors } = await open({ intro: true });
    await ready(page);
    check(await page.isVisible(".intro-modal"), "once: the intro opens on a first visit");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".intro-modal", { state: "detached", timeout: 5000 });
    check(await page.evaluate(() => localStorage.getItem("dl.introSeen")) === "1", "once: closing the intro remembers it");
    await page.click("#btn-about");
    check(await page.isVisible(".intro-modal"), "once: How it works reopens it");
    await page.click('.intro-modal button:has-text("Play the optimized run")');
    await page.waitForTimeout(400);
    check(await text(page, ".status-pill .text") === "Playing", "once: the intro's button plays the optimized run");
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
    server.blockLocal.add("/data/reference.json");
    const { context, page } = await open();
    await page.waitForSelector('#boot[data-state="failed"]', { timeout: 20000 });
    const detail = await text(page, "#boot-detail");
    check(/reference\.json: HTTP 404/.test(detail) && await page.isVisible(".boot-help"), `failure: a missing data file ends on the boot screen with the reason (${detail})`);
    server.blockLocal.delete("/data/reference.json");
    await context.close();
    // A Python score the engine does not reproduce: the page says so instead of claiming a match.
    const wrong = await open();
    const altered = JSON.parse(JSON.stringify(reference));
    altered.runs.estimate.reward += 1;
    await wrong.context.route(/\/data\/reference\.json$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(altered) }));
    await wrong.page.reload();
    await ready(wrong.page);
    const banner = await wrong.page.isVisible(".banner");
    const bannerText = banner ? await text(wrong.page, ".banner") : "";
    const notes = await wrong.page.$$eval(".compare-note.verified", (els) => els.map((e) => e.closest(".compare-row")?.dataset.run));
    check(banner && /differs from the Python runner/.test(bannerText), `failure: a score that differs from the Python runner's raises a banner (${bannerText.slice(0, 60)})`);
    check(notes.length === 2 && !notes.includes("estimate"), `failure: the estimate then loses "same score as the Python runner" (${notes.join(", ")})`);
    await wrong.context.close();
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
