"""Learned ETA model: Linear Regression on request-only features (ticket AI-06).

EVERYTHING HERE IS TRAINED ON FAKE (SYNTHETIC) DATA. The model learns the invented
world described in ``synthetic.py``. Its MAE says nothing about real-world accuracy,
and its ETAs are estimates, not guaranteed arrival times.

What this module does:
  1. Builds features ONLY from what the API will receive (coordinates and hour).
     Traffic level, road type and day of week are in the dataset but are never used,
     because a model that needs them could not run behind the API.
  2. Trains a Linear Regression (the model that is saved and served) on the training
     trips only, and a Random Forest (comparison only).
  3. Compares baseline, Linear Regression and Random Forest on the validation trips,
     using the same split as Phase 3, and writes ``data/model_comparison.json``.
  4. Saves the Linear Regression to ``models/`` with a metadata file and a checksum.
  5. Provides ``load_model`` and ``predict_eta_with_model`` for Phase 5 (the API).

Failures are specific on purpose: ``ModelLoadError`` (missing, corrupt or mismatched
files) and ``ModelPredictionError`` (the model cannot give a valid number). Phase 5
catches exactly these two and falls back to the baseline; nothing is hidden here.

SECURITY NOTE: a ``.joblib`` file is a pickle. Only load model files that you created
yourself. Never load one from an untrusted source.

Run it:  python -m ml.eta.model
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold

from ml.eta.config import DEFAULT_CONFIG, EtaConfig
from ml.eta.eta import OUTPUT_DECIMALS, EtaResult, haversine_distance_km
from ml.eta.evaluate import (
    DEFAULT_DATA_DIR,
    SPLIT_SEED,
    VALIDATION_FRACTION,
    baseline_predictions,
    compute_baseline_metrics,
    mean_absolute_error,
    split_train_validation,
)
from ml.eta.synthetic import (
    DATA_SOURCE_LABEL,
    DEFAULT_OUTPUT_PATH,
    PROJECT_ROOT,
    DatasetError,
    load_trips_csv,
    validate_trips_dataframe,
)
from ml.eta.validation import (
    validate_ambulance_type,
    validate_hour,
    validate_latitude,
    validate_longitude,
)

__all__ = [
    "COMPARISON_FILE_NAME",
    "FEATURE_NAMES",
    "LoadedModel",
    "MODEL_DIR",
    "ModelError",
    "ModelLoadError",
    "ModelPredictionError",
    "build_feature_matrix",
    "build_feature_row",
    "build_rf_feature_matrix",
    "load_model",
    "paired_bootstrap_interval",
    "predict_eta_with_model",
    "run_training",
    "save_model",
    "train_linear_regression",
    "train_random_forest",
]

# --- Where files live (relative to the project, never an absolute path) ------
MODEL_DIR: Path = PROJECT_ROOT / "models"
MODEL_FILE_NAME: str = "eta_linear_regression.joblib"
METADATA_FILE_NAME: str = "eta_linear_regression.json"
COMPARISON_FILE_NAME: str = "model_comparison.json"

# --- Features -----------------------------------------------------------------
# Linear Regression: distance, a peak-hour flag, and distance x flag (so that peak
# hours can have a different speed, like the baseline). All three come from the
# request. ``ambulanceType`` is always "BLS", so it carries no information.
FEATURE_NAMES: tuple[str, ...] = ("distanceKm", "isPeak", "distanceKmXPeak")
# Random Forest (comparison only): distance and the raw hour.
RF_FEATURE_NAMES: tuple[str, ...] = ("distanceKm", "hour")

# --- Fixed settings (chosen up front, not tuned on the validation trips) ------
MODEL_SEED: int = 42
CV_FOLDS: int = 5
RF_TREES: int = 200
RF_MIN_SAMPLES_LEAF: int = 5
BOOTSTRAP_RESAMPLES: int = 2000
BOOTSTRAP_SEED: int = 42
METRIC_DECIMALS: int = 4

MODEL_DISCLAIMER: str = (
    "Synthetic (fake) data only. The model learned from an invented world, so its error "
    "is NOT a measure of real-world accuracy. ETAs are estimates, not guaranteed arrival "
    "times."
)
_RETRAIN_HINT: str = "Run 'python -m ml.eta.model' to create it again."


class ModelError(RuntimeError):
    """Base class for the two specific model failures below."""


class ModelLoadError(ModelError):
    """The model files are missing, unreadable, corrupt, or do not match this code."""


class ModelPredictionError(ModelError):
    """The model could not produce a valid (finite, non-negative) prediction."""


@dataclass(frozen=True)
class LoadedModel:
    """A fitted estimator together with its metadata (as saved next to it)."""

    estimator: object
    metadata: dict[str, object]


# --- Features -----------------------------------------------------------------
def build_feature_row(
    distance_km: float, hour: int, config: EtaConfig = DEFAULT_CONFIG
) -> list[float]:
    """Features for ONE trip: [distanceKm, isPeak, distanceKm x isPeak].

    ``distance_km`` and ``hour`` must already be validated.
    Example: 10 km at hour 9 (a peak hour) -> [10.0, 1.0, 10.0].
    """
    is_peak = 1.0 if config.is_peak_hour(hour) else 0.0
    distance = float(distance_km)
    return [distance, is_peak, distance * is_peak]


def _distance_and_hour(row: object) -> tuple[float, int]:
    """Distance (Haversine, from the coordinates) and the hour of one table row.

    Only the five request fields are read. Traffic level, road type, day of week and
    the target are never touched.
    """
    distance = haversine_distance_km(
        row.fromLat, row.fromLng, row.toLat, row.toLng  # type: ignore[attr-defined]
    )
    hour = validate_hour(row.hour)  # type: ignore[attr-defined]
    return distance, hour


def build_feature_matrix(trips: pd.DataFrame, config: EtaConfig = DEFAULT_CONFIG) -> np.ndarray:
    """Feature matrix (one row per trip) for the Linear Regression."""
    rows = [
        build_feature_row(*_distance_and_hour(row), config=config)
        for row in trips.itertuples(index=False)
    ]
    return np.asarray(rows, dtype=float).reshape(len(rows), len(FEATURE_NAMES))


def build_rf_feature_matrix(trips: pd.DataFrame) -> np.ndarray:
    """Feature matrix [distanceKm, hour] for the Random Forest (comparison only)."""
    rows = []
    for row in trips.itertuples(index=False):
        distance, hour = _distance_and_hour(row)
        rows.append([distance, float(hour)])
    return np.asarray(rows, dtype=float).reshape(len(rows), len(RF_FEATURE_NAMES))


# --- Training -----------------------------------------------------------------
def train_linear_regression(
    train: pd.DataFrame, config: EtaConfig = DEFAULT_CONFIG
) -> LinearRegression:
    """Fit the Linear Regression on the given (training) trips only."""
    validate_trips_dataframe(train)
    model = LinearRegression()
    model.fit(build_feature_matrix(train, config), train["travelTimeMinutes"].to_numpy(dtype=float))
    return model


def _new_random_forest() -> RandomForestRegressor:
    return RandomForestRegressor(
        n_estimators=RF_TREES, min_samples_leaf=RF_MIN_SAMPLES_LEAF, random_state=MODEL_SEED
    )


def train_random_forest(train: pd.DataFrame) -> RandomForestRegressor:
    """Fit the comparison Random Forest on the given (training) trips only."""
    validate_trips_dataframe(train)
    model = _new_random_forest()
    model.fit(build_rf_feature_matrix(train), train["travelTimeMinutes"].to_numpy(dtype=float))
    return model


def _cross_validated_mae(
    make_model: Callable[[], object], features: np.ndarray, target: np.ndarray
) -> float:
    """Average MAE over ``CV_FOLDS`` folds of the TRAINING trips (validation untouched)."""
    splitter = KFold(n_splits=CV_FOLDS, shuffle=True, random_state=MODEL_SEED)
    fold_maes = []
    for fit_index, test_index in splitter.split(features):
        model = make_model()
        model.fit(features[fit_index], target[fit_index])  # type: ignore[attr-defined]
        predicted = model.predict(features[test_index])  # type: ignore[attr-defined]
        fold_maes.append(mean_absolute_error(target[test_index], predicted))
    return float(np.mean(fold_maes))


# --- Saving and loading --------------------------------------------------------
def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(65536), b""):
                digest.update(chunk)
    except OSError as error:
        raise ModelLoadError(f"Could not read '{path.name}'.") from error
    return digest.hexdigest()


def _write_json(path: Path, data: dict[str, object]) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def _build_metadata(
    model: LinearRegression, train: pd.DataFrame, config: EtaConfig
) -> dict[str, object]:
    distances = build_feature_matrix(train, config)[:, 0]
    return {
        "modelType": "LinearRegression",
        "dataSource": DATA_SOURCE_LABEL,
        "disclaimer": MODEL_DISCLAIMER,
        "featureNames": list(FEATURE_NAMES),
        "coefficients": {name: float(value) for name, value in zip(FEATURE_NAMES, model.coef_)},
        "intercept": float(model.intercept_),
        "trainRows": int(len(train)),
        "trainingDistanceKm": {"min": float(distances.min()), "max": float(distances.max())},
        "peakHours": sorted(config.peak_hours),
        "ambulanceTypes": list(config.allowed_ambulance_types),
        "outputDecimals": OUTPUT_DECIMALS,
        "splitSeed": SPLIT_SEED,
        "validationFraction": VALIDATION_FRACTION,
        "scikitLearnVersion": sklearn.__version__,
    }


def save_model(
    model: LinearRegression, metadata: dict[str, object], model_dir: Path | str = MODEL_DIR
) -> tuple[Path, Path]:
    """Write the model (.joblib) and its metadata (.json, with a checksum of the model)."""
    folder = Path(model_dir)
    folder.mkdir(parents=True, exist_ok=True)
    model_path = folder / MODEL_FILE_NAME
    metadata_path = folder / METADATA_FILE_NAME
    joblib.dump(model, model_path)
    full_metadata = dict(metadata)
    full_metadata["modelFile"] = MODEL_FILE_NAME
    full_metadata["modelFileSha256"] = _file_sha256(model_path)
    _write_json(metadata_path, full_metadata)
    return model_path, metadata_path


def _read_metadata(path: Path) -> dict[str, object]:
    if not path.is_file():
        raise ModelLoadError(f"Model metadata file '{path.name}' was not found. {_RETRAIN_HINT}")
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ModelLoadError(f"Model metadata file '{path.name}' could not be read.") from error
    if not isinstance(metadata, dict):
        raise ModelLoadError(f"Model metadata file '{path.name}' has an unexpected format.")
    return metadata


def _check_metadata_matches_code(metadata: dict[str, object], config: EtaConfig) -> None:
    """Refuse a model whose recorded settings differ from the current code or config."""
    checks = (
        (metadata.get("featureNames") == list(FEATURE_NAMES), "feature list"),
        (metadata.get("peakHours") == sorted(config.peak_hours), "peak hours"),
        (metadata.get("ambulanceTypes") == list(config.allowed_ambulance_types), "ambulance types"),
        (metadata.get("scikitLearnVersion") == sklearn.__version__, "scikit-learn version"),
    )
    for matches, label in checks:
        if not matches:
            raise ModelLoadError(
                f"The saved model does not match this code (different {label}). Retrain it: "
                "run 'python -m ml.eta.model'."
            )


def load_model(model_dir: Path | str = MODEL_DIR, config: EtaConfig = DEFAULT_CONFIG) -> LoadedModel:
    """Load the saved Linear Regression, or raise ``ModelLoadError`` with a clear reason.

    Checks, in order: both files exist, the metadata matches this code and config, the
    model file matches its recorded checksum, and the loaded object looks like the
    expected model. Only load files that you created yourself (see the module note).
    """
    folder = Path(model_dir)
    model_path = folder / MODEL_FILE_NAME
    metadata = _read_metadata(folder / METADATA_FILE_NAME)
    if not model_path.is_file():
        raise ModelLoadError(f"Model file '{MODEL_FILE_NAME}' was not found. {_RETRAIN_HINT}")
    _check_metadata_matches_code(metadata, config)
    if _file_sha256(model_path) != metadata.get("modelFileSha256"):
        raise ModelLoadError(
            f"Model file '{MODEL_FILE_NAME}' does not match its recorded checksum "
            "(it is corrupt or was changed). Retrain it: run 'python -m ml.eta.model'."
        )
    try:
        estimator = joblib.load(model_path)
    except Exception as error:  # noqa: BLE001
        # Deliberately broad, and the ONLY such place: unpickling can fail in many
        # different ways, and every one of them means "this file is not usable". The
        # original error is kept as the cause, so nothing is hidden.
        raise ModelLoadError(f"Model file '{MODEL_FILE_NAME}' could not be loaded.") from error
    coefficients = getattr(estimator, "coef_", None)
    if not hasattr(estimator, "predict") or np.shape(coefficients) != (len(FEATURE_NAMES),):
        raise ModelLoadError(f"Model file '{MODEL_FILE_NAME}' does not contain the expected model.")
    return LoadedModel(estimator=estimator, metadata=metadata)


# --- Prediction ----------------------------------------------------------------
def predict_eta_with_model(
    loaded: LoadedModel,
    fromLat: float,
    fromLng: float,
    toLat: float,
    toLng: float,
    hour: int,
    ambulanceType: str,
    *,
    config: EtaConfig = DEFAULT_CONFIG,
) -> EtaResult:
    """Estimate travel time with the learned model. Same inputs and outputs as ``predict_eta``.

    This is an ESTIMATE, not a guaranteed arrival time, from a model trained on fake data.

    Returns ``{"etaMinutes": float, "distanceKm": float}`` rounded to 2 decimals.
    Identical start and end points return 0.0 and 0.0 BEFORE the model runs, exactly
    like the baseline (CONFIRMED with mentor).

    Raises:
        InvalidInputError: bad request values (checked first, never hidden).
        ModelPredictionError: the model failed, or produced a value that is not a
            finite number of at least 0. The value is never clipped or replaced.
    """
    lat1 = validate_latitude(fromLat, "fromLat")
    lng1 = validate_longitude(fromLng, "fromLng")
    lat2 = validate_latitude(toLat, "toLat")
    lng2 = validate_longitude(toLng, "toLng")
    valid_hour = validate_hour(hour, "hour")
    validate_ambulance_type(ambulanceType, config, "ambulanceType")

    distance_km = haversine_distance_km(lat1, lng1, lat2, lng2)
    if distance_km == 0.0:
        return {"etaMinutes": 0.0, "distanceKm": 0.0}

    features = np.asarray([build_feature_row(distance_km, valid_hour, config)], dtype=float)
    try:
        eta_minutes = float(loaded.estimator.predict(features)[0])  # type: ignore[attr-defined]
    except (ValueError, TypeError, AttributeError, IndexError) as error:
        # The errors scikit-learn raises for a broken or unfitted model. Unrelated
        # exceptions (for example a RuntimeError) are NOT caught and pass through.
        raise ModelPredictionError("The model could not produce a prediction.") from error
    if not math.isfinite(eta_minutes) or eta_minutes < 0.0:
        raise ModelPredictionError(
            "The model produced an invalid prediction (not a finite number of at least 0)."
        )
    return {
        "etaMinutes": round(eta_minutes, OUTPUT_DECIMALS),
        "distanceKm": round(distance_km, OUTPUT_DECIMALS),
    }


# --- Comparison ----------------------------------------------------------------
def paired_bootstrap_interval(
    baseline_abs_errors: object,
    model_abs_errors: object,
    resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, object]:
    """How sure are we that the model beats the baseline, on THESE trips only?

    Takes each trip's absolute error for the baseline and for the model. The
    difference "baseline minus model" is positive when the model is better. Trips are
    re-drawn with replacement ``resamples`` times to get a 95% interval for the mean
    difference (seeded, so the result is reproducible).

    Verdict: "model_clearly_better" if the whole interval is above 0,
    "baseline_clearly_better" if it is below 0, otherwise "no_clear_difference".
    """
    baseline = np.asarray(baseline_abs_errors, dtype=float)
    model = np.asarray(model_abs_errors, dtype=float)
    if baseline.ndim != 1 or baseline.shape != model.shape or baseline.size == 0:
        raise ValueError("The two error lists must be non-empty and the same length.")
    if not (np.isfinite(baseline).all() and np.isfinite(model).all()):
        raise ValueError("Errors must be finite numbers.")
    if isinstance(resamples, bool) or not isinstance(resamples, int) or resamples < 1:
        raise ValueError("resamples must be a positive whole number.")

    difference = baseline - model
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, difference.size, size=(resamples, difference.size))
    resampled_means = difference[picks].mean(axis=1)
    low, high = np.percentile(resampled_means, [2.5, 97.5])
    if low > 0:
        verdict = "model_clearly_better"
    elif high < 0:
        verdict = "baseline_clearly_better"
    else:
        verdict = "no_clear_difference"
    return {
        "maeDifferenceMinutes": round(float(difference.mean()), METRIC_DECIMALS),
        "bootstrap95Interval": [round(float(low), METRIC_DECIMALS), round(float(high), METRIC_DECIMALS)],
        "bootstrapResamples": resamples,
        "bootstrapSeed": seed,
        "modelBetterShareOfTrips": round(float(np.mean(model < baseline)), METRIC_DECIMALS),
        "verdict": verdict,
    }


def _summary(validation: pd.DataFrame, predictions: pd.Series) -> dict[str, object]:
    """MAE, bias and peak/off-peak MAE (reuses the Phase 3 metric code)."""
    metrics = compute_baseline_metrics(validation, predictions)
    mae = metrics.pop("baselineMaeMinutes")
    return {"maeMinutes": mae, **metrics}


def run_training(
    trips_path: Path | str = DEFAULT_OUTPUT_PATH,
    model_dir: Path | str = MODEL_DIR,
    data_dir: Path | str = DEFAULT_DATA_DIR,
) -> dict[str, object]:
    """Train, compare on the validation trips, then save the model and the comparison.

    Everything is computed first and files are written last, so a failure leaves no
    half-written results. Returns the comparison dictionary that is saved.
    """
    trips = load_trips_csv(trips_path)
    train, validation = split_train_validation(trips)  # the same split as Phase 3

    x_train = build_feature_matrix(train)
    x_train_rf = build_rf_feature_matrix(train)
    y_train = train["travelTimeMinutes"].to_numpy(dtype=float)

    # Evidence about the two model types comes from the TRAINING trips only.
    cv_linear = _cross_validated_mae(LinearRegression, x_train, y_train)
    cv_forest = _cross_validated_mae(_new_random_forest, x_train_rf, y_train)

    linear = train_linear_regression(train)
    forest = train_random_forest(train)
    metadata = _build_metadata(linear, train, DEFAULT_CONFIG)
    loaded = LoadedModel(estimator=linear, metadata=metadata)

    # The validation trips are scored once. The Linear Regression goes through the
    # same function the API will use, so the reported number is the served number.
    actual = validation["travelTimeMinutes"]
    baseline = baseline_predictions(validation)
    linear_predictions = pd.Series(
        [
            predict_eta_with_model(
                loaded, r.fromLat, r.fromLng, r.toLat, r.toLng, r.hour, r.ambulanceType
            )["etaMinutes"]
            for r in validation.itertuples(index=False)
        ],
        index=validation.index,
        dtype=float,
    )
    forest_predictions = pd.Series(
        np.round(forest.predict(build_rf_feature_matrix(validation)), OUTPUT_DECIMALS),
        index=validation.index,
        dtype=float,
    )
    constant_mean = float(y_train.mean())
    constant_mae = mean_absolute_error(actual, np.full(len(validation), constant_mean))

    comparison: dict[str, object] = {
        "dataSource": DATA_SOURCE_LABEL,
        "disclaimer": MODEL_DISCLAIMER,
        "datasetRows": int(len(trips)),
        "trainRows": int(len(train)),
        "validationRows": int(len(validation)),
        "splitSeed": SPLIT_SEED,
        "servedModel": "LinearRegression",
        "featuresUsed": {
            "linearRegression": list(FEATURE_NAMES),
            "randomForest": list(RF_FEATURE_NAMES),
        },
        "validation": {
            "baseline": _summary(validation, baseline),
            "linearRegression": _summary(validation, linear_predictions),
            "randomForest": _summary(validation, forest_predictions),
            "constantMeanReference": {"maeMinutes": round(constant_mae, METRIC_DECIMALS)},
        },
        "crossValidationOnTrainRows": {
            "folds": CV_FOLDS,
            "linearRegressionMaeMinutes": round(cv_linear, METRIC_DECIMALS),
            "randomForestMaeMinutes": round(cv_forest, METRIC_DECIMALS),
        },
        "linearRegressionVsBaseline": paired_bootstrap_interval(
            (baseline - actual).abs().to_numpy(), (linear_predictions - actual).abs().to_numpy()
        ),
        "notes": [
            "maeDifferenceMinutes is baseline MAE minus model MAE; positive means the model is better.",
            "No validation trip was used to fit anything in this run; cross-validation used training trips only.",
            "traffic level, road type and day of week are not available to the API, so no model here uses them.",
        ],
    }

    save_model(linear, metadata, model_dir)
    folder = Path(data_dir)
    folder.mkdir(parents=True, exist_ok=True)
    _write_json(folder / COMPARISON_FILE_NAME, comparison)
    return comparison


def main(argv: Sequence[str] | None = None) -> int:
    """Command line entry point: train, compare, and save the model."""
    parser = argparse.ArgumentParser(description="Train the ETA model on SYNTHETIC trips.")
    parser.add_argument("--input", type=Path, default=DEFAULT_OUTPUT_PATH, help="trips CSV")
    parser.add_argument("--model-dir", type=Path, default=MODEL_DIR, help="where to save the model")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="comparison folder")
    args = parser.parse_args(argv)

    try:
        comparison = run_training(args.input, args.model_dir, args.data_dir)
    except DatasetError as error:
        print(f"Error: {error}")
        return 1

    validation = comparison["validation"]  # type: ignore[assignment]
    versus = comparison["linearRegressionVsBaseline"]  # type: ignore[assignment]
    print(
        f"Trained on {comparison['trainRows']} synthetic trips; "
        f"validated on {comparison['validationRows']} synthetic trips."
    )
    print(
        "Validation MAE (minutes): "
        f"baseline {validation['baseline']['maeMinutes']} | "  # type: ignore[index]
        f"linear regression {validation['linearRegression']['maeMinutes']} | "  # type: ignore[index]
        f"random forest {validation['randomForest']['maeMinutes']}"  # type: ignore[index]
    )
    print(
        "Baseline MAE minus linear regression MAE: "
        f"{versus['maeDifferenceMinutes']} minutes "  # type: ignore[index]
        f"(95% interval {versus['bootstrap95Interval']}) -> {versus['verdict']}."  # type: ignore[index]
    )
    print(f"Saved the model to {args.model_dir} and {COMPARISON_FILE_NAME} to {args.data_dir}.")
    print(MODEL_DISCLAIMER)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())