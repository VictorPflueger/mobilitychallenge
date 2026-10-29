"""Reference traces from the official Python environment, for the browser engine's parity test.

Runs each of the three controllers through the challenge's own runner (run_episode in
src/tbrain-simulation.py, rendering off) on data/maps/neufrankfurt_19agents.json and records, for
every step, the actions handed to env.step and the full state of every train afterwards: position,
direction, state, speed, distance travelled in the cell, the step's reward and the done flag. It
also records the distance map's digest, and every term of every reward (Decomposer below: a crash,
a delay at the target, a stop not served, ...), so tests/engine.mjs can compare the browser engine,
and the score breakdown the page shows, with flatland number for number.

  baseline   OrderedController, the challenge's default (tree observation, depth 2)
  estimate   tools/estimate_planner.py, the estimate of the current best (routes booked, stops
             skipped), run live; its actions must equal data/estimate_actions.json, which the page
             replays (tools/check_estimate.py writes that file and checks the run)
  optimized  the actions in data/planner_actions.json (PlannerController's plan, see check_plan.py),
             replayed by a controller that never sees the environment

It also writes tests/fixtures/rules.json: the penalties as the challenge's own code scales them, and
the floor no dispatcher can beat (tools/score_floor.py), after checking the timing that floor assumes
in all three runs.

Usage, from this folder, with the challenge repository's Python (flatland-rl 4.2.2):
  <repo>/.venv/bin/python tools/export_fixtures.py --repo <repo>           write tests/fixtures/
  <repo>/.venv/bin/python tools/export_fixtures.py --repo <repo> --check   rebuild and compare
The env.step and reward wrappers below are test harness only: they record, they change nothing.
"""
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import logging
import os
import sys
import warnings

warnings.filterwarnings('ignore')
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
MAP = 'data/maps/neufrankfurt_19agents.json'
SCENARIOS = ('baseline', 'estimate', 'optimized')


def load_runner(repo):
    sys.path.insert(0, os.path.join(repo, 'src'))
    sys.path.insert(0, HERE)
    os.chdir(repo)
    spec = importlib.util.spec_from_file_location('tbsim', os.path.join(repo, 'src', 'tbrain-simulation.py'))
    tbsim = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tbsim)
    logging.getLogger().setLevel(logging.WARNING)
    for name in list(logging.root.manager.loggerDict):
        logging.getLogger(name).setLevel(logging.WARNING)
    return tbsim


class Replay:
    """Returns the recorded actions; never sees the environment (the handle follows the call order)."""

    def __init__(self, steps):
        self.steps = steps
        self.t = -1
        self.calls = 0
        self.queue = []

    def bind(self, recorder):
        self.recorder = recorder

    def act(self, obs):
        t = self.recorder.t
        if t != self.t:
            self.t = t
            self.queue = list(self.recorder.not_done)
        h = self.queue.pop(0)
        self.calls += 1
        return self.steps[t][h]


class Recorder:
    """Wraps env.step on the instance: records the actions and the state after each step."""

    def __init__(self, env):
        self.env = env
        self.inner = env.step
        self.actions, self.trace = [], []
        self.t = 0
        self.not_done = []
        env.step = self.step

    def snapshot(self, rewards, dones):
        env = self.env
        row = {'pos': [], 'dir': [], 'state': [], 'speed': [], 'dist': [], 'rew': [], 'done': []}
        for a in env.agents:
            row['pos'].append([int(a.position[0]), int(a.position[1])] if a.position is not None else None)
            row['dir'].append(None if a.direction is None else int(a.direction))
            row['state'].append(int(a.state))
            row['speed'].append(float(a.speed_counter.speed))
            row['dist'].append(float(a.speed_counter.distance))
            row['rew'].append(float(rewards[a.handle]) if rewards is not None else 0.0)
            row['done'].append(bool(dones[a.handle]))
        return row

    def step(self, action_dict):
        acts = [int(action_dict[a].value) for a in range(len(self.env.agents))]
        self.actions.append(acts)
        obs, rewards, dones, info = self.inner(action_dict)
        self.trace.append(self.snapshot(rewards, dones))
        self.t += 1
        self.not_done = [a for a in range(len(self.env.agents)) if not dones[a]]
        return obs, rewards, dones, info


class Decomposer:
    """Splits every reward the challenge's reward function (src/rewards_fix.py) hands out into its
    terms, for the page's breakdown of the score: a crash, the target's delay, a cancellation, a
    train still on the map at the end, and per intermediate stop not reached, passed without
    stopping, late or early. It wraps the two methods on the instance and mirrors their arithmetic
    term by term; every call asserts that the terms add up to exactly what the method returned, so
    the mirror cannot drift from the real function. Like Recorder, it changes nothing."""

    def __init__(self, env):
        from flatland.envs.step_utils.states import TrainState
        self.TrainState = TrainState
        self.rw = env.rewards
        self.entries = []
        self.inner_step = self.rw.step_reward
        self.inner_done = self.rw._agent_done_or_max_episode_steps_reward
        self.rw.step_reward = self.step_reward
        self.rw._agent_done_or_max_episode_steps_reward = self.done_reward

    def note(self, step, agent, kind, value, stop=None):
        self.entries.append([int(step), int(agent.handle), kind, value, stop])

    def step_reward(self, agent, agent_transition_data, distance_map, elapsed_steps):
        before = len(self.entries)
        reward = self.inner_step(agent, agent_transition_data, distance_map, elapsed_steps)
        TS, rw = self.TrainState, self.rw
        crash = None
        if agent.state_machine.previous_state == TS.MOVING and agent.state == TS.STOPPED \
                and not agent_transition_data.state_transition_signal.stop_action_given:
            crash = -1 * agent_transition_data.speed * rw.crash_penalty_factor
            # the crash is booked before the arrival terms, as in the method
            self.entries.insert(before, [int(elapsed_steps), int(agent.handle), 'collision', crash, None])
        done_terms = self.entries[before + (crash is not None):]
        expected = 0
        if crash is not None:
            expected += crash
        if done_terms:
            expected += self.last_done
        assert expected == reward and type(expected) is type(reward), ('step_reward', agent.handle, elapsed_steps, expected, reward)
        return reward

    def done_reward(self, agent, distance_map, elapsed_steps):
        reward = self.inner_done(agent, distance_map, elapsed_steps)
        TS, rw = self.TrainState, self.rw
        terms = []
        total = 0
        if agent.state == TS.DONE:
            total = min(agent.latest_arrival - agent.arrival_time, 0)
            terms.append(('target_late', total, None))
        else:
            if agent.state.is_off_map_state():
                total = -1 * rw.cancellation_factor * (agent.get_travel_time_on_shortest_path(distance_map) + rw.cancellation_time_buffer)
                terms.append(('cancelled', total, None))
            if agent.state.is_on_map_state():
                total = agent.get_current_delay(elapsed_steps, distance_map)
                terms.append(('not_arrived', total, None))
        stops = zip(agent.waypoints[1:-1], agent.waypoints_latest_arrival[1:-1], agent.waypoints_earliest_departure[1:-1])
        for k, (alternatives, la, ed) in enumerate(stops, start=1):
            reached = set(alternatives).intersection(set(rw.arrivals[agent.handle]))
            if len(reached) == 0 or TS.STOPPED not in rw.states[agent.handle][list(reached)[0]]:
                term = -1 * rw.intermediate_not_served_penalty
                total += term
                terms.append(('stop_missed' if len(reached) == 0 else 'stop_passed', term, k))
            else:
                wp = list(reached)[0]
                term = rw.intermediate_late_arrival_penalty_factor * min(la - rw.arrivals[agent.handle][wp], 0)
                total += term
                terms.append(('stop_late', term, k))
                if wp in rw.departures[agent.handle]:
                    term = rw.intermediate_early_departure_penalty_factor * min(rw.departures[agent.handle][wp] - ed, 0)
                    total += term
                    terms.append(('stop_early', term, k))
        assert total == reward and type(total) is type(reward), ('done_reward', agent.handle, elapsed_steps, total, reward)
        for kind, value, k in terms:
            self.note(elapsed_steps, agent, kind, float(value) if isinstance(value, float) else int(value), k)
        self.last_done = reward
        return reward


def distance_map_digest(env):
    import numpy as np
    dm = np.asarray(env.distance_map.get(), dtype='<f8')
    return {'shape': list(dm.shape),
            'sha256': hashlib.sha256(dm.tobytes()).hexdigest(),
            'per_agent': [hashlib.sha256(dm[i].tobytes()).hexdigest() for i in range(dm.shape[0])]}


def run(tbsim, scenario):
    import scenario_loader
    from flatland.envs.observations import TreeObsForRailEnv
    env = scenario_loader.load(MAP, use_malfunctions=False, obs_builder_object=TreeObsForRailEnv(max_depth=2))
    rec = Recorder(env)
    terms = Decomposer(env)
    if scenario == 'baseline':
        from controller.orderedcontroller import OrderedController
        ctrl = OrderedController()
    elif scenario == 'estimate':
        from estimate_planner import EstimatePlanner
        ctrl = EstimatePlanner(env)
        estimate_plan = json.load(open(os.path.join(SITE, 'data', 'estimate_actions.json')))
    else:
        plan = json.load(open(os.path.join(SITE, 'data', 'planner_actions.json')))
        ctrl = Replay(plan['actions'])
        ctrl.bind(rec)
    # run_episode resets the env first; the snapshot of the reset state is taken by a reset wrapper.
    inner_reset = env.reset

    def reset(*a, **k):
        out = inner_reset(*a, **k)
        rec.initial = rec.snapshot(None, env.dones)
        rec.not_done = [i for i in range(len(env.agents)) if not env.dones[i]]
        return out

    env.reset = reset
    res = tbsim.run_episode(env, ctrl, render=False, max_steps=100000)
    total = 0
    for row in rec.trace:
        total += sum(row['rew'])
    assert total == res['reward'], (total, res['reward'])
    # the terms add up to the score, step by step and train by train
    by_step = {}
    for step, handle, kind, value, k in terms.entries:
        by_step[(step, handle)] = by_step.get((step, handle), 0) + value
    for t, row in enumerate(rec.trace, start=1):
        for handle, rew in enumerate(row['rew']):
            assert abs(by_step.get((t, handle), 0) - rew) < 1e-6, ('terms', t, handle, by_step.get((t, handle)), rew)
    if scenario == 'optimized':
        assert rec.actions == plan['actions'][:len(rec.actions)] and len(rec.actions) == len(plan['actions']), 'replay diverged'
    if scenario == 'estimate':
        assert rec.actions == estimate_plan['actions'], 'data/estimate_actions.json is not what EstimatePlanner does'
    return {
        'scenario': scenario,
        'map': os.path.basename(MAP),
        'map_sha256': hashlib.sha256(open(MAP, 'rb').read()).hexdigest(),
        'flatland': importlib.metadata.version('flatland-rl'),
        'reward': res['reward'],
        'done_agents': res['done_agents'],
        'steps': len(rec.trace),
        'distance_map': distance_map_digest(env),
        'initial': rec.initial,
        'actions': rec.actions,
        'trace': rec.trace,
        'terms': terms.entries,
    }


def python_semantics(seed=7):
    """Python 3.13's sum() of mixed ints and floats, and the iteration order of small int sets, on
    random inputs shaped like the engine's (rewards, train handles), for js/engine/py.js."""
    import random
    rng = random.Random(seed)
    sums = []
    pool = [0, 0, 0, -936.0, -499.2, -0.5, -1.0, -1.75, -3.5, -748.8, -4.0 * (61 + 374.4), 0.0, -12, 7, -1497.6]
    for _ in range(4000):
        items = []
        for _ in range(rng.randint(0, 25)):
            r = rng.random()
            if r < 0.5:
                items.append(rng.choice(pool))
            elif r < 0.7:
                items.append(rng.randint(-2000, 50))
            elif r < 0.9:
                items.append(rng.choice([-0.5, -1.75, 0.5]) * rng.randint(-400, 400))
            else:
                items.append(rng.uniform(-5000, 5000))
        sums.append({'items': [[float(x), isinstance(x, float)] for x in items], 'sum': float(sum(items)),
                     'sum_is_float': isinstance(sum(items), float)})
    sets = []
    for _ in range(3000):
        keys = [rng.randint(0, 18) for _ in range(rng.randint(1, 24))]
        s = set()
        for k in keys:
            s.add(k)
        sets.append({'insert': keys, 'order': list(s)})
    rounds = [{'x': x, 'round': round(x)} for x in [1 / 0.8, 1 / 0.6, 1.0, 2.5, 3.5, 0.5, 1.5, 1 / 0.3, 1 / 0.7, 1 / 0.4]]
    return {'python': sys.version.split()[0], 'sums': sums, 'sets': sets, 'rounds': rounds}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True, help='checkout of the challenge repository (with its .venv)')
    ap.add_argument('--check', action='store_true', help='rebuild and compare with tests/fixtures/ instead of writing')
    ap.add_argument('--only', choices=SCENARIOS)
    args = ap.parse_args()
    repo = os.path.abspath(args.repo)
    out_dir = os.path.join(SITE, 'tests', 'fixtures')
    tbsim = load_runner(repo)
    ok = True
    results = {}
    for scenario in ([args.only] if args.only else SCENARIOS):
        data = run(tbsim, scenario)
        results[scenario] = data
        path = os.path.join(out_dir, f'trace_{scenario}.json')
        text = json.dumps(data, separators=(',', ':'))
        if args.check:
            same = os.path.exists(path) and json.load(open(path)) == json.loads(text)
            ok &= same
            print(f'{scenario:9s} reward {data["reward"]:>10.2f}  steps {data["steps"]:4d}  done {data["done_agents"]:2d}/19  '
                  f'{"identical to" if same else "DIFFERS from"} tests/fixtures/trace_{scenario}.json')
        else:
            os.makedirs(out_dir, exist_ok=True)
            open(path, 'w').write(text)
            print(f'{scenario:9s} reward {data["reward"]:>10.2f}  steps {data["steps"]:4d}  done {data["done_agents"]:2d}/19  '
                  f'wrote {os.path.relpath(path, SITE)} ({len(text) // 1024} KiB)')
    if not args.only:
        # data/reference.json: the Python runner's scores, which the page compares its own with.
        ref = {'map': os.path.basename(MAP), 'map_sha256': results['baseline']['map_sha256'],
               'python': sys.version.split()[0], 'flatland': results['baseline']['flatland'],
               'runs': {k: {'reward': v['reward'], 'steps': v['steps']} for k, v in results.items()}}
        ref_path = os.path.join(SITE, 'data', 'reference.json')
        if args.check:
            same = os.path.exists(ref_path) and json.load(open(ref_path)) == json.loads(json.dumps(ref))
            ok &= same
            print(f'scores: {", ".join(k + " " + str(v["reward"]) for k, v in ref["runs"].items())} '
                  f'{"identical to" if same else "DIFFER from"} data/reference.json')
        else:
            open(ref_path, 'w').write(json.dumps(ref, indent=1))
            print('wrote data/reference.json')
    # tests/fixtures/rules.json: the penalties as the challenge's own code sets them for this map
    # (scaled_penalties.get_scaled_penalties, the "balanced" profile the loader picks), and the
    # floor no dispatcher can beat (tools/score_floor.py, on flatland's own rail), which
    # tests/guide.mjs compares with the figures the guide states. The floor's timing assumptions
    # must hold in every recorded run.
    from scaled_penalties import get_scaled_penalties
    import scenario_loader
    from score_floor import score_floor, timing_holds
    max_steps = json.load(open(MAP))['flatland timetable']['max_episode_steps']
    balanced = get_scaled_penalties(max_steps, profile='balanced')
    env = scenario_loader.load(MAP, use_malfunctions=False)
    env.reset()
    floor = score_floor(env, balanced)
    for scenario, data in results.items():
        problems = timing_holds(env, [data['initial']] + data['trace'])
        assert not problems, (scenario, problems[:5])
    print(f'floor: no dispatcher can score better than -{sum(floor)} '
          f'(the timing it assumes holds in the {", ".join(results)} run{"s" if len(results) > 1 else ""})')
    rules = {'map': os.path.basename(MAP), 'max_episode_steps': max_steps,
             'balanced': balanced,
             'target_late_per_step': 1,
             'floor': {'per_train': floor, 'total': sum(floor)}}
    rules_path = os.path.join(out_dir, 'rules.json')
    if args.check:
        same = os.path.exists(rules_path) and json.load(open(rules_path)) == json.loads(json.dumps(rules))
        ok &= same
        print(f'penalties for {max_steps} steps {"identical to" if same else "DIFFER from"} tests/fixtures/rules.json')
    elif not args.only:
        open(rules_path, 'w').write(json.dumps(rules, indent=1))
        print('wrote tests/fixtures/rules.json')
    sem = python_semantics()
    path = os.path.join(out_dir, 'python_semantics.json')
    if args.check:
        same = os.path.exists(path) and json.load(open(path)) == json.loads(json.dumps(sem))
        ok &= same
        print(f'python semantics ({len(sem["sums"])} sums, {len(sem["sets"])} sets) {"identical to" if same else "DIFFER from"} tests/fixtures/python_semantics.json')
    elif not args.only:
        open(path, 'w').write(json.dumps(sem, separators=(',', ':')))
        print(f'python semantics: wrote {os.path.relpath(path, SITE)}')
    if args.check:
        print('FIXTURES_REPRODUCED' if ok else 'FIXTURES_DIFFER')
        sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
