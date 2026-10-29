// Runs every check in order and prints a summary. The page itself needs none of this.
// Usage: node tests/run-all.mjs               (all suites)
//        node tests/run-all.mjs engine smoke  (only the named suites)
// The data suite compares the site's map with a checkout of the challenge repository's main branch:
// DL_CHALLENGE names its folder (default ../mobilitychallenge, next to this checkout).
// The Python checks (tools/export_fixtures.py --check, tools/check_plan.py) and the two GitHub
// checks (tests/remote.mjs, tests/pages.mjs) are not part of this run; tests/README.md has them.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./lib/harness.mjs";

const challenge = path.resolve(APP_ROOT, process.env.DL_CHALLENGE || "../mobilitychallenge");

const SUITES = [
  { id: "tokens", what: "colour system on Vici's tokens, light and dark: contrast, colour-blind separation", file: "tests/tokens.mjs" },
  { id: "page-icon", what: "page icon: favicon, header and loading screen", file: "tests/page-icon.mjs" },
  { id: "vici-files", what: "vici/ holds Vici v1.0.0 unchanged", file: "tests/vici-files.mjs" },
  { id: "data", what: "the site's map is the challenge's, byte for byte; plan and traces recorded on it", file: "tests/data.mjs", args: ["--challenge", challenge], needs: challenge },
  { id: "engine", what: "the engine against flatland: Python semantics, distance map, three runs step by step, the score's terms", file: "tests/engine.mjs" },
  { id: "negctl", what: "the engine checks catch planted changes", file: "tests/engine-negctl.mjs" },
  { id: "story", what: "the Story tab's figures, moments and situation line against the Python traces", file: "tests/story.mjs" },
  { id: "guide", what: "the guide's figures against the scenario, the challenge's rules and the Python traces", file: "tests/guide.mjs" },
  { id: "glide", what: "the map moves each train at its own speed and keeps a standing train at its cell's centre, against the Python traces", file: "tests/glide.mjs" },
  { id: "smoke", what: "boot, playback, runs, panel, map, guide, story, glide, motion, failures (Chromium)", file: "tests/smoke.mjs", browser: true },
  { id: "layout", what: "viewports from 1920×1080 to 320×640, the guide's chapters, touch targets (Chromium)", file: "tests/layout.mjs", browser: true },
  { id: "hexagon", what: "nothing round: the files, and the rendered app in both themes (Chromium)", file: "tests/hexagon.mjs", browser: true }
];

const only = process.argv.slice(2);
const chosen = SUITES.filter((s) => !only.length || only.includes(s.id));
const summary = [];
for (const s of chosen) {
  console.log(`\n=== ${s.id}: ${s.what} ===`);
  if (s.needs && !existsSync(s.needs)) {
    console.log(`Not run: no checkout of the challenge repository at ${s.needs} (set DL_CHALLENGE).`);
    continue;
  }
  const started = Date.now();
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, s.file), ...(s.args || [])], { cwd: APP_ROOT, stdio: "inherit", env: process.env });
  summary.push({ ...s, ok: r.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
  if (r.status === 2 && s.browser) {
    console.log("Playwright is missing; the browser suites are skipped. See tests/README.md.");
    break;
  }
}

console.log("\n=== Summary ===");
for (const s of summary) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.id.padEnd(10)} ${String(s.seconds).padStart(4)} s  ${s.what}`);
const skipped = chosen.length - summary.length;
if (skipped) console.log(`(${skipped} suite${skipped === 1 ? "" : "s"} not run)`);
process.exit(summary.length === chosen.length && summary.every((s) => s.ok) ? 0 : 1);
