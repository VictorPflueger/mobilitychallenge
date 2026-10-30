"""The maps Dispatch Lab shows, as the Python tools see them. js/maps.js lists the same maps for the
page, and tests/lib/maps.mjs for the tests.

For each map: the challenge's file (data/maps/<file> in the challenge repository), the runs recorded
on it, the folder of the site's data for it (data/<id>/: the map itself, the plans the page replays,
the Python runner's scores) and the folder of its reference traces (tests/fixtures/<id>/).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)

MAPS = {
    # The challenge's default map: the runner loads it (src/tbrain-simulation.py).
    'frankfurt': {'file': 'neufrankfurt_19agents.json', 'runs': ('baseline', 'optimized')},
    # The larger map of the challenge's final (36 trains); the page opens on it.
    'koeln': {'file': 'kk_36agents.json', 'runs': ('baseline', 'optimized')},
}

# With malfunctions on (the page's Malfunctions switch), every run of a map is recorded a second
# time with the loader's malfunctions (scenario_loader.load(..., use_malfunctions=True)) and the
# environment's random generator seeded with this seed before the episode (env._seed(seed); the
# loader leaves it to the system's entropy). Seed 1, the first seed of tools/malfunction_test.py,
# was fixed before any result was seen; both runs of a map meet the same breakdowns.
MALFUNCTION_SEED = 1

# The two ways a map's runs are recorded: as the challenge's runner runs them, and with malfunctions.
VARIANTS = ('normal', 'malfunctions')


def run_file(run, variant='normal'):
    """The name a run's files carry: <run>, or <run>_malfunctions."""
    return run if variant == 'normal' else f'{run}_malfunctions'


def plan_file(variant='normal'):
    """The optimized run's recorded actions: planner_actions.json, or planner_actions_malfunctions.json."""
    return 'planner_actions.json' if variant == 'normal' else 'planner_actions_malfunctions.json'


def challenge_map(map_id):
    """The map's path in the challenge repository, relative to its root (the runner's folder)."""
    return os.path.join('data', 'maps', MAPS[map_id]['file'])


def site_data(map_id, name=None):
    """data/<id>/ in this site, or a file in it."""
    path = os.path.join(SITE, 'data', map_id)
    return path if name is None else os.path.join(path, name)


def fixtures(map_id, name=None):
    """tests/fixtures/<id>/ in this site, or a file in it."""
    path = os.path.join(SITE, 'tests', 'fixtures', map_id)
    return path if name is None else os.path.join(path, name)


def chosen(map_arg):
    """The maps a tool works on: the one named, or all of them."""
    return [map_arg] if map_arg else list(MAPS)
