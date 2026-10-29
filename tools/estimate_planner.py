"""The estimate of the leaderboard's current best (-37,374): routes booked, stops skipped.

The leaderboard entry's code is not public. This is Claude's reconstruction of the kind of solution
that lands in that range: it solves the first half of the challenge, getting every train through
the network without two trains ever claiming the same track, and ignores the second half, stopping
at the stations.

  1. Route: each train's route runs through a platform of each of its timetabled stops, in order,
     then to its destination, the shortest way (breadth-first search over cells and directions).
     The train drives through those platforms without stopping, so no stop counts as served.
  2. Booking: trains are planned one after another, in the order of their earliest departure. A
     train enters the network only at a step from which its whole route is free: no cell (or level
     of a level-free crossing) on it is booked by another train within one step of the time this
     train needs it. Until then it waits at its entry, off the map.
  3. Driving: once in, a train runs at its full speed to its destination and never waits again.
     Nobody else is ever in its way, so it is never held back, and nothing can jam.

On neufrankfurt_19agents every train arrives, none is ever held back, and the score is -32,488.8:
59 stops not served (59 x 499.2 = 29,452.8) and 3,036 steps late at the destinations, because trains
wait up to 761 steps at their entry for a free route. tools/check_estimate.py checks all of this
through the official runner; the page replays the actions this planner gives
(data/estimate_actions.json).

The planner only reads the environment; it changes nothing in it. The runner (run_episode) calls
act() once per train that is not done, in handle order, so the handle follows from the call order.
"""
from collections import deque

from flatland.envs.rail_env_action import RailEnvActions

DO_NOTHING = 0
MOVES = (RailEnvActions.MOVE_FORWARD, RailEnvActions.MOVE_LEFT, RailEnvActions.MOVE_RIGHT)


class EstimatePlanner:
    def __init__(self, env):
        self.env = env
        self.plan = None  # plan[t][i]: the action for train i at step t
        self.info = {}  # per train: route, entry and arrival steps, or None if it never fits
        self.t = None
        self.queue = []

    # ---- routes ----------------------------------------------------------------------------------
    def _next_states(self, state):
        cell, d = state
        for nxt in self.env.rail.get_valid_move_actions_(d, cell):
            yield (nxt.next_position, nxt.next_direction)

    def _walk(self, start, goals, avoid):
        """Shortest walk from state start to any state in goals, never entering a cell in avoid."""
        prev = {start: None}
        queue = deque([start])
        while queue:
            state = queue.popleft()
            if state in goals and state != start:
                walk = [state]
                while prev[walk[-1]] is not None:
                    walk.append(prev[walk[-1]])
                return walk[::-1]
            for nxt in self._next_states(state):
                if nxt not in prev and nxt[0] not in avoid:
                    prev[nxt] = state
                    queue.append(nxt)
        return None

    def route(self, i):
        """[(cell, direction), ...] from the train's entry through each stop to its destination.

        The route never passes the destination early (a train that reaches it is done) and never
        visits a cell in the same direction twice (the reward function rejects that). If the route
        through the stops cannot meet both, the train takes the shortest way to its destination.
        """
        a = self.env.agents[i]
        state = (a.initial_position, a.initial_direction)
        target = a.target
        route = [state]
        for alternatives in a.waypoints[1:-1]:
            goals = {(w.position, w.direction) for w in alternatives}
            leg = self._walk(state, goals, avoid={target})
            if leg is None:
                route = None
                break
            route.extend(leg[1:])
            state = leg[-1]
        if route is not None:
            last = self._walk(state, {(target, d) for d in range(4)}, avoid=set())
            route = route + last[1:] if last else None
        if route is None or len(set(route)) != len(route):
            start = (a.initial_position, a.initial_direction)
            last = self._walk(start, {(target, d) for d in range(4)}, avoid=set())
            route = last
        return route

    def _action(self, state, next_cell):
        """The move action that takes a train in state to next_cell."""
        for action in MOVES:
            _, (position, _), _, preprocessed = self.env.rail.check_action_on_agent(action, state)
            if position == next_cell and preprocessed in MOVES:
                return action.value
        raise RuntimeError(f"no action leads from {state} to {next_cell}")

    def _resource(self, state):
        cell, d = state
        return (cell, d % 2) if cell in self.env.level_free_positions else cell

    # ---- booking -----------------------------------------------------------------------------------
    def make_plan(self):
        env = self.env
        n = len(env.agents)
        horizon = env._max_episode_steps
        booked = {}  # resource -> [(first step, last step)] it is held at the end of a step
        plan = [[DO_NOTHING] * n for _ in range(horizon + 1)]
        order = sorted(range(n), key=lambda i: (env.agents[i].earliest_departure, i))
        for i in order:
            a = env.agents[i]
            route = self.route(i)
            if route is None:
                self.info[i] = None
                continue
            per = int(round(1 / a.speed_counter.max_speed))  # steps per cell at full speed
            k = len(route) - 1
            resources = [self._resource(s) for s in route]

            def holds(enter):
                # cell j from the end of step enter + per * j for per steps; the destination for the
                # one step the train arrives (it then leaves the map)
                for j in range(k):
                    yield resources[j], enter + per * j, enter + per * j + per - 1
                yield resources[k], enter + per * k, enter + per * k

            def free(enter):
                # one free step between two trains in the same cell: entering a cell that another
                # train held at the end of the step before, or leaving one that another enters,
                # could be refused by the motion check
                for r, first, last in holds(enter):
                    for f2, l2 in booked.get(r, ()):
                        if first <= l2 + 1 and f2 <= last + 1:
                            return False
                return True

            # waiting -> ready at the earliest departure, entering the map the step after
            enter = max(a.earliest_departure, 1) + 1
            while enter + per * k < horizon and not free(enter):
                enter += 1
            if enter + per * k >= horizon:
                self.info[i] = None
                continue
            for r, first, last in holds(enter):
                booked.setdefault(r, []).append((first, last))
            actions = [self._action(route[j], route[j + 1][0]) for j in range(k)]
            # the entering step takes the first cell's move; afterwards the action of step t is the
            # move out of the cell the train stands in when step t begins
            plan[enter][i] = actions[0]
            for j in range(k):
                for t in range(enter + per * j + 1, enter + per * (j + 1) + 1):
                    plan[t][i] = actions[j]
            self.info[i] = {'route': route, 'enter': enter, 'arrive': enter + per * k, 'per': per}
        self.plan = plan
        return plan

    def position(self, i, t):
        """Where train i stands at the end of step t by the plan: a cell, or None off the map."""
        info = self.info.get(i)
        if not info or t < info['enter'] or t >= info['arrive']:
            return None
        return info['route'][(t - info['enter']) // info['per']][0]

    # ---- the runner's interface ----------------------------------------------------------------
    def act(self, obs):
        env = self.env
        if self.plan is None:
            self.make_plan()
        t = env._elapsed_steps + 1  # the step these actions are for
        if t != self.t:
            self.t = t
            self.queue = [i for i in range(len(env.agents)) if not env.dones[i]]
        i = self.queue.pop(0)
        return self.plan[t][i] if t < len(self.plan) else DO_NOTHING
