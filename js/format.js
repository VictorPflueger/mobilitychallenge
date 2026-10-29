// Number formats: English digit grouping, one decimal for points (the challenge reports scores to
// a tenth), and a true minus sign, so "−74,022.6" reads as the leaderboard prints it.

const ONE = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ZERO = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const minus = (s) => s.replace("-", "−");

/** A score: −74,022.6 (one decimal). Rounds −0.04 to 0.0, never "−0.0". */
export function score(v) {
  const r = Math.round(v * 10) / 10;
  return minus(ONE.format(r === 0 ? 0 : r));
}

/** Points without a sign: 74,022.6. */
export function points(v) {
  return ONE.format(Math.abs(Math.round(v * 10) / 10));
}

const UPTO2 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

/** An amount in running text, as exact as it is and without a needless ".0": 936, 499.2, 1.75. */
export function amount(v) {
  return UPTO2.format(Math.abs(Math.round(v * 100) / 100));
}

/** A signed difference: +36,360.0 or −4,885.2. */
export function signed(v) {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return "±0.0";
  return r > 0 ? `+${ONE.format(r)}` : minus(ONE.format(r));
}

/** A whole number with grouping: 1,248. */
export function count(n) {
  return minus(ZERO.format(n));
}

/** "1 train", "3 trains". */
export function plural(n, one, many = `${one}s`) {
  return `${count(n)} ${n === 1 ? one : many}`;
}
