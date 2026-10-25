"""Tests for ml/eta/estimator.py (Phase 5, ticket AI-06: model with baseline fallback).

The real saved model in ``models/`` is used (no mocks) for the normal path. Failures
are created by really breaking a copy of the model folder, or with tiny stand-in
models that raise or return bad numbers on purpose. No FastAPI is needed here.
"""

from __future__ import annotations

import json
import logging
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import pytest

from ml.eta.config import DEFAULT_CONFIG
from ml.eta.eta import haversine_distance_km, predict_eta
from ml.eta.estimator import (
    REASON_MODEL_FAILED,
    REASON_MODEL_UNAVAILABLE,
    REASON_OUT_OF_RANGE,
    SOURCE_BASELINE,
    SOURCE_MODEL,
    EtaEstimator,
)
from ml.eta.model import MODEL_DIR, LoadedModel, ModelLoadError, load_model, predict_eta_with_model
from ml.eta.validation import InvalidInputError

LOGGER_NAME = "ml.eta.estimator"

# A normal trip (about 19.8 km, inside the trained 0.52 to 21.99 km range), off-peak hour.
NORMAL = (28.6139, 77.2090, 28.5355, 77.3910, 14, "BLS")
# About 0.1 km: shorter than anything the model was trained on.
TOO_SHORT = (28.6139, 77.2090, 28.6148, 77.2090, 14, "BLS")
# About 50 km: longer than anything the model was trained on.
TOO_LONG = (28.6139, 77.2090, 28.9000, 77.6000, 14, "BLS")
# A normal trip at a peak hour (hour 9).
PEAK = (28.6139, 77.2090, 28.5355, 77.3910, 9, "BLS")


class _ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@contextmanager
def capture_logs() -> Iterator[_ListHandler]:
    """Collect the estimator's log records (works without any pytest plugin)."""
    handler = _ListHandler()
    logger = logging.getLogger(LOGGER_NAME)
    old_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield handler
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old_level)


class _FixedModel:
    """Stand-in model that returns a fixed value."""

    def __init__(self, value: float) -> None:
        self.value = value

    def predict(self, features: object) -> np.ndarray:
        return np.array([self.value])


class _RaisingModel:
    """Stand-in model that raises the given error when asked to predict."""

    def __init__(self, error: Exception) -> None:
        self.error = error

    def predict(self, features: object) -> np.ndarray:
        raise self.error


def _fake_loaded(estimator: object, low: float = 0.5, high: float = 22.0) -> LoadedModel:
    return LoadedModel(
        estimator=estimator,  # type: ignore[arg-type]
        metadata={"trainingDistanceKm": {"min": low, "max": high}},
    )


def _copy_model_dir(tmp_path: Path) -> Path:
    target = tmp_path / "models"
    shutil.copytree(MODEL_DIR, target)
    return target


def _baseline(args: tuple) -> dict:
    return predict_eta(*args)


# --- Normal path: the model is used ---------------------------------------------------
def test_normal_trip_uses_the_model() -> None:
    estimator = EtaEstimator.from_model_dir(MODEL_DIR)
    outcome = estimator.estimate(*NORMAL)
    assert estimator.model_loaded is True
    assert outcome.source == SOURCE_MODEL
    assert outcome.fallbackReason is None
    expected = predict_eta_with_model(load_model(MODEL_DIR), *NORMAL)
    assert outcome.result == expected


def test_normal_trip_result_has_exactly_the_two_contract_fields() -> None:
    outcome = EtaEstimator.from_model_dir(MODEL_DIR).estimate(*NORMAL)
    assert set(outcome.result) == {"etaMinutes", "distanceKm"}
    assert outcome.result["distanceKm"] == 19.8
    assert outcome.result["etaMinutes"] > 0


def test_model_and_baseline_give_different_numbers_so_the_source_label_matters() -> None:
    model_eta = EtaEstimator.from_model_dir(MODEL_DIR).estimate(*NORMAL).result["etaMinutes"]
    assert model_eta != _baseline(NORMAL)["etaMinutes"]


def test_peak_trip_inside_the_range_uses_the_model() -> None:
    outcome = EtaEstimator.from_model_dir(MODEL_DIR).estimate(*PEAK)
    assert outcome.source == SOURCE_MODEL


# --- Out-of-range distances use the baseline ---------------------------------------------
def test_trip_shorter_than_training_data_uses_the_baseline() -> None:
    outcome = EtaEstimator.from_model_dir(MODEL_DIR).estimate(*TOO_SHORT)
    assert outcome.source == SOURCE_BASELINE
    assert outcome.fallbackReason == REASON_OUT_OF_RANGE
    assert outcome.result == _baseline(TOO_SHORT)


def test_trip_longer_than_training_data_uses_the_baseline() -> None:
    outcome = EtaEstimator.from_model_dir(MODEL_DIR).estimate(*TOO_LONG)
    assert outcome.source == SOURCE_BASELINE
    assert outcome.fallbackReason == REASON_OUT_OF_RANGE
    assert outcome.result == _baseline(TOO_LONG)


def test_identical_points_return_zero_and_use_the_baseline() -> None:
    same = (28.6139, 77.2090, 28.6139, 77.2090, 14, "BLS")
    outcome = EtaEstimator.from_model_dir(MODEL_DIR).estimate(*same)
    assert outcome.result == {"etaMinutes": 0.0, "distanceKm": 0.0}
    assert outcome.source == SOURCE_BASELINE


def test_range_edges_are_inclusive() -> None:
    distance = haversine_distance_km(*NORMAL[:4])
    # The range is exactly this trip's distance on both ends: still "inside".
    inside = EtaEstimator(_fake_loaded(_FixedModel(10.0), low=distance, high=distance))
    assert inside.estimate(*NORMAL).source == SOURCE_MODEL
    # Just below the lower edge and just above the upper edge: outside.
    above = EtaEstimator(_fake_loaded(_FixedModel(10.0), low=distance + 0.001, high=distance + 1))
    below = EtaEstimator(_fake_loaded(_FixedModel(10.0), low=distance - 1, high=distance - 0.001))
    assert above.estimate(*NORMAL).source == SOURCE_BASELINE
    assert below.estimate(*NORMAL).source == SOURCE_BASELINE


# --- Model cannot be loaded: ERROR is logged, baseline is served ---------------------------
def test_missing_model_files_log_an_error_and_serve_the_baseline(tmp_path: Path) -> None:
    with capture_logs() as logs:
        estimator = EtaEstimator.from_model_dir(tmp_path / "does_not_exist")
    errors = [r for r in logs.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "baseline" in errors[0].getMessage()
    assert estimator.model_loaded is False

    outcome = estimator.estimate(*NORMAL)
    assert outcome.source == SOURCE_BASELINE
    assert outcome.fallbackReason == REASON_MODEL_UNAVAILABLE
    assert outcome.result == _baseline(NORMAL)


def test_damaged_model_file_logs_an_error_and_serves_the_baseline(tmp_path: Path) -> None:
    model_dir = _copy_model_dir(tmp_path)
    joblib_file = next(model_dir.glob("*.joblib"))
    joblib_file.write_bytes(joblib_file.read_bytes()[:-50] + b"damaged-on-purpose")
    with capture_logs() as logs:
        estimator = EtaEstimator.from_model_dir(model_dir)
    assert any(r.levelno == logging.ERROR for r in logs.records)
    assert estimator.estimate(*NORMAL).source == SOURCE_BASELINE


def test_metadata_without_a_distance_range_is_treated_as_a_load_failure(tmp_path: Path) -> None:
    model_dir = _copy_model_dir(tmp_path)
    metadata_file = next(model_dir.glob("*.json"))
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
    del metadata["trainingDistanceKm"]
    metadata_file.write_text(json.dumps(metadata), encoding="utf-8")
    with capture_logs() as logs:
        estimator = EtaEstimator.from_model_dir(model_dir)
    assert estimator.model_loaded is False
    assert any(r.levelno == logging.ERROR for r in logs.records)


@pytest.mark.parametrize(
    "bad_range",
    [None, {}, {"min": 1.0}, {"min": "a", "max": 2.0}, {"min": 5.0, "max": 1.0},
     {"min": -1.0, "max": 2.0}, {"min": float("nan"), "max": 2.0}, {"min": 1.0, "max": float("inf")}],
)
def test_constructor_rejects_a_bad_training_range(bad_range: object) -> None:
    loaded = LoadedModel(estimator=_FixedModel(1.0), metadata={"trainingDistanceKm": bad_range})  # type: ignore[arg-type]
    with pytest.raises(ModelLoadError):
        EtaEstimator(loaded)


def test_baseline_only_estimator_can_be_built_directly() -> None:
    estimator = EtaEstimator(None)
    assert estimator.model_loaded is False
    assert estimator.estimate(*NORMAL).result == _baseline(NORMAL)


# --- Model fails while predicting: warning is logged, baseline is served ------------------------
@pytest.mark.parametrize(
    "model",
    [
        _RaisingModel(ValueError("boom")),
        _RaisingModel(TypeError("boom")),
        _RaisingModel(AttributeError("boom")),
        _RaisingModel(IndexError("boom")),
        _FixedModel(-5.0),
        _FixedModel(float("nan")),
        _FixedModel(float("inf")),
    ],
)
def test_model_failure_or_invalid_prediction_uses_the_baseline(model: object) -> None:
    estimator = EtaEstimator(_fake_loaded(model))
    with capture_logs() as logs:
        outcome = estimator.estimate(*NORMAL)
    assert outcome.source == SOURCE_BASELINE
    assert outcome.fallbackReason == REASON_MODEL_FAILED
    assert outcome.result == _baseline(NORMAL)
    assert any(r.levelno == logging.WARNING for r in logs.records)


def test_unrelated_errors_are_not_hidden_by_the_fallback() -> None:
    estimator = EtaEstimator(_fake_loaded(_RaisingModel(RuntimeError("a real bug"))))
    with pytest.raises(RuntimeError):
        estimator.estimate(*NORMAL)


def test_a_working_stand_in_model_is_used_and_rounded() -> None:
    estimator = EtaEstimator(_fake_loaded(_FixedModel(12.3456)))
    outcome = estimator.estimate(*NORMAL)
    assert outcome.source == SOURCE_MODEL
    assert outcome.result["etaMinutes"] == 12.35


# --- Bad request values are never hidden ---------------------------------------------------------
BAD_VALUES = [
    (None, 77.2, 28.5, 77.3, 14, "BLS"),
    ("28.6", 77.2, 28.5, 77.3, 14, "BLS"),
    (True, 77.2, 28.5, 77.3, 14, "BLS"),
    (91, 77.2, 28.5, 77.3, 14, "BLS"),
    (28.6, 181, 28.5, 77.3, 14, "BLS"),
    (28.6, 77.2, float("nan"), 77.3, 14, "BLS"),
    (28.6, 77.2, 28.5, float("inf"), 14, "BLS"),
    (28.6, 77.2, 28.5, 77.3, 8.0, "BLS"),
    (28.6, 77.2, 28.5, 77.3, "8", "BLS"),
    (28.6, 77.2, 28.5, 77.3, 24, "BLS"),
    (28.6, 77.2, 28.5, 77.3, True, "BLS"),
    (28.6, 77.2, 28.5, 77.3, 14, "bls"),
    (28.6, 77.2, 28.5, 77.3, 14, "ALS"),
    (28.6, 77.2, 28.5, 77.3, 14, None),
]


@pytest.mark.parametrize("args", BAD_VALUES)
def test_bad_values_raise_invalid_input_with_the_model(args: tuple) -> None:
    with pytest.raises(InvalidInputError):
        EtaEstimator.from_model_dir(MODEL_DIR).estimate(*args)


@pytest.mark.parametrize("args", BAD_VALUES)
def test_bad_values_raise_invalid_input_without_a_model(args: tuple) -> None:
    with pytest.raises(InvalidInputError):
        EtaEstimator(None).estimate(*args)


def test_invalid_input_is_not_logged_as_a_model_problem() -> None:
    with capture_logs() as logs:
        with pytest.raises(InvalidInputError):
            EtaEstimator.from_model_dir(MODEL_DIR).estimate(28.6, 77.2, 28.5, 77.3, 99, "BLS")
    assert logs.records == []


# --- Privacy: logs never hold request values -------------------------------------------------------
def test_fallback_logs_do_not_contain_coordinates() -> None:
    estimator = EtaEstimator(_fake_loaded(_FixedModel(-1.0)))
    with capture_logs() as logs:
        estimator.estimate(*NORMAL)
    text = " ".join(record.getMessage() for record in logs.records)
    assert text != ""
    for secret in ("28.6139", "77.2090", "77.209", "28.5355", "77.391"):
        assert secret not in text


# --- Same inputs, same answer --------------------------------------------------------------------------
def test_estimate_is_repeatable() -> None:
    estimator = EtaEstimator.from_model_dir(MODEL_DIR)
    assert estimator.estimate(*NORMAL) == estimator.estimate(*NORMAL)


def test_config_default_is_used_for_the_baseline() -> None:
    assert DEFAULT_CONFIG.allowed_ambulance_types == ("BLS",)