// The optimized run: a plan, replayed. The plan was computed in Python by PlannerController (a few
// minutes of search per map), through the challenge's own runner; tools/check_plan.py re-runs it and
// compares. data/<map>/planner_actions.json holds the action it handed to every train at every
// step. The replay sees nothing of the environment but the step number; the engine simulates and
// scores the episode itself.

export class ReplayController {
  /** plan: { actions: [[action of train 0, …], …] }, indexed by step; id: the run it plays. */
  constructor(plan, id) {
    this.id = id;
    this.plan = plan;
  }

  act(handle, env) {
    const step = this.plan.actions[env.elapsed];
    if (!step) throw new Error(`the plan has no actions for step ${env.elapsed}`);
    return step[handle];
  }
}
