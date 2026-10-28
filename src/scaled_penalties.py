"""
Scaled Penalty Configuration for T-Brain Mobility Challenge
============================================================

PROBLEM
-------
The flatland-rl DefaultRewards uses fixed penalty values that don't scale with
scenario size. In large scenarios (1000+ steps, 50+ agents), penalties become
negligible after normalization, making crashes and cancellations essentially free.

Example:
    Small scenario (100 steps, 3 agents):
        Crash penalty -75 → 25% impact on normalized score ✓

    Large scenario (1000 steps, 50 agents):
        Crash penalty -75 → 0.15% impact on normalized score ✗

SOLUTION
--------
Express penalties as FRACTIONS of max_episode_steps instead of fixed values.
This maintains consistent relative impact across all scenario sizes.

USAGE
-----
1. Copy this file to the project source directory

2. Modify your scenario_loader.py

    from flatland.envs.rewards import DefaultRewards
    from scaled_penalties import get_scaled_penalties

    def load(path: str, use_malfunctions=False, ...):
        # ... existing code to load scenario ...

        # Get max_episode_steps from timetable
        max_episode_steps = data['flatland timetable']['max_episode_steps']

        # Get scaled penalty parameters
        penalty_params = get_scaled_penalties(max_episode_steps, profile="balanced")

        # Create environment with scaled rewards
        env = RailEnv(
            ...,
            rewards=DefaultRewards(**penalty_params),
        )
        return env

3. Choose profile based on training needs:
    - "conservative": Gentler penalties, easier initial learning
    - "balanced": Recommended for most cases (default)
    - "aggressive": Strong deterrents, use after basic learning

PROFILES EXPLAINED
------------------
All profiles express penalties as percentages of max_episode_steps:

Conservative:
    - Crash: 50% of episode length
    - Missed stop: 30% of episode length
    - Cancellation: 3x travel time + 20% buffer

Balanced (Recommended):
    - Crash: 75% of episode length
    - Missed stop: 40% of episode length
    - Cancellation: 4x travel time + 30% buffer

Aggressive:
    - Crash: 100% of episode length (full episode penalty!)
    - Missed stop: 50% of episode length
    - Cancellation: 5x travel time + 50% buffer

PENALTY HIERARCHY
-----------------
From most severe to least severe:
    1. Crashes         - Catastrophic safety incident
    2. Cancellations   - Complete service failure
    3. Missed stops    - Passengers stranded
    4. Early departure - Passengers miss their train
    5. Late arrival    - Service delivered but delayed

This hierarchy reflects real-world railway operations priorities:
safety first, reliability second, punctuality third.
"""

from typing import Dict, Literal


def get_scaled_penalties(
    max_episode_steps: int,
    profile: Literal["conservative", "balanced", "aggressive"] = "balanced"
) -> Dict[str, float]:
    """
    Get penalty parameters scaled to scenario size.

    Penalties are expressed as fractions of max_episode_steps to maintain
    consistent relative impact across all scenario sizes (small to large).

    Parameters
    ----------
    max_episode_steps : int
        Maximum episode steps from the scenario's timetable data.
        Extract from: data['flatland timetable']['max_episode_steps']

    profile : {"conservative", "balanced", "aggressive"}, default="balanced"
        Penalty severity profile:
        - "conservative": Gentler penalties for initial learning
        - "balanced": Recommended for most training scenarios
        - "aggressive": Strong deterrents for safety-critical applications

    Returns
    -------
    dict
        Parameters dictionary ready for: DefaultRewards(**params)
        Contains:
        - crash_penalty_factor: float
        - cancellation_factor: float
        - cancellation_time_buffer: float
        - intermediate_not_served_penalty: float
        - intermediate_early_departure_penalty_factor: float
        - intermediate_late_arrival_penalty_factor: float

    Raises
    ------
    ValueError
        If profile is not one of the allowed values.

    Notes
    -----
    Scaling ensures penalties maintain proportional impact:
    - Small scenarios (100 steps): crash = -37.5, impact = 12.5%
    - Large scenarios (1000 steps): crash = -375, impact = 0.75%

    Without scaling, large scenario crash would be negligible (0.15% impact).

    Per-step factors (early_departure, late_arrival) don't need scaling
    because they're already proportional to time differences.
    """

    # Validate profile
    valid_profiles = {"conservative", "balanced", "aggressive"}
    if profile not in valid_profiles:
        raise ValueError(
            f"Unknown profile: '{profile}'. "
            f"Must be one of: {', '.join(sorted(valid_profiles))}"
        )

    # Define profiles as fractions of max_episode_steps
    profiles = {
        "conservative": {
            # Crash: 50% of episode length
            "crash_penalty_factor": 0.50 * max_episode_steps,

            # Cancellation: 3x travel time + 20% episode buffer
            "cancellation_factor": 3.0,
            "cancellation_time_buffer": 0.20 * max_episode_steps,

            # Missed stop: 30% of episode length
            "intermediate_not_served_penalty": 0.30 * max_episode_steps,

            # Per-step factors (already proportional, no scaling needed)
            "intermediate_early_departure_penalty_factor": 1.5,
            "intermediate_late_arrival_penalty_factor": 0.5,
        },

        "balanced": {
            # Crash: 75% of episode length
            "crash_penalty_factor": 0.75 * max_episode_steps,

            # Cancellation: 4x travel time + 30% episode buffer
            "cancellation_factor": 4.0,
            "cancellation_time_buffer": 0.30 * max_episode_steps,

            # Missed stop: 40% of episode length
            "intermediate_not_served_penalty": 0.40 * max_episode_steps,

            # Per-step factors
            "intermediate_early_departure_penalty_factor": 1.75,
            "intermediate_late_arrival_penalty_factor": 0.5,
        },

        "aggressive": {
            # Crash: 100% of episode length (full episode penalty!)
            "crash_penalty_factor": 1.0 * max_episode_steps,

            # Cancellation: 5x travel time + 50% episode buffer
            "cancellation_factor": 5.0,
            "cancellation_time_buffer": 0.50 * max_episode_steps,

            # Missed stop: 50% of episode length
            "intermediate_not_served_penalty": 0.50 * max_episode_steps,

            # Per-step factors
            "intermediate_early_departure_penalty_factor": 2.0,
            "intermediate_late_arrival_penalty_factor": 0.5,
        },
    }

    return profiles[profile]
