"""Tests for ml/eta/config.py (the rulebook)."""

import dataclasses
import math

import pytest

from ml.eta.config import (
    DEFAULT_CONFIG,
    MAX_AVERAGE_SPEED_KMH,
    ConfigError,
    EtaConfig,
    SpeedProfile,
)


def make_profile() -> SpeedProfile:
    return SpeedProfile(peak_kmh=20.0, off_peak_kmh=40.0)


# --- The default configuration ---------------------------------------------


def test_default_config_is_valid_and_has_ambulance_types() -> None:
    assert len(DEFAULT_CONFIG.allowed_ambulance_types) >= 1
    for name in DEFAULT_CONFIG.allowed_ambulance_types:
        profile = DEFAULT_CONFIG.speeds_kmh[name]
        assert 0 < profile.peak_kmh <= MAX_AVERAGE_SPEED_KMH
        assert 0 < profile.off_peak_kmh <= MAX_AVERAGE_SPEED_KMH


def test_default_peak_hours_are_valid_hours() -> None:
    assert all(0 <= hour <= 23 for hour in DEFAULT_CONFIG.peak_hours)


# --- Valid custom configurations -------------------------------------------


def test_custom_config_reports_types_and_peak_hours() -> None:
    config = EtaConfig(speeds_kmh={"X": make_profile(), "Y": make_profile()}, peak_hours={7, 8})
    assert config.allowed_ambulance_types == ("X", "Y")
    assert config.is_peak_hour(7) is True
    assert config.is_peak_hour(8) is True
    assert config.is_peak_hour(9) is False
    assert config.is_peak_hour(0) is False


def test_empty_peak_hours_is_allowed() -> None:
    config = EtaConfig(speeds_kmh={"X": make_profile()}, peak_hours=set())
    assert config.is_peak_hour(8) is False


def test_speed_profile_stores_floats() -> None:
    profile = SpeedProfile(peak_kmh=20, off_peak_kmh=40)
    assert isinstance(profile.peak_kmh, float)
    assert isinstance(profile.off_peak_kmh, float)


# --- Invalid speeds ---------------------------------------------------------


@pytest.mark.parametrize(
    "bad_speed",
    [0, -1, -0.5, math.nan, math.inf, -math.inf, True, "40", None, MAX_AVERAGE_SPEED_KMH + 1, 10**400],
)
def test_invalid_peak_speed_is_rejected(bad_speed: object) -> None:
    with pytest.raises(ConfigError):
        SpeedProfile(peak_kmh=bad_speed, off_peak_kmh=40.0)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "bad_speed",
    [0, -1, math.nan, math.inf, False, "40", None, MAX_AVERAGE_SPEED_KMH + 1],
)
def test_invalid_off_peak_speed_is_rejected(bad_speed: object) -> None:
    with pytest.raises(ConfigError):
        SpeedProfile(peak_kmh=20.0, off_peak_kmh=bad_speed)  # type: ignore[arg-type]


def test_speed_at_the_ceiling_is_accepted() -> None:
    profile = SpeedProfile(peak_kmh=MAX_AVERAGE_SPEED_KMH, off_peak_kmh=0.1)
    assert profile.peak_kmh == MAX_AVERAGE_SPEED_KMH


# --- Invalid ambulance table ------------------------------------------------


@pytest.mark.parametrize(
    "bad_table",
    [
        {},
        None,
        [("X", None)],
        "X",
    ],
)
def test_invalid_speed_table_is_rejected(bad_table: object) -> None:
    with pytest.raises(ConfigError):
        EtaConfig(speeds_kmh=bad_table, peak_hours={8})  # type: ignore[arg-type]


def test_empty_ambulance_type_name_is_rejected() -> None:
    with pytest.raises(ConfigError):
        EtaConfig(speeds_kmh={"": make_profile()}, peak_hours={8})


def test_whitespace_only_ambulance_type_name_is_rejected() -> None:
    with pytest.raises(ConfigError):
        EtaConfig(speeds_kmh={"  ": make_profile()}, peak_hours={8})


def test_non_string_ambulance_type_name_is_rejected() -> None:
    with pytest.raises(ConfigError):
        EtaConfig(speeds_kmh={1: make_profile()}, peak_hours={8})  # type: ignore[dict-item]


def test_profile_that_is_not_a_speed_profile_is_rejected() -> None:
    with pytest.raises(ConfigError):
        EtaConfig(speeds_kmh={"X": (20.0, 40.0)}, peak_hours={8})  # type: ignore[dict-item]


# --- Invalid peak hours -----------------------------------------------------


@pytest.mark.parametrize(
    "bad_hours",
    [{24}, {-1}, {True}, {"8"}, {8.5}, {None}, "8", b"8", 8, None],
)
def test_invalid_peak_hours_are_rejected(bad_hours: object) -> None:
    with pytest.raises(ConfigError):
        EtaConfig(speeds_kmh={"X": make_profile()}, peak_hours=bad_hours)  # type: ignore[arg-type]


def test_peak_hour_boundaries_are_accepted() -> None:
    config = EtaConfig(speeds_kmh={"X": make_profile()}, peak_hours=[0, 23])
    assert config.is_peak_hour(0) is True
    assert config.is_peak_hour(23) is True


# --- The configuration cannot be changed by accident ------------------------


def test_config_attributes_cannot_be_reassigned() -> None:
    with pytest.raises(dataclasses.FrozenInstanceError):
        DEFAULT_CONFIG.peak_hours = frozenset()  # type: ignore[misc]


def test_speed_table_is_read_only() -> None:
    with pytest.raises(TypeError):
        DEFAULT_CONFIG.speeds_kmh["NEW"] = make_profile()  # type: ignore[index]


def test_config_is_unaffected_by_later_changes_to_the_input() -> None:
    table = {"X": make_profile()}
    hours = {8}
    config = EtaConfig(speeds_kmh=table, peak_hours=hours)
    table["Y"] = make_profile()
    hours.add(9)
    assert config.allowed_ambulance_types == ("X",)
    assert config.is_peak_hour(9) is False