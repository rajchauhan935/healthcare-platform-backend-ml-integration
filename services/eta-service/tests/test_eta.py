"""Tests for ml/eta/eta.py (Phase 2, ticket AI-04).

Expected distances are derived from the Haversine formula itself
(arc length = radius x angle), not copied from the code under test.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from ml.eta.config import DEFAULT_CONFIG, EtaConfig, SpeedProfile
from ml.eta.eta import (
    EARTH_RADIUS_KM,
    OUTPUT_DECIMALS,
    haversine_distance_km,
    predict_eta,
)
from ml.eta.validation import InvalidInputError

KM_PER_DEGREE = EARTH_RADIUS_KM * math.pi / 180.0  # arc length of 1 degree
PEAK_SPEED = DEFAULT_CONFIG.speeds_kmh["BLS"].peak_kmh
OFF_PEAK_SPEED = DEFAULT_CONFIG.speeds_kmh["BLS"].off_peak_kmh

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


# --- Haversine: known values --------------------------------------------------
def test_one_degree_of_latitude() -> None:
    assert haversine_distance_km(0, 0, 1, 0) == pytest.approx(KM_PER_DEGREE)


def test_quarter_of_equator() -> None:
    assert haversine_distance_km(0, 0, 0, 90) == pytest.approx(EARTH_RADIUS_KM * math.pi / 2)


def test_antipodal_points_are_half_the_circumference() -> None:
    expected = EARTH_RADIUS_KM * math.pi
    assert haversine_distance_km(0, 0, 0, 180) == pytest.approx(expected)
    assert haversine_distance_km(90, 0, -90, 0) == pytest.approx(expected)


def test_longitude_degree_shrinks_with_latitude() -> None:
    at_equator = haversine_distance_km(0, 0, 0, 1)
    at_60_north = haversine_distance_km(60, 0, 60, 1)
    assert at_60_north == pytest.approx(at_equator * 0.5, rel=1e-3)  # cos(60) = 0.5


# --- Haversine: properties and edge cases -------------------------------------
def test_identical_points_have_zero_distance() -> None:
    assert haversine_distance_km(28.6, 77.2, 28.6, 77.2) == 0.0


def test_distance_is_symmetric() -> None:
    forward = haversine_distance_km(28.6139, 77.2090, 19.0760, 72.8777)
    backward = haversine_distance_km(19.0760, 72.8777, 28.6139, 77.2090)
    assert forward == pytest.approx(backward)


def test_distance_is_never_negative() -> None:
    corners = [-90, 0, 90]
    for lat1 in corners:
        for lat2 in corners:
            assert haversine_distance_km(lat1, -180, lat2, 180) >= 0.0


def test_trip_across_the_date_line_is_short() -> None:
    assert haversine_distance_km(0, 179, 0, -179) == pytest.approx(2 * KM_PER_DEGREE)


def test_both_poles_with_any_longitude_work() -> None:
    assert haversine_distance_km(90, -180, 90, 180) == pytest.approx(0.0, abs=1e-6)


@pytest.mark.parametrize(
    "points",
    [
        (-12.0, 70.11, 12.0, -109.89),
        (9.41, -96.3, -9.41, 83.7),
        (48.2, -34.21, -48.2, 145.79),
    ],
)
def test_antipodal_rounding_error_does_not_crash(points: tuple[float, ...]) -> None:
    # For these exactly-opposite points the raw Haversine value comes out as
    # 1.0000000000000002 (found by a search). This checks that such points still
    # give the half-circumference. Note: it does NOT prove the clamp in eta.py is
    # needed; no input was found where removing the clamp changes the result.
    assert haversine_distance_km(*points) == pytest.approx(EARTH_RADIUS_KM * math.pi, rel=1e-9)


@pytest.mark.parametrize(
    "args",
    [
        (91, 0, 0, 0),
        (0, 181, 0, 0),
        (0, 0, -91, 0),
        (0, 0, 0, -181),
        (math.nan, 0, 0, 0),
        (0, math.inf, 0, 0),
        (0, 0, True, 0),
        (0, 0, 0, "77.2"),
        (None, 0, 0, 0),
    ],
)
def test_haversine_rejects_invalid_coordinates(args: tuple[object, ...]) -> None:
    with pytest.raises(InvalidInputError):
        haversine_distance_km(*args)  # type: ignore[arg-type]


# --- predict_eta: normal cases ------------------------------------------------
def test_off_peak_eta_matches_hand_calculation() -> None:
    result = predict_eta(0, 0, 1, 0, 12, "BLS")  # hour 12 is not a peak hour
    assert result["distanceKm"] == round(KM_PER_DEGREE, 2)
    assert result["etaMinutes"] == round(KM_PER_DEGREE / OFF_PEAK_SPEED * 60, 2)


def test_peak_eta_matches_hand_calculation() -> None:
    result = predict_eta(0, 0, 1, 0, 8, "BLS")  # hour 8 is a peak hour
    assert result["etaMinutes"] == round(KM_PER_DEGREE / PEAK_SPEED * 60, 2)


def test_peak_is_slower_than_off_peak_for_the_same_trip() -> None:
    peak = predict_eta(**request_with(hour=9))
    off_peak = predict_eta(**request_with(hour=14))
    assert peak["etaMinutes"] > off_peak["etaMinutes"]
    assert peak["distanceKm"] == off_peak["distanceKm"]


def test_identical_coordinates_give_zero_eta_and_zero_distance() -> None:
    assert predict_eta(28.6, 77.2, 28.6, 77.2, 14, "BLS") == {
        "etaMinutes": 0.0,
        "distanceKm": 0.0,
    }


def test_result_has_exactly_the_contract_keys() -> None:
    assert set(predict_eta(**VALID)) == {"etaMinutes", "distanceKm"}


def test_values_are_non_negative_floats_with_two_decimals() -> None:
    result = predict_eta(**VALID)
    for value in result.values():
        assert isinstance(value, float)
        assert value >= 0.0
        assert value == round(value, OUTPUT_DECIMALS)


def test_very_long_trip_still_returns_a_valid_result() -> None:
    result = predict_eta(0, 0, 0, 180, 12, "BLS")
    assert result["distanceKm"] == pytest.approx(EARTH_RADIUS_KM * math.pi, abs=0.01)
    assert result["etaMinutes"] > 0


# --- predict_eta: boundaries --------------------------------------------------
@pytest.mark.parametrize("hour", [0, 23])
def test_hour_boundaries_are_accepted(hour: int) -> None:
    assert predict_eta(**request_with(hour=hour))["etaMinutes"] > 0


@pytest.mark.parametrize(
    ("hour", "is_peak"),
    [(7, False), (8, True), (10, True), (11, False), (16, False), (17, True), (20, True), (21, False)],
)
def test_peak_window_edges(hour: int, is_peak: bool) -> None:
    result = predict_eta(0, 0, 1, 0, hour, "BLS")
    speed = PEAK_SPEED if is_peak else OFF_PEAK_SPEED
    assert result["etaMinutes"] == round(KM_PER_DEGREE / speed * 60, 2)


def test_extreme_valid_coordinates_are_accepted() -> None:
    result = predict_eta(-90, -180, 90, 180, 0, "BLS")
    assert result["distanceKm"] == pytest.approx(EARTH_RADIUS_KM * math.pi, abs=0.01)


# --- predict_eta: error handling ----------------------------------------------
BAD_NUMBERS = [None, "28.6", True, False, [28.6], math.nan, math.inf, -math.inf]


@pytest.mark.parametrize("field", ["fromLat", "toLat"])
@pytest.mark.parametrize("bad", [*BAD_NUMBERS, 90.0001, -90.0001, 1000])
def test_bad_latitude_is_rejected(field: str, bad: object) -> None:
    with pytest.raises(InvalidInputError, match=field):
        predict_eta(**request_with(**{field: bad}))


@pytest.mark.parametrize("field", ["fromLng", "toLng"])
@pytest.mark.parametrize("bad", [*BAD_NUMBERS, 180.0001, -180.0001, 1000])
def test_bad_longitude_is_rejected(field: str, bad: object) -> None:
    with pytest.raises(InvalidInputError, match=field):
        predict_eta(**request_with(**{field: bad}))


@pytest.mark.parametrize(
    "bad", [-1, 24, 100, 8.0, 7.5, "8", "", None, True, False, [8], math.nan, math.inf]
)
def test_bad_hour_is_rejected(bad: object) -> None:
    with pytest.raises(InvalidInputError, match="hour"):
        predict_eta(**request_with(hour=bad))


@pytest.mark.parametrize(
    "bad", ["ALS", "ICU", "bls", "Bls", "BLS ", " BLS", "", None, 5, True, ["BLS"], b"BLS"]
)
def test_bad_ambulance_type_is_rejected(bad: object) -> None:
    with pytest.raises(InvalidInputError, match="ambulanceType"):
        predict_eta(**request_with(ambulanceType=bad))


def test_error_message_does_not_echo_the_submitted_value() -> None:
    secret = "SUBMITTED-VALUE-12345"
    with pytest.raises(InvalidInputError) as caught:
        predict_eta(**request_with(ambulanceType=secret))
    assert secret not in str(caught.value)


def test_first_invalid_field_in_contract_order_is_reported() -> None:
    with pytest.raises(InvalidInputError, match="fromLat"):
        predict_eta(**request_with(fromLat=999, hour=99, ambulanceType="X"))


# --- predict_eta: extras ------------------------------------------------------
def test_numpy_numbers_are_accepted() -> None:
    result = predict_eta(np.float64(28.6139), np.float32(77.2), 28.5, 77.3, np.int64(14), "BLS")
    assert result["etaMinutes"] > 0


def test_custom_config_is_respected() -> None:
    config = EtaConfig(
        speeds_kmh={"X": SpeedProfile(peak_kmh=10.0, off_peak_kmh=20.0)},
        peak_hours={5},
    )
    peak = predict_eta(0, 0, 1, 0, 5, "X", config=config)
    off_peak = predict_eta(0, 0, 1, 0, 6, "X", config=config)
    assert peak["etaMinutes"] == round(KM_PER_DEGREE / 10.0 * 60, 2)
    assert off_peak["etaMinutes"] == round(KM_PER_DEGREE / 20.0 * 60, 2)
    with pytest.raises(InvalidInputError):  # "BLS" is not in this custom config
        predict_eta(0, 0, 1, 0, 5, "BLS", config=config)


def test_disclaimer_is_documented() -> None:
    import ml.eta.eta as eta_module

    assert "not guaranteed" in (eta_module.__doc__ or "").lower()
    assert "not a guaranteed" in (predict_eta.__doc__ or "").lower()