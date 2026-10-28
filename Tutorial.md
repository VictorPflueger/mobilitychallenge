Tutorial
==========================
Before you begin coding like a maniac, it is important for you to understand the basic tools you are given so you can use them to their full extent. Let's begin with a breakdown of the core parts that make up this code!

-----------------------------------------------------------------------------------------------------------------------

**AGENTS AND CONTROLLERS:**

**What actions can an agent/train perform?**
- As you probably know, trains don't often tend to fly around in the air, but rather use the rails they are on, which limits their movements to 5 specific actions that they can perform in the 2D environment. These options are defined in the 'RailEnvActions' enum under flatland.envs.rail_env_action; they are as follows:
DO_NOTHING (value 0): The agent stays in place. In dead-ends, this may imply a change of direction.
MOVE_LEFT (value 1): The agent turns left and accelerates.
MOVE_FORWARD (value 2): The agent accelerates keeping its current direction.
MOVE_RIGHT (value 3): The agent turns right and accelerates.
STOP_MOVING (value 4): The agent stops moving (if applicable, e.g., for malfunction handling).

**What is a Controller and how do I build my own?**
- This links to the question above.
A Controller ultimately is the thing that decides what the agents are going to do and just how they will act and make 'decisions'. You can find two pre-made Controllers under the same folder; one of them, OrderedController, will try to take the shortest way possible to its target, while the other one, RandomController, will roll the dice on what to do every single timestep (as you can imagine, this won't lead to a good average of results).
To build your own Controller, you have to create one in the controller folder. To try it out, you have to set the used Controller in tbrain-simulation.py to your own one. To do this, you'll have to navigate to line 99 and replace the used Controller with your own one. We can't wait to see how your Controller will operate!

-----------------------------------------------------------------------------------------------------------------------

**REWARDS:**

**How is the reward calculated and where can I find information regarding that?**
- If you check your flatland-rl package and search for the module flatland.env.rewards, you'll find the file that is used in scenario_loader.py in order to calculate just how great (or bad) the reward your attempt is going to receive will be!
If you're too lazy to read through the explanations there, here is a short summary of how the reward is calculated:
At the end of each train's journey, its individual reward is calculated by subtracting the actual time taken from the 'optimal' time it could have achieved if it had taken the shortest route, without slowing down or having trains in its way. Since it is very likely to make adjustments to its route, you can probably already imagine that a perfect score of 0 will only be possible to achieve in a minority of cases. Don't be suprised that your reward is negative. Unfortunately, in the railway industry nobody gives you a pat on the back for being on time. On the contrary, the lack of a huge negative reward is the highest compliment you can get. No worries: We will celebrate you for great results!

-----------------------------------------------------------------------------------------------------------------------

**OBSERVATIONS:**

**What is an observation?**
- An observation in this project is a data structure that represents the current state of the rail environment from an agent's perspective. It provides information like the agent's position, direction, target, nearby rail elements (e.g., switches, crossings), other agents, and possible actions. This allows agents to make decisions without needing full global knowledge. Kind of like in the real world, where there are limitations in train control systems.



**Which observations already exist?**
- The project uses Flatland's built-in observation builders. By default, it makes use of TreeObsForRailEnv(max_depth=2) (a tree-structured observation for local surroundings) and can switch to FullEnvObservation for a complete global view. Other options from Flatland include GlobalObsForRailEnv, which provides pretty much every information available, or custom ones like FlattenedNormalizedTreeObsForRailEnv for machine learning compatibility. You can find these in the flatland.envs.observations module.

**How do I use them?**
- Observations are generated automatically by the environment and passed to controllers. In src/tbrain-simulation.py, the run_episode function calls agent.act(obs[a]) for each agent, where obs[a] is the observation for agent a. Controllers like OrderedController parse this data to decide actions (e.g., analyzing the tree for paths). To experiment, change the obs_builder_object in scenario_loader.load(...) in src/scenario_loader.py or src/tbrain-simulation.py, then run the simulation to see how it affects agent behavior.

**How do I make my own?**
- To create a custom observation, inherit from flatland.core.env_observation_builder.ObservationBuilder and implement required methods like reset(), get_many(), and get_observation_space(). Place your class in a new file (e.g., src/my_observation.py), import it, and pass it as obs_builder_object in scenario_loader.load(...). For example, you could add timetable data or predictions. Test it by swapping in tbrain-simulation.py and observing agent performance. Show us how you make the most out of the given data and surprise us with some creative observations!
