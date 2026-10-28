T-Brain Mobility Challenge
==========================

If you’ve ever sighed at the words “Your train is delayed” 😩 — and you also love to code, build, or experiment with AI agents 🤖 — then this repository is for you. The T-Brain Challenge simulates real train operations using timetable-based scenarios and provides a sandbox for building AI agents that improve train behaviour and reduce delays.

**Overview**
- **Purpose:** Simulate train stations and timetables to experiment with AI agent strategies for reducing delays and improving scheduling.
- **Origin:** Developed by Group Technology (2024) and T-Systems International, inspired by Kaggle-style competitions for the Deutsche Telekom AG data scientist community. It is based on the Flatland Challenge.
- **Core idea:** Use the included simulation environment to load realistic maps/timetables, run agent controllers, and evaluate performance.

**Quick Start**
- **Python:** This project targets Python 3.8+ (use your preferred pyenv/venv).
- **Virtual env (recommended):**
- **Virtual env (optional):** If you prefer isolation create/activate one before running with `uv`:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

- **Automatic dependencies:** This project supports running with `uv` which will automatically install required libraries from `pyproject.toml` before executing the script. If `uv` is available on your machine the next step will both install dependencies and run the simulation.

**Run the simulation**
- From the repository root run the main runner with `uv`. This will install any missing libraries automatically and then start the simulation:

```bash
uv run src/tbrain-simulation.py
```

- If `uv` is not installed, install it (for example) with:

```bash
pip install uv
```

- By default the runner loads the `neufrankfurt_19agents` map via `data/maps/neufrankfurt_19agents.json` and uses the `OrderedController` in `src/controller/`.

**What the runner does / outputs**
- **Animation:** When run with rendering enabled the code attempts to save an `animation.gif` in the current directory.
- **Result log:** An evaluation summary is written to `evaluation_result.log` (plain-text dict by default).

**Key Files & Structure**
- **`src/tbrain-simulation.py`**: Main script that sets up the environment, controller and runs a simulation episode.
- **`src/scenario_loader.py`**: Helper for loading scenarios and map files from `data/maps/`.
- **`src/simple_logger.py`**: Lightweight logging setup used by the runner.
- **`src/controller/`**: Controller implementations (agent policies):
	- `orderedcontroller.py` — a simple ordered policy used by default.
	- `randomcontroller.py` — a baseline random-action policy.
- **`data/maps/`**: JSON maps and scenarios. Swap these to run different simulations.

**How to change the scenario or controller**
- To run a different map, change the path passed to `scenario_loader.load(...)` in `src/tbrain-simulation.py` (example paths: `data/maps/smallville_mini.json`, `smallville_midi.json`, etc.).
- To test a different agent policy, replace the controller instantiation near the bottom of `src/tbrain-simulation.py`:

```python
# controller = RandomController(5)
controller = OrderedController()
```

**Notes for development**
- The environment uses the Flatland package to emulate rail networks and agent observations. Tweak observation builders and environment settings in the call to `scenario_loader.load(...)` for experiments.
- The runner limits episode length by a function of the environment size; you can pass `max_steps` to `run_episode(...)` when calling from other scripts.

**Contributing & Extending**
- Add new controllers under `src/controller/` and import them in `src/tbrain-simulation.py` to evaluate.
- Add new scenarios by placing JSON files under `data/maps/` and loading them via the scenario loader.


---

Have fun experimenting — and may your agents keep the trains on time! 🚆
