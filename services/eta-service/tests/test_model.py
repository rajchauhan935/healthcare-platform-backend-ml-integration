"""Tests for ml/eta/model.py (Phase 4, ticket AI-06: the learned model).

All data here is fake. Models are trained for real (no mocks) on a small temporary
dataset. Only the check on the committed comparison file needs a file from your
project: run ``python -m ml.eta.model`` once before ``pytest``.
"""

from __future__ import annotations

import functools
import hashlib
import json
import math
import shutil
import tempfile
from pathlib import Path

import joblib
import numpy as np
import pytest
from sklearn.linear_model import LinearRegression

from ml.eta.config import DEFAULT_CONFIG, EtaConfig, SpeedProfile
from ml.eta.eta import predict_eta
from ml.eta.evaluate import (
    DEFAULT_DATA_DIR,
    baseline_predictions,
    mean_absolute_error,
    split_train_validation,
)
from ml.eta.model import (
    COMPARISON_FILE_NAME,
    FEATURE_NAMES,
    LoadedModel,
    ModelLoadError,
    ModelPredictionError,
    build_feature_matrix,
    build_feature_row,
    build_rf_feature_matrix,
    load_model,
    main,
    paired_bootstrap_interval,
    predict_eta_with_model,
    run_training,
    save_model,
    train_linear_regression,
)
from ml.eta.synthetic import (
    DatasetError,
    generate_synthetic_trips,
    load_trips_csv,
    save_trips_csv,
)
from ml.eta.validation import InvalidInputError

SMALL = generate_synthetic_trips(n_trips=300, seed=5)
_WORK = tempfile.TemporaryDirectory()  # cleaned up when the test run ends
_ROOT = Path(_WORK.name)

# A valid baseline request; error tests change one field at a time.
VALID = {
    "fromLat": 28.6139,
    "fromLng": 77.2090,
    "toLat": 28.5355,
    "toLng": 77.3910,
    "hour": 14,
    "ambulanceType": "BLS",
}


def request_with(**changes: object) -> dict[str, object]:
    return {**VALID, **changes}


@functools.lru_cache(maxsize=None)
def _trained() -> tuple[dict, LoadedModel, Path]:
    """Train once on the small dataset (real training) and load the saved model."""
    trips_path = save_trips_csv(SMALL, _ROOT / "trips.csv")
    comparison = run_training(trips_path, _ROOT / "models", _ROOT / "data")
    return comparison, load_model(_ROOT / "models"), trips_path


def _copy_model_dir(tmp_path: Path) -> Path:
    _trained()  # makes sure the model folder exists, whichever test runs first
    target = tmp_path / "models"
    shutil.copytree(_ROOT / "models", target)
    return target


def _metadata_path(folder: Path) -> Path:
    return folder / "eta_linear_regression.json"


def _edit_metadata(folder: Path, **changes: object) -> None:
    path = _metadata_path(folder)
    data = json.loads(path.read_text(encoding="utf-8"))
    data.update(changes)
    path.write_text(json.dumps(data), encoding="utf-8")


def _set_checksum(folder: Path) -> None:
    digest = hashlib.sha256((folder / "eta_linear_regression.joblib").read_bytes()).hexdigest()
    _edit_metadata(folder, modelFileSha256=digest)


class _FixedModel:
    """A tiny stand-in estimator that always predicts the same number."""

    def __init__(self, value: float) -> None:
        self.value = value

    def predict(self, features: np.ndarray) -> np.ndarray:
        return np.array([self.value])


class _RaisesValueError:
    def predict(self, features: np.ndarray) -> np.ndarray:
        raise ValueError("bad shape")


class _RaisesRuntimeError:
    def predict(self, features: np.ndarray) -> np.ndarray:
        raise RuntimeError("unrelated problem")


def _stub(model: object) -> LoadedModel:
    return LoadedModel(estimator=model, metadata={})


def _exact_linear_model() -> LoadedModel:
    """A real LinearRegression fitted to an exact line: 1.5 - 2.5*peak + 2*d + 0.8*d*peak."""
    rng = np.random.default_rng(0)
    distance = rng.uniform(0.5, 20.0, 50)
    peak = (rng.random(50) > 0.5).astype(float)
    features = np.column_stack([distance, peak, distance * peak])
    target = 1.5 - 2.5 * peak + 2.0 * distance + 0.8 * distance * peak
    return _stub(LinearRegression().fit(features, target))


# --- Features -------------------------------------------------------------------------
def test_feature_names_are_the_three_documented_ones() -> None:
    assert FEATURE_NAMES == ("distanceKm", "isPeak", "distanceKmXPeak")


def test_feature_row_off_peak() -> None:
    assert build_feature_row(10.0, 12) == [10.0, 0.0, 0.0]


def test_feature_row_peak() -> None:
    assert build_feature_row(10.0, 9) == [10.0, 1.0, 10.0]


@pytest.mark.parametrize(
    ("hour", "is_peak"),
    [(7, 0.0), (8, 1.0), (10, 1.0), (11, 0.0), (16, 0.0), (17, 1.0), (20, 1.0), (21, 0.0)],
)
def test_peak_flag_at_the_window_edges(hour: int, is_peak: float) -> None:
    assert build_feature_row(5.0, hour)[1] == is_peak


def test_distance_feature_is_the_haversine_distance_of_the_coordinates() -> None:
    matrix = build_feature_matrix(SMALL.iloc[:5])
    for position, row in enumerate(SMALL.iloc[:5].itertuples(index=False)):
        expected = predict_eta(
            row.fromLat, row.fromLng, row.toLat, row.toLng, row.hour, row.ambulanceType
        )["distanceKm"]
        assert matrix[position, 0] == pytest.approx(expected, abs=0.006)  # output is rounded


def test_matrix_shapes() -> None:
    assert build_feature_matrix(SMALL).shape == (300, 3)
    assert build_rf_feature_matrix(SMALL).shape == (300, 2)


def test_columns_the_api_does_not_receive_cannot_change_the_features() -> None:
    changed = SMALL.assign(
        trafficLevel="high", roadType="local", dayOfWeek=0, travelTimeMinutes=1.0, tripId=1
    )
    assert np.array_equal(build_feature_matrix(SMALL), build_feature_matrix(changed))
    assert np.array_equal(build_rf_feature_matrix(SMALL), build_rf_feature_matrix(changed))


def test_invalid_hours_and_coordinates_are_rejected_when_building_features() -> None:
    with pytest.raises(InvalidInputError):
        build_feature_matrix(SMALL.iloc[:3].assign(hour=99))
    with pytest.raises(InvalidInputError):
        build_feature_matrix(SMALL.iloc[:3].assign(fromLat=95.0))


# --- Training -------------------------------------------------------------------------------
def test_training_uses_only_the_training_trips() -> None:
    comparison, loaded, trips_path = _trained()
    train, validation = split_train_validation(load_trips_csv(trips_path))
    assert loaded.metadata["trainRows"] == len(train) == comparison["trainRows"]

    independent = train_linear_regression(train)
    saved = [loaded.metadata["coefficients"][name] for name in FEATURE_NAMES]  # type: ignore[index]
    assert np.allclose(independent.coef_, saved, atol=1e-9)

    # Had the model also seen the validation trips, its coefficients would differ.
    fitted_on_everything = train_linear_regression(load_trips_csv(trips_path))
    assert not np.allclose(fitted_on_everything.coef_, independent.coef_, atol=1e-6)
    assert len(validation) == comparison["validationRows"]


def test_saved_coefficients_are_finite_and_distance_slows_the_trip_down() -> None:
    _, loaded, _ = _trained()
    coefficients = list(loaded.metadata["coefficients"].values())  # type: ignore[union-attr]
    assert all(math.isfinite(value) for value in coefficients)
    assert math.isfinite(loaded.metadata["intercept"])  # type: ignore[arg-type]
    assert loaded.metadata["coefficients"]["distanceKm"] > 0  # type: ignore[index]


def test_metadata_records_what_phase_5_needs() -> None:
    _, loaded, _ = _trained()
    meta = loaded.metadata
    assert meta["dataSource"] == "synthetic"
    assert meta["featureNames"] == list(FEATURE_NAMES)
    assert meta["peakHours"] == sorted(DEFAULT_CONFIG.peak_hours)
    assert meta["trainingDistanceKm"]["min"] >= 0.5 - 0.001  # type: ignore[index]
    assert meta["trainingDistanceKm"]["max"] > meta["trainingDistanceKm"]["min"]  # type: ignore[index]
    assert "NOT a measure of real-world accuracy" in meta["disclaimer"]  # type: ignore[operator]


def test_training_is_reproducible(tmp_path: Path) -> None:
    comparison, loaded, trips_path = _trained()
    again = run_training(trips_path, tmp_path / "models", tmp_path / "data")
    assert (tmp_path / "data" / COMPARISON_FILE_NAME).read_bytes() == (
        _ROOT / "data" / COMPARISON_FILE_NAME
    ).read_bytes()
    assert again == comparison
    reloaded = load_model(tmp_path / "models")
    assert np.array_equal(reloaded.estimator.coef_, loaded.estimator.coef_)  # type: ignore[attr-defined]
    assert reloaded.estimator.intercept_ == loaded.estimator.intercept_  # type: ignore[attr-defined]


def test_training_refuses_an_invalid_table() -> None:
    with pytest.raises(DatasetError):
        train_linear_regression(SMALL.assign(dataSource="real"))


def test_a_missing_input_file_is_reported_and_nothing_is_written(tmp_path: Path) -> None:
    with pytest.raises(DatasetError, match="not found"):
        run_training(tmp_path / "nope.csv", tmp_path / "models", tmp_path / "data")
    assert not (tmp_path / "models").exists()
    assert not (tmp_path / "data").exists()


def test_command_line_returns_0_on_success_and_1_on_a_missing_file(tmp_path: Path) -> None:
    _, _, trips_path = _trained()
    arguments = ["--input", str(trips_path), "--model-dir", str(tmp_path / "m"), "--data-dir", str(tmp_path / "d")]
    assert main(arguments) == 0
    assert main(["--input", str(tmp_path / "nope.csv"), "--model-dir", str(tmp_path / "m2")]) == 1


# --- Predicting -----------------------------------------------------------------------------
def test_prediction_has_the_contract_keys_and_valid_values() -> None:
    _, loaded, _ = _trained()
    result = predict_eta_with_model(loaded, **VALID)  # type: ignore[arg-type]
    assert set(result) == {"etaMinutes", "distanceKm"}
    for value in result.values():
        assert isinstance(value, float)
        assert math.isfinite(value)
        assert value >= 0.0
        assert value == round(value, 2)


def test_distance_matches_the_baseline_distance() -> None:
    _, loaded, _ = _trained()
    model_result = predict_eta_with_model(loaded, **VALID)  # type: ignore[arg-type]
    assert model_result["distanceKm"] == predict_eta(**VALID)["distanceKm"]  # type: ignore[arg-type]


def test_a_ten_kilometre_trip_gets_a_sensible_estimate() -> None:
    _, loaded, _ = _trained()
    result = predict_eta_with_model(loaded, 28.6, 77.2, 28.69, 77.2, 13, "BLS")
    assert result["distanceKm"] == pytest.approx(10.0, abs=0.1)
    assert 10.0 < result["etaMinutes"] < 60.0


def test_identical_points_give_zero_even_if_the_model_would_say_something_else() -> None:
    result = predict_eta_with_model(_stub(_FixedModel(-5.0)), 28.6, 77.2, 28.6, 77.2, 14, "BLS")
    assert result == {"etaMinutes": 0.0, "distanceKm": 0.0}


def test_the_peak_flag_really_reaches_the_model() -> None:
    model = _exact_linear_model()
    peak = predict_eta_with_model(model, 28.6, 77.2, 28.69, 77.2, 9, "BLS")
    off_peak = predict_eta_with_model(model, 28.6, 77.2, 28.69, 77.2, 13, "BLS")
    # about 10 km: off-peak 1.5 + 2*10 = 21.5 minutes; peak 1.5 - 2.5 + 2.8*10 = 27 minutes
    assert off_peak["etaMinutes"] == pytest.approx(21.5, abs=0.1)
    assert peak["etaMinutes"] == pytest.approx(27.0, abs=0.1)


def test_a_very_short_peak_hour_trip_makes_the_model_fail_loudly() -> None:
    # This line goes below zero for short peak trips (1.5 - 2.5 + 0.28 for 0.1 km).
    # The value must not be clipped or hidden: Phase 5 falls back to the baseline.
    model = _exact_linear_model()
    with pytest.raises(ModelPredictionError, match="invalid prediction"):
        predict_eta_with_model(model, 28.6, 77.2, 28.6009, 77.2, 9, "BLS")
    off_peak = predict_eta_with_model(model, 28.6, 77.2, 28.6009, 77.2, 13, "BLS")
    assert off_peak["etaMinutes"] == pytest.approx(1.7, abs=0.02)


@pytest.mark.parametrize("bad_value", [-0.01, math.nan, math.inf, -math.inf])
def test_an_invalid_model_output_raises_instead_of_being_returned(bad_value: float) -> None:
    with pytest.raises(ModelPredictionError, match="invalid prediction"):
        predict_eta_with_model(_stub(_FixedModel(bad_value)), **VALID)  # type: ignore[arg-type]


def test_a_model_that_cannot_predict_raises_a_model_error() -> None:
    with pytest.raises(ModelPredictionError, match="could not produce"):
        predict_eta_with_model(_stub(_RaisesValueError()), **VALID)  # type: ignore[arg-type]


def test_an_unrelated_error_is_not_hidden() -> None:
    with pytest.raises(RuntimeError, match="unrelated problem") as caught:
        predict_eta_with_model(_stub(_RaisesRuntimeError()), **VALID)  # type: ignore[arg-type]
    assert type(caught.value) is RuntimeError  # not turned into a ModelPredictionError


@pytest.mark.parametrize(
    "changes",
    [
        {"fromLat": 91},
        {"toLng": 181},
        {"fromLat": math.nan},
        {"toLat": None},
        {"hour": 8.0},
        {"hour": True},
        {"hour": 24},
        {"ambulanceType": "ALS"},
        {"ambulanceType": "bls"},
    ],
)
def test_bad_requests_are_rejected_before_the_model_runs(changes: dict[str, object]) -> None:
    with pytest.raises(InvalidInputError):
        predict_eta_with_model(_stub(_FixedModel(10.0)), **request_with(**changes))  # type: ignore[arg-type]


def test_the_first_invalid_field_in_contract_order_is_reported() -> None:
    with pytest.raises(InvalidInputError, match="fromLat"):
        predict_eta_with_model(
            _stub(_FixedModel(10.0)), **request_with(fromLat=999, hour=99, ambulanceType="X")  # type: ignore[arg-type]
        )


def test_error_messages_do_not_echo_the_submitted_value() -> None:
    secret = "SUBMITTED-VALUE-12345"
    with pytest.raises(InvalidInputError) as caught:
        predict_eta_with_model(_stub(_FixedModel(10.0)), **request_with(ambulanceType=secret))  # type: ignore[arg-type]
    assert secret not in str(caught.value)


# --- Saving and loading -----------------------------------------------------------------------
def test_save_then_load_gives_identical_predictions(tmp_path: Path) -> None:
    _, loaded, trips_path = _trained()
    train, _ = split_train_validation(load_trips_csv(trips_path))
    in_memory = _stub(train_linear_regression(train))
    save_model(in_memory.estimator, loaded.metadata, tmp_path / "models")  # type: ignore[arg-type]
    reloaded = load_model(tmp_path / "models")
    for row in SMALL.iloc[:25].itertuples(index=False):
        args = (row.fromLat, row.fromLng, row.toLat, row.toLng, row.hour, row.ambulanceType)
        assert predict_eta_with_model(reloaded, *args) == predict_eta_with_model(in_memory, *args)


def test_loading_without_the_model_file(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    (folder / "eta_linear_regression.joblib").unlink()
    with pytest.raises(ModelLoadError, match="was not found"):
        load_model(folder)


def test_loading_without_the_metadata_file(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    _metadata_path(folder).unlink()
    with pytest.raises(ModelLoadError, match="was not found"):
        load_model(folder)


def test_loading_from_a_folder_that_does_not_exist(tmp_path: Path) -> None:
    with pytest.raises(ModelLoadError, match="was not found"):
        load_model(tmp_path / "no_such_folder")


def test_a_changed_model_file_is_detected_by_its_checksum(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    (folder / "eta_linear_regression.joblib").write_bytes(b"this is not a model")
    with pytest.raises(ModelLoadError, match="checksum"):
        load_model(folder)


def test_a_file_with_a_valid_checksum_that_cannot_be_unpickled(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    (folder / "eta_linear_regression.joblib").write_bytes(b"garbage bytes")
    _set_checksum(folder)
    with pytest.raises(ModelLoadError, match="could not be loaded") as caught:
        load_model(folder)
    assert caught.value.__cause__ is not None  # the original error is kept, not hidden


def test_a_file_with_a_valid_checksum_that_is_not_the_expected_model(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    joblib.dump({"not": "a model"}, folder / "eta_linear_regression.joblib")
    _set_checksum(folder)
    with pytest.raises(ModelLoadError, match="expected model"):
        load_model(folder)


def test_unreadable_metadata_is_reported(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    _metadata_path(folder).write_text("this is not json", encoding="utf-8")
    with pytest.raises(ModelLoadError, match="could not be read"):
        load_model(folder)
    _metadata_path(folder).write_text("[1, 2, 3]", encoding="utf-8")
    with pytest.raises(ModelLoadError, match="unexpected format"):
        load_model(folder)


@pytest.mark.parametrize(
    ("changes", "label"),
    [
        ({"featureNames": ["distanceKm"]}, "feature list"),
        ({"peakHours": [1, 2, 3]}, "peak hours"),
        ({"ambulanceTypes": ["ALS"]}, "ambulance types"),
        ({"scikitLearnVersion": "0.0.1"}, "scikit-learn version"),
    ],
)
def test_a_model_that_does_not_match_this_code_is_refused(
    tmp_path: Path, changes: dict[str, object], label: str
) -> None:
    folder = _copy_model_dir(tmp_path)
    _edit_metadata(folder, **changes)
    with pytest.raises(ModelLoadError, match=label):
        load_model(folder)


def test_changed_peak_hours_in_the_config_make_the_saved_model_stale() -> None:
    other = EtaConfig(
        speeds_kmh={"BLS": SpeedProfile(peak_kmh=25.0, off_peak_kmh=40.0)}, peak_hours={9}
    )
    _trained()  # makes sure the model folder exists
    with pytest.raises(ModelLoadError, match="peak hours"):
        load_model(_ROOT / "models", config=other)


def test_load_errors_do_not_reveal_the_folder_path(tmp_path: Path) -> None:
    folder = _copy_model_dir(tmp_path)
    (folder / "eta_linear_regression.joblib").write_bytes(b"changed")
    with pytest.raises(ModelLoadError) as caught:
        load_model(folder)
    assert str(tmp_path) not in str(caught.value)


# --- The comparison ------------------------------------------------------------------------------
def test_comparison_is_labelled_synthetic_and_carries_the_disclaimer() -> None:
    comparison, _, _ = _trained()
    assert comparison["dataSource"] == "synthetic"
    assert comparison["servedModel"] == "LinearRegression"
    assert "NOT a measure of real-world accuracy" in comparison["disclaimer"]  # type: ignore[operator]
    saved = json.loads((_ROOT / "data" / COMPARISON_FILE_NAME).read_text(encoding="utf-8"))
    assert saved == comparison


def test_comparison_uses_the_same_split_as_phase_3() -> None:
    comparison, _, _ = _trained()
    assert comparison["datasetRows"] == 300
    assert comparison["trainRows"] == 240
    assert comparison["validationRows"] == 60  # 20% of 300, like Phase 3


def test_reported_maes_match_an_independent_recalculation() -> None:
    comparison, loaded, trips_path = _trained()
    _, validation = split_train_validation(load_trips_csv(trips_path))
    actual = validation["travelTimeMinutes"]

    baseline_mae = mean_absolute_error(actual, baseline_predictions(validation))
    served = [
        predict_eta_with_model(
            loaded, r.fromLat, r.fromLng, r.toLat, r.toLng, r.hour, r.ambulanceType
        )["etaMinutes"]
        for r in validation.itertuples(index=False)
    ]
    model_mae = mean_absolute_error(actual, served)

    reported = comparison["validation"]
    assert reported["baseline"]["maeMinutes"] == pytest.approx(baseline_mae, abs=1e-4)  # type: ignore[index]
    assert reported["linearRegression"]["maeMinutes"] == pytest.approx(model_mae, abs=1e-4)  # type: ignore[index]
    assert comparison["linearRegressionVsBaseline"]["maeDifferenceMinutes"] == pytest.approx(  # type: ignore[index]
        baseline_mae - model_mae, abs=1e-3
    )


def test_constant_mean_reference_uses_the_training_mean() -> None:
    comparison, _, trips_path = _trained()
    train, validation = split_train_validation(load_trips_csv(trips_path))
    expected = mean_absolute_error(
        validation["travelTimeMinutes"],
        np.full(len(validation), train["travelTimeMinutes"].mean()),
    )
    assert comparison["validation"]["constantMeanReference"]["maeMinutes"] == pytest.approx(  # type: ignore[index]
        expected, abs=1e-4
    )


def test_cross_validation_numbers_exist_and_are_positive() -> None:
    comparison, _, _ = _trained()
    cv = comparison["crossValidationOnTrainRows"]
    assert cv["folds"] == 5  # type: ignore[index]
    assert cv["linearRegressionMaeMinutes"] > 0  # type: ignore[index]
    assert cv["randomForestMaeMinutes"] > 0  # type: ignore[index]


def test_peak_and_off_peak_rows_add_up_for_every_model() -> None:
    comparison, _, _ = _trained()
    for name in ("baseline", "linearRegression", "randomForest"):
        part = comparison["validation"][name]  # type: ignore[index]
        assert part["peakHours"]["rows"] + part["offPeakHours"]["rows"] == 60


# --- The bootstrap helper ---------------------------------------------------------------------------
def test_bootstrap_when_the_model_is_always_better() -> None:
    result = paired_bootstrap_interval([5.0] * 20, [4.0] * 20)
    assert result["maeDifferenceMinutes"] == 1.0
    assert result["bootstrap95Interval"] == [1.0, 1.0]
    assert result["modelBetterShareOfTrips"] == 1.0
    assert result["verdict"] == "model_clearly_better"


def test_bootstrap_when_the_baseline_is_always_better() -> None:
    assert paired_bootstrap_interval([4.0] * 20, [6.0] * 20)["verdict"] == "baseline_clearly_better"


def test_bootstrap_when_there_is_no_difference() -> None:
    result = paired_bootstrap_interval([3.0, 5.0, 4.0, 6.0], [3.0, 5.0, 4.0, 6.0])
    assert result["maeDifferenceMinutes"] == 0.0
    assert result["modelBetterShareOfTrips"] == 0.0
    assert result["verdict"] == "no_clear_difference"


def test_bootstrap_says_no_clear_difference_when_the_gap_is_noise() -> None:
    # +1 on half the trips and -1 on the other half: a mean of 0 with real spread.
    baseline = [5.0, 3.0] * 25
    model = [4.0, 4.0] * 25
    assert paired_bootstrap_interval(baseline, model)["verdict"] == "no_clear_difference"


def test_bootstrap_is_reproducible_with_the_same_seed() -> None:
    baseline = list(np.random.default_rng(1).uniform(0, 20, 80))
    model = list(np.random.default_rng(2).uniform(0, 20, 80))
    assert paired_bootstrap_interval(baseline, model) == paired_bootstrap_interval(baseline, model)


@pytest.mark.parametrize(
    ("baseline", "model", "resamples"),
    [
        ([], [], 10),
        ([1.0, 2.0], [1.0], 10),
        ([1.0, math.nan], [1.0, 2.0], 10),
        ([[1.0, 2.0]], [[1.0, 2.0]], 10),
        ([1.0], [1.0], 0),
        ([1.0], [1.0], True),
    ],
)
def test_bootstrap_rejects_bad_input(baseline: object, model: object, resamples: object) -> None:
    with pytest.raises(ValueError):
        paired_bootstrap_interval(baseline, model, resamples=resamples)  # type: ignore[arg-type]


# --- The committed comparison file ---------------------------------------------------------------------
def test_committed_comparison_file_has_both_maes_and_the_disclaimer() -> None:
    saved = json.loads((DEFAULT_DATA_DIR / COMPARISON_FILE_NAME).read_text(encoding="utf-8"))
    assert saved["dataSource"] == "synthetic"
    assert saved["validation"]["baseline"]["maeMinutes"] > 0
    assert saved["validation"]["linearRegression"]["maeMinutes"] > 0
    assert saved["linearRegressionVsBaseline"]["verdict"] in {
        "model_clearly_better",
        "baseline_clearly_better",
        "no_clear_difference",
    }
    assert "NOT a measure of real-world accuracy" in saved["disclaimer"]