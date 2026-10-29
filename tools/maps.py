"""The maps Dispatch Lab shows, as the Python tools see them, in the page's order. js/maps.js lists
the same maps for the page, and tests/lib/maps.mjs for the tests.

For each map: the challenge's file (data/maps/<file> in the challenge repository), the runs recorded
on it, the folder of the site's data for it (data/<id>/: the map itself, the plan the page replays,
the Python runner's scores) and the folder of its reference traces (tests/fixtures/<id>/).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)

MAPS = {
    # The larger map of the challenge's final (36 trains); the page opens on it.
    'koeln': {'file': 'kk_36agents.json', 'runs': ('baseline', 'optimized')},
    # The challenge's default map: the runner loads it (src/tbrain-simulation.py).
    'frankfurt': {'file': 'neufrankfurt_19agents.json', 'runs': ('baseline', 'optimized')},
}


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
