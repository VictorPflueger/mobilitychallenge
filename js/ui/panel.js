// The side panel: the run's score (the four scores, where the points go, the score over time), its
// trains (state, stops, penalty, and the timetable of the selected one), its events and the method.
// Vici's tabs (role tablist); the panel owns them.

import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { count, plural, points, score } from "../format.js";
import { KINDS, breakdown, trainStatus } from "../sim.js";
import { moments, runFacts } from "../story.js";
import { RUNS, runById, LEADERBOARD, ESTIMATE_NOTE } from "../runs.js";
import { comparison, scoreOverTime } from "./charts.js";
import { aiLabel } from "./ailabel.js";
import { trainSwatch, trackGlyph } from "./map.js";
import { STATE } from "../engine/env.js";

const TABS = [
  { id: "story", label: "Story" },
  { id: "score", label: "Score" },
  { id: "trains", label: "Trains" },
  { id: "events", label: "Events" },
  { id: "method", label: "Method" }
];

export function createPanel(root, ctx) {
  const { scenario, network, runs, verified, reference } = ctx;
  const tabs = new Map();
  const panels = new Map();
  const list = h("div", { class: "vc-tabs__list panel-tabs", role: "tablist", "aria-label": "Run details" });
  const body = h("div", { class: "panel-body" });
  let active = "story";

  for (const t of TABS) {
    const b = h("button", { type: "button", role: "tab", id: `tab-${t.id}`, "aria-selected": String(t.id === active), "aria-controls": `panel-${t.id}`, tabindex: t.id === active ? "0" : "-1" }, t.label);
    b.addEventListener("click", () => show(t.id));
    b.addEventListener("keydown", (e) => {
      const i = TABS.findIndex((x) => x.id === t.id);
      const j = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault();
      show(TABS[j].id);
      tabs.get(TABS[j].id).focus();
    });
    tabs.set(t.id, b);
    list.appendChild(b);
    const p = h("div", { class: "panel-section", id: `panel-${t.id}`, role: "tabpanel", "aria-labelledby": `tab-${t.id}`, tabindex: "0", hidden: t.id !== active });
    panels.set(t.id, p);
    body.appendChild(p);
  }
  root.append(h("div", { class: "panel-head" }, list), body);

  function show(id) {
    active = id;
    for (const [tid, b] of tabs) { b.setAttribute("aria-selected", String(tid === id)); b.tabIndex = tid === id ? 0 : -1; }
    for (const [pid, p] of panels) p.hidden = pid !== id;
    ctx.onTab?.(id);
    refresh(true);
  }

  // ---- Story -------------------------------------------------------------------------------------
  // What the run's dispatcher does, the moments worth watching (each jumps to its step and picks its
  // train), why it scores what it scores, and the way on to the next run.
  const stories = new Map();
  const storyOf = (id) => {
    if (!stories.has(id)) {
      const run = runs.get(id);
      const facts = runFacts(run, scenario);
      stories.set(id, { facts, moments: moments(run, scenario, network, facts, runById(id).why || {}) });
    }
    return stories.get(id);
  };
  const NEXT = {
    baseline: { run: "estimate", text: "Next: how the estimate gets every train through" },
    estimate: { run: "optimized", text: "Next: how the optimized run serves every stop" },
    optimized: { run: null, text: "Compare all four scores" }
  };
  const storyHolder = h("div", { class: "story" });
  panels.get("story").append(storyHolder);
  let storyFor = "";
  let momentButtons = [];

  function renderStory() {
    const id = state.run;
    const r = runById(id);
    const run = runs.get(id);
    const { facts, moments: list } = storyOf(id);
    if (storyFor !== id) {
      storyFor = id;
      storyHolder.dataset.run = id;
      const fin = breakdown(run, run.steps);
      const lost = KINDS.map((k) => ({ ...k, ...fin[k.id] })).filter((k) => k.value < 0).sort((a, b) => a.value - b.value);
      const total = Math.abs(run.score) || 1;
      momentButtons = list.map((m) => h("button", {
        type: "button", class: "moment", dataset: { kind: m.kind },
        on: { click: () => { ctx.onSeek(m.step); ctx.onSelect(m.train ?? null, { keepTab: true }); } }
      },
      h("span", { class: "moment-step" }, `Step ${count(m.step)}`),
      h("span", { class: "moment-body" }, h("strong", {}, m.title), h("span", {}, m.text))));
      const next = NEXT[id];
      clear(storyHolder).append(
        h("section", { class: "story-intro" },
          h("div", { class: "story-head" }, h("span", { class: "run-swatch", "aria-hidden": "true" }), h("h3", {}, r.title), r.ai ? aiLabel(ESTIMATE_NOTE.title, ESTIMATE_NOTE.text) : null),
          h("p", {}, r.does),
          h("ul", { class: "story-facts" },
            h("li", {}, h("strong", {}, `${count(facts.arrived)} / ${count(facts.n)}`), h("span", {}, "trains arrived")),
            h("li", {}, h("strong", {}, `${count(facts.served)} / ${count(facts.stops)}`), h("span", {}, "stops served")),
            h("li", {}, h("strong", {}, count(facts.collisions)), h("span", {}, facts.collisions === 1 ? "collision" : "collisions")),
            h("li", {}, h("strong", {}, score(run.score)), h("span", {}, "score")))),
        h("section", {},
          h("h3", {}, "What happens"),
          h("p", { class: "panel-hint" }, icon("info", 16), "Pick a moment to jump to it on the map."),
          h("ol", { class: "story-moments" }, momentButtons.map((b) => h("li", {}, b)))),
        h("section", {},
          h("h3", {}, `Why it scores ${score(run.score)}`),
          lost.length
            ? h("ul", { class: "story-why" }, lost.slice(0, 4).map((k) => h("li", { dataset: { tone: k.tone } },
              h("span", { class: "story-why-share" }, `${Math.round((Math.abs(k.value) / total) * 100)} %`),
              h("span", {}, h("strong", {}, `${k.label}: ${score(k.value)}`), h("span", {}, `${count(k.count)} × · ${k.hint}`)))))
            : h("p", {}, "No penalty at all.")),
        h("button", {
          type: "button", class: "vc-button vc-button--secondary story-next",
          on: { click: () => (next.run ? ctx.onRun(next.run) : show("score")) }
        }, next.text, icon("forward", 16)));
    }
    // the moment the timeline has reached
    let current = -1;
    list.forEach((m, j) => { if (m.step <= state.t) current = j; });
    momentButtons.forEach((b, j) => {
      b.dataset.state = j < current ? "past" : j === current ? "current" : "ahead";
      if (j === current) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
  }

  // ---- Score -------------------------------------------------------------------------------------
  const scoreChart = scoreOverTime(runs);
  const compareHolder = h("div", { class: "compare-holder" });
  const breakdownHolder = h("div", { class: "breakdown-holder" });
  panels.get("score").append(compareHolder, breakdownHolder, scoreChart.el);

  function renderCompare() {
    clear(compareHolder).appendChild(comparison(runs, { selected: state.run, verified, onPick: (id) => ctx.onRun(id) }));
  }

  function renderBreakdown() {
    const run = runs.get(state.run);
    const now = breakdown(run, state.t);
    const fin = breakdown(run, run.steps);
    const max = Math.max(1, ...KINDS.map((k) => Math.abs(fin[k.id].value)));
    const rows = KINDS.map((k) => {
      const b = now[k.id];
      const f = fin[k.id];
      const bar = h("span", { class: "kind-bar", dataset: { tone: k.tone } });
      bar.style.setProperty("--w", `${((Math.abs(b.value) / max) * 100).toFixed(2)}%`);
      const finBar = h("span", { class: "kind-bar-final" });
      finBar.style.setProperty("--w", `${((Math.abs(f.value) / max) * 100).toFixed(2)}%`);
      return h("tr", { dataset: { tone: k.tone, zero: String(f.value === 0 && f.count === 0) } },
        h("th", { scope: "row" }, h("span", { class: "kind-mark", "aria-hidden": "true" }, icon(k.tone === "danger" ? "error" : "warning", 15)), h("span", { class: "kind-label" }, k.label), h("span", { class: "kind-hint" }, k.hint)),
        h("td", { class: "kind-track" }, finBar, bar),
        h("td", { class: "num" }, b.count ? `${count(b.count)}×` : "—"),
        h("td", { class: "num strong" }, b.value ? score(b.value) : "0.0"),
        h("td", { class: "num muted" }, f.value ? score(f.value) : "0.0"));
    });
    const total = run.frames.total[Math.min(state.t, run.steps)];
    clear(breakdownHolder).appendChild(h("figure", { class: "vc-chart breakdown" },
      h("figcaption", {}, h("span", { class: "vc-chart__title" }, `Where the points go: ${runById(state.run).label.toLowerCase()} run`),
        h("span", { class: "vc-chart__subtitle" }, state.t >= run.steps ? `Final, after ${count(run.steps)} steps` : `At step ${count(state.t)}; the pale bar and the last column are the final values`)),
      h("div", { class: "vc-table-wrap" }, h("table", { class: "vc-table vc-table--compact kinds" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Penalty"), h("th", { scope: "col" }, h("span", { class: "vc-visually-hidden" }, "Share")), h("th", { scope: "col", class: "num" }, "Count"), h("th", { scope: "col", class: "num" }, "So far"), h("th", { scope: "col", class: "num" }, "Final"))),
        h("tbody", {}, rows),
        h("tfoot", {}, h("tr", {}, h("th", { scope: "row" }, "Score"), h("td", {}), h("td", {}), h("td", { class: "num strong" }, score(total)), h("td", { class: "num muted" }, score(run.score))))))));
  }

  // ---- Trains ------------------------------------------------------------------------------------
  const detailHolder = h("div", { class: "train-detail-holder" });
  const tableHolder = h("div", { class: "vc-table-wrap trains-wrap" });
  panels.get("trains").append(detailHolder, tableHolder);
  const trainRows = network.trains.map((tr) => {
    const status = h("span", { class: "train-status" }, "");
    const stops = h("td", { class: "num" }, "");
    const pen = h("td", { class: "num" }, "");
    const pick = h("button", { type: "button", class: "train-pick", "aria-pressed": "false", on: { click: () => ctx.onSelect(state.selected === tr.handle ? null : tr.handle) } },
      h("span", { class: "train-badge", "aria-hidden": "true" }, String(tr.handle)),
      h("span", { class: "train-name" }, h("strong", {}, tr.name), h("span", {}, `${tr.kind} · ${tr.from} → ${tr.to}`)));
    const row = h("tr", { dataset: { train: tr.handle } }, h("td", { class: "train-cell" }, pick), h("td", {}, status), stops, pen);
    return { row, status, stops, pen, pick };
  });
  tableHolder.appendChild(h("table", { class: "vc-table vc-table--compact trains" },
    h("caption", { class: "vc-visually-hidden" }, "The trains of the run on screen at the step shown"),
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Train"), h("th", { scope: "col" }, "Now"), h("th", { scope: "col", class: "num" }, "Stops"), h("th", { scope: "col", class: "num" }, "Points"))),
    h("tbody", {}, trainRows.map((r) => r.row))));

  function renderTrains() {
    const run = runs.get(state.run);
    const t = Math.min(state.t, run.steps);
    trainRows.forEach((r, i) => {
      const st = trainStatus(run, scenario, i, t);
      r.status.textContent = st.word;
      r.status.dataset.tone = st.tone;
      const a = scenario.agents[i];
      const tt = run.timetable[i];
      let served = 0;
      for (let k = 1; k < a.waypoints.length - 1; k += 1) if (tt.stopped[k] !== null && tt.stopped[k] <= t) served += 1;
      r.stops.textContent = `${served} / ${a.waypoints.length - 2}`;
      const p = run.frames.trainTotal[t * run.frames.n + i];
      r.pen.textContent = p ? score(p) : "0.0";
      r.row.dataset.selected = String(state.selected === i);
      r.pick.setAttribute("aria-pressed", String(state.selected === i));
    });
    renderDetail();
  }

  function renderDetail() {
    clear(detailHolder);
    if (state.selected === null) {
      detailHolder.appendChild(h("p", { class: "panel-hint" }, icon("info", 16), "Pick a train, here or on the map, to see its timetable as it was run."));
      return;
    }
    const i = state.selected;
    const run = runs.get(state.run);
    const t = Math.min(state.t, run.steps);
    const a = scenario.agents[i];
    const tr = network.trains[i];
    const tt = run.timetable[i];
    const st = trainStatus(run, scenario, i, t);
    const shown = (v) => (v !== null && v <= t ? count(v) : "—");
    const rows = a.waypoints.map((_, k) => {
      const first = k === 0;
      const lastStop = k === a.waypoints.length - 1;
      const name = network.stations.find((s) => s.id === tr.stops[k])?.name || `Stop ${tr.stops[k]}`;
      let arrive = "—";
      let leave = "—";
      let mark = "";
      let tone = "";
      if (first) {
        arrive = "";
        leave = tt.entered !== null && tt.entered <= t ? count(tt.entered) : "—";
        mark = tt.entered !== null && tt.entered <= t ? "Departed" : "";
      } else if (lastStop) {
        arrive = tt.doneAt !== null && tt.doneAt <= t ? count(tt.doneAt) : "—";
        if (tt.doneAt !== null && tt.doneAt <= t) { mark = tt.doneAt > a.latestArrival ? `${tt.doneAt - a.latestArrival} late` : "On time"; tone = tt.doneAt > a.latestArrival ? "late" : "ok"; }
        else if (t >= run.steps) { mark = "Not arrived"; tone = "lost"; }
      } else {
        arrive = shown(tt.arrived[k]);
        leave = shown(tt.departed[k]);
        const stopped = tt.stopped[k] !== null && tt.stopped[k] <= t;
        const reached = tt.arrived[k] !== null && tt.arrived[k] <= t;
        const left = tt.departed[k] !== null && tt.departed[k] <= t;
        if (stopped) {
          const lateBy = tt.arrived[k] - a.wpLa[k];
          const earlyBy = left ? a.wpEd[k] - tt.departed[k] : 0;
          mark = lateBy > 0 ? `Stopped, ${lateBy} late` : earlyBy > 0 ? `Left ${earlyBy} early` : "Stopped on time";
          tone = lateBy > 0 || earlyBy > 0 ? "late" : "ok";
        } else if (left) { mark = "Passed through"; tone = "lost"; }
        else if (reached) { mark = "At the platform"; }
        else if (t >= run.steps || (tt.doneAt !== null && tt.doneAt <= t)) { mark = "Never reached"; tone = "lost"; }
      }
      return h("tr", { dataset: { tone } },
        h("th", { scope: "row" }, name),
        h("td", { class: "num" }, first ? "" : count(k === a.waypoints.length - 1 ? a.latestArrival : a.wpLa[k])),
        h("td", { class: "num" }, arrive),
        h("td", { class: "num" }, lastStop ? "" : count(a.wpEd[k])),
        h("td", { class: "num" }, lastStop ? "" : leave),
        h("td", {}, mark ? h("span", { class: "stop-mark", dataset: { tone } }, mark) : ""));
    });
    const close = h("button", { class: "vc-icon-button train-close", type: "button", "aria-label": "Close the timetable" }, icon("close", 18));
    close.addEventListener("click", () => ctx.onSelect(null));
    detailHolder.appendChild(h("section", { class: "vc-card train-detail", "aria-label": `Timetable of train ${i}` },
      h("div", { class: "train-detail-head" },
        h("span", { class: "train-badge big", "aria-hidden": "true" }, String(i)),
        h("div", {}, h("h3", {}, `${tr.name}`), h("p", {}, `${tr.kind} · ${tr.line} · ${a.maxSpeed === 1 ? "full speed" : "half speed"} · now: ${st.word.toLowerCase()}`)),
        close),
      h("div", { class: "vc-table-wrap" }, h("table", { class: "vc-table vc-table--compact timetable" },
        h("caption", { class: "vc-visually-hidden" }, `Timetable of train ${i}: due and actual steps`),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Station"), h("th", { scope: "col", class: "num" }, "Arrive by"), h("th", { scope: "col", class: "num" }, "Arrived"), h("th", { scope: "col", class: "num" }, "Leave from"), h("th", { scope: "col", class: "num" }, "Left"), h("th", { scope: "col" }, ""))),
        h("tbody", {}, rows)))));
  }

  // ---- Events ------------------------------------------------------------------------------------
  const eventsHolder = h("ol", { class: "events-list", "aria-label": "Events up to the step on screen, newest first" });
  const eventsNote = h("p", { class: "panel-hint" }, "");
  panels.get("events").append(eventsNote, eventsHolder);
  let eventsKey = "";

  function eventText(run, e) {
    const tr = network.trains[e.train];
    const a = scenario.agents[e.train];
    const stName = (k) => network.stations.find((s) => s.id === tr.stops[k])?.name || "a stop";
    switch (e.kind) {
      case "enter": return { text: `enters at ${tr.from}${e.late ? `, ${e.late} steps after its departure time` : ""}`, tone: e.late ? "late" : "" };
      case "reach": return { text: `reaches ${stName(e.stop)}${e.late ? `, ${e.late} steps late` : ""}`, tone: e.late ? "late" : "" };
      case "stop": return { text: `stops at ${stName(e.stop)}`, tone: "ok" };
      case "leave": return { text: `leaves ${stName(e.stop)}${e.early ? `, ${e.early} steps early` : ""}`, tone: e.early ? "late" : "" };
      case "pass": return { text: `runs through ${stName(e.stop)} without stopping`, tone: "lost" };
      case "collision": return { text: `is stopped by a train in its way: ${score(e.value)}`, tone: "lost" };
      case "arrive": return { text: `arrives at ${tr.to}${e.late ? `, ${e.late} steps late` : " on time"}`, tone: e.late ? "late" : "ok" };
      case "account": {
        const sum = e.items.reduce((s, x) => s + x.value, 0);
        const parts = [];
        const by = (kind) => e.items.filter((x) => x.kind === kind);
        if (by("cancelled").length) parts.push("never departed");
        if (by("not_arrived").length) parts.push("did not arrive");
        const missed = by("stop_missed").length + by("stop_passed").length;
        if (missed) parts.push(`${plural(missed, "stop")} not served`);
        const late = by("stop_late").filter((x) => x.value).length + by("stop_early").filter((x) => x.value).length + by("target_late").filter((x) => x.value).length;
        if (late && !parts.length) parts.push("delays booked");
        const t = e.step >= run.steps && a ? "at the end" : "on arrival";
        return { text: `${parts.length ? parts.join(", ") : "timetable kept"}: ${sum ? score(sum) : "no penalty"} (booked ${t})`, tone: sum < -0.05 ? (parts.some((p) => p.startsWith("did") || p.startsWith("never") || p.includes("not served")) ? "lost" : "late") : "ok" };
      }
      default: return { text: e.kind, tone: "" };
    }
  }

  function renderEvents() {
    const run = runs.get(state.run);
    const t = Math.min(state.t, run.steps);
    const key = `${state.run}|${t}`;
    if (key === eventsKey) return;
    eventsKey = key;
    const shown = run.events.filter((e) => e.step <= t);
    const recent = shown.slice(-160).reverse();
    eventsNote.replaceChildren(icon("info", 16), `${plural(shown.length, "event")} up to step ${count(t)}, newest first. Pick one to jump to it.`);
    clear(eventsHolder);
    for (const e of recent) {
      const { text, tone } = eventText(run, e);
      const b = h("button", { type: "button", class: "event", on: { click: () => { ctx.onSeek(e.step); ctx.onSelect(e.train); } } },
        h("span", { class: "event-step" }, count(e.step)),
        h("span", { class: "train-badge", "aria-hidden": "true" }, String(e.train)),
        h("span", { class: "event-text" }, h("strong", {}, network.trains[e.train].name), ` ${text}`));
      eventsHolder.appendChild(h("li", { class: "event-row", dataset: { tone } }, b));
    }
  }

  // ---- Method ------------------------------------------------------------------------------------
  const symbol = (glyph, name, text) => h("li", {}, glyph, h("span", {}, h("strong", {}, `${name}: `), text));
  renderMethod();
  function renderMethod() {
    const p = panels.get("method");
    const runsInfo = RUNS.map((r) => h("li", { dataset: { run: r.id } },
      h("div", { class: "method-run-head" }, h("span", { class: "run-swatch", "aria-hidden": "true" }), h("strong", {}, r.title), r.ai ? aiLabel(ESTIMATE_NOTE.title, ESTIMATE_NOTE.text) : null),
      h("p", {}, r.does), h("p", { class: "muted" }, r.how)));
    const ref = reference;
    p.append(
      h("section", { class: "method" },
        h("h3", {}, "What runs in your browser"),
        h("p", {}, "The challenge's Python environment, flatland-rl 4.2.2 with the challenge's reward rules, ported to JavaScript line by line: the trains' acceleration and braking, the state machine, how conflicts between trains are resolved, the level-free crossings and every penalty. When the page opens, it simulates all three runs and scores them itself."),
        h("h3", {}, "How it is checked"),
        h("p", {}, `The port was compared with the Python runner step by step: every train's position, direction, state, speed and reward at each of the ${count(ref.runs.baseline.steps)} steps, for all three runs, with no tolerance. The scores match to the last digit, and so does every line of the breakdown under Score: each penalty term was checked against the terms the Python reward function itself computes. Planted errors in the dynamics, the conflict rule, the map, a penalty or the breakdown are caught by the same comparison.`),
        h("p", { class: "method-check" }, icon("check", 16), `Python ${ref.python}, flatland-rl ${ref.flatland}; scores ${RUNS.map((r) => `${r.label.toLowerCase()} ${score(ref.runs[r.id].reward)}`).join(", ")}.`),
        h("h3", {}, "The runs"),
        h("ul", { class: "method-runs" }, runsInfo),
        h("h3", {}, "Reading the map"),
        h("ul", { class: "method-symbols" },
          symbol(trainSwatch("ontime", "moving"), "On time", "a train running within its timetable."),
          symbol(trainSwatch("late", "moving"), "Behind timetable", "past the latest arrival at its next stop; it stays filled when it stands."),
          symbol(trainSwatch("ontime", "standing"), "Standing", "stopped at a platform or holding, on time."),
          symbol(trainSwatch("blocked", "moving"), "Blocked", "it would move on, but a train is in its way."),
          symbol(trainSwatch("blocked", "standing"), "Stuck", "standing still for 40 steps or more past its time."),
          symbol(trackGlyph("track"), "Track", "45° corners are switches and curves."),
          symbol(trackGlyph("crossing"), "Level-free crossing", "tracks cross at different levels, so trains on them never conflict."),
          symbol(trackGlyph("platform"), "Platforms", "a station's platforms; the stops of the train picked in the Trains tab get an ink frame."),
          symbol(trackGlyph("buffer"), "Buffer stop", "the end of a track, where trains enter and leave the map.")),
        h("h3", {}, "How the score works"),
        h("p", {}, "The score is the sum of penalties, so zero is perfect. The challenge scales its penalties to the episode's 1,248 steps:"),
        h("ul", { class: "method-penalties" },
          h("li", {}, h("strong", {}, "Collision: "), "936 × the train's speed when a moving train is stopped by another."),
          h("li", {}, h("strong", {}, "Stop not served: "), "499.2 for a stop never reached or passed without stopping."),
          h("li", {}, h("strong", {}, "Late or early: "), "0.5 per step late at a stop, 1.75 per step leaving early, 1 per step late at the destination."),
          h("li", {}, h("strong", {}, "Unfinished: "), "a train still on the map at the end loses its remaining delay; one that never left loses 4 × (its travel time + 374.4).")),
        h("h3", {}, "Limits"),
        h("p", {}, `The two planners do not run in your browser: they ran in Python (the estimate's in a few seconds, the optimized run's in about two minutes), and the page replays the actions they gave each train. Malfunctions are off, as in the challenge's runner. The leaderboard's ${count(LEADERBOARD)} is a figure from the brief; the estimate is a reconstruction of the kind of solution that scores in that range, not the leaderboard entry's code.`),
        h("p", { class: "muted" }, "The map is the challenge's data/maps/neufrankfurt_19agents.json, unchanged. Station names come from its line names; stations no line names stay numbered.")));
  }

  // ---- state and refresh ---------------------------------------------------------------------------
  const state = { run: ctx.initialRun, t: 0, selected: null };
  let lastCompare = "";
  function refresh(force = false) {
    if (active === "story") renderStory();
    else if (active === "score") {
      const key = `${state.run}`;
      if (force || key !== lastCompare) { renderCompare(); lastCompare = key; }
      renderBreakdown();
      scoreChart.update(state.t, state.run);
    } else if (active === "trains") renderTrains();
    else if (active === "events") renderEvents();
  }

  function set(patch) {
    Object.assign(state, patch);
    refresh(Boolean(patch.run));
  }

  requestAnimationFrame(() => { scoreChart.draw(); refresh(true); });
  return { set, show, active: () => active };
}
