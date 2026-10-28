// GitHub Pages for the repository: switched on, and its latest deployment is this checkout's
// commit of the gh-pages branch, deployed successfully. Reads GitHub's REST API (public data, no
// token needed) through the GitHub CLI when it is installed, otherwise directly.
// Usage: node tests/pages.mjs [owner/repo]   (default: VictorPflueger/mobilitychallenge)
import { execFileSync } from "node:child_process";
import { APP_ROOT } from "./lib/harness.mjs";

const repo = process.argv[2] || "VictorPflueger/mobilitychallenge";

function hasGh() {
  try { execFileSync("gh", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}
const useGh = hasGh();

/** GET a REST path; returns { ok, status, body }. */
async function api(path) {
  if (useGh) {
    try {
      const out = execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { ok: true, status: 200, body: JSON.parse(out) };
    } catch (err) {
      const text = `${err.stdout || ""}${err.stderr || ""}`;
      const status = Number((text.match(/HTTP (\d{3})/) || [])[1] || 0);
      return { ok: false, status, body: text.trim().split("\n")[0] };
    }
  }
  const res = await fetch(`https://api.github.com/${path}`, { headers: { accept: "application/vnd.github+json" } });
  return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : await res.text() };
}

const results = [];
const check = (ok, what) => results.push([ok, what]);
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: APP_ROOT, encoding: "utf8" }).trim();

const info = await api(`repos/${repo}`);
check(info.ok && info.body.has_pages === true, info.ok ? `GitHub Pages is ${info.body.has_pages ? "switched on" : "NOT switched on"} for ${repo}` : `could not read ${repo}: ${info.status} ${info.body}`);

let url = "";
const deployments = await api(`repos/${repo}/deployments?environment=github-pages&per_page=5`);
if (!deployments.ok) {
  check(false, `could not read the Pages deployments: ${deployments.status} ${deployments.body}`);
} else if (!deployments.body.length) {
  check(false, "GitHub Pages has not deployed anything yet");
} else {
  const latest = deployments.body[0];
  check(latest.sha === head, `the latest Pages deployment (${latest.created_at}) is commit ${latest.sha.slice(0, 12)} of ${latest.ref}; this checkout is ${head.slice(0, 12)}`);
  check(latest.ref === "gh-pages", `it was deployed from the gh-pages branch (${latest.ref})`);
  const statuses = await api(`repos/${repo}/deployments/${latest.id}/statuses?per_page=1`);
  if (!statuses.ok) check(false, `could not read the deployment's status: ${statuses.status} ${statuses.body}`);
  else {
    const s = statuses.body[0];
    url = s?.environment_url || "";
    check(s?.state === "success", `the deployment ${s ? `is ${s.state}` : "has no status yet"}${url ? `, at ${url}` : ""}`);
  }
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (results.some(([ok]) => !ok)) process.exit(1);
console.log(`PAGES_ENABLED ${url}`);
