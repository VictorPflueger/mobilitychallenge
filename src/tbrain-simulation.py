#%%
from flatland.utils.rendertools import RenderTool
import scenario_loader
import PIL
from controller.randomcontroller import RandomController
from controller.orderedcontroller import OrderedController
from flatland.envs.observations import TreeObsForRailEnv, FullEnvObservation
from flatland.envs.rail_env_action import RailEnvActions
from simple_logger import setup_logging, get_logger
import json


setup_logging()
logger = get_logger(__name__)


def render_env(env, step_count, episode_count, wait=True, env_renderer = None):
    if env_renderer is None:
        env_renderer = RenderTool(env)
    env_renderer.render_env(
        show_observations=False,
        show_inactive_agents=True,
        show_rowcols=False,
        episode=episode_count,
        step=step_count,
        frames=True,
        )

    image = env_renderer.get_image()
    return PIL.Image.fromarray(image)


def run_episode(env, agent, render = True, max_steps = 500):
    obs, info = env.reset()
    logger.debug(f"Environment reset; info keys: {list(info.keys()) if isinstance(info, dict) else info}")

    env_renderer = RenderTool(env)
    render_env(env, 0, 0)
    env._max_episode_steps
    
    max_steps = min(max_steps, 100 * (env.height + env.width)-1)
    action_dict = dict()
    total_reward = 0
    
    done = env.dones
    # Run episode
    frames = list()
    step_evaluation = list()
    for step in range(max_steps):
        # Action
        for a in range(env.get_num_agents()):
            if done[a]:
                action = 4
            else:
                action = agent.act(obs[a])
            action_dict[a] = RailEnvActions.from_value(action)
        
        # Environment step
        obs, all_rewards, done, _ = env.step(action_dict)
        step_evaluation.append(action_dict)
        
        total_reward += sum(all_rewards.values())    
        logger.info(f'Timestep {step}, current reward = {total_reward}, done_agents = {sum(1 for k, v in done.items() if k != '__all__' and bool(v))}')

        if done['__all__']:
            logger.info('All done')
            break

        # Render
        if render:
            frames.append(render_env(env, step_count=step, episode_count=1, env_renderer=env_renderer))
    
    if render:
            try:
                output = 'animation.gif'
                frames[0].save(output, save_all=True, append_images=frames[1:], duration=200, loop=0)
                logger.info(f'Saved simulation to {output}')
            except Exception as e:
                logger.warning(f"Failed to save GIF: {e}")

    evaluation = dict()
    evaluation['reward'] = total_reward
    # Count agents with a True 'done' value, excluding the special '__all__' key
    evaluation['done_agents'] = sum(1 for k, v in done.items() if k != '__all__' and bool(v))
    # Total number of agent entries (exclude '__all__')
    evaluation['agents'] = sum(1 for k in done.keys() if k != '__all__')
    evaluation['done_rate'] = evaluation['done_agents'] / evaluation['agents'] if evaluation['agents'] > 0 else 0
    
    evaluation['steps'] = step_evaluation
    
    return evaluation


# Create environment using helper
if __name__ == '__main__':
    logger.info('Starting simulation')
    # Load environment 
    env = scenario_loader.load('data/maps/neufrankfurt_19agents.json', use_malfunctions=False, obs_builder_object=TreeObsForRailEnv(max_depth=2))
    hash = hash(env.agent_positions)
    # controller = RandomController(5)
    controller = OrderedController()

    # run and log
    result = run_episode(env, controller, render=True, max_steps=100000)
    result['env_hash'] = hash
    logger.info(f'Finished run, result: {result["reward"]}')
    
    # Write result to file 'evaulation_result.log' for leaderboard as a text file
    with open('evaluation_result.log', 'w') as f:
        # Write result to file but not as json
        # Convert RailEnvActions in numeric values
        result_for_output = result.copy()
        if 'steps' in result_for_output:
            result_for_output['steps'] = [
                {agent: action.value for agent, action in step.items()} 
                for step in result['steps']
            ]
        f.write(str(result_for_output))
