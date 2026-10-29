"""The best score any dispatcher can reach on a map, bounded from below with flatland's own rail.

For each train: the earliest step it can be at a platform of each of its timetabled stops, and at
its destination, on empty track, at full speed and without halting. A breadth-first search from its
start over (cell, direction) counts the fewest moves; the trip ends at the destination, so the
search never passes through it. A train is on the map at the earliest at step
max(earliest departure, 1) + 1 and moves at most one cell every 1 / speed steps (flatland's speed
counter: an S-Bahn at speed 0.5 needs two steps per cell). Halting, detours and other trains only
add time, and a train that never arrives or never sets off pays more than a late one.

Each stop that the train reaches L steps after its latest arrival costs at least
0.5 x L (intermediate_late_arrival_penalty_factor), or the lost stop's penalty (499.2 on
neufrankfurt_19agents, 684 on kk_36agents) if that is less; the destination L steps late costs L.
The sum over all trains bounds every dispatcher's penalty from below: no score on the map can be
better than minus that sum.

On neufrankfurt_19agents only the two S-Bahns of the airport loop (S_FF_Hbf_FF_1 and _2) are bound
to be late: 217 cells at two steps each take them past every latest arrival on their way, and each
loses at least 472 points, so no dispatcher can score better than -944.

On kk_36agents (Köln) the six S-Bahn loops (S_clock_1-3, S_counter_1-3) start on the cell that is
their destination. The search above never leaves a train's destination, so none of their stops is
reachable here, and that is flatland's behaviour too: a train placed on its destination is done in
the step it enters, every stop lost (6 x 684 points each). With six more trains that are too slow
for their timetables, no dispatcher can score better than -25,010.5 there.

export_fixtures.py writes the result to tests/fixtures/<map>/rules.json (with the penalties it uses),
and checks there that the timing assumptions above hold in every recorded run; js/floor.js computes
the same in the browser, and tests/guide.mjs compares the two.
"""
from collections import deque

INF = float('inf')


def train_floor(env, agent, penalties):
    """The least penalty this train can get, whatever the dispatcher does."""
    from flatland.core.grid.grid4_utils import get_new_position

    start = (tuple(agent.initial_position), int(agent.initial_direction))
    target = tuple(agent.target)
    moves = {start: 0}
    queue = deque([start])
    while queue:
        pos, direction = queue.popleft()
        if pos == target:
            continue  # the trip ends here
        transitions = env.rail.get_transitions((pos, direction))
        for new_direction in range(4):
            if not transitions[new_direction]:
                continue
            state = (tuple(get_new_position(pos, new_direction)), new_direction)
            if state not in moves:
                moves[state] = moves[(pos, direction)] + 1
                queue.append(state)

    steps_per_cell = round(1 / agent.speed_counter.max_speed)
    enter = max(agent.earliest_departure, 1) + 1
    floor = 0
    for alternatives, latest in zip(agent.waypoints[1:-1], agent.waypoints_latest_arrival[1:-1]):
        fewest = min(moves.get((tuple(w.position), int(w.direction)), INF) for w in alternatives)
        late = max(0, enter + steps_per_cell * fewest - latest)
        floor += min(penalties['intermediate_not_served_penalty'],
                     penalties['intermediate_late_arrival_penalty_factor'] * late)
    to_target = min(moves.get((target, d), INF) for d in range(4))
    assert to_target < INF, f'train {agent.handle} cannot reach its destination'
    floor += max(0, enter + steps_per_cell * to_target - agent.latest_arrival)
    return floor


def score_floor(env, penalties):
    """Per train, the least penalty it can get; env must be reset (its agents set up)."""
    return [train_floor(env, agent, penalties) for agent in env.agents]


def timing_holds(env, trace):
    """The assumptions above in a recorded run (rows of positions, as export_fixtures.py records
    them): no train on the map before max(earliest departure, 1) + 1, and no train in a new cell
    sooner than 1 / speed steps after its last move. Returns the violations (empty if none)."""
    rows = trace
    problems = []
    for agent in env.agents:
        i = agent.handle
        steps_per_cell = round(1 / agent.speed_counter.max_speed)
        last_step, last_pos = None, None
        for t, row in enumerate(rows):
            pos = row['pos'][i]
            if pos is None:
                continue
            pos = tuple(pos)
            if last_pos is None:
                if t < max(agent.earliest_departure, 1) + 1:
                    problems.append(f'train {i} on the map at step {t}')
                last_step, last_pos = t, pos
            elif pos != last_pos:
                if t - last_step < steps_per_cell:
                    problems.append(f'train {i} moved {t - last_step} step(s) after its last move, at step {t}')
                last_step, last_pos = t, pos
    return problems
