// Dispatch Lab: boots the page. Loads the challenge's map and the recorded plan, simulates the three
// runs in the browser (the engine scores them), checks the scores against the Python runner's, then
// builds the header, controls, map and panel and plays the runs back.

import { $, h } from "./dom.js";
import { icon } from "./icons.js";
import { count, score } from "./format.js";
import { loadScenario } from "./engine/env.js";
import { OrderedController } from "./controllers/ordered.js";
import { EstimateController } from "./controllers/estimate.js";
import { ReplayController } from "./controllers/replay.js";
import { simulate } from "./sim.js";
import { describe } from "./network.js";
import { RUNS, runById } from "./runs.js";
import { createKpis } from "./ui/kpis.js";
import { createControls, SPEEDS } from "./ui/controls.js";
import { createMap } from "./ui/map.js";
import { createPanel } from "./ui/panel.js";
import { introSeen, openIntro } from "./ui/intro.js";

const bootStatus = $("#boot-status");
const bootSteps = $("#boot-steps");
const boot = $("#boot");

const say = (text) => { bootStatus.textContent = text; };
const done = (text) => bootSteps.appendChild(h("li", {}, icon("check", 16), text));
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function start() {
  say("Loading the scenario…");
  const [mapData, plan, reference] = await Promise.all([
    fetchJson("data/neufrankfurt_19agents.json"),
    fetchJson("data/planner_actions.json"),
    fetchJson("data/reference.json")
  ]);
  const scenario = loadScenario(mapData);
  const network = describe(mapData);
  done(`Neu-Frankfurt: ${scenario.rail.height} × ${scenario.rail.width} cells, ${scenario.agents.length} trains, ${count(scenario.maxSteps)} steps`);

  const runs = new Map();
  const verified = new Map();
  const controllers = {
    baseline: () => new OrderedController(),
    estimate: () => new EstimateController(),
    optimized: () => new ReplayController(plan)
  };
  for (const r of RUNS) {
    say(`Simulating the ${r.label.toLowerCase()} run…`);
    await nextFrame();
    const run = simulate(scenario, controllers[r.id]());
    runs.set(r.id, run);
    const ref = reference.runs[r.id];
    const same = ref && ref.reward === run.score && ref.steps === run.steps && !run.ambiguous.length;
    verified.set(r.id, same);
    done(`${r.label}: ${score(run.score)} in ${count(run.steps)} steps, ${Math.max(1, Math.round(run.millis))} ms${same ? ", same as the Python runner" : ""}`);
  }
  if (![...verified.values()].every(Boolean)) {
    showBanner("danger", "A score differs from the Python runner's", "The engine in this browser computed a score that the challenge's Python runner did not. The figures on this page may be wrong.");
  }

  build({ scenario, network, runs, verified, reference });
}

function build(ctx) {
  const { scenario, network, runs } = ctx;
  const params = new URLSearchParams(location.search);
  const state = {
    run: RUNS.some((r) => r.id === params.get("run")) ? params.get("run") : "optimized",
    t: 0,
    speed: 4,
    playing: false,
    selected: null
  };
  const startStep = Number(params.get("step"));

  const kpis = createKpis($("#kpis"));
  const controls = createControls($("#controls"), {
    onRun: (id) => setRun(id),
    onPlay: () => togglePlay(),
    onStep: (d) => { pause(); seek(Math.round(state.t) + d); },
    onSeek: (t) => { pause(); seek(t); },
    onSpeed: (id) => { state.speed = id; controls.setSpeed(id); }
  });
  const map = createMap($("#map"), { scenario, network, onSelect: (i) => select(state.selected === i ? null : i) });
  const panel = createPanel($("#panel"), {
    ...ctx,
    initialRun: state.run,
    onRun: (id) => setRun(id),
    onSelect: (i) => select(i),
    onSeek: (t) => { pause(); seek(t); },
    onTab: () => {}
  });

  $("#btn-about").addEventListener("click", () => openIntro(runs, { onPlay: () => { setRun("optimized"); seek(0); play(); } }));

  const run = () => runs.get(state.run);
  let lastUi = -1;
  let lastPanel = 0;

  function updateUi(force = false) {
    const r = run();
    const t = Math.min(Math.floor(state.t), r.steps);
    controls.setStep(t, r.steps);
    if (!force && t === lastUi) return;
    lastUi = t;
    kpis.update(r, t, scenario);
    let onMap = 0;
    for (let i = 0; i < r.frames.n; i += 1) if (r.frames.pos[t * r.frames.n + i] >= 0) onMap += 1;
    map.setCaption(`Step ${count(t)} of ${count(r.steps)} · ${onMap} on the map · score ${score(r.frames.total[t])}`);
    const now = performance.now();
    if (force || !state.playing || now - lastPanel > 180) {
      lastPanel = now;
      panel.set({ t });
    }
    controls.setPlaying(state.playing, t >= r.steps);
  }

  function setRun(id) {
    state.run = id;
    const r = run();
    if (state.t > r.steps) state.t = r.steps;
    controls.setRun(id, runs);
    map.setRun(r, { id, title: runById(id).title });
    panel.set({ run: id, t: Math.min(Math.floor(state.t), r.steps) });
    map.render(state.t, true);
    updateUi(true);
    remember();
  }

  function seek(t) {
    const r = run();
    state.t = Math.max(0, Math.min(r.steps, Number.isFinite(t) ? t : r.steps));
    map.render(state.t, true);
    updateUi();
    remember();
  }

  function select(i) {
    state.selected = i;
    map.select(i);
    panel.set({ selected: i });
    if (i !== null && panel.active() !== "trains") panel.show("trains");
  }

  // ---- playback ------------------------------------------------------------------------------------
  let raf = 0;
  let last = 0;
  function frame(now) {
    if (!state.playing) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const r = run();
    const sps = SPEEDS.find((s) => s.id === state.speed).stepsPerSecond;
    state.t = Math.min(r.steps, state.t + dt * sps);
    map.render(state.t);
    updateUi();
    if (state.t >= r.steps) { pause(); updateUi(true); remember(); return; }
    raf = requestAnimationFrame(frame);
  }
  function play() {
    const r = run();
    if (state.t >= r.steps) state.t = 0;
    state.playing = true;
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    updateUi(true);
  }
  function pause() {
    if (!state.playing) return;
    state.playing = false;
    cancelAnimationFrame(raf);
    state.t = Math.floor(state.t);
    map.render(state.t, true);
    updateUi(true);
  }
  function togglePlay() { if (state.playing) pause(); else play(); }

  // The run and step on screen live in the address, so a moment can be shared as a link.
  let rememberTimer = 0;
  function remember() {
    clearTimeout(rememberTimer);
    rememberTimer = setTimeout(() => {
      const p = new URLSearchParams(location.search);
      p.set("run", state.run);
      p.set("step", String(Math.floor(state.t)));
      history.replaceState(null, "", `${location.pathname}?${p}`);
    }, 400);
  }

  controls.setSpeed(state.speed);
  setRun(state.run);
  if (Number.isFinite(startStep) && startStep > 0) seek(startStep);

  boot.dataset.state = "done";
  document.documentElement.dataset.boot = "ready";
  setTimeout(() => boot.remove(), 400);
  if (!introSeen()) openIntro(runs, { onPlay: () => { setRun("optimized"); seek(0); play(); } });

  // For tests and the curious: the runs as computed in this browser.
  window.dispatchLab = { runs, state, scenario, seek, setRun, play, pause, select };
}

function showBanner(tone, title, text) {
  const el = h("div", { class: `vc-alert vc-alert--${tone} banner`, role: "alert" },
    h("div", { class: "vc-alert__body" }, h("strong", { class: "vc-alert__title" }, title), h("p", {}, text)));
  $("#banners").appendChild(el);
}

start().catch((err) => {
  console.error(err);
  boot.dataset.state = "failed";
  say("Dispatch Lab could not start.");
  const d = $("#boot-detail");
  d.hidden = false;
  d.textContent = String(err && err.message ? err.message : err);
});
