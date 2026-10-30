"""The optimized runs' actions come from PlannerController v2 itself.

For each map (tools/maps.py), runs the challenge's own runner (run_episode, rendering off) with the
documented wiring, the full observation (FullEnvObservation) and PlannerController() with its
defaults, on the challenge's map file, records the actions handed to env.step at every step, and
compares them with data/<map>/planner_actions.json, the plan the browser replays. Planning takes a
few minutes per map. The planner's files (planner_core.py and plannercontroller.py) must sit in
<repo>/src/controller/. Like tools/export_fixtures.py it runs under the fixed PYTHONHASHSEED the
plans record, as the runner's score of a plan can depend on it.

With --malfunctions it does the same with the loader's malfunctions on and the environment's random
generator seeded with tools/maps.py's MALFUNCTION_SEED (as tools/export_fixtures.py records the runs
with malfunctions), and compares with data/<map>/planner_actions_malfunctions.json: the actions
PlannerController v2 gives when trains break down. It plans before the first step, when no train has
broken down yet, and then follows its plan as far as the breakdowns let it (planner_core.PathFollower).

Usage, from this folder, with the challenge repository's Python:
  PYTHONHASHSEED=0 <repo>/.venv/bin/python tools/check_plan.py --repo <repo>                     compare, every map
  PYTHONHASHSEED=0 <repo>/.venv/bin/python tools/check_plan.py --repo <repo> --map koeln         compare, one map
  PYTHONHASHSEED=0 <repo>/.venv/bin/python tools/check_plan.py --repo <repo> --map koeln --write write data/koeln/planner_actions.json
  PYTHONHASHSEED=0 <repo>/.venv/bin/python tools/check_plan.py --repo <repo> --malfunctions  the same, with malfunctions
"""
import argparse
import hashlib
import json
import os
import sys
import time

from export_fixtures import Recorder, hash_seed, load_runner, malfunction_env
from maps import MALFUNCTION_SEED, MAPS, SITE, challenge_map, chosen, plan_file, site_data


def plan_map(tbsim, map_id, malfunctions=False):
    import scenario_loader
    from flatland.envs.observations import FullEnvObservation
    from controller.plannercontroller import PlannerController
    MAP = challenge_map(map_id)
    if malfunctions:
        env = malfunction_env(map_id, MALFUNCTION_SEED, FullEnvObservation())
    else:
        env = scenario_loader.load(MAP, use_malfunctions=False, obs_builder_object=FullEnvObservation())
    rec = Recorder(env)
    ctrl = PlannerController(verbose=False)
    t0 = time.time()
    res = tbsim.run_episode(env, ctrl, render=False, max_steps=100000)
    print(f'{map_id}: PlannerController through the runner{" with malfunctions" if malfunctions else ""} in {time.time() - t0:.0f} s')
    plan = {
        'map': os.path.basename(MAP),
        'map_sha256': hashlib.sha256(open(MAP, 'rb').read()).hexdigest(),
        'controller': 'PlannerController v2 (n_orders=1, lns_iters=40, seed=2)',
        'wiring': ('scenario_loader.load(..., use_malfunctions=True, obs_builder_object=FullEnvObservation()); env._seed(malfunction_seed); run_episode(env, PlannerController(), render=False)'
                   if malfunctions else 'scenario_loader.load(..., obs_builder_object=FullEnvObservation()); run_episode(env, PlannerController(), render=False)'),
        'hash_seed': hash_seed(),
        'reward': res['reward'],
        'steps': len(rec.actions),
        'actions': rec.actions,
    }
    if malfunctions:
        plan['malfunction_seed'] = MALFUNCTION_SEED
        plan['disturbed_at'] = ctrl.disturbed_at
        plan['errors'] = ctrl.errors
    return plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--map', choices=list(MAPS), help='one map only (default: every map)')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--malfunctions', action='store_true', help='the runs with malfunctions (planner_actions_malfunctions.json)')
    args = ap.parse_args()
    if hash_seed() is None:
        sys.exit('Run with the fixed PYTHONHASHSEED the plans record (PYTHONHASHSEED=0).')
    tbsim = load_runner(os.path.abspath(args.repo))
    failed = False
    reproduced = 0
    maps = chosen(args.map)
    variant = 'malfunctions' if args.malfunctions else 'normal'
    for map_id in maps:
        plan = plan_map(tbsim, map_id, args.malfunctions)
        path = site_data(map_id, plan_file(variant))
        rel = os.path.relpath(path, SITE)
        if args.write:
            os.makedirs(site_data(map_id), exist_ok=True)
            open(path, 'w').write(json.dumps(plan, separators=(',', ':')))
            print(f'wrote {rel}: {plan["steps"]} steps, reward {plan["reward"]}')
            continue
        saved = json.load(open(path))
        same = saved['actions'] == plan['actions'] and saved['reward'] == plan['reward'] and saved['map_sha256'] == plan['map_sha256'] \
            and saved.get('hash_seed') == plan['hash_seed'] and saved.get('malfunction_seed') == plan.get('malfunction_seed')
        print(f'{map_id}: PlannerController live: reward {plan["reward"]}, {plan["steps"]} steps; '
              f'{rel}: reward {saved["reward"]}, {saved["steps"]} steps; actions identical: {saved["actions"] == plan["actions"]}')
        if same:
            reproduced += 1
            print(f'PLAN_ACTIONS_REPRODUCED map={map_id}{" malfunctions" if args.malfunctions else ""} reward={plan["reward"]}')
        else:
            print(f'PLAN_ACTIONS_DIFFER map={map_id}{" malfunctions" if args.malfunctions else ""}')
            failed = True
    if not args.write and not failed:
        print(f'PLANS_REPRODUCED {reproduced}/{len(maps)} variant={variant}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
