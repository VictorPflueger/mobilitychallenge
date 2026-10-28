// The optimized run: PlannerController's plan, replayed. The planner (Python, about two minutes of
// search) ran through the challenge's own runner with the documented wiring; data/planner_actions.json
// holds the action it handed to every train at every step (tools/check_plan.py re-runs the planner
// and compares). The replay sees nothing of the environment but the step number; the engine
// simulates and scores the episode itself.

export class ReplayController {
  constructor(plan) {
    this.id = "optimized";
    this.plan = plan;
  }

  act(handle, env) {
    const step = this.plan.actions[env.elapsed];
    if (!step) throw new Error(`the plan has no actions for step ${env.elapsed}`);
    return step[handle];
  }
}
