"""Tests for ml/eta/evaluate.py (Phase 3, ticket AI-05).

All data here is fake. The tests for the committed result files need them to
exist: run ``python -m ml.eta.synthetic`` and then ``python -m ml.eta.evaluate``
once before ``pytest``.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ml.eta.config import DEFAULT_CONFIG
from ml.eta.eta import predict_eta
from ml.eta.evaluate import (
    DEFAULT_DATA_DIR,
    EXAMPLES_FILE_NAME,
    METRICS_FILE_NAME,
    N_EXAMPLES,
    VALIDATION_FRACTION,
    baseline_predictions,
    build_examples,
    compute_baseline_metrics,
    main,
    mean_absolute_error,
    run_baseline_evaluation,
    split_train_validation,
)
from ml.eta.synthetic import (
    DatasetError,
    generate_synthetic_trips,
    load_trips_csv,
    save_trips_csv,
)

TRIPS = generate_synthetic_trips(n_trips=1000, seed=42)


# --- MAE --------------------------------------------------------------------------
def test_mae_matches_a_hand_calculation() -> None:
    # errors are 2 and 3 -> (2 + 3) / 2 = 2.5
    assert mean_absolute_error([10, 20], [12, 17]) == 2.5


def test_mae_is_zero_for_perfect_predictions() -> None:
    assert mean_absolute_error([1.5, 2.5, 3.5], [1.5, 2.5, 3.5]) == 0.0


def test_mae_ignores_the_direction_of_the_error() -> None:
    assert mean_absolute_error([10], [13]) == mean_absolute_error([10], [7]) == 3.0


def test_mae_accepts_numpy_arrays_and_pandas_series() -> None:
    assert mean_absolute_error(np.array([1.0, 2.0]), pd.Series([2.0, 4.0])) == 1.5


@pytest.mark.parametrize(
    ("actual", "predicted"),
    [
        ([], []),
        ([1, 2], [1]),
        ([1, math.nan], [1, 2]),
        ([1, 2], [1, math.inf]),
        (["a", "b"], [1, 2]),
        (["1", "2"], [1, 2]),
        ([True, False], [1, 0]),
        ([[1, 2], [3, 4]], [[1, 2], [3, 4]]),
        (None, [1]),
    ],
)
def test_mae_rejects_bad_input(actual: object, predicted: object) -> None:
    with pytest.raises(ValueError):
        mean_absolute_error(actual, predicted)


# --- Train / validation split ---------------------------------------------------------
def test_split_sizes_follow_the_fraction() -> None:
    train, validation = split_train_validation(TRIPS)
    assert len(validation) == round(1000 * VALIDATION_FRACTION) == 200
    assert len(train) == 800


def test_split_parts_never_share_a_trip_and_cover_everything() -> None:
    train, validation = split_train_validation(TRIPS)
    train_ids = set(train["tripId"])
    validation_ids = set(validation["tripId"])
    assert train_ids.isdisjoint(validation_ids)
    assert train_ids | validation_ids == set(TRIPS["tripId"])


def test_split_is_reproducible_and_depends_on_the_seed() -> None:
    first = split_train_validation(TRIPS, seed=1)[1]
    second = split_train_validation(TRIPS, seed=1)[1]
    other = split_train_validation(TRIPS, seed=2)[1]
    pd.testing.assert_frame_equal(first, second)
    assert list(first["tripId"]) != list(other["tripId"])


def test_split_keeps_original_row_order() -> None:
    _, validation = split_train_validation(TRIPS)
    assert list(validation["tripId"]) == sorted(validation["tripId"])


@pytest.mark.parametrize("bad", [0, 1, -0.1, 1.5, math.nan, "0.2", None, True])
def test_split_rejects_a_bad_fraction(bad: object) -> None:
    with pytest.raises(ValueError, match="validation_fraction"):
        split_train_validation(TRIPS, validation_fraction=bad)  # type: ignore[arg-type]


@pytest.mark.parametrize("bad", [-1, 1.5, "1", None, True])
def test_split_rejects_a_bad_seed(bad: object) -> None:
    with pytest.raises(ValueError, match="seed"):
        split_train_validation(TRIPS, seed=bad)  # type: ignore[arg-type]


def test_split_needs_at_least_two_trips() -> None:
    with pytest.raises(ValueError, match="At least 2"):
        split_train_validation(TRIPS.iloc[:1])


def test_split_rejects_an_invalid_table() -> None:
    with pytest.raises(DatasetError):
        split_train_validation(TRIPS.drop(columns=["hour"]))


# --- Baseline predictions and metrics -----------------------------------------------
def test_baseline_predictions_come_from_the_real_predict_eta() -> None:
    _, validation = split_train_validation(TRIPS)
    predictions = baseline_predictions(validation)
    assert len(predictions) == len(validation)
    for position in (0, 1, 57, len(validation) - 1):
        row = validation.iloc[position]
        expected = predict_eta(
            row["fromLat"],
            row["fromLng"],
            row["toLat"],
            row["toLng"],
            int(row["hour"]),
            row["ambulanceType"],
        )["etaMinutes"]
        assert predictions.iloc[position] == expected


def test_metrics_match_an_independent_calculation() -> None:
    _, validation = split_train_validation(TRIPS)
    predictions = baseline_predictions(validation)
    metrics = compute_baseline_metrics(validation, predictions)

    gaps = [
        abs(p - a)
        for p, a in zip(predictions.tolist(), validation["travelTimeMinutes"].tolist())
    ]
    assert metrics["baselineMaeMinutes"] == pytest.approx(sum(gaps) / len(gaps), abs=1e-4)

    peak = metrics["peakHours"]
    off_peak = metrics["offPeakHours"]
    assert peak["rows"] + off_peak["rows"] == len(validation)  # type: ignore[index]
    expected_peak_rows = int(validation["hour"].isin(list(DEFAULT_CONFIG.peak_hours)).sum())
    assert peak["rows"] == expected_peak_rows  # type: ignore[index]


def test_negative_signed_error_means_the_baseline_underestimates() -> None:
    validation = TRIPS.iloc[:10].reset_index(drop=True)
    low_guess = validation["travelTimeMinutes"] - 5.0
    metrics = compute_baseline_metrics(validation, low_guess)
    assert metrics["meanSignedErrorMinutes"] == pytest.approx(-5.0)
    assert metrics["baselineMaeMinutes"] == pytest.approx(5.0)


# --- The 20 example predictions ---------------------------------------------------------
def test_examples_have_exactly_20_rows_and_consistent_errors() -> None:
    _, validation = split_train_validation(TRIPS)
    predictions = baseline_predictions(validation)
    examples = build_examples(validation, predictions)

    assert len(examples) == N_EXAMPLES == 20
    assert set(examples["tripId"]).issubset(set(validation["tripId"]))
    assert examples["tripId"].is_unique
    assert (examples["dataSource"] == "synthetic").all()
    signed_gap = examples["baselineEtaMinutes"] - examples["actualTravelTimeMinutes"]
    # errorMinutes is "baseline minus actual": negative means the baseline was too low.
    assert np.allclose(signed_gap, examples["errorMinutes"], atol=0.011)
    assert np.allclose(signed_gap.abs(), examples["absoluteErrorMinutes"], atol=0.011)


def test_examples_are_reproducible() -> None:
    _, validation = split_train_validation(TRIPS)
    predictions = baseline_predictions(validation)
    pd.testing.assert_frame_equal(
        build_examples(validation, predictions), build_examples(validation, predictions)
    )


def test_examples_need_enough_validation_trips() -> None:
    small = TRIPS.iloc[:10].reset_index(drop=True)
    with pytest.raises(ValueError, match="at least 20"):
        build_examples(small, baseline_predictions(small))


# --- End to end (real files, no mocks) ---------------------------------------------------
def _make_small_dataset(folder: Path) -> Path:
    return save_trips_csv(generate_synthetic_trips(n_trips=300, seed=5), folder / "trips.csv")


def test_end_to_end_run_writes_the_expected_files(tmp_path: Path) -> None:
    trips_path = _make_small_dataset(tmp_path)
    out = tmp_path / "out"
    metrics = run_baseline_evaluation(trips_path, out)

    saved = json.loads((out / METRICS_FILE_NAME).read_text(encoding="utf-8"))
    assert saved == metrics
    assert saved["dataSource"] == "synthetic"
    assert "NOT a measure of real-world accuracy" in saved["disclaimer"]
    assert saved["validationRows"] == 60  # 20% of 300

    examples = pd.read_csv(out / EXAMPLES_FILE_NAME)
    assert len(examples) == 20

    # Independent recomputation of the MAE straight from the CSV.
    _, validation = split_train_validation(load_trips_csv(trips_path))
    gaps = [
        abs(
            predict_eta(r.fromLat, r.fromLng, r.toLat, r.toLng, r.hour, r.ambulanceType)[
                "etaMinutes"
            ]
            - r.travelTimeMinutes
        )
        for r in validation.itertuples(index=False)
    ]
    assert saved["baselineMaeMinutes"] == pytest.approx(sum(gaps) / len(gaps), abs=1e-4)


def test_running_twice_gives_identical_files(tmp_path: Path) -> None:
    trips_path = _make_small_dataset(tmp_path)
    run_baseline_evaluation(trips_path, tmp_path / "first")
    run_baseline_evaluation(trips_path, tmp_path / "second")
    for name in (METRICS_FILE_NAME, EXAMPLES_FILE_NAME):
        assert (tmp_path / "first" / name).read_bytes() == (tmp_path / "second" / name).read_bytes()


def test_a_missing_input_file_is_reported_clearly(tmp_path: Path) -> None:
    with pytest.raises(DatasetError, match="not found"):
        run_baseline_evaluation(tmp_path / "nope.csv", tmp_path / "out")
    assert not (tmp_path / "out").exists()  # nothing half-written


def test_too_few_trips_for_20_examples_writes_nothing(tmp_path: Path) -> None:
    tiny = save_trips_csv(generate_synthetic_trips(n_trips=50, seed=5), tmp_path / "tiny.csv")
    with pytest.raises(ValueError, match="at least 20"):
        run_baseline_evaluation(tiny, tmp_path / "out")
    assert not (tmp_path / "out" / METRICS_FILE_NAME).exists()


def test_command_line_returns_0_on_success_and_1_on_a_missing_file(tmp_path: Path) -> None:
    trips_path = _make_small_dataset(tmp_path)
    assert main(["--input", str(trips_path), "--output-dir", str(tmp_path / "out")]) == 0
    assert main(["--input", str(tmp_path / "nope.csv"), "--output-dir", str(tmp_path)]) == 1


# --- The committed result files ------------------------------------------------------------
def test_committed_examples_file_has_20_rows_and_the_synthetic_label() -> None:
    examples = pd.read_csv(DEFAULT_DATA_DIR / EXAMPLES_FILE_NAME)
    assert len(examples) == 20
    assert (examples["dataSource"] == "synthetic").all()


def test_committed_metrics_file_has_the_mae_and_the_disclaimer() -> None:
    saved = json.loads((DEFAULT_DATA_DIR / METRICS_FILE_NAME).read_text(encoding="utf-8"))
    assert saved["baselineMaeMinutes"] > 0
    assert saved["dataSource"] == "synthetic"
    assert "NOT a measure of real-world accuracy" in saved["disclaimer"]