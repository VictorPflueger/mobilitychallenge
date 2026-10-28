// Intro window: what Dispatch Lab shows and how to read it, in about a minute. It opens by itself on
// a visitor's first visit (remembered in this browser) and any time from "How it works".

import { h } from "../dom.js";
import { icon } from "../icons.js";
import { openModal } from "../modal.js";
import { count, score } from "../format.js";
import { LEADERBOARD } from "../runs.js";

const KEY = "dl.introSeen";

export function introSeen() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked: it opens again next time */ }
}

/** Opens the intro. runs: the simulated runs (for their scores). Resolves "play" or null. */
export function openIntro(runs, { onPlay } = {}) {
  return new Promise((resolve) => {
    let modal;
    const steps = [
      { tone: "baseline", title: "Baseline", value: runs.get("baseline").score, text: "The challenge's default controller. Trains drive straight for their destination, run into each other and through their stops." },
      { tone: "best", title: "Current best", value: LEADERBOARD, text: "The leaderboard's figure. Its code is not public; the estimate run shows a rule set that lands next to it." },
      { tone: "estimate", title: "Estimate", value: runs.get("estimate").score, text: "Rules of thumb: no driving into an occupied cell, a stop at the next station, no early departure." },
      { tone: "optimized", title: "Optimized", value: runs.get("optimized").score, text: "A planner books every train's path through space and time before the first step, so no train ever blocks another." }
    ];
    const list = h("ol", { class: "vc-stepper intro-steps" }, steps.map((s, i) =>
      h("li", { class: "vc-step intro-step", dataset: { tone: s.tone } },
        h("span", { class: "vc-step__marker", "aria-hidden": "true" }, String(i + 1)),
        h("strong", { class: "vc-step__label intro-step-title" }, s.title, h("span", { class: "intro-score" }, s.tone === "best" ? count(s.value) : score(s.value))),
        h("span", { class: "vc-step__hint intro-step-text" }, s.text))));
    const value = h("ul", { class: "intro-value" },
      h("li", {}, h("strong", {}, "One map, 19 trains"), h("span", {}, "Neu-Frankfurt from the T-Brain Mobility Challenge: 1,248 steps, 59 timetabled stops.")),
      h("li", {}, h("strong", {}, "Zero is perfect"), h("span", {}, "The score adds up penalties: collisions, stops not served, delays, trains that never arrive.")),
      h("li", {}, h("strong", {}, "Computed here"), h("span", {}, "Your browser simulates every step and scores it, and the result matches the Python runner exactly.")));
    modal = openModal({
      title: "How Dispatch Lab works",
      intro: "Dispatch Lab runs the T-Brain Mobility Challenge in your browser: the same trains, timetable and scoring, under three dispatching strategies. Watch where each one loses its points.",
      className: "intro-modal",
      size: "intro",
      body: [h("h3", {}, "Four scores"), list, h("h3", {}, "How to read it"), value,
        h("p", { class: "intro-note" }, "A simulation, not real operations: Neu-Frankfurt is the challenge's fictional network. Station names come from the challenge's line names.")],
      footer: [
        h("span", { class: "dialog-note" }, "Press ", h("strong", {}, "Play"), " to watch the optimized run. Switch runs in the bar at the top."),
        h("button", { class: "vc-button vc-button--ghost", type: "button", on: { click: () => modal.close(null) } }, "Close"),
        h("button", { class: "vc-button", type: "button", autofocus: true, on: { click: () => modal.close("play") } }, icon("play", 18), "Play the optimized run")
      ],
      onClose: (result) => {
        markSeen();
        resolve(result || null);
        if (result === "play") onPlay?.();
      }
    });
  });
}
