"""The optimized runs' actions come from PlannerController itself.

For each map (tools/maps.py), runs the challenge's own runner (run_episode, rendering off) with the
documented wiring, the full observation (FullEnvObservation) and PlannerController() with its
defaults, on the challenge's map file, records the actions handed to env.step at every step, and
compares them with data/<map>/planner_actions.json, the plan the browser replays. Planning takes a
few minutes per map. The planner's files (planner_core.py and plannercontroller.py) must sit in
<repo>/src/controller/.

Usage, from this folder, with the challenge repository's Python:
  <repo>/.venv/bin/python tools/check_plan.py --repo <repo>                     compare, every map
  <repo>/.venv/bin/python tools/check_plan.py --repo <repo> --map koeln         compare, one map
  <repo>/.venv/bin/python tools/check_plan.py --repo <repo> --map koeln --write write data/koeln/planner_actions.json
"""
import argparse
import hashlib
import json
import os
import sys
import time

from export_fixtures import Recorder, load_runner
from maps import MAPS, SITE, challenge_map, chosen, site_data


def plan_map(tbsim, map_id):
    import scenario_loader
    from flatland.envs.observations import FullEnvObservation
    from controller.plannercontroller import PlannerController
    MAP = challenge_map(map_id)
    env = scenario_loader.load(MAP, use_malfunctions=False, obs_builder_object=FullEnvObservation())
    rec = Recorder(env)
    ctrl = PlannerController(verbose=False)
    t0 = time.time()
    res = tbsim.run_episode(env, ctrl, render=False, max_steps=100000)
    print(f'{map_id}: PlannerController through the runner in {time.time() - t0:.0f} s')
    return {
        'map': os.path.basename(MAP),
        'map_sha256': hashlib.sha256(open(MAP, 'rb').read()).hexdigest(),
        'controller': 'PlannerController(n_orders=1, lns_iters=40, seed=2)',
        'wiring': 'scenario_loader.load(..., obs_builder_object=FullEnvObservation()); run_episode(env, PlannerController(), render=False)',
        'reward': res['reward'],
        'steps': len(rec.actions),
        'actions': rec.actions,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--map', choices=list(MAPS), help='one map only (default: every map)')
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()
    tbsim = load_runner(os.path.abspath(args.repo))
    failed = False
    for map_id in chosen(args.map):
        plan = plan_map(tbsim, map_id)
        path = site_data(map_id, 'planner_actions.json')
        rel = os.path.relpath(path, SITE)
        if args.write:
            os.makedirs(site_data(map_id), exist_ok=True)
            open(path, 'w').write(json.dumps(plan, separators=(',', ':')))
            print(f'wrote {rel}: {plan["steps"]} steps, reward {plan["reward"]}')
            continue
        saved = json.load(open(path))
        same = saved['actions'] == plan['actions'] and saved['reward'] == plan['reward'] and saved['map_sha256'] == plan['map_sha256']
        print(f'{map_id}: PlannerController live: reward {plan["reward"]}, {plan["steps"]} steps; '
              f'{rel}: reward {saved["reward"]}, {saved["steps"]} steps; actions identical: {saved["actions"] == plan["actions"]}')
        if same:
            print(f'PLAN_ACTIONS_REPRODUCED map={map_id} reward={plan["reward"]}')
        else:
            print(f'PLAN_ACTIONS_DIFFER map={map_id}')
            failed = True
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
