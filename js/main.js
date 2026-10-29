// Dispatch Lab: boots the page. Loads the map the address asks for (?map=frankfurt or ?map=koeln;
// Köln by default) with its recorded plan, simulates its runs in the browser (the engine scores
// them), checks the scores against the Python runner's, then builds the header, controls, map and
// panel and plays the runs back. The map switch in the header loads the other map.

import { $, h } from "./dom.js";
import { icon } from "./icons.js";
import { count, score } from "./format.js";
import { loadScenario } from "./engine/env.js";
import { OrderedController } from "./controllers/ordered.js";
import { ReplayController } from "./controllers/replay.js";
import { simulate } from "./sim.js";
import { describe } from "./network.js";
import { RUNS, runById } from "./runs.js";
import { MAPS, dataPath, mapFromSearch } from "./maps.js";
import { balancedPenalties } from "./engine/env.js";
import { scoreFloor } from "./floor.js";
import { createKpis } from "./ui/kpis.js";
import { createControls, SPEEDS } from "./ui/controls.js";
import { createMap } from "./ui/map.js";
import { createPanel } from "./ui/panel.js";
import { guideSeen, openGuide } from "./ui/guide.js";
import { runFacts, situation } from "./story.js";

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
  const map = mapFromSearch(location.search);
  document.documentElement.dataset.map = map.id;
  say(`Loading ${map.name}…`);
  // The map, the Python runner's scores, and the plan the optimized run replays.
  const [mapData, reference, plan] = await Promise.all([
    fetchJson(dataPath(map, map.file)),
    fetchJson(dataPath(map, "reference.json")),
    fetchJson(dataPath(map, "planner_actions.json"))
  ]);
  const scenario = loadScenario(mapData);
  const network = describe(mapData, map);
  done(`${map.name}: ${scenario.rail.height} × ${scenario.rail.width} cells, ${scenario.agents.length} trains, ${count(scenario.maxSteps)} steps`);

  const runs = new Map();
  const verified = new Map();
  const controllers = {
    baseline: () => new OrderedController(),
    optimized: () => new ReplayController(plan, "optimized")
  };
  const runList = RUNS.filter((r) => map.runs.includes(r.id));
  for (const r of runList) {
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

  // What every part of the page compares against: the leaderboard's figure (js/maps.js), and the
  // floor no dispatcher can beat (js/floor.js).
  const floor = scoreFloor(scenario, balancedPenalties(scenario.maxSteps));
  build({ map, runList, scenario, network, runs, verified, reference, floor });
}

function build(ctx) {
  const { map, runList, scenario, network, runs } = ctx;
  const params = new URLSearchParams(location.search);
  const state = {
    run: runList.some((r) => r.id === params.get("run")) ? params.get("run") : "optimized",
    t: 0,
    speed: 4,
    playing: false,
    selected: null
  };
  const startStep = Number(params.get("step"));

  // The header says which map is on screen, and the map switch loads the other one.
  $("#brand-sub").textContent = `T-Brain Mobility Challenge · ${map.name}, ${count(scenario.agents.length)} trains`;
  buildMapSwitch($("#map-switch"), map, () => state.run);

  const kpis = createKpis($("#kpis"), ctx);
  const controls = createControls($("#controls"), runList, {
    onRun: (id) => setRun(id),
    onPlay: () => togglePlay(),
    onStep: (d) => { pause(); seek(Math.round(state.t) + d); },
    onSeek: (t) => { pause(); seek(t); },
    onSpeed: (id) => { state.speed = id; controls.setSpeed(id); }
  });
  const mapView = createMap($("#map"), { map, scenario, network, onSelect: (i) => select(state.selected === i ? null : i) });
  const panel = createPanel($("#panel"), {
    ...ctx,
    initialRun: state.run,
    onRun: (id) => setRun(id),
    onSelect: (i, opts) => select(i, opts),
    onSeek: (t) => { pause(); seek(t); },
    onTab: () => {}
  });

  // The guide; a run's Watch button plays that run from its start, with its story beside it.
  const watch = (id) => { setRun(id); panel.show("story"); seek(0); play(); };
  const guide = () => openGuide({ map, runList, scenario, network, runs, floor: ctx.floor }, { onWatch: watch });
  $("#btn-about").addEventListener("click", guide);
  const facts = new Map([...runs].map(([id, r]) => [id, runFacts(r, scenario)]));

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
    mapView.setCaption(`Step ${count(t)} of ${count(r.steps)} · ${onMap} on the map · score ${score(r.frames.total[t])}`);
    mapView.setSituation(situation(r, scenario, facts.get(state.run), t));
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
    mapView.setRun(r, { id, title: runById(id).title });
    panel.set({ run: id, t: Math.min(Math.floor(state.t), r.steps) });
    mapView.render(state.t, true);
    updateUi(true);
    remember();
  }

  function seek(t) {
    const r = run();
    state.t = Math.max(0, Math.min(r.steps, Number.isFinite(t) ? t : r.steps));
    mapView.render(state.t, true);
    updateUi();
    remember();
  }

  // A train picked on the map, in the trains table or in the events opens its timetable (the Trains
  // tab); one picked by a story moment is only ringed on the map, so the story stays in view.
  function select(i, { keepTab = false } = {}) {
    state.selected = i;
    mapView.select(i);
    panel.set({ selected: i });
    if (i !== null && !keepTab && panel.active() !== "trains") panel.show("trains");
  }

  // ---- playback ------------------------------------------------------------------------------------
  let raf = 0;
  let last = 0;
  function frame(now) {
    if (!state.playing) return;
    // A frame's time stamp can lie before the click that started playback (the browser stamps the
    // frame before it handles the click), so time never runs backwards here.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = Math.max(last, now);
    const r = run();
    const sps = SPEEDS.find((s) => s.id === state.speed).stepsPerSecond;
    state.t = Math.max(0, Math.min(r.steps, state.t + dt * sps));
    mapView.render(state.t);
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
    mapView.render(state.t, true);
    updateUi(true);
  }
  function togglePlay() { if (state.playing) pause(); else play(); }

  // The map, run and step on screen live in the address, so a moment can be shared as a link
  // (?map=koeln&run=baseline&step=600). The map is always named, also on the default one.
  let rememberTimer = 0;
  function remember() {
    clearTimeout(rememberTimer);
    rememberTimer = setTimeout(() => {
      const p = new URLSearchParams({ map: map.id, run: state.run, step: String(Math.floor(state.t)) });
      for (const [key, value] of new URLSearchParams(location.search)) if (!p.has(key)) p.append(key, value);
      history.replaceState(null, "", `${location.pathname}?${p}`);
    }, 400);
  }

  controls.setSpeed(state.speed);
  setRun(state.run);
  if (Number.isFinite(startStep) && startStep > 0) seek(startStep);

  boot.dataset.state = "done";
  document.documentElement.dataset.boot = "ready";
  setTimeout(() => boot.remove(), 400);
  if (!guideSeen()) guide();

  // For tests and the curious: the runs as computed in this browser.
  window.dispatchLab = { map: map.id, runs, state, scenario, seek, setRun, play, pause, select, guide, facts };
}

/**
 * The map switch in the header: one button per map, the one on screen pressed. Another map loads
 * that map's page, its address naming the map (?map=frankfurt, ?map=koeln); its runs are simulated
 * afresh, and the run on screen stays if the other map has it.
 */
function buildMapSwitch(root, current, currentRun) {
  for (const m of MAPS) {
    const b = h("button", { type: "button", "aria-pressed": String(m.id === current.id), dataset: { map: m.id } }, m.name);
    b.addEventListener("click", () => {
      if (m.id === current.id) return;
      const p = new URLSearchParams({ map: m.id });
      if (m.runs.includes(currentRun())) p.set("run", currentRun());
      location.assign(`${location.pathname}?${p}`);
    });
    root.appendChild(b);
  }
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
