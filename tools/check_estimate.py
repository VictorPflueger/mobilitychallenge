"""The estimate run, checked through the challenge's own runner.

Runs EstimatePlanner (tools/estimate_planner.py) with the challenge's runner (run_episode,
rendering off) on data/maps/neufrankfurt_19agents.json and checks, after every step, that every
train stands exactly where the plan put it, so no train was ever held back by another; that all 19
trains arrive, each at its planned step; and that the actions handed to env.step are the ones in
data/estimate_actions.json, which the page replays.

Usage, from this folder, with the challenge repository's Python (flatland-rl 4.2.2):
  <repo>/.venv/bin/python -B tools/check_estimate.py --repo <repo>           check
  <repo>/.venv/bin/python -B tools/check_estimate.py --repo <repo> --write   write data/estimate_actions.json
The env.step wrapper below records and compares; it changes nothing.
"""
import argparse
import hashlib
import json
import os
import sys

from export_fixtures import MAP, SITE, Recorder, load_runner

PLAN_FILE = os.path.join(SITE, 'data', 'estimate_actions.json')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True, help='checkout of the challenge repository (with its .venv)')
    ap.add_argument('--write', action='store_true', help='write data/estimate_actions.json')
    args = ap.parse_args()
    tbsim = load_runner(os.path.abspath(args.repo))
    import scenario_loader
    from flatland.envs.observations import TreeObsForRailEnv
    from flatland.envs.step_utils.states import TrainState
    from estimate_planner import EstimatePlanner

    env = scenario_loader.load(MAP, use_malfunctions=False, obs_builder_object=TreeObsForRailEnv(max_depth=2))
    rec = Recorder(env)
    planner = EstimatePlanner(env)
    problems = []
    arrived = {}
    recorded_step = env.step

    def step(action_dict):
        out = recorded_step(action_dict)
        t = env._elapsed_steps
        for a in env.agents:
            if a.state == TrainState.DONE:
                arrived.setdefault(a.handle, t)
                continue
            expected = planner.position(a.handle, t)
            if a.position != expected and len(problems) < 10:
                problems.append(f'step {t}: train {a.handle} at {a.position}, planned {expected} (state {a.state.name})')
        return out

    env.step = step
    res = tbsim.run_episode(env, planner, render=False, max_steps=100000)

    n = len(env.agents)
    late = sum(max(0, arrived[i] - env.agents[i].latest_arrival) for i in arrived)
    waits = {i: planner.info[i]['enter'] - (max(env.agents[i].earliest_departure, 1) + 1)
             for i in range(n) if planner.info.get(i)}
    missing = [i for i in range(n) if i not in arrived]
    off_plan = [i for i in arrived if not planner.info.get(i) or planner.info[i]['arrive'] != arrived[i]]
    print(f'EstimatePlanner through the runner: reward {res["reward"]}, {len(rec.trace)} steps, '
          f'{len(arrived)} of {n} trains arrived, {late} steps late in all, longest wait {max(waits.values())} steps '
          f'(train {max(waits, key=waits.get)})')
    if missing:
        problems.append(f'trains that did not arrive: {missing}')
    if off_plan:
        problems.append(f'trains that arrived off plan: {off_plan}')

    plan = {
        'map': os.path.basename(MAP),
        'map_sha256': hashlib.sha256(open(MAP, 'rb').read()).hexdigest(),
        'controller': 'EstimatePlanner (tools/estimate_planner.py): routes booked one train after another, stops not served',
        'wiring': "scenario_loader.load(..., obs_builder_object=TreeObsForRailEnv(max_depth=2)); run_episode(env, EstimatePlanner(env), render=False)",
        'reward': res['reward'],
        'steps': len(rec.actions),
        'actions': rec.actions,
    }
    if args.write:
        open(PLAN_FILE, 'w').write(json.dumps(plan, separators=(',', ':')))
        print(f'wrote {os.path.relpath(PLAN_FILE, SITE)} ({len(rec.actions)} steps)')
    else:
        stored = json.load(open(PLAN_FILE)) if os.path.exists(PLAN_FILE) else None
        if stored is None:
            problems.append('data/estimate_actions.json is missing')
        else:
            if stored['actions'] != rec.actions:
                first = next((t for t, (x, y) in enumerate(zip(stored['actions'], rec.actions)) if x != y), min(len(stored['actions']), len(rec.actions)))
                problems.append(f'data/estimate_actions.json differs from the planner from step {first + 1}')
            if stored['reward'] != res['reward'] or stored['map_sha256'] != plan['map_sha256']:
                problems.append('data/estimate_actions.json: reward or map differ')
            print(f'data/estimate_actions.json: {len(stored["actions"])} steps, reward {stored["reward"]}; '
                  f'{"identical to" if not problems else "checked against"} the planner')
    for p in problems:
        print('PROBLEM ' + p)
    if problems:
        print('ESTIMATE_DIFFERS')
        sys.exit(1)
    print('Every train ran exactly as planned: never held back, all arrived.')
    print('ESTIMATE_CLEAN')


if __name__ == '__main__':
    main()
