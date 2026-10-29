// The guide: what the challenge is, how it works and what each run does, in seven short chapters for
// a reader who has never heard of it. It opens by itself on a first visit (remembered in this
// browser) and any time from "How it works". The text and every figure in it come from
// js/guide-content.js; the drawings from js/ui/diagrams.js. Each run's card ends with a button that
// closes the guide and plays that run.

import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { openModal } from "../modal.js";
import { chapters, guideFacts } from "../guide-content.js";
import { ESTIMATE_NOTE } from "../runs.js";
import { networkDiagram, piecesDiagram, conflictScenes } from "./diagrams.js";
import { trainSwatch } from "./map.js";
import { aiLabel } from "./ailabel.js";

const KEY = "dl.guideSeen";

export function guideSeen() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(KEY, "1"); } catch { /* storage blocked: it opens again next time */ }
}

const COMMANDS = [
  { icon: "arrowUp", name: "Forward", text: "Keep straight on and speed up." },
  { icon: "turnLeft", name: "Left", text: "At a switch, take the left branch." },
  { icon: "turnRight", name: "Right", text: "At a switch, take the right branch." },
  { icon: "stop", name: "Stop moving", text: "Brake to a halt (it takes a step or two)." },
  { icon: "more", name: "Do nothing", text: "Carry on as before: moving on, or standing still." }
];

const AREA_ICONS = { maps: "pin", runs: "play", map: "map", kpis: "chart", panel: "book" };

/**
 * Opens the guide for the map on screen. ctx: { map, runList, scenario, network, runs, floor }.
 * onWatch(runId) is called after the guide closed through a run's Watch button. Resolves the run to
 * watch, or null.
 */
export function openGuide(ctx, { chapter = 0, onWatch } = {}) {
  return new Promise((resolve) => {
    const F = guideFacts(ctx);
    const list = chapters(F);
    let index = Math.max(0, Math.min(list.length - 1, chapter));
    let modal;

    const navButtons = [];
    const nav = h("ol", { class: "vc-stepper vc-stepper--vertical guide-nav", "aria-label": "Chapters of the guide" },
      list.map((c, i) => {
        const b = h("button", { type: "button", class: "guide-nav-btn", dataset: { chapter: c.id }, on: { click: () => show(i, true) } },
          h("span", { class: "vc-step__marker", "aria-hidden": "true" }, String(i + 1)),
          h("span", { class: "vc-step__label" }, c.nav));
        navButtons.push(b);
        return h("li", { class: "vc-step guide-step" }, b);
      }));

    const pane = h("article", { class: "guide-chapter", "aria-live": "polite" });
    const count = h("span", { class: "dialog-note guide-count" }, "");
    const back = h("button", { class: "vc-button vc-button--ghost guide-back", type: "button", on: { click: () => show(index - 1, true) } }, icon("back", 18), "Back");
    const next = h("button", { class: "vc-button guide-next", type: "button", autofocus: true, on: { click: () => (index < list.length - 1 ? show(index + 1, true) : modal.close("baseline")) } }, "Next", icon("forward", 18));

    function block(bk) {
      switch (bk.type) {
        case "points":
          return h("ul", { class: "guide-points" }, bk.items.map((p) =>
            h("li", {}, p.icon ? h("span", { class: "vc-cell vc-cell--sm guide-cell", "aria-hidden": "true" }, icon(p.icon, 16)) : null,
              h("div", {}, h("strong", {}, p.title), h("p", {}, p.text)))));
        case "diagram": {
          const drawing = bk.name === "network" ? networkDiagram(ctx.scenario, ctx.network, ctx.map) : piecesDiagram();
          return h("figure", { class: `guide-figure guide-figure--${bk.name}` }, drawing, h("figcaption", {}, bk.caption));
        }
        case "note":
          return h("div", { class: `vc-callout vc-callout--${bk.tone} guide-note` },
            h("span", { class: "vc-callout__cell", "aria-hidden": "true" }, icon(bk.tone === "tip" ? "check" : "info", 16)),
            h("div", { class: "vc-callout__body" }, h("p", { class: "vc-callout__title" }, bk.title), h("p", {}, bk.text)));
        case "kinds":
          return h("ul", { class: "guide-kinds" }, bk.kinds.map((k) =>
            h("li", {}, trainSwatch("ontime", "moving"),
              h("div", {}, h("strong", {}, k.label),
                h("span", {}, `${k.count} trains, ${k.pace}`)))));
        case "timetable": {
          const ex = bk.example;
          const step = (v) => (v === null ? "—" : `step ${v}`);
          return h("figure", { class: "guide-figure guide-timetable" },
            h("table", { class: "vc-table vc-table--compact" },
              h("caption", {}, `Example: the timetable of ${ex.name}`),
              h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Station"), h("th", { scope: "col" }, "Arrive by"), h("th", { scope: "col" }, "Leave from"))),
              h("tbody", {}, ex.rows.map((r) => h("tr", {},
                h("th", { scope: "row" }, r.station, h("span", { class: `vc-tag vc-tag--sm guide-role`, dataset: { role: r.role } }, r.role)),
                h("td", { dataset: { label: "Arrive by" } }, r.role === "start" ? "—" : step(r.arriveBy)),
                h("td", { dataset: { label: "Leave from" } }, r.role === "destination" ? "—" : step(r.leaveFrom)))))));
        }
        case "commands":
          return h("ul", { class: "guide-commands", "aria-label": "The five commands" }, COMMANDS.map((c) =>
            h("li", {}, h("span", { class: "vc-cell vc-cell--sm guide-cell", "aria-hidden": "true" }, icon(c.icon, 18)),
              h("div", {}, h("strong", {}, c.name), h("span", {}, c.text)))));
        case "conflicts":
          return h("ul", { class: "guide-scenes" }, conflictScenes().map((s) =>
            h("li", { dataset: { scene: s.id } }, s.drawing, h("strong", {}, s.title),
              h("p", {}, s.text, s.id === "taken" ? bk.taken : ""))));
        case "penalties":
          return h("table", { class: "vc-table vc-table--compact guide-penalties" },
            h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Penalty"), h("th", { scope: "col" }, "When"), h("th", { scope: "col", class: "num" }, "Points"))),
            h("tbody", {}, bk.rows.map((r) => h("tr", { dataset: { tone: r.tone, kind: r.kind } },
              h("th", { scope: "row" }, h("span", { class: "guide-mark", "aria-hidden": "true" }), r.name),
              h("td", {}, r.text),
              h("td", { class: "num" }, r.cost)))));
        case "results":
          return h("ol", { class: "guide-results" }, bk.cards.map((c) => {
            const share = c.run === "best" ? Math.abs(F.leaderboard) : Math.abs(F.runs[c.run].score);
            const bar = h("span", { class: "guide-bar", "aria-hidden": "true" }, h("span", { class: "guide-bar-fill" }));
            bar.firstChild.style.setProperty("--share", String(Math.max(0.006, share / Math.abs(F.runs.baseline.score))));
            return h("li", { class: "guide-result", dataset: { run: c.run } },
              h("div", { class: "guide-result-head" },
                h("span", { class: "run-swatch", "aria-hidden": "true" }),
                h("strong", {}, c.name),
                c.ai ? aiLabel(ESTIMATE_NOTE.title, ESTIMATE_NOTE.text) : null,
                h("span", { class: "guide-result-score" }, c.score)),
              c.source ? h("p", { class: "guide-result-source" }, c.source) : null,
              bar,
              h("dl", {}, h("dt", {}, c.labels?.[0] || "What it does"), h("dd", {}, c.does), h("dt", {}, c.labels?.[1] || "What happens"), h("dd", {}, c.happens)),
              c.watch ? h("button", { class: "vc-button vc-button--secondary guide-watch", type: "button", dataset: { run: c.run }, on: { click: () => modal.close(c.run) } }, icon("play", 16), c.watch) : null);
          }));
        case "howto":
          return h("ul", { class: "guide-points guide-howto" }, bk.items.map((p) =>
            h("li", { dataset: { area: p.area } }, h("span", { class: "vc-cell vc-cell--sm guide-cell", "aria-hidden": "true" }, icon(AREA_ICONS[p.area] || "info", 16)),
              h("div", {}, h("strong", {}, p.title), h("p", {}, p.text)))));
        default:
          return null;
      }
    }

    function show(i, moveFocus = false) {
      index = Math.max(0, Math.min(list.length - 1, i));
      const c = list[index];
      const heading = h("h3", { class: "guide-title", id: "guide-title", tabindex: "-1" }, c.title);
      clear(pane).append(
        h("p", { class: "vc-eyebrow guide-eyebrow" }, `Chapter ${index + 1} of ${list.length} · ${c.nav}`),
        heading,
        h("p", { class: "guide-lead" }, c.lead),
        ...c.blocks.map(block));
      pane.dataset.chapter = c.id;
      navButtons.forEach((b, j) => {
        b.parentElement.classList.toggle("vc-step--current", j === index);
        if (j === index) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      count.textContent = `${index + 1} of ${list.length}`;
      back.disabled = index === 0;
      const last = index === list.length - 1;
      next.replaceChildren(...(last ? [icon("play", 18), "Watch the baseline"] : ["Next", icon("forward", 18)]));
      next.dataset.last = String(last);
      pane.parentElement?.scrollTo?.({ top: 0 });
      if (moveFocus) heading.focus({ preventScroll: true });
    }

    modal = openModal({
      title: "How the challenge works",
      className: "guide-modal",
      size: "guide",
      body: [h("div", { class: "guide" }, h("nav", { class: "guide-side", "aria-label": "Guide" }, nav), h("div", { class: "guide-scroll" }, pane))],
      footer: [count, back, next],
      onClose: (result) => {
        markSeen();
        resolve(result || null);
        if (result) onWatch?.(result);
      }
    });
    show(index);
  });
}
