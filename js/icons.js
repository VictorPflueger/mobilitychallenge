// Icons: Vici's icon set, and the app's own drawings for the few things Vici has no icon for yet.
// An icon is a <span class="vc-icon"> that Vici's stylesheet paints as a mask in the current text
// colour, hidden from screen readers. A drawing of the app's own is set as the span's --_icon with
// element.style.setProperty(), which the content security policy allows (no style attribute in the
// markup). The drawings follow Vici's grid: 24 x 24 with 2 px to spare, 1.75 px strokes with round
// caps and joins, hexagons where a shape would be round, chamfered corners (DESIGN.md §11).

/** The app's names for Vici's icons. */
const VICI = {
  play: "play", restart: "refresh", back: "chevron-left", forward: "chevron-right", info: "info",
  close: "close", x: "close", flag: "flag", check: "check", warning: "warning", error: "error", success: "success",
  clock: "clock", chart: "chart-line", spark: "sparkle", globe: "globe-hex", external: "external",
  list: "layers", hub: "honeycomb", pin: "pin", up: "chevron-up", down: "chevron-down", code: "code"
};

/** The app's own drawings (static, trusted strings; never built from data). */
const DRAWN = {
  // Two bars with chamfered ends (pause).
  pause: "<path d='M8 5.5 L9.25 4.5 L10.5 5.5 V18.5 L9.25 19.5 L8 18.5 Z M13.5 5.5 L14.75 4.5 L16 5.5 V18.5 L14.75 19.5 L13.5 18.5 Z'/>",
  // A bar and Vici's chevron: to the first step.
  toStart: "<path d='M6.5 5.5 V18.5'/><path d='M15.75 5.5 L12 12 L15.75 18.5'/>",
  // Vici's chevron and a bar: to the last step.
  toEnd: "<path d='M17.5 5.5 V18.5'/><path d='M8.25 5.5 L12 12 L8.25 18.5'/>",
  // A rail vehicle seen from the front, with chamfered corners and hexagon lamps (a train).
  train: "<path d='M7.5 3.5 H16.5 L18.5 5.5 V16 L16.5 18 H7.5 L5.5 16 V5.5 Z'/><path d='M5.5 11 H18.5'/><path d='M8 18 L6 21 M16 18 L18 21'/><path d='M9.4 14.2 L8.95 14.98 L8.05 14.98 L7.6 14.2 L8.05 13.42 L8.95 13.42 Z M16.4 14.2 L15.95 14.98 L15.05 14.98 L14.6 14.2 L15.05 13.42 L15.95 13.42 Z' fill='black' stroke='none'/>"
};

const masks = new Map();
/** A drawing as the CSS value Vici's .vc-icon masks with: black strokes on a 24 x 24 grid. */
function maskOf(name) {
  if (!masks.has(name)) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>${DRAWN[name]}</svg>`;
    masks.set(name, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  return masks.get(name);
}

/** The names icon() knows: Vici's and the app's own. */
export const ICON_NAMES = [...Object.keys(VICI), ...Object.keys(DRAWN)];

/**
 * A Vici icon, <span class="vc-icon vc-icon--NAME" aria-hidden="true">, or one of the app's own
 * drawings in the same form. size (px) sets its size where no Vici component sizes it. An unknown
 * name draws "info".
 */
export function icon(name, size = 20, cls = "") {
  const span = document.createElement("span");
  const own = Object.hasOwn(DRAWN, name);
  const vici = own ? null : VICI[name] || "info";
  span.className = ["vc-icon", vici ? `vc-icon--${vici}` : "app-icon", cls].filter(Boolean).join(" ");
  span.setAttribute("aria-hidden", "true");
  if (own) span.style.setProperty("--_icon", maskOf(name));
  if (size) span.style.setProperty("--vc-icon-size", `${size}px`);
  return span;
}
