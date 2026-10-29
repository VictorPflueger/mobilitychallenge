// Header KPI strip, four of Vici's stat cards for the run on screen: the score at the step shown,
// the final score against the leaderboard, the trains that reached their destination and the stops
// served with a real stop. Each tile pairs one value with a line of context (Bach et al. 2022).
// A tile that shows an outcome takes that outcome's tone.

import { h } from "../dom.js";
import { count, score, signed } from "../format.js";
import { LEADERBOARD } from "../runs.js";
import { STATE } from "../engine/env.js";

export function createKpis(container) {
  const make = (id, label) => {
    const value = h("div", { class: "vc-stat__value kpi-value", id: `kpi-${id}-value` }, "—");
    const note = h("div", { class: "vc-stat__note kpi-sub", id: `kpi-${id}-sub` }, "");
    const el = h("div", { class: "vc-stat kpi", dataset: { tone: "muted" }, role: "group", "aria-label": label },
      h("div", { class: "vc-stat__label kpi-label" }, label), value, note);
    container.appendChild(el);
    return { el, value, note };
  };
  const tiles = {
    score: make("score", "Score"),
    best: make("best", "Final vs. the best"),
    trains: make("trains", "Trains arrived"),
    stops: make("stops", "Stops served")
  };

  const set = (tile, text, tone, note) => {
    if (tile.value.textContent !== text) tile.value.textContent = text;
    tile.el.dataset.tone = tone;
    if (tile.note.textContent !== note) { tile.note.textContent = note; tile.note.title = note; }
  };

  /** run: a simulated run; t: the step on screen; scenario: the engine's scenario. */
  function update(run, t, scenario) {
    const f = run.frames;
    const n = f.n;
    const last = t >= run.steps;
    set(tiles.score, score(f.total[t]), last ? "" : "", last ? `final, after ${count(run.steps)} steps` : `at step ${count(t)}; final ${score(run.score)}`);

    const diff = run.score - LEADERBOARD;
    set(tiles.best, signed(diff), diff > 0 ? "resolved" : "affected", `${score(run.score)} vs ${count(LEADERBOARD)}`);

    let arrived = 0;
    let onTime = 0;
    for (let i = 0; i < n; i += 1) {
      if (f.state[t * n + i] === STATE.DONE) {
        arrived += 1;
        if (f.lateBy[t * n + i] === 0) onTime += 1;
      }
    }
    const trainsTone = !last ? "" : arrived === n ? "resolved" : "affected";
    set(tiles.trains, `${arrived} / ${n}`, trainsTone, arrived ? `${onTime} of them on time` : last ? "none reached its destination" : "none yet");

    let total = 0;
    let served = 0;
    let passed = 0;
    run.timetable.forEach((tt, i) => {
      const a = scenario.agents[i];
      for (let k = 1; k < a.waypoints.length - 1; k += 1) {
        total += 1;
        if (tt.stopped[k] !== null && tt.stopped[k] <= t) served += 1;
        else if (tt.departed[k] !== null && tt.departed[k] <= t) passed += 1;
      }
    });
    const stopsTone = !last ? "" : served === total ? "resolved" : "affected";
    set(tiles.stops, `${served} / ${total}`, stopsTone, passed ? `${passed} passed without stopping` : last && served < total ? `${total - served} not served` : "with a real stop");
  }

  return { update };
}
