from collections import defaultdict
from typing import Dict, Set, Optional

from flatland.core.env_observation_builder import AgentHandle
from flatland.envs.agent_utils import EnvAgent
from flatland.envs.distance_map import DistanceMap
from flatland.envs.rail_trainrun_data_structures import Waypoint
from flatland.envs.step_utils.env_utils import AgentTransitionData
from flatland.envs.step_utils.states import TrainState


def defaultdict_set():
    return defaultdict(lambda: set())


class DefaultRewards:
    """
    Default Reward Function.

    This scoring function is designed to capture key operational metrics such as punctuality,
    efficiency in responding to disruptions, and safety.

    Punctuality and schedule adherence are rewarded based on the difference between actual and
    target arrival and departure times at each stop respectively, as well as penalties for
    intermediate stops not served or even journeys not started.

    Safety measures are implemented as penalties for collisions which are directly proportional
    to the train's speed at impact, ensuring that high-speed operations are managed with extra caution.
    """

    def __init__(self,
                 epsilon: float = 0.01,
                 cancellation_factor: float = 1,
                 cancellation_time_buffer: float = 0,
                 intermediate_not_served_penalty: float = 1,
                 intermediate_late_arrival_penalty_factor: float = 0.2,
                 intermediate_early_departure_penalty_factor: float = 0.5,
                 crash_penalty_factor: float = 0.0
                 ):
        r"""
        Parameters
        ----------
        epsilon : float
            avoid rounding errors, defaults to 0.01.
        cancellation_factor : float
            Cancellation factor $\phi \geq 0$. defaults to  1.
        cancellation_time_buffer : float
            Cancellation time buffer $\pi \geq 0$. Defaults to 0.
        intermediate_not_served_penalty : float
           Intermediate stop not served penalty $\mu \geq 0$. Applied if one of the intermediates
           is not served or only run through without stopping. Defaults to 1.
        intermediate_late_arrival_penalty_factor : float
            Intermediate late arrival penalty factor $\alpha \geq 0$. Defaults to 0.2.
        intermediate_early_departure_penalty_factor : float
            Intermediate early departure penalty factor $\delta \geq 0$. Defaults to 0.5.
        crash_penalty_factor : float
            Crash penalty factor $\kappa \geq 0$. Defaults to 0.0.
        """
        self.crash_penalty_factor = crash_penalty_factor
        self.intermediate_early_departure_penalty_factor = intermediate_early_departure_penalty_factor
        self.intermediate_late_arrival_penalty_factor = intermediate_late_arrival_penalty_factor
        self.intermediate_not_served_penalty = intermediate_not_served_penalty
        self.cancellation_time_buffer = cancellation_time_buffer
        self.cancellation_factor = cancellation_factor
        assert self.crash_penalty_factor >= 0
        assert self.intermediate_early_departure_penalty_factor >= 0
        assert self.intermediate_late_arrival_penalty_factor >= 0
        assert self.intermediate_not_served_penalty >= 0
        assert self.cancellation_time_buffer >= 0
        assert self.cancellation_factor >= 0
        # https://stackoverflow.com/questions/16439301/cant-pickle-defaultdict
        self.arrivals: Dict[AgentHandle, Dict[Waypoint, int]] = defaultdict(defaultdict)
        self.departures: Dict[AgentHandle, Dict[Waypoint, int]] = defaultdict(defaultdict)
        self.states: Dict[AgentHandle, Dict[Waypoint, Set[TrainState]]] = defaultdict(defaultdict_set)

    def step_reward(self, agent: EnvAgent, agent_transition_data: AgentTransitionData, distance_map: DistanceMap, elapsed_steps: int) -> float:
        reward = 0
        if agent.position is not None:
            wp = Waypoint(agent.position, agent.direction)
            self.states[agent.handle][wp].add(agent.state)
            if wp not in self.arrivals[agent.handle]:
                self.arrivals[agent.handle][wp] = elapsed_steps
                old_wp = Waypoint(agent.old_position, agent.old_direction)
                self.departures[agent.handle][old_wp] = elapsed_steps
            else:
                # Waypoint already recorded. This is OK if agent is dwelling (staying at same position).
                # But if agent moved away and came back, this indicates the scenario has duplicate
                # waypoints, which requires List[int] tracking instead of single int.
                old_wp = Waypoint(agent.old_position, agent.old_direction)
                if old_wp != wp:
                    # Agent moved from a different position to this waypoint - genuine revisit!
                    prev_arrival = self.arrivals[agent.handle][wp]
                    raise AssertionError(
                        f"Agent {agent.handle} revisiting waypoint {wp} at step {elapsed_steps}. "
                        f"Previous arrival at step {prev_arrival}. "
                        f"This scenario has duplicate waypoints in the route, which is not supported "
                        f"by the current implementation. Change arrivals/departures to "
                        f"Dict[AgentHandle, Dict[Waypoint, List[int]]] to support this."
                    )
        if agent.state_machine.previous_state == TrainState.MOVING and agent.state == TrainState.STOPPED and not agent_transition_data.state_transition_signal.stop_action_given:
            reward += -1 * agent_transition_data.speed * self.crash_penalty_factor

        if agent.state == TrainState.DONE and agent.state_machine.previous_state != TrainState.DONE:
            reward += self._agent_done_or_max_episode_steps_reward(agent, distance_map, elapsed_steps)
        return reward

    def end_of_episode_reward(self, agent: EnvAgent, distance_map: DistanceMap, elapsed_steps: int) -> float:
        # If agent is DONE, the reward was already calculated when it transitioned to DONE in step_reward
        # Only calculate end-of-episode penalty for agents that didn't finish
        if agent.state == TrainState.DONE:
            return 0
        return self._agent_done_or_max_episode_steps_reward(agent, distance_map, elapsed_steps)

    def _agent_done_or_max_episode_steps_reward(self, agent, distance_map, elapsed_steps):
        reward = 0
        if agent.state == TrainState.DONE:
            # delay at target
            # if agent arrived earlier or on time = 0
            # if agent arrived later = -ve reward based on how late
            reward = min(agent.latest_arrival - agent.arrival_time, 0)
        else:
            if agent.state.is_off_map_state():
                # journey not started
                reward = -1 * self.cancellation_factor * \
                         (agent.get_travel_time_on_shortest_path(distance_map) + self.cancellation_time_buffer)

            # target not reached
            if agent.state.is_on_map_state():
                reward = agent.get_current_delay(elapsed_steps, distance_map)
        for intermediate_alternatives, la, ed in zip(agent.waypoints[1:-1], agent.waypoints_latest_arrival[1:-1],
                                                     agent.waypoints_earliest_departure[1:-1]):
            agent_arrivals: Set[Waypoint] = set(self.arrivals[agent.handle])
            intermediate_alternatives: Set[Waypoint] = set(intermediate_alternatives)
            wps_intersection: Set[Waypoint] = intermediate_alternatives.intersection(agent_arrivals)
            if len(wps_intersection) == 0 or TrainState.STOPPED not in self.states[agent.handle][list(wps_intersection)[0]]:
                # stop not served or served but not stopped
                reward += -1 * self.intermediate_not_served_penalty
            else:
                wp = list(wps_intersection)[0]
                # late arrival
                reward += self.intermediate_late_arrival_penalty_factor * min(la - self.arrivals[agent.handle][wp], 0)
                # early departure
                # N.B. if arrival but not departure, handled by above by departed but never reached.
                if wp in self.departures[agent.handle]:
                    reward += self.intermediate_early_departure_penalty_factor * min(self.departures[agent.handle][wp] - ed, 0)
        return reward

    def cumulate(self, *rewards: float) -> float:
        return sum(rewards)

    def normalize(self, *rewards: float, num_agents: int, max_episode_steps: int) -> float:
        # https://flatland-association.github.io/flatland-book/challenges/flatland3/eval.html
        return sum(rewards) / (max_episode_steps * num_agents) + 1.0

    def empty(self) -> float:
        return 0
