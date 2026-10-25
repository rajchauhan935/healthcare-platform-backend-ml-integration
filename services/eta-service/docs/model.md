# ETA model (AI-06)

> **Trained on fake data only.** The model learns the invented world described in
> `docs/dataset.md`. Its error says nothing about real-world accuracy, and ETAs are
> estimates, not guaranteed arrival times. Not for real emergency dispatch.

## What it is

A Linear Regression that predicts travel time in minutes from three numbers that the API
will receive (coordinates and hour). It lives in `ml/eta/model.py`.

| Feature | Meaning |
|---|---|
| `distanceKm` | Straight-line (Haversine) distance from the four coordinates |
| `isPeak` | 1 if the hour is a peak hour (`config.is_peak_hour`), otherwise 0 |
| `distanceKmXPeak` | `distanceKm` times `isPeak`, so peak hours can have a different speed |

**Deliberately not used:** `trafficLevel`, `roadType` and `dayOfWeek` (they are in the
dataset but the API never receives them, so a model that needed them could not run behind
the API) and `ambulanceType` (always `BLS`, so it carries no information).

A Random Forest (200 trees, using distance and the raw hour) is trained **for comparison
only**. The saved and served model is the Linear Regression. It is simple to explain, and it
extends a straight line beyond the longest training trip, while a forest simply repeats its
largest training value.

## How it is trained and compared

* Same split as Phase 3: 800 training and 200 validation trips (`split_train_validation`).
* The model is fitted on the 800 training trips only. No scaling is needed, and the feature
  builder has nothing to fit, so nothing can leak.
* Evidence about the two model types comes from 5-fold cross-validation on the training
  trips only. The 200 validation trips are scored once, at the end.
* `data/model_comparison.json` holds the MAE of the baseline, the Linear Regression, the
  Random Forest and a "guess the training mean" reference, plus a seeded paired bootstrap
  (2,000 resamples) for the difference between baseline and Linear Regression.

## Results from one run (synthetic data, scikit-learn 1.9.1)

Your numbers can differ slightly; the saved `data/model_comparison.json` is the record.

| Validation MAE (minutes) | Baseline | Linear Regression | Random Forest |
|---|---|---|---|
| All 200 trips | 11.22 | 9.80 | 9.99 |
| Peak hours (62 trips) | 12.11 | 12.77 | 13.17 |
| Off-peak hours (138 trips) | 10.82 | 8.47 | 8.56 |

* Overall the model is better than the baseline by about 1.4 minutes (95% interval roughly
  0.4 to 2.4). The model has the smaller error on only about 55% of individual trips.
* The win comes entirely from off-peak hours. In peak hours the baseline was slightly better
  on these 62 trips, but that gap is within noise (the interval includes 0).
* Why the model wins at all: the baseline assumes 25 or 40 km/h, while the invented world
  runs at roughly 28 km/h on average (about 2.15 minutes per km, plus a short start-up time).
  The model mostly learns that. The biggest remaining error comes from traffic level and road
  type, which the API cannot provide.

## Limits to remember

* **Synthetic only.** Every number describes an invented world, never real roads.
* **Short peak-hour trips fail on purpose.** In the saved model, a peak-hour trip shorter
  than about 0.33 km would get a negative time. `predict_eta_with_model` raises
  `ModelPredictionError` for any output that is not a finite number of at least 0, and never
  clips it. The API (Phase 5) falls back to the baseline in that case.
* **Training range.** Training trips are about 0.5 to 22 km. Longer requests are
  extrapolation; the range is saved in the metadata so the API can decide what to do.
* **Identical points** return 0.0 and 0.0 before the model runs, like the baseline
  (Not yet confirmed with with Naga).
* **The model's estimates are higher than the baseline's.** The 19.8 km sample trip gets about
  44 minutes from the model and about 30 from the baseline, because the invented world is
  slower than the baseline's assumptions.

## Files

| File | Content |
|---|---|
| `models/eta_linear_regression.joblib` | The fitted Linear Regression |
| `models/eta_linear_regression.json` | Metadata: feature names, coefficients, training rows, training distance range, peak hours, scikit-learn version, a checksum of the model file |
| `data/model_comparison.json` | The comparison described above |

The trained model files are committed to Git. They only load with the scikit-learn version
that created them; with any other version `load_model` refuses them (the fix is to retrain),
so keep the scikit-learn version the same across the team.

## Train, load, retrain

```
python -m ml.eta.model        # trains, compares, writes models/ and data/model_comparison.json
```

```python
from ml.eta.model import load_model, predict_eta_with_model

loaded = load_model()
print(predict_eta_with_model(loaded, 28.6139, 77.2090, 28.5355, 77.3910, 14, "BLS"))
# {'etaMinutes': 44.11, 'distanceKm': 19.8}
```

* `load_model` raises `ModelLoadError` if a file is missing or unreadable, if the checksum
  does not match, or if the saved model does not match the code (feature list, peak hours,
  ambulance types, or scikit-learn version). The fix is always to retrain.
* **Retrain** after changing peak hours or ambulance types in `config.py`, after
  regenerating the dataset, or after upgrading scikit-learn. The same data, seed and library
  versions give identical files.
* **Security:** a `.joblib` file is a pickle. Only load model files you created yourself. The
  checksum protects against accidental damage, not against someone who can edit both files.