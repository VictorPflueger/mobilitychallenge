import numpy as np
from flatland.envs.observations import TreeObsForRailEnv

def min_gt(seq, val):
    """
    Return smallest item in seq for which item > val applies.
    None is returned if seq was empty or all items in seq were >= val.
    """
    min = np.inf
    idx = len(seq) - 1
    while idx >= 0:
        if seq[idx] >= val and seq[idx] < min:
            min = seq[idx]
        idx -= 1
    return min

class OrderedController:

    def __init__(self):
        self.action_size = 5

    def act(self, state, eps=0):
        """
        :param state: input is the observation of the agent
        :return: returns an action
        """
        distance = []
        for direction in TreeObsForRailEnv.tree_explored_actions_char:
            try:
                distance.append(state.childs[direction].dist_min_to_target)
            except:
                distance.append(np.inf)
        distance = np.array(distance)
        min_dist = min_gt(distance, 0)
        min_direction = np.where(distance == min_dist)
        if len(min_direction[0]) > 1:
            return min_direction[0][-1] + 1
        return min_direction[0][0] + 1
