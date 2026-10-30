"""PlannerController v2 and the baseline under the challenge's malfunctions, over many seeds.

The challenge's loader can switch malfunctions on (scenario_loader.load(..., use_malfunctions=True):
flatland's ParamMalfunctionGen(MalfunctionParameters(0.04, 2, 10))); its runner leaves them off. On,
every train, in every step, breaks down with probability 1 - exp(-0.04) (about 3.9 %) unless it is
broken down already, and then stands for randint(2, 11) + 1 = 3 to 11 steps. The draws come from the
environment's random generator, which the loader seeds from the system's entropy, so a run can only be
repeated with the generator seeded: here env._seed(seed) before run_episode, for seeds 1, 2, ...

The draws do not depend on the dispatcher: flatland draws for every train in every step, in the
trains' order, whatever they do (MalfunctionEffectsGenerator.on_episode_step_start), and counts every
breakdown down by one each step. This tool checks that for every run: the draws a run made are exactly
those of a dry run of the same generator, seeded the same, that never steps the environment. Both
dispatchers therefore meet the same breakdowns on a seed.

Per map and seed it runs, through the challenge's own runner (run_episode, rendering off):
  optimized  PlannerController v2 with its defaults and the full observation (FullEnvObservation).
             It plans before the first step, when no train has broken down yet, so its plan is the
             same on every seed (its search uses its own random.Random(seed=2), never flatland's
             generator). The tool plans once per process and hands that plan to a PlannerController
             for each seed (CachedPlanner); for the first --live seeds it also runs a fresh
             PlannerController() that plans for itself and asserts the identical action at every step.
             It also asserts that the cached plan, run without malfunctions, repeats the page's
             recorded plan (data/<map>/planner_actions.json) action for action.
  baseline   OrderedController (the runner's tree observation, depth 2), for the first --baseline seeds.

and records the score, the steps, trains arrived (and on time), trains that never departed,
collisions (a moving train stopped without a stop action: the crash penalty), refused moves (the
motion check kept a train from the cell it wanted), breakdowns (a train entering a malfunction state;
a breakdown that starts the step another ends, with the train standing throughout, counts once, so
this is at most the page's count of breakdowns, flatland's num_malfunctions of trains not yet done),
train-steps broken down, stops served as the reward function counts them, the delays at the
destination, errors caught inside v2's act() and the step its safe mode took over.

Writes data/<map>/malfunction_test.json (the page's Method tab shows it); --out keeps every run's
record and actions for inspection. The planner's files must sit in <repo>/src/controller/.

Usage, from this folder, with the challenge repository's Python:
  PYTHONHASHSEED=0 <repo>/.venv/bin/python tools/malfunction_test.py --repo <repo> --map koeln \
      --seeds 1-100 --live 10 --baseline 10 --out <dir> [--part 0/2]
  PYTHONHASHSEED=0 <repo>/.venv/bin/python tools/malfunction_test.py --repo <repo> --map koeln --merge <dir>
--part i/k runs every k-th seed starting with the i-th, so two processes can share the seeds; --merge
reads the records in <dir>, checks them and writes data/<map>/malfunction_test.json.
"""
import argparse
import hashlib
import json
import os
import sys
import time

from export_fixtures import hash_seed, load_runner
from maps import MAPS, SITE, challenge_map, site_data

# The loader's malfunction parameters (src/scenario_loader.py), checked against the generator it builds.
RATE, MIN_DURATION, MAX_DURATION = 0.04, 2, 10
CONTROLLERS = {'optimized': 'PlannerController v2 (n_orders=1, lns_iters=40, seed=2), FullEnvObservation',
               'baseline': 'OrderedController, TreeObsForRailEnv(max_depth=2)'}


def seed_list(spec):
    out = []
    for part in spec.split(','):
        if '-' in part:
            a, b = part.split('-')
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def load_env(map_id, malfunctions, obs):
    import scenario_loader
    from flatland.envs.observations import FullEnvObservation, TreeObsForRailEnv
    ob = FullEnvObservation() if obs == 'full' else TreeObsForRailEnv(max_depth=2)
    env = scenario_loader.load(challenge_map(map_id), use_malfunctions=malfunctions, obs_builder_object=ob)
    if malfunctions:
        mfp = env.malfunction_generator.MFP
        assert (mfp.malfunction_rate, mfp.min_duration, mfp.max_duration) == (RATE, MIN_DURATION, MAX_DURATION), mfp
    return env


def dry_draws(map_id, seed, steps):
    """The generator's draws for steps 1..steps, every train in order, without stepping the
    environment: [[step, train, broken steps], ...] for every draw that breaks a train down."""
    env = load_env(map_id, True, 'tree')
    env._seed(seed)
    env.reset()
    gen = env.malfunction_generator
    out = []
    for t in range(1, steps + 1):
        for h in range(len(env.agents)):
            m = gen.generate(env.np_random)
            if m is not None:
                out.append([t, h, int(m.num_broken_steps)])
    return out


def draws_digest(draws):
    return hashlib.sha256(json.dumps(draws, separators=(',', ':')).encode()).hexdigest()


class Watch:
    """Wraps env.step and the malfunction generator on the instance: records actions, the draws,
    and what the run did. Test harness only: it changes nothing."""

    def __init__(self, env):
        self.env = env
        self.inner = env.step
        env.step = self.step
        self.actions = []
        self.draws = []
        self.collisions = 0
        self.refused = 0
        self.breakdowns = 0
        self.broken_steps = 0
        self.calls = 0
        gen = env.malfunction_generator
        if hasattr(gen, '_cached_rand'):
            inner_gen = gen.generate

            def generate(np_random):
                m = inner_gen(np_random)
                h = self.calls % len(env.agents)
                self.calls += 1
                if m is not None:
                    self.draws.append([int(env._elapsed_steps), h, int(m.num_broken_steps)])
                return m
            gen.generate = generate

    def step(self, action_dict):
        env = self.env
        n = len(env.agents)
        self.actions.append([int(action_dict[a].value) for a in range(n)])
        out = self.inner(action_dict)
        stopped = env.motion_check.stopped
        for a in env.agents:
            td = env.temp_transition_data[a.handle]
            prev = a.state_machine.previous_state
            st = int(a.state)
            if a.handle in stopped and td.new_position_level_free != td.agent_position_level_free:
                self.refused += 1
            if prev is not None and int(prev) == 3 and st == 4 and not td.state_transition_signal.stop_action_given:
                self.collisions += 1
            if st in (2, 5):
                self.broken_steps += 1
                if prev is None or int(prev) not in (2, 5):
                    self.breakdowns += 1
        return out


def stops_served(env):
    """Stops served as the reward function counts them: the train stood still (STOPPED) on the
    platform its booking falls on (list(set(listed) & set(arrivals))[0])."""
    from flatland.envs.step_utils.states import TrainState
    rw = env.rewards
    served = total = 0
    for a in env.agents:
        for alts in a.waypoints[1:-1]:
            total += 1
            hit = set(alts).intersection(set(rw.arrivals[a.handle]))
            if hit and TrainState.STOPPED in rw.states[a.handle][list(hit)[0]]:
                served += 1
    return served, total


def record(map_id, seed, kind, env, res, watch, ctrl, secs, live):
    delays = [max(0, a.arrival_time - a.latest_arrival) for a in env.agents if int(a.state) == 6]
    served, total = stops_served(env)
    out = {
        'map': map_id, 'seed': seed, 'run': kind, 'live': live,
        'reward': res['reward'], 'steps': len(watch.actions),
        'trains': len(env.agents),
        'arrived': sum(1 for a in env.agents if int(a.state) == 6),
        'on_time': sum(1 for d in delays if d == 0),
        'never_departed': sum(1 for a in env.agents if int(a.state) in (0, 1, 2)),
        'collisions': watch.collisions, 'refused': watch.refused,
        'breakdowns': watch.breakdowns, 'broken_steps': watch.broken_steps,
        'stops_served': served, 'stops': total,
        'delay_total': sum(delays), 'delay_max': max(delays) if delays else 0,
        'draws': len(watch.draws), 'draws_sha256': draws_digest(watch.draws),
        'actions_sha256': hashlib.sha256(json.dumps(watch.actions, separators=(',', ':')).encode()).hexdigest(),
        'seconds': round(secs, 1),
    }
    if kind == 'optimized':
        out['errors'] = ctrl.errors
        out['disturbed_at'] = ctrl.disturbed_at
    return out


def make_cached_planner():
    from controller.plannercontroller import PlannerController

    class CachedPlanner(PlannerController):
        """PlannerController v2, handed the plan it would make (PlannerController._plan_episode),
        computed once; everything else is v2's own code."""
        cache = None

        def _plan_episode(self, env):
            ctx, best = CachedPlanner.cache
            self._ctx = ctx
            self._plans, self._order = dict(best['plans']), list(best['order'])
            self._follower = None
            self.disturbed_at = None
            self.solo_penalties = best.get('solo')
            self.predicted_penalty = best['score']
            self.predicted = {h: (p.penalty if p is not None else None) for h, p in self._plans.items()}
            self.ambiguous = {h: list(p.ambiguous) for h, p in self._plans.items() if p is not None and p.ambiguous}
            self.planning_seconds = 0.0

    return CachedPlanner


def plan_once(map_id):
    """Plan as PlannerController() does on its first act() call, from the reset environment."""
    from controller.planner_core import PlanningContext, solve
    env = load_env(map_id, False, 'full')
    env.reset()
    t0 = time.time()
    ctx = PlanningContext(env)
    best = solve(ctx, n_orders=1, lns_iters=40, seed=2, time_cap=None, log=None)
    print(f'{map_id}: planned once in {time.time() - t0:.0f} s, predicted penalty {best["score"]}', flush=True)
    return ctx, best


def run_one(tbsim, map_id, seed, kind, ctrl, malfunctions=True):
    env = load_env(map_id, malfunctions, 'full' if kind == 'optimized' else 'tree')
    if malfunctions:
        env._seed(seed)
    watch = Watch(env)
    t0 = time.time()
    res = tbsim.run_episode(env, ctrl, render=False, max_steps=100000)
    return env, res, watch, time.time() - t0


def run_part(tbsim, args, map_id, seeds):
    from controller.orderedcontroller import OrderedController
    from controller.plannercontroller import PlannerController
    os.makedirs(args.out, exist_ok=True)
    CachedPlanner = make_cached_planner()
    CachedPlanner.cache = plan_once(map_id)
    # The cached plan, run without malfunctions, is the page's plan, action for action.
    page_plan = json.load(open(site_data(map_id, 'planner_actions.json')))
    env, res, watch, secs = run_one(tbsim, map_id, None, 'optimized', CachedPlanner(verbose=False), malfunctions=False)
    assert watch.actions == page_plan['actions'] and res['reward'] == page_plan['reward'], \
        f'{map_id}: the cached plan does not repeat data/{map_id}/planner_actions.json'
    print(f'{map_id}: the cached plan repeats data/{map_id}/planner_actions.json ({len(watch.actions)} steps, {res["reward"]})', flush=True)
    for seed in seeds:
        steps_max = json.load(open(challenge_map(map_id)))['flatland timetable']['max_episode_steps']
        dry = dry_draws(map_id, seed, steps_max)
        runs = [('optimized', False)]
        if seed in args.live_seeds:
            runs.append(('optimized', True))
        if seed in args.baseline_seeds:
            runs.append(('baseline', True))
        actions = {}
        for kind, live in runs:
            if kind == 'baseline':
                ctrl = OrderedController()
            else:
                ctrl = PlannerController(verbose=False) if live else CachedPlanner(verbose=False)
            env, res, watch, secs = run_one(tbsim, map_id, seed, kind, ctrl)
            # the run met exactly the dry run's breakdowns, step by step
            last = len(watch.actions)
            assert watch.draws == [d for d in dry if d[0] <= last], (map_id, seed, kind, 'draws differ from the dry run')
            rec = record(map_id, seed, kind, env, res, watch, ctrl, secs, live)
            name = f'{map_id}_{seed}_{kind}{"_live" if live and kind == "optimized" else ""}'
            json.dump({**rec, 'actions': watch.actions}, open(os.path.join(args.out, name + '.json'), 'w'), separators=(',', ':'))
            actions[(kind, live)] = watch.actions
            print(f'{name}: {rec["reward"]} in {rec["steps"]} steps, {rec["arrived"]}/{rec["trains"]} arrived, '
                  f'{rec["collisions"]} collisions, {rec["refused"]} refused, {rec["breakdowns"]} breakdowns, '
                  f'{rec.get("errors", "-")} errors, {secs:.0f} s', flush=True)
        if ('optimized', True) in actions:
            assert actions[('optimized', True)] == actions[('optimized', False)], (map_id, seed, 'live and cached plans differ')
            print(f'{map_id} seed {seed}: live PlannerController() and the cached plan: identical actions', flush=True)
        json.dump({'seed': seed, 'draws': dry, 'sha256': draws_digest(dry)},
                  open(os.path.join(args.out, f'{map_id}_{seed}_draws.json'), 'w'), separators=(',', ':'))


def merge(args, map_id):
    """Checks the records in args.merge and writes data/<map>/malfunction_test.json."""
    recs = []
    for name in sorted(os.listdir(args.merge)):
        if name.startswith(map_id + '_') and name.endswith('.json') and not name.endswith('_draws.json'):
            r = json.load(open(os.path.join(args.merge, name)))
            r.pop('actions', None)
            recs.append(r)
    seeds = sorted({r['seed'] for r in recs})
    by = {(r['seed'], r['run'], r['live']): r for r in recs}
    ref = json.load(open(site_data(map_id, 'reference.json')))
    rows = []
    for s in seeds:
        opt = by.get((s, 'optimized', False))
        assert opt is not None, (map_id, s, 'no optimized run')
        live = by.get((s, 'optimized', True))
        if live is not None:
            assert live['actions_sha256'] == opt['actions_sha256'] and live['reward'] == opt['reward'], (map_id, s, 'live differs')
        base = by.get((s, 'baseline', True))
        row = {'seed': s, 'optimized': {k: v for k, v in opt.items() if k not in ('map', 'seed', 'run', 'live', 'seconds', 'actions_sha256', 'draws_sha256')},
               'live': live is not None}
        if base is not None:
            row['baseline'] = {k: v for k, v in base.items() if k not in ('map', 'seed', 'run', 'live', 'seconds', 'actions_sha256', 'draws_sha256', 'errors', 'disturbed_at')}
        rows.append(row)
    out = {
        'map': MAPS[map_id]['file'],
        'malfunctions': {'rate': RATE, 'min_duration': MIN_DURATION, 'max_duration': MAX_DURATION,
                         'seeding': 'env._seed(seed) before run_episode'},
        'controllers': CONTROLLERS,
        'hash_seed': hash_seed(),
        'undisturbed': {k: v['reward'] for k, v in ref['runs'].items()},
        'seeds': rows,
    }
    path = site_data(map_id, 'malfunction_test.json')
    open(path, 'w').write(json.dumps(out, indent=1))
    print(f'{map_id}: wrote {os.path.relpath(path, SITE)} ({len(rows)} seeds)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--map', choices=list(MAPS), required=True)
    ap.add_argument('--seeds', default='1-10')
    ap.add_argument('--live', default='0', help='seeds whose optimized run also plans live (a count n means seeds 1..n)')
    ap.add_argument('--baseline', default='0', help='seeds the baseline runs on (a count n means seeds 1..n)')
    ap.add_argument('--part', default='0/1')
    ap.add_argument('--out')
    ap.add_argument('--merge')
    args = ap.parse_args()
    if hash_seed() is None:
        sys.exit('Run with the fixed PYTHONHASHSEED the plans record (PYTHONHASHSEED=0).')
    tbsim = load_runner(os.path.abspath(args.repo))
    if args.merge:
        merge(args, args.map)
        return
    as_seeds = lambda v: set(range(1, int(v) + 1)) if v.isdigit() else set(seed_list(v))  # noqa: E731
    args.live_seeds = as_seeds(args.live)
    args.baseline_seeds = as_seeds(args.baseline)
    i, k = map(int, args.part.split('/'))
    seeds = seed_list(args.seeds)[i::k]
    run_part(tbsim, args, args.map, seeds)
    print(f'MALFUNCTION_PART_DONE map={args.map} part={args.part} seeds={len(seeds)}')


if __name__ == '__main__':
    main()
