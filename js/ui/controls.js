// The control bar: which run is on screen, playback (the one solid merlot button), stepping, the
// playback speed, the timeline and the playback status. The run switch and the speed are groups of
// toggle buttons with aria-pressed (Rebate Hunter's segmented look); this module owns them.

import { h, withTooltip } from "../dom.js";
import { icon } from "../icons.js";
import { count, score } from "../format.js";

export const SPEEDS = [
  { id: 1, label: "×1", stepsPerSecond: 8 },
  { id: 4, label: "×4", stepsPerSecond: 32 },
  { id: 16, label: "×16", stepsPerSecond: 128 }
];

/** runList: the runs of the map on screen (js/runs.js entries, in their order). */
export function createControls(root, runList, handlers) {
  // Run switch.
  const runButtons = new Map();
  const runSwitch = h("div", { class: "segmented run-switch", role: "group", "aria-label": "Run on screen", dataset: { runs: String(runList.length) } },
    runList.map((r) => {
      const scoreEl = h("span", { class: "run-score" }, "");
      const b = h("button", { type: "button", "aria-pressed": "false", dataset: { run: r.id } },
        h("span", { class: "run-swatch", "aria-hidden": "true" }), h("span", { class: "run-name" }, r.label), scoreEl);
      b.addEventListener("click", () => handlers.onRun(r.id));
      runButtons.set(r.id, { b, scoreEl });
      return b;
    }));

  // Playback.
  const play = h("button", { class: "vc-button play-btn", type: "button", id: "btn-play" }, icon("play", 18), h("span", { class: "btn-text" }, "Play"));
  play.addEventListener("click", () => handlers.onPlay());
  const iconButton = (name, label, fn, id) => {
    const b = h("button", { class: "vc-icon-button", type: "button", id }, icon(name, 20));
    b.addEventListener("click", fn);
    return withTooltip(b, label);
  };
  const steppers = h("div", { class: "control-group steppers" },
    iconButton("toStart", "To the first step", () => handlers.onSeek(0), "btn-start"),
    iconButton("back", "One step back", () => handlers.onStep(-1), "btn-back"),
    iconButton("forward", "One step on", () => handlers.onStep(1), "btn-forward"),
    iconButton("toEnd", "To the last step", () => handlers.onSeek(Infinity), "btn-end"));

  // Speed.
  const speedButtons = new Map();
  const speed = h("div", { class: "segmented speed", role: "group", "aria-label": "Playback speed" },
    SPEEDS.map((s) => {
      const b = h("button", { type: "button", "aria-pressed": "false", "aria-label": `Playback speed ${s.label} (${s.stepsPerSecond} steps a second)` }, s.label);
      b.addEventListener("click", () => handlers.onSpeed(s.id));
      speedButtons.set(s.id, b);
      return b;
    }));

  // Timeline.
  const stepLabel = h("span", { class: "step-label", id: "step-label", "aria-live": "off" }, "");
  const slider = h("input", { class: "vc-slider", type: "range", min: "0", max: "1", step: "1", value: "0", id: "timeline", "aria-label": "Step on screen" });
  slider.addEventListener("input", () => handlers.onSeek(Number(slider.value), { fromSlider: true }));
  const timeline = h("div", { class: "timeline" }, stepLabel, slider);

  // Status.
  const status = h("span", { class: "vc-tag status-pill", role: "status", dataset: { tone: "idle" } }, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "text" }, "Paused"));

  root.append(
    h("div", { class: "control-group" }, h("span", { class: "control-label", id: "run-label" }, "Run"), runSwitch),
    play,
    steppers,
    h("div", { class: "control-group" }, h("span", { class: "control-label" }, "Speed"), speed),
    timeline,
    status
  );

  function setRun(id, runs) {
    for (const [rid, { b, scoreEl }] of runButtons) {
      b.setAttribute("aria-pressed", String(rid === id));
      const r = runs.get(rid);
      if (r) scoreEl.textContent = score(r.score);
    }
  }

  function setSpeed(id) {
    for (const [sid, b] of speedButtons) b.setAttribute("aria-pressed", String(sid === id));
  }

  // Called on every step while the run plays, so it touches the button only when its state changes:
  // replacing the button's content under the pointer between mousedown and mouseup would lose the
  // click on Pause.
  let shown = "";
  function setPlaying(playing, finished) {
    const key = playing ? "playing" : finished ? "finished" : "paused";
    if (key === shown) return;
    shown = key;
    play.replaceChildren(icon(playing ? "pause" : "play", 18), h("span", { class: "btn-text" }, playing ? "Pause" : finished ? "Replay" : "Play"));
    play.setAttribute("aria-pressed", String(playing));
    status.dataset.tone = playing ? "active" : finished ? "done" : "idle";
    status.querySelector(".text").textContent = playing ? "Playing" : finished ? "Finished" : "Paused";
  }

  function setStep(t, steps) {
    slider.max = String(steps);
    if (Number(slider.value) !== t) slider.value = String(t);
    slider.style.setProperty("--vc-slider-value", String(steps ? t / steps : 0));
    slider.setAttribute("aria-valuetext", `Step ${t} of ${steps}`);
    stepLabel.replaceChildren("Step ", h("strong", {}, count(t)), ` of ${count(steps)}`);
  }

  return { setRun, setSpeed, setPlaying, setStep, play };
}
