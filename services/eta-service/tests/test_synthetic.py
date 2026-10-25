"""Tests for ml/eta/synthetic.py (Phase 3, ticket AI-05).

All data here is fake. The test for the committed CSV needs the file to exist:
run ``python -m ml.eta.synthetic`` once before ``pytest``.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ml.eta.eta import haversine_distance_km, predict_eta
from ml.eta.synthetic import (
    BOX_MAX_LAT,
    BOX_MAX_LNG,
    BOX_MIN_LAT,
    BOX_MIN_LNG,
    DATA_SOURCE_LABEL,
    DEFAULT_N_TRIPS,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SEED,
    DETOUR_FACTOR,
    MIN_TRIP_KM,
    NOISE_SIGMA,
    ROAD_TYPE_PROBABILITIES,
    ROAD_TYPES,
    TRAFFIC_LEVELS,
    TRAFFIC_PROBABILITIES,
    TRIP_COLUMNS,
    DatasetError,
    generate_synthetic_trips,
    load_trips_csv,
    main,
    noiseless_travel_minutes,
    save_trips_csv,
    validate_trips_dataframe,
)

TRIPS = generate_synthetic_trips(n_trips=DEFAULT_N_TRIPS, seed=DEFAULT_SEED)


# --- Shape, labels and value ranges ---------------------------------------------
def test_dataset_has_at_least_500_rows() -> None:
    assert len(TRIPS) == DEFAULT_N_TRIPS
    assert len(TRIPS) >= 500  # the PDF minimum


def test_columns_are_exactly_the_documented_ones() -> None:
    assert list(TRIPS.columns) == list(TRIP_COLUMNS)


def test_no_missing_or_non_finite_values() -> None:
    assert not TRIPS.isna().any().any()
    numeric = TRIPS.select_dtypes(include="number").to_numpy(dtype=float)
    assert np.isfinite(numeric).all()


def test_whole_number_columns_have_integer_type() -> None:
    for column in ("tripId", "hour", "dayOfWeek"):
        assert pd.api.types.is_integer_dtype(TRIPS[column])


def test_every_row_is_labelled_synthetic() -> None:
    assert (TRIPS["dataSource"] == DATA_SOURCE_LABEL).all()


def test_trip_ids_are_unique_and_sequential() -> None:
    assert list(TRIPS["tripId"]) == list(range(1, len(TRIPS) + 1))


def test_coordinates_are_valid_and_inside_the_fake_area() -> None:
    assert TRIPS["fromLat"].between(BOX_MIN_LAT, BOX_MAX_LAT).all()
    assert TRIPS["toLat"].between(BOX_MIN_LAT, BOX_MAX_LAT).all()
    assert TRIPS["fromLng"].between(BOX_MIN_LNG, BOX_MAX_LNG).all()
    assert TRIPS["toLng"].between(BOX_MIN_LNG, BOX_MAX_LNG).all()


def test_hour_and_day_values_are_in_range_and_cover_the_range() -> None:
    assert TRIPS["hour"].between(0, 23).all()
    assert TRIPS["dayOfWeek"].between(0, 6).all()
    assert TRIPS["hour"].nunique() == 24
    assert TRIPS["dayOfWeek"].nunique() == 7


def test_only_the_bls_ambulance_type_is_used() -> None:
    assert set(TRIPS["ambulanceType"]) == {"BLS"}


def test_traffic_and_road_values_are_from_the_allowed_sets() -> None:
    assert set(TRIPS["trafficLevel"]) == set(TRAFFIC_LEVELS)
    assert set(TRIPS["roadType"]) == set(ROAD_TYPES)


def test_distance_column_matches_haversine_of_the_coordinates() -> None:
    for row in TRIPS.itertuples(index=False):
        expected = haversine_distance_km(row.fromLat, row.fromLng, row.toLat, row.toLng)
        assert row.distanceKm == pytest.approx(expected, abs=0.0006)


def test_trips_are_at_least_the_minimum_length() -> None:
    assert (TRIPS["distanceKm"] >= MIN_TRIP_KM - 0.0006).all()


def test_travel_times_are_positive_and_sane() -> None:
    assert (TRIPS["travelTimeMinutes"] > 0).all()
    assert (TRIPS["travelTimeMinutes"] < 240).all()  # no trip longer than 4 hours


# --- Reproducibility --------------------------------------------------------------
def test_same_seed_gives_an_identical_table() -> None:
    again = generate_synthetic_trips(n_trips=DEFAULT_N_TRIPS, seed=DEFAULT_SEED)
    pd.testing.assert_frame_equal(TRIPS, again)


def test_different_seed_gives_a_different_table() -> None:
    other = generate_synthetic_trips(n_trips=DEFAULT_N_TRIPS, seed=DEFAULT_SEED + 1)
    assert not other["travelTimeMinutes"].equals(TRIPS["travelTimeMinutes"])


# --- The documented model really is what the data follows ------------------------
@pytest.mark.parametrize("scenario", sorted(TRAFFIC_PROBABILITIES))
def test_traffic_probabilities_sum_to_one(scenario: str) -> None:
    assert sum(TRAFFIC_PROBABILITIES[scenario]) == pytest.approx(1.0)


def test_road_type_probabilities_sum_to_one() -> None:
    assert sum(ROAD_TYPE_PROBABILITIES) == pytest.approx(1.0)
    assert len(ROAD_TYPE_PROBABILITIES) == len(ROAD_TYPES)


def test_noiseless_formula_matches_the_worked_example() -> None:
    # 10 km x 1.25 = 12.5 km of road at 45 x 0.8 = 36 km/h -> 20.83 min, + 1 min.
    assert noiseless_travel_minutes(10.0, "arterial", "medium") == pytest.approx(
        12.5 / 36.0 * 60.0 + 1.0
    )
    assert DETOUR_FACTOR["arterial"] == 1.25


def test_noise_spread_matches_the_documented_sigma() -> None:
    noiseless = np.array(
        [
            noiseless_travel_minutes(row.distanceKm, row.roadType, row.trafficLevel)
            for row in TRIPS.itertuples(index=False)
        ]
    )
    log_ratio = np.log(TRIPS["travelTimeMinutes"].to_numpy() / noiseless)
    assert float(np.std(log_ratio)) == pytest.approx(NOISE_SIGMA, abs=0.02)
    assert abs(float(np.mean(log_ratio))) < 0.02  # noise is centred, not biased


def test_high_traffic_trips_are_slower_per_km_than_low_traffic_trips() -> None:
    minutes_per_km = TRIPS["travelTimeMinutes"] / TRIPS["distanceKm"]
    high = minutes_per_km[TRIPS["trafficLevel"] == "high"].mean()
    low = minutes_per_km[TRIPS["trafficLevel"] == "low"].mean()
    assert high > low


def test_rush_hours_have_more_high_traffic_than_night_hours() -> None:
    weekday = TRIPS[TRIPS["dayOfWeek"] < 5]
    rush = weekday[weekday["hour"].isin({8, 9, 10, 17, 18, 19, 20})]
    night = weekday[weekday["hour"].isin({0, 1, 2, 3, 4, 5})]
    assert (rush["trafficLevel"] == "high").mean() > (night["trafficLevel"] == "high").mean()


def test_target_is_not_just_the_baseline_formula_plus_noise() -> None:
    baseline = np.array(
        [
            predict_eta(r.fromLat, r.fromLng, r.toLat, r.toLng, r.hour, r.ambulanceType)[
                "etaMinutes"
            ]
            for r in TRIPS.itertuples(index=False)
        ]
    )
    mean_gap = float(np.mean(np.abs(TRIPS["travelTimeMinutes"].to_numpy() - baseline)))
    assert mean_gap > 0.5  # the synthetic world differs from the baseline's assumptions


# --- Bad arguments ---------------------------------------------------------------
@pytest.mark.parametrize("bad", [0, -1, 1.5, "10", None, True, 10**7])
def test_invalid_row_counts_are_rejected(bad: object) -> None:
    with pytest.raises(ValueError, match="n_trips"):
        generate_synthetic_trips(n_trips=bad)  # type: ignore[arg-type]


@pytest.mark.parametrize("bad", [-1, 1.5, "1", None, True, 2**40])
def test_invalid_seeds_are_rejected(bad: object) -> None:
    with pytest.raises(ValueError, match="seed"):
        generate_synthetic_trips(n_trips=10, seed=bad)  # type: ignore[arg-type]


# --- Validation of a table or file ------------------------------------------------
def test_a_valid_table_passes_validation() -> None:
    validate_trips_dataframe(TRIPS)


def _without_column(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.drop(columns=["roadType"])


def _with_extra_column(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(extra=1)


def _with_missing_value(trips: pd.DataFrame) -> pd.DataFrame:
    broken = trips.copy()
    broken.loc[0, "travelTimeMinutes"] = float("nan")
    return broken


def _with_unknown_traffic_level(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(trafficLevel="extreme")


def _not_labelled_synthetic(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(dataSource="real")


def _other_ambulance_type(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(ambulanceType="ALS")


def _duplicate_trip_id(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(tripId=1)


def _hour_as_float(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(hour=trips["hour"].astype(float))


def _negative_travel_time(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(travelTimeMinutes=-1.0)


def _latitude_out_of_range(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(fromLat=95.0)


def _infinite_distance(trips: pd.DataFrame) -> pd.DataFrame:
    return trips.assign(distanceKm=float("inf"))


@pytest.mark.parametrize(
    "break_it",
    [
        _without_column,
        _with_extra_column,
        _with_missing_value,
        _with_unknown_traffic_level,
        _not_labelled_synthetic,
        _other_ambulance_type,
        _duplicate_trip_id,
        _hour_as_float,
        _negative_travel_time,
        _latitude_out_of_range,
        _infinite_distance,
    ],
)
def test_broken_tables_are_rejected(break_it: object) -> None:
    with pytest.raises(DatasetError):
        validate_trips_dataframe(break_it(TRIPS))  # type: ignore[operator]


def test_empty_table_and_wrong_type_are_rejected() -> None:
    with pytest.raises(DatasetError):
        validate_trips_dataframe(TRIPS.iloc[0:0])
    with pytest.raises(DatasetError):
        validate_trips_dataframe([1, 2, 3])  # type: ignore[arg-type]


# --- Files -------------------------------------------------------------------------
def test_csv_round_trip_is_lossless(tmp_path: Path) -> None:
    path = save_trips_csv(TRIPS, tmp_path / "trips.csv")
    loaded = load_trips_csv(path)
    pd.testing.assert_frame_equal(TRIPS, loaded, check_dtype=False)


def test_saving_an_invalid_table_is_refused(tmp_path: Path) -> None:
    with pytest.raises(DatasetError):
        save_trips_csv(_not_labelled_synthetic(TRIPS), tmp_path / "bad.csv")
    assert not (tmp_path / "bad.csv").exists()


def test_loading_a_missing_file_gives_a_clear_error(tmp_path: Path) -> None:
    with pytest.raises(DatasetError, match="not found"):
        load_trips_csv(tmp_path / "does_not_exist.csv")


def test_loading_an_empty_file_gives_a_clear_error(tmp_path: Path) -> None:
    empty = tmp_path / "empty.csv"
    empty.write_text("", encoding="utf-8")
    with pytest.raises(DatasetError, match="empty"):
        load_trips_csv(empty)


def test_command_line_writes_a_valid_file(tmp_path: Path) -> None:
    output = tmp_path / "cli_trips.csv"
    assert main(["--rows", "50", "--seed", "7", "--output", str(output)]) == 0
    assert len(load_trips_csv(output)) == 50


def test_committed_dataset_file_is_valid_and_has_500_plus_rows() -> None:
    trips = load_trips_csv(DEFAULT_OUTPUT_PATH)  # validates columns, labels and ranges
    assert len(trips) >= 500