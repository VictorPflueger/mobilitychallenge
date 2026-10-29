// Where the map draws a train between steps. Flatland keeps a train in one cell until it has
// covered the whole cell: an S-Bahn, at half a cell per step, takes two steps per cell, and a train
// moving off covers 0.3 and then 0.6 of a cell before it leaves its first one. Moved only in the
// step it changes cells, such a train would glide for one step and halt for the next, though it
// never stops. So the map draws a train at the centre of its cell in every step it stands, at the
// centre of every cell it enters at a steady speed and passes through without halting, and where
// it enters and leaves the map; on the way from one of these rest points to the next it moves in
// proportion to the distance Flatland's speed counter covers in each step, never more than a cell
// in a step. A train glides at its own speed, slows into a stop and speeds up out of one, and
// stands still at the centre of its cell whenever the engine has it standing. It is drawn moving
// whenever the engine moves it, except while it inches forward inside one cell between two halts
// (or between entering the map and a halt there): it never leaves that cell, and is drawn
// standing.

import { STATE } from "./engine/env.js";

/**
 * The trains' paths as the map draws them, from simulate()'s record (frames) of a run of `steps`
 * steps: for every train the cells it passes, in order and with its destination last once it has
 * arrived (routes[i]), and for every step its place along them (at[step * n + i]: k + f is f of the
 * way from the k-th cell's centre to the next one's; NaN while it is not on the map).
 */
export function trainPaths(frames, steps, agents) {
  const n = frames.n;
  const at = new Float64Array((steps + 1) * n).fill(NaN);
  const routes = [];
  const index = new Int32Array(steps + 1); // the train's place in its route at each step, -1 off the map
  const covered = new Float64Array(steps + 1); // the distance it has covered up to each step, in cells
  const MOVING = STATE.MOVING;
  for (let i = 0; i < n; i += 1) {
    const route = [];
    index.fill(-1);
    let distance = 0;
    for (let t = 0; t <= steps; t += 1) {
      const o = t * n + i;
      const pos = frames.pos[o];
      const prev = t > 0 ? frames.pos[o - n] : -1;
      const arrives = pos < 0 && prev >= 0 && frames.state[o] === STATE.DONE;
      if (prev >= 0 && ((pos >= 0 && frames.state[o] === MOVING) || arrives)) distance += frames.speed[o];
      covered[t] = distance;
      if (pos >= 0) {
        if (pos !== prev) route.push(pos);
        index[t] = route.length - 1;
      } else if (arrives) {
        route.push(agents[i].target); // it reaches its destination in this step and leaves the map
        index[t] = route.length - 1;
      }
    }
    routes.push(Int32Array.from(route));

    // Rest points, in order: [step, place, step, place, …].
    const rests = [];
    for (let t = 0; t <= steps; t += 1) {
      if (index[t] < 0) continue;
      const o = t * n + i;
      const pos = frames.pos[o];
      const prev = t > 0 ? frames.pos[o - n] : -1;
      // Arriving, entering the map, standing.
      if (pos < 0 || prev < 0 || frames.state[o] !== MOVING) { rests.push(t, index[t]); continue; }
      if (pos === prev) continue;
      // Entering a cell at the speed of the step before (not speeding up or braking), and going
      // through it without a halt.
      if (frames.state[o - n] !== MOVING || Math.abs(frames.speed[o] - frames.speed[o - n]) > 1e-6) continue;
      let halts = false;
      for (let u = t + 1; u <= steps && frames.pos[u * n + i] === pos; u += 1) {
        if (frames.state[u * n + i] !== MOVING) { halts = true; break; }
      }
      if (!halts) rests.push(t, index[t]);
    }

    // From each rest point to the next, in proportion to the distance covered in each step.
    for (let k = 0; k < rests.length; k += 2) {
      const t1 = rests[k];
      const p1 = rests[k + 1];
      at[t1 * n + i] = p1;
      if (k + 2 < rests.length) {
        const t2 = rests[k + 2];
        const p2 = rests[k + 3];
        if (p2 === p1) {
          for (let t = t1 + 1; t < t2; t += 1) at[t * n + i] = p1;
          continue;
        }
        const shares = spread(Array.from({ length: t2 - t1 }, (_, j) => covered[t1 + j + 1] - covered[t1 + j]), p2 - p1);
        let place = p1;
        for (let t = t1 + 1; t < t2; t += 1) {
          place += shares[t - t1 - 1];
          at[t * n + i] = place;
        }
      } else {
        // The run ends while the train is still on its way through this cell.
        for (let t = t1 + 1; t <= steps && index[t] >= 0; t += 1) at[t * n + i] = p1 + Math.min(0.99, covered[t] - covered[t1]);
      }
    }
  }
  return { n, steps, at, routes };
}

/**
 * How far to draw a train in each step of a stretch between two rest points `cells` cells apart:
 * in proportion to the distance it covers in each step, but never more than a cell in one step,
 * as no train is faster. A rest point at a cell's centre can lie behind where the speed counter
 * has the train (one that inched to the end of its cell), so a short hop between two halts can be
 * longer drawn than run; the steps that would exceed a cell keep one and the others share the rest.
 * Every cell changed takes a step, so the stretch has at least `cells` steps that move.
 */
function spread(distances, cells) {
  const shares = distances.map(() => 0);
  let open = distances.map((_, j) => j).filter((j) => distances[j] > 0);
  let left = cells;
  while (open.length) {
    const sum = open.reduce((s, j) => s + distances[j], 0);
    const scale = left / sum;
    const capped = open.filter((j) => distances[j] * scale > 1);
    if (!capped.length) {
      for (const j of open) shares[j] = distances[j] * scale;
      break;
    }
    for (const j of capped) shares[j] = 1;
    left -= capped.length;
    open = open.filter((j) => distances[j] * scale <= 1);
  }
  return shares;
}

/**
 * The point (x, y), in cell units, where the map draws train i at step t, between two steps when t
 * has a fraction; null when the train is not on the map at step ⌊t⌋.
 */
export function trainPoint(paths, rail, i, t) {
  const { n, steps, at, routes } = paths;
  const s = Math.max(0, Math.min(Math.floor(t), steps));
  let place = at[s * n + i];
  if (Number.isNaN(place)) return null;
  const f = t - s;
  if (f > 0 && s < steps) {
    const next = at[(s + 1) * n + i];
    if (!Number.isNaN(next)) place += (next - place) * f;
  }
  const route = routes[i];
  const k = Math.min(Math.floor(place), route.length - 1);
  const x = rail.col(route[k]) + 0.5;
  const y = rail.row(route[k]) + 0.5;
  const g = place - k;
  if (g <= 0 || k + 1 >= route.length) return [x, y];
  return [x + (rail.col(route[k + 1]) + 0.5 - x) * g, y + (rail.row(route[k + 1]) + 0.5 - y) * g];
}
