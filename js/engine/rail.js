// The rail grid: transitions, moves, the distance map and shortest paths, ported line by line from
// flatland-rl 4.2.2 (core/grid/grid4.py, envs/rail_grid_transition_map.py, envs/distance_map.py).
// A cell is its index r * width + c; -1 stands for Python's None (not on the map).

import { pyMod } from "./py.js";

export const ACTION = { DO_NOTHING: 0, MOVE_LEFT: 1, MOVE_FORWARD: 2, MOVE_RIGHT: 3, STOP_MOVING: 4 };
const MOVES = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const DEAD_END_MASK = 0b0010000110000100;
const CROSSING = 0b1000010000100001;

export class Rail {
  /** grid: rows of 16-bit cell codes (the scenario file's "grid"). */
  constructor(grid) {
    this.height = grid.length;
    this.width = grid[0].length;
    this.cells = new Uint16Array(this.height * this.width);
    grid.forEach((row, r) => row.forEach((code, c) => { this.cells[r * this.width + c] = code; }));
  }

  index(r, c) { return r * this.width + c; }
  row(cell) { return Math.floor(cell / this.width); }
  col(cell) { return cell % this.width; }

  /** The four bits (N, E, S, W) of the moves a train facing `orientation` in `cell` may make. */
  transitions(cell, orientation) {
    const bits = this.cells[cell] >> ((3 - orientation) * 4);
    return [(bits >> 3) & 1, (bits >> 2) & 1, (bits >> 1) & 1, bits & 1];
  }

  transition(cell, orientation, direction) {
    return ((this.cells[cell] >> ((3 - orientation) * 4)) >> (3 - direction)) & 1;
  }

  fullTransitions(cell) { return this.cells[cell]; }
  isDeadEnd(cell) { return (this.cells[cell] & DEAD_END_MASK) > 0; }
  isCrossing(cell) { return this.cells[cell] === CROSSING; }

  /** get_new_position: the neighbouring cell in `direction` (row and column may leave the grid). */
  step(cell, direction) {
    const [dr, dc] = MOVES[direction];
    return { r: this.row(cell) + dr, c: this.col(cell) + dc };
  }

  inBounds(r, c) { return r >= 0 && c >= 0 && r < this.height && c < this.width; }

  /** The neighbour as a cell index; the move must stay on the grid (the map guarantees it). */
  next(cell, direction) {
    const { r, c } = this.step(cell, direction);
    if (!this.inBounds(r, c)) throw new Error(`move off the grid from cell ${cell} towards ${direction}`);
    return r * this.width + c;
  }

  /**
   * RailGridTransitionMap._check_action_new. `compareActions` false reproduces a call with a plain
   * int in Python: RailEnvActions (a fastenum) never equals an int, so no branch for LEFT or
   * RIGHT is taken. Returns [new direction, transition valid, preprocessed action].
   */
  checkActionNew(action, cell, direction, compareActions = true) {
    const possible = this.transitions(cell, direction);
    const count = possible[0] + possible[1] + possible[2] + possible[3];
    const is = (a) => compareActions && action === a;
    if (count === 1) {
      const newDirection = possible[0] === 1 ? 0 : possible[1] === 1 ? 1 : possible[2] === 1 ? 2 : 3;
      if (is(ACTION.MOVE_LEFT) && newDirection !== pyMod(direction - 1, 4)) return [newDirection, false, ACTION.MOVE_FORWARD];
      if (is(ACTION.MOVE_RIGHT) && newDirection !== pyMod(direction + 1, 4)) return [newDirection, false, ACTION.MOVE_FORWARD];
      return [newDirection, true, action];
    }
    if (is(ACTION.MOVE_LEFT)) {
      const d = pyMod(direction - 1, 4);
      if (possible[d]) return [d, true, ACTION.MOVE_LEFT];
      if (possible[direction]) return [direction, false, ACTION.MOVE_FORWARD];
    } else if (is(ACTION.MOVE_RIGHT)) {
      const d = pyMod(direction + 1, 4);
      if (possible[d]) return [d, true, ACTION.MOVE_RIGHT];
      if (possible[direction]) return [direction, false, ACTION.MOVE_FORWARD];
    } else if (possible[direction]) {
      return [direction, true, action];
    }
    return [direction, false, ACTION.STOP_MOVING];
  }

  /**
   * check_action_on_agent: { position {r, c}, direction, valid, action } for an action taken at
   * (cell, direction). The position may lie off the grid when the action is refused at a switch.
   */
  checkActionOnAgent(action, cell, direction, compareActions = true) {
    const [newDirection, valid, preprocessed] = this.checkActionNew(action, cell, direction, compareActions);
    const position = this.step(cell, newDirection);
    return { position, direction: newDirection, valid, action: preprocessed };
  }

  /** get_valid_move_actions_: [{ action, cell, direction }] in the order left, forward, right. */
  validMoveActions(direction, cell) {
    const possible = this.transitions(cell, direction);
    const count = possible[0] + possible[1] + possible[2] + possible[3];
    if (this.isDeadEnd(cell)) {
      const exit = (direction + 2) % 4;
      return possible[exit] ? [{ action: ACTION.MOVE_FORWARD, cell: this.next(cell, exit), direction: exit }] : [];
    }
    const out = [];
    for (let i = -1; i < 2; i += 1) {
      const d = pyMod(direction + i, 4);
      if (!possible[d]) continue;
      if (count === 1) {
        out.length = 0;
        out.push({ action: ACTION.MOVE_FORWARD, cell: this.next(cell, d), direction: d });
      } else {
        const action = d === direction ? ACTION.MOVE_FORWARD : d === (direction + 1) % 4 ? ACTION.MOVE_RIGHT : ACTION.MOVE_LEFT;
        out.push({ action, cell: this.next(cell, d), direction: d });
      }
    }
    return out;
  }
}

/**
 * DistanceMap._compute for every agent: Float64Array (height * width * 4) of the steps from each
 * cell and orientation to the agent's target, Infinity where the target cannot be reached. Agents
 * with the same target share one map, as in flatland.
 */
export function computeDistanceMaps(rail, targets) {
  const maps = [];
  const byTarget = new Map();
  for (const target of targets) {
    if (!byTarget.has(target)) byTarget.set(target, distanceMapWalker(rail, target));
    maps.push(byTarget.get(target));
  }
  return maps;
}

function distanceMapWalker(rail, target) {
  const { height, width } = rail;
  const dm = new Float64Array(height * width * 4).fill(Infinity);
  const at = (r, c, o) => ((r * width + c) * 4) + o;
  const tr = rail.row(target);
  const tc = rail.col(target);
  for (let o = 0; o < 4; o += 1) dm[at(tr, tc, o)] = 0;

  // _get_and_update_neighbors: neighbours that can move into (r, c) arriving with orientation
  // enforce (or any orientation when enforce < 0), with their distance updated to the minimum.
  const neighbours = (r, c, current, enforce) => {
    const out = [];
    const directions = enforce >= 0 ? [(enforce + 2) % 4] : [0, 1, 2, 3];
    for (const nd of directions) {
      const [dr, dc] = MOVES[nd];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const desired = (nd + 2) % 4;
      const cell = nr * width + nc;
      for (let o = 0; o < 4; o += 1) {
        if (rail.transition(cell, o, desired)) {
          const k = at(nr, nc, o);
          const d = Math.min(dm[k], current + 1);
          out.push([nr, nc, o, d]);
          dm[k] = d;
        }
      }
    }
    return out;
  };

  const queue = neighbours(tr, tc, 0, -1);
  const visited = new Uint8Array(height * width * 4);
  for (let o = 0; o < 4; o += 1) visited[at(tr, tc, o)] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const [r, c, o, d] = queue[head];
    const k = at(r, c, o);
    if (visited[k]) continue;
    visited[k] = 1;
    for (const n of neighbours(r, c, d, o)) queue.push(n);
  }
  return dm;
}

/** The distance-map value of (cell, direction) for an agent's map. */
export const distanceAt = (dm, cell, direction) => dm[cell * 4 + direction];

/**
 * DistanceMap.get_shortest_paths for one agent: the number of waypoints on the path from
 * (cell, direction) to the target, or null when the rail is disconnected. Note that the best
 * distance found so far carries over from step to step, as in flatland.
 */
export function shortestPathLength(rail, dm, cell, direction, target) {
  let length = 0;
  let distance = Infinity;
  while (cell !== target) {
    let best = null;
    for (const next of rail.validMoveActions(direction, cell)) {
      const d = distanceAt(dm, next.cell, next.direction);
      if (d < distance) { best = next; distance = d; }
    }
    length += 1;
    if (best === null) return null;
    cell = best.cell;
    direction = best.direction;
  }
  return length + 1;
}
