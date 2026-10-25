# Pull Request draft

Use this as the description when the work is pushed to the author's own repository (a Pull
Request is optional). Fill in the `[ ]` items that are still open before submitting.

## Title

ETA service: baseline, synthetic dataset, model comparison and POST /eta (AI-04, AI-05, AI-06)

## Summary

Adds the ETA estimator for the Emergency & Home Healthcare Platform:

* **AI-04** formula baseline (`predict_eta`): Haversine distance, 25 or 40 km/h, strict validation.
* **AI-05** clearly labelled synthetic dataset (1000 trips), baseline MAE and 20 example predictions.
* **AI-06** Linear Regression (and a Random Forest comparison), plus FastAPI `POST /eta` with the
  baseline as automatic fallback, `GET /health` and an optional `X-ETA-Source` header.

All model results are on fake data and are NOT a measure of real-world accuracy. ETAs are
estimates, not guaranteed arrival times. Not for real dispatch.

## API contract (agreed fields)

* Request: `fromLat`, `fromLng`, `toLat`, `toLng`, `hour` (integer 0 to 23), `ambulanceType` (`"BLS"`).
* Response: `etaMinutes`, `distanceKm` (2 decimals).
* Invalid input: 422 without echoing the submitted values. Details in `docs/api_contract.md`.

## How to test

```
python -m pip install -r requirements-dev.txt
pytest -q
uvicorn api.main:app --host 127.0.0.1 --port 8000
```

Evidence (run by the author on Windows, Python 3.13.7, 12 Oct 2026):

* `pytest -q`: 598 passed, 1 warning (a harmless `httpx` deprecation notice).
* Live check: valid request gave `200 model {"etaMinutes":44.11,"distanceKm":19.8}`; hour sent as
  text gave the expected 422.
* Test plan with 42 documented cases: `docs/test_plan.md`.

## Where to look

| Area | Files |
|---|---|
| Baseline and validation | `ml/eta/config.py`, `ml/eta/validation.py`, `ml/eta/eta.py` |
| Synthetic data and baseline evaluation | `ml/eta/synthetic.py`, `ml/eta/evaluate.py`, `docs/dataset.md`, `data/` |
| Model | `ml/eta/model.py`, `docs/model.md`, `models/` |
| Fallback and API | `ml/eta/estimator.py`, `api/main.py`, `api/schemas.py`, `docs/api_contract.md` |
| Tests | `tests/`, `docs/test_plan.md` |
| Handover | `README.md`, `notebooks/eta_baseline_and_models.ipynb`, `docs/demo_script.md`, `docs/limitations_and_blockers.md` |

## Points for the reviewer

1. **Hand-over jump at the long end.** The model only answers between about 0.52 and 21.99 km;
   longer trips use the baseline, which is 11 to 16 minutes lower there. Decision needed.
2. **Peak hours.** Linear Regression is worse than the baseline in peak hours in the validation
   sample (12.77 against 12.11 minutes), although better overall.
3. **Strict validation.** `hour` must be a real integer and `ambulanceType` exactly `"BLS"`;
   pydantic's lax conversion is deliberately bypassed (the request fields are typed `Any` and
   checked by `ml/eta/validation.py`).
4. **Pickle model file** is committed (lead approved). scikit-learn is pinned to exactly 1.9.1.
5. Baseline speeds and peak hours are accepted assumptions, not measurements.

## Author self-review

- [x] Tests run and pass on the author's machine (598 passed).
- [x] Errors and invalid input handled and tested; error messages never echo submitted values.
- [x] No debug prints, TODO or FIXME markers; a simple scan found no unused imports.
- [x] Synthetic data labelled everywhere; no claim of real-world accuracy.
- [x] Naga confirmed the three contract points (reported by the author; reply not stored).
- [x] README, API contract, dataset, test plan, demo script and limitations are written.
- [ ] A linter and type checker (for example `ruff`, `mypy`) were NOT run. Run them if the team uses them.
-  [x] Fresh-clone check (13 Oct 2026): a new clone with a new virtual environment, installed from `requirements-dev.txt`, gave 598 passed. It installed slightly newer packages than `requirements.lock.txt` (for example pydantic 2.14.1 and numpy 2.5.4) and still passed.
- [x] Repository: the mentor said to use the author's own repository, so the lead's naming rules do not apply.
- [x] Pushed to the author's own repository (github.com/Sedentaryshreya/eta-service, branch feature/eta-baseline) on 17 Oct 2026.
- [ ] Not tested: load, other operating systems, the Node.js caller.