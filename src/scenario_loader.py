from flatland.envs.rail_env import RailEnv
from flatland.envs.timetable_utils import Line, Timetable
from flatland.envs.rail_grid_transition_map import RailGridTransitionMap
from flatland.envs.grid.rail_env_grid import RailEnvTransitions
from flatland.envs.observations import TreeObsForRailEnv
from flatland.envs.rail_trainrun_data_structures import Waypoint
from flatland.envs.malfunction_generators import ParamMalfunctionGen, MalfunctionParameters
from rewards_fix import DefaultRewards
from scaled_penalties import get_scaled_penalties
from simple_logger import get_logger

import json
import numpy as np
from simple_logger import get_logger

logger = get_logger(__name__)


def rail_generator_from_grid_map(grid_map, level_free_positions):
    def rail_generator(*args, **kwargs):
        return grid_map, {
            "agents_hints": {"city_positions": {}},
            "level_free_positions": level_free_positions,
        }

    return rail_generator

def line_generator_from_line(line):
    def line_generator(*args, **kwargs):
        return line

    return line_generator


def timetable_generator_from_timetable(timetable):
    def timetable_generator(*args, **kwargs):
        return timetable

    return timetable_generator



def load(path: str, use_malfunctions=False, obs_builder_object=TreeObsForRailEnv(max_depth=1)) -> RailEnv:
    logger.info(f"Loading scenario from {path} (malfunctions={use_malfunctions})")
    with open(path, 'r') as f:
        data = json.load(f)

    width = data['gridDimensions']['cols']
    height = data['gridDimensions']['rows']
    
    number_of_agents = len(data['flatland line']['agent_positions'])
    
    agent_positions = data['flatland line']['agent_positions']
    agent_directions = data['flatland line']['agent_directions']
    agent_targets = data['flatland line']['agent_targets']
    agent_speeds = data['flatland line']['agent_speeds']


    agent_waypoints = {}
    for i, (positions, directions, targets) in enumerate(zip(agent_positions, agent_directions, agent_targets)):
        single_agent_waypoints = list()
        for k in range(len(positions)):
            single_agent_waypoints.append([Waypoint(position=tuple(position), direction=direction) for (position, direction) in zip(positions[k], directions[k])])
        single_agent_waypoints.append([Waypoint(position=tuple(targets[0]), direction=None)])
        agent_waypoints[i]= single_agent_waypoints
        
    line = Line(
        agent_waypoints=agent_waypoints,
        agent_speeds=agent_speeds
    )

    # Get max_episode_steps from timetable
    max_episode_steps = data['flatland timetable']['max_episode_steps']

    timetable = Timetable(
        earliest_departures = data['flatland timetable']['earliest_departures'],
        latest_arrivals = data['flatland timetable']['latest_arrivals'],
        max_episode_steps = max_episode_steps
    )

    grid = RailGridTransitionMap(width=width, height=height, transitions=RailEnvTransitions())
    grid.grid = np.array(data['grid'])

    level_free_positions = [tuple(item) for item in data['overpasses']]

    if use_malfunctions:
        malfunction_generator = ParamMalfunctionGen(MalfunctionParameters(0.04, 2, 10))
    else:
        malfunction_generator = None

    # Get scaled penalty parameters
    penalty_params = get_scaled_penalties(max_episode_steps, profile="balanced")

    env = RailEnv(
        width = width,
        height = height,
        number_of_agents = number_of_agents,
        rail_generator = rail_generator_from_grid_map(grid, level_free_positions),
        line_generator = line_generator_from_line(line),
        timetable_generator = timetable_generator_from_timetable(timetable),
        obs_builder_object = obs_builder_object,
        malfunction_generator= malfunction_generator,
        remove_agents_at_target=True,
        acceleration_delta= 0.3,
        braking_delta= -0.5,
        rewards= DefaultRewards(**penalty_params),
    )

    return env
