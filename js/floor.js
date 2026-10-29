// The best score any dispatcher can reach on the scenario, bounded from below: for each train, the
// earliest step it can be at a platform of each of its timetabled stops and at its destination, on
// empty track, at full speed and without halting (a breadth-first search from its start over cells
// and directions, never through its destination). A train is on the map at the earliest at step
// max(earliest departure, 1) + 1 and moves at most one cell every 1 / speed steps; halting, detours
// and other trains only add time, and a train that never arrives pays more than a late one.
// A stop reached L steps late costs at least 0.5 × L (or the lost stop's 499.2 on Neu-Frankfurt, 684
// on Köln, if that is less), a destination L steps late costs L. tools/score_floor.py computes the
// same with flatland's own rail (tests/fixtures/<map>/rules.json), and tests/guide.mjs holds the two
// together.

/**
 * Why trains have a floor above zero, in two groups: { atTarget, slow }. atTarget: trains whose
 * first cell is their destination (Köln's S-Bahn loops); Flatland finishes such a train the moment
 * it enters, so none of its stops can be served. slow: the others with a floor, too slow for their
 * own timetables even on empty track. Each group: { trains: [handles], points, stops }.
 */
export function floorReasons(scenario, floor) {
  const atTarget = { trains: [], points: 0, stops: 0 };
  const slow = { trains: [], points: 0 };
  scenario.agents.forEach((a, i) => {
    const least = floor.perTrain[i];
    if (!(least > 0)) return;
    if (a.initialPos === a.target) {
      atTarget.trains.push(i);
      atTarget.points += least;
      atTarget.stops += a.waypoints.length - 2;
    } else {
      slow.trains.push(i);
      slow.points += least;
    }
  });
  return { atTarget, slow };
}

/** { perTrain: [least penalty per train], total }: no score can be better than −total. */
export function scoreFloor(scenario, penalty) {
  const rail = scenario.rail;
  const perTrain = scenario.agents.map((a) => {
    const moves = new Map(); // cell * 4 + direction → fewest moves from the start
    const start = a.initialPos * 4 + a.initialDir;
    moves.set(start, 0);
    let frontier = [start];
    for (let d = 1; frontier.length; d += 1) {
      const next = [];
      for (const s of frontier) {
        const cell = s >> 2;
        if (cell === a.target) continue; // the trip ends here
        const t = rail.transitions(cell, s & 3);
        for (let dir = 0; dir < 4; dir += 1) {
          if (!t[dir]) continue;
          const n = rail.next(cell, dir) * 4 + dir;
          if (moves.has(n)) continue;
          moves.set(n, d);
          next.push(n);
        }
      }
      frontier = next;
    }
    const perCell = Math.round(1 / a.maxSpeed);
    const enter = Math.max(a.earliestDeparture, 1) + 1;
    let least = 0;
    for (let k = 1; k < a.waypoints.length - 1; k += 1) {
      const fewest = Math.min(...a.waypoints[k].map((w) => moves.get(w.cell * 4 + w.dir) ?? Infinity));
      const late = Math.max(0, enter + perCell * fewest - a.wpLa[k]);
      least += Math.min(penalty.notServed, penalty.lateArrival * late);
    }
    const toTarget = Math.min(...[0, 1, 2, 3].map((dir) => moves.get(a.target * 4 + dir) ?? Infinity));
    if (toTarget === Infinity) throw new Error(`train ${a.handle} cannot reach its destination`);
    return least + Math.max(0, enter + perCell * toTarget - a.latestArrival);
  });
  return { perTrain, total: perTrain.reduce((s, v) => s + v, 0) };
}
