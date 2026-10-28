// Python semantics the engine depends on, so that the browser computes bit for bit what the
// challenge's Python code computes (flatland-rl 4.2.2 on CPython 3.13).

/** Python's round() for a float, to the nearest integer, ties to even. */
export function pyRound(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Python's a % n for integers (the result has the sign of n). */
export const pyMod = (a, n) => ((a % n) + n) % n;

/** A number with its Python type: an int (isFloat false) or a float. */
export const int = (v) => ({ v, isFloat: false });
export const float = (v) => ({ v, isFloat: true });

/** a + b with Python's typing: int + int is an int, anything with a float is a float. */
export const add = (a, b) => ({ v: a.v + b.v, isFloat: a.isFloat || b.isFloat });

/**
 * Python 3.13's sum(items) with the default start 0 (Python/bltinmodule.c, builtin_sum_impl):
 * ints are added exactly while every item is an int; the first float is added plainly; every
 * later float goes through Neumaier's compensated summation, later ints are added plainly, and
 * the compensation is added at the end. items: [{ v, isFloat }].
 */
export function pySum(items) {
  let i = 0;
  let iResult = 0;
  for (; i < items.length; i += 1) {
    if (items[i].isFloat) break;
    iResult += items[i].v;
  }
  if (i === items.length) return int(iResult);
  let f = iResult + items[i].v;
  let c = 0.0;
  for (i += 1; i < items.length; i += 1) {
    const it = items[i];
    if (it.isFloat) {
      const x = it.v;
      const t = f + x;
      if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x;
      else c += (x - t) + f;
      f = t;
    } else {
      f += it.v;
    }
  }
  if (c !== 0 && Number.isFinite(c)) f += c;
  return float(f);
}

/**
 * The iteration order of a CPython set of small non-negative ints (Objects/setobject.c: an int
 * hashes to itself, 8 slots to start, linear probing of 9 slots where the table has room, then
 * perturbation, and a resize to the smallest power of two above four times the size once the
 * table is three fifths full). flatland's MotionCheck iterates such a set (its deadlocked trains),
 * and the order decides the order in which their conflicts are resolved.
 */
export class PySmallIntSet {
  constructor() {
    this.table = new Array(8).fill(null);
    this.mask = 7;
    this.used = 0;
  }

  has(key) {
    return this.table.includes(key);
  }

  add(key) {
    if (this.has(key)) return;
    let mask = this.mask;
    let i = key & mask;
    let perturb = key;
    for (;;) {
      const probes = i + 9 <= mask ? 9 : 0;
      for (let j = 0; j <= probes; j += 1) {
        if (this.table[i + j] === null) {
          this.table[i + j] = key;
          this.used += 1;
          if (this.used * 5 >= mask * 3) this.resize(this.used * 4);
          return;
        }
      }
      perturb = Math.floor(perturb / 32);
      i = (i * 5 + 1 + perturb) & mask;
    }
  }

  resize(minUsed) {
    let size = 8;
    while (size <= minUsed) size *= 2;
    const old = this.table;
    this.table = new Array(size).fill(null);
    this.mask = size - 1;
    for (const key of old) if (key !== null) this.insertClean(key);
  }

  insertClean(key) {
    const mask = this.mask;
    let i = key & mask;
    let perturb = key;
    for (;;) {
      if (this.table[i] === null) { this.table[i] = key; return; }
      if (i + 9 <= mask) {
        for (let j = 1; j <= 9; j += 1) {
          if (this.table[i + j] === null) { this.table[i + j] = key; return; }
        }
      }
      perturb = Math.floor(perturb / 32);
      i = (i * 5 + 1 + perturb) & mask;
    }
  }

  /** The keys in CPython's iteration order. */
  values() {
    return this.table.filter((k) => k !== null);
  }
}
