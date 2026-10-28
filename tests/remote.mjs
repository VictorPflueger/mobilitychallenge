// The gh-pages branch on GitHub against this checkout: the branch on GitHub points at this
// checkout's commit, and the checkout has nothing uncommitted or ignored, so what GitHub Pages
// serves is exactly the build the other suites verified. Needs git and network access to GitHub.
// Usage: node tests/remote.mjs [remote]   (default: origin)
import { execFileSync } from "node:child_process";
import { APP_ROOT } from "./lib/harness.mjs";

const remote = process.argv[2] || "origin";
const git = (...args) => execFileSync("git", args, { cwd: APP_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const results = [];
const check = (ok, what) => results.push([ok, what]);
let head = "";
try {
  head = git("rev-parse", "HEAD");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  check(branch === "gh-pages", `this checkout is on the gh-pages branch (${branch})`);
  const dirty = git("status", "--porcelain", "--untracked-files=all");
  check(dirty === "", dirty ? `nothing uncommitted: ${dirty.split("\n").length} change(s), first ${dirty.split("\n")[0]}` : "nothing uncommitted or untracked");
  // Ignored files never reach GitHub; only Python's caches of tools/ may be ignored (.gitignore).
  const ignored = git("status", "--porcelain", "--ignored", "--untracked-files=all").split("\n")
    .filter((l) => l.startsWith("!!") && !/(^|\/)__pycache__\/|\.pyc$/.test(l.slice(3)));
  check(!ignored.length, ignored.length ? `no ignored files: ${ignored.slice(0, 3).join(", ")}` : "no ignored files that GitHub would not have (Python caches aside)");
  const url = git("remote", "get-url", remote);
  const line = git("ls-remote", remote, "refs/heads/gh-pages");
  const theirs = line.split(/\s+/)[0] || "";
  check(theirs === head, theirs ? `gh-pages on ${url} is ${theirs.slice(0, 12)}, this checkout ${head.slice(0, 12)}` : `${url} has no gh-pages branch`);
} catch (err) {
  check(false, `git failed: ${(err.stderr || err.message || "").toString().trim().split("\n")[0]}`);
}

for (const [ok, what] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
if (results.some(([ok]) => !ok)) process.exit(1);
console.log(`REMOTE_BRANCH_MATCHES ${head}`);
