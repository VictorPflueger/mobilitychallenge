"""The optimized run's actions come from PlannerController itself.

Runs the challenge's own runner (run_episode, rendering off) with the documented wiring, the full
observation (FullEnvObservation) and PlannerController() with its defaults, records the actions
handed to env.step at every step, and compares them with data/planner_actions.json, the plan the
browser replays. Planning takes about two minutes. The planner's files (planner_core.py and
plannercontroller.py) must sit in <repo>/src/controller/.

Usage, from this folder, with the challenge repository's Python:
  <repo>/.venv/bin/python tools/check_plan.py --repo <repo>            compare
  <repo>/.venv/bin/python tools/check_plan.py --repo <repo> --write    write data/planner_actions.json
"""
import argparse
import hashlib
import json
import os
import sys

from export_fixtures import MAP, SITE, Recorder, load_runner


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()
    tbsim = load_runner(os.path.abspath(args.repo))
    import scenario_loader
    from flatland.envs.observations import FullEnvObservation
    from controller.plannercontroller import PlannerController
    env = scenario_loader.load(MAP, use_malfunctions=False, obs_builder_object=FullEnvObservation())
    rec = Recorder(env)
    ctrl = PlannerController(verbose=False)
    res = tbsim.run_episode(env, ctrl, render=False, max_steps=100000)
    plan = {
        'map': os.path.basename(MAP),
        'map_sha256': hashlib.sha256(open(MAP, 'rb').read()).hexdigest(),
        'controller': 'PlannerController(n_orders=1, lns_iters=40, seed=2)',
        'wiring': 'scenario_loader.load(..., obs_builder_object=FullEnvObservation()); run_episode(env, PlannerController(), render=False)',
        'reward': res['reward'],
        'steps': len(rec.actions),
        'actions': rec.actions,
    }
    path = os.path.join(SITE, 'data', 'planner_actions.json')
    if args.write:
        open(path, 'w').write(json.dumps(plan, separators=(',', ':')))
        print(f'wrote data/planner_actions.json: {plan["steps"]} steps, reward {plan["reward"]}')
        return
    saved = json.load(open(path))
    same = saved['actions'] == plan['actions'] and saved['reward'] == plan['reward'] and saved['map_sha256'] == plan['map_sha256']
    print(f'PlannerController live: reward {plan["reward"]}, {plan["steps"]} steps; '
          f'data/planner_actions.json: reward {saved["reward"]}, {saved["steps"]} steps; actions identical: {saved["actions"] == plan["actions"]}')
    if same:
        print(f'PLAN_ACTIONS_REPRODUCED reward={plan["reward"]}')
    else:
        print('PLAN_ACTIONS_DIFFER')
        sys.exit(1)


if __name__ == '__main__':
    main()
