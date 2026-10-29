// The stops of a run that the challenge's reward function books in Python's hash order, grouped the
// way one interpreter books them, and the scores the run can have (TECH_NOTES.md, 4c).
//
// A stop a train reached on two or more of the platforms listed for it is booked at the first element
// of set(listed) & set(arrivals), an order the interpreter's hash seed sets. CPython builds that
// intersection by walking the smaller set, here the call's listed platforms (tools/export_fixtures.py
// asserts it for every such stop), and adds the matches to the result in that order. So one
// interpreter books alike every stop whose call lists the same platforms in the same order and whose
// train stood on the same ones: such a group is booked as one, at one of its platforms, and the run
// can score one score per choice of platform per group. The bookings come from
// data/<map>/reference.json (runs.<run>.bookings), the listed platforms from the scenario.
//
// The functions sit on one object, so that tests/engine-negctl.mjs can plant a wrong grouping.

const same = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];

/** What booking stop b at platform p adds to the score, as the record gives it. */
const valueAt = (b, p) => b.options.find((o) => same(o.platform, p)).value;

export const hashOrder = {
  /** What one interpreter books alike: the call's listed platforms, in order, and those the train stood on. */
  key(b, scenario) {
    const listed = scenario.agents[b.agent].waypoints[b.stop].map((w) => `${w.cell}:${w.dir}`).join(" ");
    const stood = b.options.map((o) => o.platform.join(",")).join(" ");
    return `${listed} | ${stood}`;
  },

  /**
   * The run's recorded bookings in groups booked as one: { members, platforms, booked, consistent,
   * choices: [{ platform, change }] }, where change is what booking every stop of the group at that
   * platform changes in the run's score. consistent: the run booked all of them at one platform, as
   * one interpreter does.
   */
  groups(bookings, scenario) {
    const byKey = new Map();
    for (const b of bookings) {
      const k = hashOrder.key(b, scenario);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(b);
    }
    return [...byKey.values()].map((members) => {
      const platforms = members[0].options.map((o) => o.platform);
      const booked = members[0].booked;
      return {
        members,
        platforms,
        booked,
        consistent: members.every((b) => same(b.booked, booked)),
        choices: platforms.map((p) => ({ platform: p, change: members.reduce((s, b) => s + valueAt(b, p) - valueAt(b, b.booked), 0) }))
      };
    });
  },

  /** The scores the run can have, one per choice of platform per group, lowest first. */
  scores(score, groups) {
    let all = [score];
    for (const g of groups) all = all.flatMap((s) => g.choices.map((c) => s + c.change));
    return [...new Set(all)].sort((x, y) => x - y);
  }
};

export const samePlatform = same;
