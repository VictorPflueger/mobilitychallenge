// What differs between Victor's prototypes in the shared Vici tests (tests/tokens.mjs,
// tests/hexagon.mjs, tests/page-icon.mjs and tests/vici-files.mjs, taken from Rebate Hunter). This
// file is the one place that is Dispatch Lab's own.

/** The prototype's name, as on its page (and, once listed, on its card on Victor's website). */
export const NAME = "Dispatch Lab";

/**
 * Colour pairs only this prototype draws (the shared shell's pairs are in tests/tokens.mjs):
 * [what, foreground token, background token, kind]. kind "text" needs 4.5:1, "mark" (a line, an
 * icon, a control's border, a bar) 3:1 (WCAG 2.2, 1.4.3 and 1.4.11). Tokens are Vici's, without "--vc-".
 */
export const COLOUR_PAIRS = [
  // The network on its canvas (bg-sunken).
  ["Tracks and buffer stops on the canvas", "neutral-solid", "bg-sunken", "mark"],
  ["Platforms' outline on the canvas", "border-strong", "bg-sunken", "mark"],
  ["The stops of the selected train: their ink frame", "text", "bg-sunken", "mark"],
  ["Station names on the canvas", "text", "bg-sunken", "text"],
  ["Numbered stops' names on the canvas", "text-muted", "bg-sunken", "text"],
  // Trains on the canvas, and their numbers on their fill.
  ["A train on time (ink) on the canvas", "text", "bg-sunken", "mark"],
  ["A train on time: its number", "surface", "text", "text"],
  ["A train behind its timetable: its outline on the canvas", "warning-text", "bg-sunken", "mark"],
  ["A train behind its timetable: its number on its fill", "text", "warning-border", "text"],
  ["A blocked train on the canvas", "danger-solid", "bg-sunken", "mark"],
  ["A blocked train: its number on its fill", "text", "danger-border", "text"],
  ["A standing train: its outline on the canvas", "text", "bg-sunken", "mark"],
  ["A standing train: its number on the surface fill", "text", "surface", "text"],
  ["A stuck train: its outline on the canvas", "danger-solid", "bg-sunken", "mark"],
  ["A stuck train: its number", "danger-text", "danger-bg", "text"],
  ["The selected train's ring on the canvas", "text", "bg-sunken", "mark"],
  // Malfunctions on: a broken-down train, hatched in the danger family's solid step on the surface.
  ["A broken-down train: its outline on the canvas", "danger-solid", "bg-sunken", "mark"],
  ["A broken-down train: its stripes against their ground", "danger-solid", "surface", "mark"],
  ["A broken-down train: its number on its halo", "text", "surface", "text"],
  // The runs' series colours (Vici's chart palette) on the panel, the tracks and the control bar.
  ["Baseline series (bars, lines, swatches) on panels", "data-8", "surface", "mark"],
  ["Optimized series on panels", "data-2", "surface", "mark"],
  ["Baseline bar on its track", "data-8", "bg-subtle", "mark"],
  ["Optimized bar on its track", "data-2", "bg-subtle", "mark"],
  ["The leaderboard's dashed bar and reference line", "text-muted", "surface", "mark"],
  ["Chart axis labels", "chart-axis", "surface", "text"],
  ["The cursor at the step on screen", "text", "surface", "mark"],
  // The breakdown and the timetable.
  ["Breakdown: failures (collisions, stops not served, not arrived)", "danger-solid", "surface", "mark"],
  ["Breakdown: delays (late, early)", "warning-text", "surface", "mark"],
  ["Train badges: the number in its ink hexagon", "surface", "text", "text"],
  ["Events: a lost stop or a collision, its stripe", "danger-solid", "surface", "mark"],
  ["Events: a breakdown, its dashed stripe", "danger-solid", "surface", "mark"],
  ["Events: a delay, its stripe", "warning-text", "surface", "mark"],
  ["Events: a stop served, its stripe", "success-solid", "surface", "mark"],
  ["The check of a score (same as the Python runner)", "info-text", "surface", "text"],
  ["Floating cards on the canvas: their text", "text", "surface", "text"],
  // The legend strip under the map and the symbols in the Method tab, on the surface.
  ["Legend: names of the symbols", "text-muted", "surface", "text"],
  ["Legend and Method tab: tracks and buffer stops on the surface", "neutral-solid", "surface", "mark"],
  ["Legend and Method tab: platforms' outline on the surface", "border-strong", "surface", "mark"],
  ["Legend and Method tab: a train behind its timetable, its outline", "warning-text", "surface", "mark"],
  ["Legend and Method tab: a blocked train, its outline and dashed ring", "danger-solid", "surface", "mark"],
  ["Legend and Method tab: a train on time", "text", "surface", "mark"],
  ["Legend and Method tab: a broken-down train, its stripes and outline", "danger-solid", "surface", "mark"],
  // The Malfunctions switch in the control bar: its zap while malfunctions are on, on the pressed button.
  ["The Malfunctions switch, on: its zap", "danger-solid", "surface", "mark"],
  ["The Malfunctions switch: its name on the pressed button", "text", "surface", "text"],
  ["The Malfunctions switch: its name, off", "text-muted", "bg-subtle", "text"],
  // The situation line in the map's caption (on the surface).
  ["Situation line: gridlock, trains held back", "danger-text", "surface", "text"],
  ["Situation line: trains broken down", "danger-text", "surface", "text"],
  ["Situation line: its hatched marker, trains broken down", "danger-solid", "surface", "mark"],
  ["Situation line: all trains arrived", "success-text", "surface", "text"],
  ["Situation line: trains waiting", "text-muted", "surface", "text"],
  ["Situation line: its marker, gridlock", "danger-solid", "surface", "mark"],
  ["Situation line: its marker, all arrived", "success-solid", "surface", "mark"],
  // The Story tab (on the surface): the moments' stripes, the moment on screen, the shares.
  ["Story: a collision, a gridlock, a station passed, a train done as it enters or a breakdown, its stripe", "danger-solid", "surface", "mark"],
  ["Story: a wait, its stripe", "warning-text", "surface", "mark"],
  ["Story: a stop served, an arrival, its stripe", "success-solid", "surface", "mark"],
  ["Story: the moment on screen, its ink frame", "text", "surface", "mark"],
  ["Story: a moment's step and text", "text-muted", "surface", "text"],
  ["Story: the run's figures on their quiet fill", "text", "bg-subtle", "text"],
  ["Story: the figures' names, a moment under the pointer", "text-muted", "bg-subtle", "text"],
  ["Story: a failure's share of the points", "danger-text", "surface", "text"],
  ["Story: a delay's share of the points", "warning-text", "surface", "text"],
  // The guide (Vici's dialog on surface-raised; its chapter list on bg-subtle).
  ["Guide: chapter text and headings", "text", "surface-raised", "text"],
  ["Guide: secondary text, figure captions", "text-muted", "surface-raised", "text"],
  ["Guide: a chapter's name in the list", "text-muted", "bg-subtle", "text"],
  ["Guide: the open chapter in the list", "text", "bg-subtle", "text"],
  ["Guide: icon cells (ink on sunken)", "text", "bg-sunken", "text"],
  ["Guide: the pieces drawing's labels", "text-muted", "surface-raised", "text"],
  ["Guide: the pieces drawing's leader lines", "text-muted", "surface-raised", "mark"],
  ["Guide: the pieces drawing's tracks", "neutral-solid", "surface-raised", "mark"],
  ["Guide: the pieces drawing's platforms", "border-strong", "surface-raised", "mark"],
  ["Guide: the dashed cell", "text-muted", "bg-sunken", "mark"],
  ["Guide: numbered markers (a phone)", "surface-raised", "text", "text"],
  ["Guide: a blocked train's arrow in the scenes", "danger-solid", "bg-sunken", "mark"],
  ["Guide: the network drawing's names", "text", "bg-sunken", "text"],
  ["Guide: penalties, a failure's marker", "danger-solid", "surface-raised", "mark"],
  ["Guide: penalties, a delay's marker", "warning-text", "surface-raised", "mark"],
  ["Guide: the leaderboard's dashed bar", "text-muted", "surface", "mark"]
];

/**
 * Colours that must stay apart, beyond the shared ones in tests/tokens.mjs: [what, token, token].
 * The test reports how far apart they stay under colour-vision deficiency; it does not fail on them.
 */
export const SEPARATIONS = [
  ["Runs: baseline vs optimized", "data-8", "data-2"],
  ["Trains: on time (ink) vs blocked (its danger fill)", "text", "danger-border"],
  ["Trains: behind (warning fill) vs blocked (danger fill)", "warning-border", "danger-border"],
  ["Trains: on time (ink) vs behind (its warning fill)", "text", "warning-border"],
  ["Trains: standing on time (surface) vs behind (its warning fill)", "surface", "warning-border"],
  ["Trains: broken down (its stripes) vs behind (its warning fill)", "danger-solid", "warning-border"],
  ["Trains: broken down (its stripes) vs on time (ink)", "danger-solid", "text"]
];

/**
 * The hexagon test's tour of the app (tests/hexagon.mjs): its main states, the dialogs and views on
 * the way. The page has just been opened without SKIP_INTRO and without ?map=, so it shows Köln, the
 * default map, and the guide opens by itself: all seven chapters, and the guide on a phone (the
 * pieces drawing with numbered markers and a key, the timetable in blocks). Then Köln's runs with
 * their story and situation line, and Neu-Frankfurt from the map switch: its runs, its story, its
 * middle view and its guide.
 * visit(name, { settle }) checks the page as it is, settle ms (250) after the step.
 */
export async function hexagonTour(page, visit) {
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
  await page.waitForSelector(".guide-modal", { timeout: 10000 });
  const chapters = await page.$$eval(".guide-nav-btn", (bs) => bs.map((b) => b.dataset.chapter));
  for (const id of chapters) {
    await page.click(`.guide-nav-btn[data-chapter="${id}"]`);
    await visit(`the guide: ${id}`);
  }
  const size = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 });
  for (const id of ["network", "timetable", "score", "results"]) {
    await page.click(`.guide-nav-btn[data-chapter="${id}"]`);
    await visit(`the guide on a phone: ${id}`);
  }
  await page.setViewportSize(size);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".guide-modal", { state: "detached", timeout: 5000 });
  await visit("Köln: optimized run at the start, its story");
  await page.click("#btn-play");
  await page.waitForTimeout(1200);
  await page.click("#btn-play");
  await visit("Köln: optimized run after playing");
  await page.click('.run-switch button[data-run="baseline"]');
  await page.evaluate(() => window.dispatchLab.seek(600));
  await visit("Köln: baseline at step 600: gridlock, its story");
  await page.click('.moment[data-kind="collision"]');
  await visit("Köln: a story moment picked: its train ringed");
  await page.click('.moment[data-kind="at-target"]');
  await visit("Köln: a train done as it enters, picked");
  await page.click('.map-views button:nth-child(2)');
  await visit("Köln: around Stop 14");
  await page.click("#tab-trains");
  await page.click('tr[data-train="11"] .train-pick');
  await visit("Köln: a train's timetable");
  await page.click("#tab-events");
  await visit("Köln: events");
  await page.click("#tab-method");
  await visit("Köln: method");
  await page.evaluate(() => document.querySelector(".method-symbols").scrollIntoView());
  await visit("Köln: method: reading the map");
  await page.click('.run-switch button[data-run="optimized"]');
  await page.evaluate(() => window.dispatchLab.seek(50));
  await page.click("#tab-score");
  await visit("Köln: optimized run at step 50 (trains waiting at their entry), the scores and the current best");
  await page.click("#btn-end");
  await page.click("#tab-story");
  await visit("Köln: optimized run at the end, its story");
  // Neu-Frankfurt, from the map switch in the header.
  await Promise.all([page.waitForNavigation(), page.click('#map-switch button[data-map="frankfurt"]')]);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
  await visit("Neu-Frankfurt: optimized run at the start, its story");
  await page.click('.run-switch button[data-run="baseline"]');
  await page.evaluate(() => window.dispatchLab.seek(600));
  await visit("Neu-Frankfurt: baseline at step 600, gridlock");
  await page.click('.moment[data-kind="collision"]');
  await visit("Neu-Frankfurt: a story moment picked: its train ringed");
  await page.click('.map-views button:nth-child(2)');
  await visit("Neu-Frankfurt: around the Hbf");
  await page.click("#tab-score");
  await visit("Neu-Frankfurt: the scores and the current best");
  await page.click("#btn-about");
  await page.waitForSelector(".guide-modal", { timeout: 5000 });
  for (const id of ["challenge", "score", "results"]) {
    await page.click(`.guide-nav-btn[data-chapter="${id}"]`);
    await visit(`Neu-Frankfurt: the guide: ${id}`);
  }
  await page.keyboard.press("Escape");
  // Malfunctions on, from the switch beside the runs: hatched broken-down trains, the situation line,
  // the breakdowns among the events, the method with the test, and the guide's note.
  await page.waitForSelector(".guide-modal", { state: "detached", timeout: 5000 });
  await Promise.all([page.waitForNavigation(), page.click("#btn-malfunctions")]);
  await page.waitForSelector('html[data-boot="ready"]', { timeout: 30000 });
  await page.evaluate(() => window.dispatchLab.seek(200));
  await page.click("#tab-story");
  await visit("Neu-Frankfurt with malfunctions: trains broken down, the story");
  await page.click('.map-views button:nth-child(2)');
  await visit("Neu-Frankfurt with malfunctions: around the Hbf");
  await page.click("#tab-events");
  await visit("Neu-Frankfurt with malfunctions: breakdowns among the events");
  await page.click("#tab-method");
  await page.evaluate(() => document.querySelector(".malf-test")?.scrollIntoView());
  await visit("Neu-Frankfurt with malfunctions: the method and the test");
  await page.click("#btn-about");
  await page.waitForSelector(".guide-modal", { timeout: 5000 });
  await page.click('.guide-nav-btn[data-chapter="results"]');
  await visit("Neu-Frankfurt with malfunctions: the guide's results");
  await page.keyboard.press("Escape");
}

/**
 * The page icon (tests/page-icon.mjs): the icon and kind for this prototype's card on Victor's
 * website (VictorPflueger/VIP, data/prototypes.js; the README gives the card to add), the colour of
 * that kind's cell (Vici's lilac for a prototype), and favicon.svg exactly.
 */
export const PAGE_ICON = {
  icon: "flag",
  kind: "prototype",
  tone: "lilac",
  favicon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 103.92">
  <!-- Dispatch Lab's page icon: Vici's flag icon in a lilac hexagon cell, the colour of a prototype's
       card on Victor Pflüger's website. Vici's lilac 100 (#f2e9fd) and lilac 900 (#372544); the
       icon is drawn larger and bolder than in the header so that it still reads at 16 px. -->
  <polygon points="120,51.96 90,103.92 30,103.92 0,51.96 30,0 90,0" fill="#f2e9fd"/>
  <g transform="translate(18 9.96) scale(3.5)" fill="none" stroke="#372544" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.5 21 V3.8 M5.5 4.5 H17.5 L15 8.5 L17.5 12.5 H5.5"/>
  </g>
</svg>
`
};
