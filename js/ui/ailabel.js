// The AI label, after IBM Carbon for AI and Pickering's toggletips: Vici's feature tag (lilac, the
// sparkle, "AI") on content Claude wrote or estimated. A click opens a short explanation in Vici's
// popover look; it stays until a click elsewhere or Escape, and gives the focus back.

import { h } from "../dom.js";
import { icon } from "../icons.js";

let open = null;

function closeOpen(returnFocus = false) {
  if (!open) return;
  const { tip, button } = open;
  tip.hidden = true;
  button.setAttribute("aria-expanded", "false");
  open = null;
  if (returnFocus) button.focus();
}

document.addEventListener("click", (e) => {
  if (open && !open.tip.contains(e.target) && !open.button.contains(e.target)) closeOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && open) { e.stopPropagation(); closeOpen(true); }
}, true);
window.addEventListener("resize", () => closeOpen(false));

/** An AI label; title and text say who wrote what. Returns the button. */
export function aiLabel(title, paragraphs) {
  const id = `ai-tip-${Math.random().toString(36).slice(2, 8)}`;
  const tip = h("div", { class: "vc-popover ai-tip", id, role: "status", hidden: true },
    h("strong", {}, title), ...paragraphs.map((p) => h("p", {}, p)));
  const button = h("button", { class: "ai-label", type: "button", "aria-expanded": "false", "aria-controls": id, "aria-label": `AI: ${title}` },
    h("span", { class: "vc-tag vc-tag--feature ai-label-chip" }, icon("spark", 14), "AI"));
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (open && open.button === button) { closeOpen(false); return; }
    closeOpen(false);
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.hidden = false;
    const r = button.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    const below = r.bottom + 8 + tip.offsetHeight < window.innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 8 : Math.max(12, r.top - 8 - tip.offsetHeight)}px`;
    button.setAttribute("aria-expanded", "true");
    open = { tip, button };
  });
  return button;
}
