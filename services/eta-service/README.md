# ETA Service (AI/ML) — Emergency & Home Healthcare Platform

Distance and baseline ETA estimates, a synthetic-trip evaluation, a simple
regression model comparison, and a FastAPI `POST /eta` endpoint.

> **Important:** ETA values are estimates, not guaranteed real arrival times.
> They use straight-line (Haversine) distance and assumed average speeds, not
> live traffic or real roads. All speeds and peak hours are illustrative
> assumptions, not measured data. All data in this project is fake/synthetic.
> Results on synthetic data must not be described as validated real-world
> traffic predictions. Not for real emergency dispatch.

## Status

- Done: project setup, configuration and input validation, Haversine distance
  and baseline `predict_eta` (`ml/eta/eta.py`), synthetic dataset and baseline
  evaluation (`ml/eta/synthetic.py`, `ml/eta/evaluate.py`), Linear Regression
  model and comparison with the baseline (`ml/eta/model.py`).
- Not built yet: FastAPI `POST /eta` with the baseline fallback.

## Setup

Developed and tested on Python 3.13.7. Python 3.11 or newer is expected to work
but has not been tested.

```bash
# 1. Create an isolated environment
python -m venv .venv

# 2. Activate it
#    macOS / Linux / Git Bash:   source .venv/bin/activate
#    Windows PowerShell:         .venv\Scripts\Activate.ps1
#    Windows Command Prompt:     .venv\Scripts\activate.bat

# 3. Install dependencies
pip install -r requirements-dev.txt

# 4. Create the data and the model (a few tests check the saved files)
python -m ml.eta.synthetic
python -m ml.eta.evaluate
python -m ml.eta.model

# 5. Run the tests
pytest
```

## Try the baseline ETA

```python
from ml.eta.eta import predict_eta

print(predict_eta(28.6139, 77.2090, 28.5355, 77.3910, 14, "BLS"))
# {'etaMinutes': 29.69, 'distanceKm': 19.8}
```

- Inputs: `fromLat`, `fromLng`, `toLat`, `toLng`, `hour` (whole number 0-23),
  `ambulanceType` (exactly `"BLS"`, the only supported type for now).
- Outputs: `etaMinutes` and `distanceKm`, rounded to 2 decimals.
- Invalid input raises `InvalidInputError`.

## Synthetic data and baseline evaluation

All trips are **fake**, generated from an invented model.

```bash
python -m ml.eta.synthetic     # data/synthetic_trips.csv (1000 fake trips, seed 42)
python -m ml.eta.evaluate      # data/baseline_metrics.json + data/baseline_examples.csv
```

The reported MAE measures the baseline against the invented synthetic world only.
It is not a measure of real-world accuracy. Fields, assumptions and limitations
are in `docs/dataset.md`.

## Model

A Linear Regression trained on the synthetic trips, using only what the API will
receive (distance, and a peak-hour flag). A Random Forest is trained for comparison
only.

```bash
python -m ml.eta.model         # models/ + data/model_comparison.json
```

```python
from ml.eta.model import load_model, predict_eta_with_model

loaded = load_model()
print(predict_eta_with_model(loaded, 28.6139, 77.2090, 28.5355, 77.3910, 14, "BLS"))
```

The trained model is committed in `models/`; recreate it with the command above after
changing the data or upgrading scikit-learn. Its error is measured on synthetic data
only. See `docs/model.md` for the features, results, limits and how to retrain.

## Freezing versions

After the first successful install, record exact versions so teammates get
the same ones:

```bash
pip freeze > requirements.lock.txt
```

## Project layout

See the roadmap: `ml/eta/` (logic), `api/` (FastAPI), `data/` (CSV and JSON
files), `models/` (trained model), `notebooks/`, `tests/`, `docs/`.
## Run the API (Phase 5)

```
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Then open http://127.0.0.1:8000/docs. `POST /eta` takes `fromLat`, `fromLng`, `toLat`, `toLng`,
`hour` (integer) and `ambulanceType` (`"BLS"`) and returns `etaMinutes` and `distanceKm`.
The learned model answers when it can; otherwise the baseline answers (header `X-ETA-Source`
says which). Full details: `docs/api_contract.md`. Estimates only, from fake data; not for
real dispatch.
## Sample request and response

Start the server (project folder, virtual environment active):

```
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Send a request from a second terminal (this exact call was run and returned the output below):

```
python -c "import httpx;r=httpx.post('http://127.0.0.1:8000/eta',json={'fromLat':28.6139,'fromLng':77.2090,'toLat':28.5355,'toLng':77.3910,'hour':14,'ambulanceType':'BLS'});print(r.status_code,r.headers.get('x-eta-source'),r.text)"
```

```
200 model {"etaMinutes":44.11,"distanceKm":19.8}
```

With `hour` sent as the text `"8"`, the API refuses it without repeating the value:

```
422 {"detail":[{"loc":["body","hour"],"msg":"hour must be a whole number (integer).","type":"value_error"}]}
```

These numbers come from a model trained on fake data. They are estimates, not guaranteed arrival times.

## More documentation

* `docs/api_contract.md`: request, response, errors and confirmed points.
* `docs/test_plan.md`: 42 documented test cases and what is not tested.
* `docs/dataset.md` and `docs/model.md`: the fake dataset and how the model is compared.
* `docs/limitations_and_blockers.md`: what is still open.
* `docs/demo_script.md`: a 5-minute demo.
* `notebooks/eta_baseline_and_models.ipynb`: results and sample calls, runs top to bottom.
## Sample request and response

Start the server (project folder, virtual environment active):

```
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Send a request from a second terminal (this exact call was run and returned the output below):

```
python -c "import httpx;r=httpx.post('http://127.0.0.1:8000/eta',json={'fromLat':28.6139,'fromLng':77.2090,'toLat':28.5355,'toLng':77.3910,'hour':14,'ambulanceType':'BLS'});print(r.status_code,r.headers.get('x-eta-source'),r.text)"
```

```
200 model {"etaMinutes":44.11,"distanceKm":19.8}
```

With `hour` sent as the text `"8"`, the API refuses it without repeating the value:

```
422 {"detail":[{"loc":["body","hour"],"msg":"hour must be a whole number (integer).","type":"value_error"}]}
```

These numbers come from a model trained on fake data. They are estimates, not guaranteed arrival times.

## More documentation

* `docs/api_contract.md`: request, response, errors and confirmed points.
* `docs/test_plan.md`: 42 documented test cases and what is not tested.
* `docs/dataset.md` and `docs/model.md`: the fake dataset and how the model is compared.
* `docs/limitations_and_blockers.md`: what is still open.
* `docs/demo_script.md`: a 5-minute demo.
* `notebooks/eta_baseline_and_models.ipynb`: results and sample calls, runs top to bottom.