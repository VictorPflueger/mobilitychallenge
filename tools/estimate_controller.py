"""The estimate of the leaderboard's current best (-37,374): a rule-based controller.

The leaderboard entry's code is not public. This is a reconstruction of the kind of controller that
lands in that range: the challenge's OrderedController plus three rules a team would add one by one.

  1. Routing: the baseline's choice (the tree observation's shortest branch to the final target).
  2. No collisions: brake (STOP_MOVING) when the cell the action leads into is occupied by a train.
  3. Timetable stops: when the train stands on a platform of its NEXT timetabled stop, brake until
     it is STOPPED there.
  4. No early departure: stay until the stop's earliest departure, then continue.

On neufrankfurt_19agents it scores -36,576.6 through the official runner, 797.4 points (2.1 %) from -37,374.
It is the Python reference of js/controllers/estimate.js; tests/engine.mjs checks the port against
the trace this file produces (tools/export_fixtures.py).

The controller only reads the environment; it changes nothing in it. act() receives the tree
observation of the train it is asked about. The runner (run_episode) calls act() once per train
that is not done, in handle order, so the handle follows from the call order.
"""
import numpy as np
from flatland.envs.observations import TreeObsForRailEnv
from flatland.envs.step_utils.states import TrainState

STOP = 4


def baseline_action(obs):
    """OrderedController.act, verbatim in effect: the branch with the smallest distance to target."""
    distance = []
    for direction in TreeObsForRailEnv.tree_explored_actions_char:
        try:
            distance.append(obs.childs[direction].dist_min_to_target)
        except Exception:
            distance.append(np.inf)
    distance = np.array(distance)
    best = np.inf
    for idx in range(len(distance) - 1, -1, -1):  # min_gt(distance, 0)
        if distance[idx] >= 0 and distance[idx] < best:
            best = distance[idx]
    candidates = np.where(distance == best)[0]
    return int((candidates[-1] if len(candidates) > 1 else candidates[0]) + 1)


class EstimateController:
    def __init__(self, env):
        self.env = env
        self.next_stop = {}   # handle -> index of the next timetabled stop in agent.waypoints
        self._t = None
        self._queue = []
        self._idx = 0

    def _handle(self):
        env = self.env
        if env._elapsed_steps != self._t:
            self._t = env._elapsed_steps
            self._queue = [a for a in range(env.get_num_agents()) if not env.dones[a]]
            self._idx = 0
        h = self._queue[self._idx]
        self._idx += 1
        return h

    def act(self, obs):
        env = self.env
        h = self._handle()
        ag = env.agents[h]

        # Rules 3 and 4: hold at the next timetabled stop until stopped and its departure time.
        k = self.next_stop.setdefault(h, 1)
        if ag.position is not None and k < len(ag.waypoints) - 1:
            on_platform = any(w.position == ag.position and w.direction == ag.direction for w in ag.waypoints[k])
            if on_platform:
                if ag.state == TrainState.STOPPED and env._elapsed_steps >= ag.waypoints_earliest_departure[k]:
                    self.next_stop[h] = k + 1
                else:
                    return STOP

        # Rule 1: the baseline's routing.
        action = baseline_action(obs)

        # Rule 2: never drive into an occupied cell.
        on_map = ag.position is not None
        pos = ag.position if on_map else ag.initial_position
        direction = ag.direction if on_map else ag.initial_direction
        _, (next_pos, _), _, _ = env.rail.check_action_on_agent(action, (pos, direction))
        enters = next_pos if on_map else pos
        if any(o.handle != h and o.position is not None and o.position == enters for o in env.agents):
            return STOP
        return action
