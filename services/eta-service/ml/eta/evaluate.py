"""Baseline evaluation on the SYNTHETIC trips (ticket AI-05).

This module scores the Phase 2 baseline (``predict_eta``) against the "true"
travel times in the synthetic dataset and saves:
  * data/baseline_metrics.json   - the MAE and a few supporting numbers
  * data/baseline_examples.csv   - 20 example predictions

IMPORTANT: the dataset is fake and its travel times come from an invented model
(see ``synthetic.py``). The MAE below measures the baseline against THAT invented
world. It is not evidence of real-world accuracy.

Run it:  python -m ml.eta.evaluate
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pandas as pd

from ml.eta.config import DEFAULT_CONFIG
from ml.eta.eta import predict_eta
from ml.eta.synthetic import (
    DATA_SOURCE_LABEL,
    DEFAULT_OUTPUT_PATH,
    PROJECT_ROOT,
    DatasetError,
    load_trips_csv,
    validate_trips_dataframe,
)

__all__ = [
    "N_EXAMPLES",
    "SPLIT_SEED",
    "VALIDATION_FRACTION",
    "baseline_predictions",
    "build_examples",
    "compute_baseline_metrics",
    "mean_absolute_error",
    "run_baseline_evaluation",
    "split_train_validation",
]

DEFAULT_DATA_DIR: Path = PROJECT_ROOT / "data"
METRICS_FILE_NAME: str = "baseline_metrics.json"
EXAMPLES_FILE_NAME: str = "baseline_examples.csv"

# The split is defined here once. Phase 4 (the ML model) must reuse
# ``split_train_validation`` so the model never trains on validation rows.
VALIDATION_FRACTION: float = 0.2
SPLIT_SEED: int = 42
EXAMPLE_SEED: int = 42
N_EXAMPLES: int = 20  # the PDF asks for 20 example predictions

DISCLAIMER: str = (
    "Synthetic (fake) data only. The travel times come from an invented model, so this "
    "number is NOT a measure of real-world accuracy. ETAs are estimates, not guaranteed "
    "arrival times."
)

_EXAMPLE_COLUMNS: tuple[str, ...] = (
    "tripId",
    "fromLat",
    "fromLng",
    "toLat",
    "toLng",
    "distanceKm",
    "hour",
    "dayOfWeek",
    "ambulanceType",
    "trafficLevel",
    "roadType",
    "actualTravelTimeMinutes",
    "baselineEtaMinutes",
    "errorMinutes",
    "absoluteErrorMinutes",
    "dataSource",
)


def _as_float_array(values: object, name: str) -> np.ndarray:
    """Return ``values`` as a 1-D float array, rejecting text, bools and NaN/inf."""
    array = np.asarray(values)
    if array.dtype.kind not in "iuf":
        raise ValueError(f"{name} must contain only numbers.")
    array = array.astype(float)
    if array.ndim != 1:
        raise ValueError(f"{name} must be a one-dimensional sequence.")
    if not np.isfinite(array).all():
        raise ValueError(f"{name} must contain only finite numbers.")
    return array


def mean_absolute_error(actual: object, predicted: object) -> float:
    """Mean absolute error: the average of |actual - predicted|, in the same unit.

    Example: actual [10, 20], predicted [12, 17] -> errors 2 and 3 -> MAE 2.5.
    """
    actual_array = _as_float_array(actual, "actual")
    predicted_array = _as_float_array(predicted, "predicted")
    if actual_array.size == 0 or predicted_array.size == 0:
        raise ValueError("actual and predicted must not be empty.")
    if actual_array.shape != predicted_array.shape:
        raise ValueError("actual and predicted must have the same length.")
    return float(np.mean(np.abs(actual_array - predicted_array)))


def split_train_validation(
    trips: pd.DataFrame,
    seed: int = SPLIT_SEED,
    validation_fraction: float = VALIDATION_FRACTION,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split trips into (train, validation) at random, reproducibly.

    The two parts never share a row. Rows keep their original order.
    """
    validate_trips_dataframe(trips)
    if isinstance(seed, bool) or not isinstance(seed, (int, np.integer)) or seed < 0:
        raise ValueError("seed must be a non-negative whole number.")
    if (
        isinstance(validation_fraction, bool)
        or not isinstance(validation_fraction, (int, float, np.floating))
        or not 0.0 < float(validation_fraction) < 1.0
    ):
        raise ValueError("validation_fraction must be a number between 0 and 1 (exclusive).")
    n_rows = len(trips)
    if n_rows < 2:
        raise ValueError("At least 2 trips are needed to make a train/validation split.")

    n_validation = int(round(n_rows * float(validation_fraction)))
    n_validation = min(max(n_validation, 1), n_rows - 1)

    rng = np.random.default_rng(int(seed))
    validation_positions = np.sort(rng.permutation(n_rows)[:n_validation])
    is_validation = np.zeros(n_rows, dtype=bool)
    is_validation[validation_positions] = True
    train = trips.iloc[~is_validation].reset_index(drop=True)
    validation = trips.iloc[is_validation].reset_index(drop=True)
    return train, validation


def baseline_predictions(trips: pd.DataFrame) -> pd.Series:
    """Run the real Phase 2 ``predict_eta`` on every trip; return the ETA minutes."""
    etas = [
        predict_eta(
            row.fromLat, row.fromLng, row.toLat, row.toLng, row.hour, row.ambulanceType
        )["etaMinutes"]
        for row in trips.itertuples(index=False)
    ]
    return pd.Series(etas, index=trips.index, name="baselineEtaMinutes", dtype=float)


def _group_summary(actual: pd.Series, predicted: pd.Series) -> dict[str, object]:
    """Row count and MAE for one group of trips (MAE is None for an empty group)."""
    if len(actual) == 0:
        return {"rows": 0, "maeMinutes": None}
    return {
        "rows": int(len(actual)),
        "maeMinutes": round(mean_absolute_error(actual, predicted), 4),
    }


def compute_baseline_metrics(validation: pd.DataFrame, predictions: pd.Series) -> dict[str, object]:
    """MAE (required) plus bias and peak/off-peak MAE (optional extras)."""
    actual = validation["travelTimeMinutes"]
    is_peak = validation["hour"].map(DEFAULT_CONFIG.is_peak_hour).astype(bool)
    return {
        "baselineMaeMinutes": round(mean_absolute_error(actual, predictions), 4),
        "meanSignedErrorMinutes": round(float(np.mean(predictions - actual)), 4),
        "peakHours": _group_summary(actual[is_peak], predictions[is_peak]),
        "offPeakHours": _group_summary(actual[~is_peak], predictions[~is_peak]),
    }


def build_examples(
    validation: pd.DataFrame,
    predictions: pd.Series,
    n_examples: int = N_EXAMPLES,
    seed: int = EXAMPLE_SEED,
) -> pd.DataFrame:
    """Pick ``n_examples`` validation trips at random (not hand-picked) with predictions."""
    if len(validation) < n_examples:
        raise ValueError(
            f"Need at least {n_examples} validation trips for the examples, "
            f"but only {len(validation)} are available."
        )
    rng = np.random.default_rng(seed)
    chosen = np.sort(rng.choice(len(validation), size=n_examples, replace=False))
    examples = validation.iloc[chosen].copy()
    examples["actualTravelTimeMinutes"] = examples["travelTimeMinutes"]
    examples["baselineEtaMinutes"] = predictions.iloc[chosen].to_numpy()
    error = examples["baselineEtaMinutes"] - examples["actualTravelTimeMinutes"]
    examples["errorMinutes"] = error.round(2)
    examples["absoluteErrorMinutes"] = error.abs().round(2)
    return examples[list(_EXAMPLE_COLUMNS)].reset_index(drop=True)


def run_baseline_evaluation(
    trips_path: Path | str = DEFAULT_OUTPUT_PATH,
    output_dir: Path | str = DEFAULT_DATA_DIR,
) -> dict[str, object]:
    """Load the trips, evaluate the baseline on the validation split, save results."""
    trips = load_trips_csv(trips_path)
    train, validation = split_train_validation(trips)
    predictions = baseline_predictions(validation)

    metrics: dict[str, object] = {
        "dataSource": DATA_SOURCE_LABEL,
        "disclaimer": DISCLAIMER,
        "datasetRows": int(len(trips)),
        "trainRows": int(len(train)),
        "validationRows": int(len(validation)),
        "validationFraction": VALIDATION_FRACTION,
        "splitSeed": SPLIT_SEED,
        "exampleSeed": EXAMPLE_SEED,
    }
    metrics.update(compute_baseline_metrics(validation, predictions))
    examples = build_examples(validation, predictions)

    folder = Path(output_dir)
    folder.mkdir(parents=True, exist_ok=True)
    examples.to_csv(folder / EXAMPLES_FILE_NAME, index=False, lineterminator="\n")
    with open(folder / METRICS_FILE_NAME, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(metrics, handle, indent=2)
        handle.write("\n")
    return metrics


def main(argv: Sequence[str] | None = None) -> int:
    """Command line entry point: evaluate the baseline and save the results."""
    parser = argparse.ArgumentParser(description="Evaluate the baseline ETA on synthetic trips.")
    parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT_PATH, help="trips CSV")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_DATA_DIR, help="output folder")
    args = parser.parse_args(argv)

    try:
        metrics = run_baseline_evaluation(args.input, args.output_dir)
    except DatasetError as error:
        print(f"Error: {error}")
        return 1
    print(
        f"Baseline MAE on {metrics['validationRows']} synthetic validation trips: "
        f"{metrics['baselineMaeMinutes']} minutes."
    )
    print(f"Saved {EXAMPLES_FILE_NAME} and {METRICS_FILE_NAME} to {args.output_dir}.")
    print(DISCLAIMER)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())