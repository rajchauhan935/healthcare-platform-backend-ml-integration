"""Tests for ml/eta/validation.py (the input checks)."""

import math

import numpy as np
import pytest

from ml.eta.config import DEFAULT_CONFIG, EtaConfig, SpeedProfile
from ml.eta.validation import (
    InvalidInputError,
    validate_ambulance_type,
    validate_hour,
    validate_latitude,
    validate_longitude,
)

# Values that are never acceptable for any numeric field.
NOT_A_NUMBER_AT_ALL = [None, "28.6", "", True, False, [28.6], (28.6,), {"v": 1}, 1 + 2j, b"1"]
NOT_FINITE = [math.nan, math.inf, -math.inf, 10**400, -(10**400)]


# --- Latitude ---------------------------------------------------------------


@pytest.mark.parametrize("value", [0, 0.0, -90, 90, -90.0, 90.0, 28.6139, -33.8688, 45])
def test_valid_latitudes_are_accepted(value: float) -> None:
    result = validate_latitude(value)
    assert result == float(value)
    assert isinstance(result, float)


@pytest.mark.parametrize("value", [90.0001, -90.0001, 91, -91, 1e308, -1e308])
def test_latitude_out_of_range_is_rejected(value: float) -> None:
    with pytest.raises(InvalidInputError, match="between -90 and 90"):
        validate_latitude(value)


@pytest.mark.parametrize("value", NOT_A_NUMBER_AT_ALL)
def test_latitude_wrong_type_is_rejected(value: object) -> None:
    with pytest.raises(InvalidInputError, match="must be a number"):
        validate_latitude(value)


@pytest.mark.parametrize("value", NOT_FINITE)
def test_latitude_not_finite_is_rejected(value: object) -> None:
    with pytest.raises(InvalidInputError, match="finite number"):
        validate_latitude(value)


# --- Longitude --------------------------------------------------------------


@pytest.mark.parametrize("value", [0, -180, 180, -180.0, 180.0, 77.2090, -122.4194, 100])
def test_valid_longitudes_are_accepted(value: float) -> None:
    result = validate_longitude(value)
    assert result == float(value)
    assert isinstance(result, float)


@pytest.mark.parametrize("value", [180.0001, -180.0001, 181, -181, 1e308])
def test_longitude_out_of_range_is_rejected(value: float) -> None:
    with pytest.raises(InvalidInputError, match="between -180 and 180"):
        validate_longitude(value)


@pytest.mark.parametrize("value", NOT_A_NUMBER_AT_ALL)
def test_longitude_wrong_type_is_rejected(value: object) -> None:
    with pytest.raises(InvalidInputError, match="must be a number"):
        validate_longitude(value)


@pytest.mark.parametrize("value", NOT_FINITE)
def test_longitude_not_finite_is_rejected(value: object) -> None:
    with pytest.raises(InvalidInputError, match="finite number"):
        validate_longitude(value)


def test_latitude_limit_does_not_apply_to_longitude() -> None:
    # 100 degrees is a valid longitude but an invalid latitude.
    assert validate_longitude(100) == 100.0
    with pytest.raises(InvalidInputError):
        validate_latitude(100)


# --- NumPy numbers (the data pipeline will pass these later) ----------------


def test_numpy_numbers_are_accepted_and_converted() -> None:
    latitude = validate_latitude(np.float64(28.6))
    assert latitude == 28.6
    assert type(latitude) is float
    assert validate_latitude(np.int64(10)) == 10.0
    hour = validate_hour(np.int64(8))
    assert hour == 8
    assert type(hour) is int


def test_numpy_bool_and_nan_are_rejected() -> None:
    with pytest.raises(InvalidInputError):
        validate_latitude(np.True_)
    with pytest.raises(InvalidInputError):
        validate_latitude(np.float64("nan"))
    with pytest.raises(InvalidInputError):
        validate_hour(np.True_)


# --- Hour -------------------------------------------------------------------


@pytest.mark.parametrize("value", [0, 1, 8, 12, 23])
def test_valid_hours_are_accepted(value: int) -> None:
    result = validate_hour(value)
    assert result == value
    assert type(result) is int


@pytest.mark.parametrize("value", [-1, 24, 100, -100, 10**400])
def test_hour_out_of_range_is_rejected(value: int) -> None:
    with pytest.raises(InvalidInputError, match="between 0 and 23"):
        validate_hour(value)


@pytest.mark.parametrize(
    "value",
    [7.5, 8.0, 0.0, "8", "", None, True, False, [8], math.nan, math.inf, -math.inf],
)
def test_hour_wrong_type_is_rejected(value: object) -> None:
    with pytest.raises(InvalidInputError, match="whole number"):
        validate_hour(value)


# --- Ambulance type ---------------------------------------------------------


@pytest.mark.parametrize("name", DEFAULT_CONFIG.allowed_ambulance_types)
def test_each_configured_ambulance_type_is_accepted(name: str) -> None:
    assert validate_ambulance_type(name) == name


@pytest.mark.parametrize(
    "value",
    ["", " ", "XYZ", "BLS ", " BLS", "bls", "Bls", None, 5, 1.5, True, ["BLS"], b"BLS", {"BLS"}],
)
def test_unsupported_ambulance_type_is_rejected(value: object) -> None:
    with pytest.raises(InvalidInputError, match="ambulanceType must be one of"):
        validate_ambulance_type(value)


def test_ambulance_type_check_follows_the_given_config() -> None:
    config = EtaConfig(
        speeds_kmh={"X": SpeedProfile(peak_kmh=20.0, off_peak_kmh=30.0)},
        peak_hours={8},
    )
    assert validate_ambulance_type("X", config=config) == "X"
    with pytest.raises(InvalidInputError):
        validate_ambulance_type("BLS", config=config)


# --- Error behaviour --------------------------------------------------------


def test_invalid_input_error_is_a_value_error() -> None:
    assert issubclass(InvalidInputError, ValueError)


def test_error_message_uses_the_given_field_name() -> None:
    with pytest.raises(InvalidInputError, match="fromLat must be between -90 and 90"):
        validate_latitude(200, field_name="fromLat")
    with pytest.raises(InvalidInputError, match="toLng must be a number"):
        validate_longitude(None, field_name="toLng")
    with pytest.raises(InvalidInputError, match="myHour must be between 0 and 23"):
        validate_hour(25, field_name="myHour")


def test_error_message_does_not_repeat_the_submitted_value() -> None:
    secret = "secret-value-123"
    with pytest.raises(InvalidInputError) as type_error:
        validate_ambulance_type(secret)
    assert secret not in str(type_error.value)
    with pytest.raises(InvalidInputError) as number_error:
        validate_latitude(secret)
    assert secret not in str(number_error.value)
    with pytest.raises(InvalidInputError) as range_error:
        validate_latitude(98765.4321)
    assert "98765" not in str(range_error.value)