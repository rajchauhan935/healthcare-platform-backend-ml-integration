"""Configuration for the baseline ETA estimator.

IMPORTANT: every speed and peak-hour value in this file is an ASSUMPTION made
for a student project. None of it is measured traffic data, and it must not be
described as validated real-world behaviour. The peak hours and speeds were
accepted by the mentor, but they are still assumptions, not measured data.

This module only holds settings and checks that the settings make sense.
It does not calculate distances or ETAs.
"""

from __future__ import annotations

import math
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from numbers import Integral, Real
from types import MappingProxyType

# --- Valid input ranges (fixed by geography and the 24-hour clock) ----------
MIN_LATITUDE: float = -90.0
MAX_LATITUDE: float = 90.0
MIN_LONGITUDE: float = -180.0
MAX_LONGITUDE: float = 180.0
MIN_HOUR: int = 0
MAX_HOUR: int = 23

# Sanity ceiling for a configured average speed. Anything above this is almost
# certainly a typing mistake (for example 400 instead of 40).
MAX_AVERAGE_SPEED_KMH: float = 200.0


class ConfigError(ValueError):
    """Raised when the ETA configuration itself is invalid.

    This is a developer mistake (bad settings), not a bad user request.
    """


def _validate_speed(label: str, value: object) -> float:
    """Return ``value`` as a float if it is a sensible average speed in km/h."""
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ConfigError(f"{label} must be a number.")
    try:
        speed = float(value)
    except OverflowError as error:
        raise ConfigError(f"{label} must be a finite number.") from error
    if not math.isfinite(speed):
        raise ConfigError(f"{label} must be a finite number.")
    if not 0.0 < speed <= MAX_AVERAGE_SPEED_KMH:
        raise ConfigError(
            f"{label} must be greater than 0 and at most "
            f"{MAX_AVERAGE_SPEED_KMH:g} km/h."
        )
    return speed


@dataclass(frozen=True)
class SpeedProfile:
    """Average speeds (km/h) for one ambulance type.

    Example: ``SpeedProfile(peak_kmh=25.0, off_peak_kmh=40.0)`` means the
    ambulance averages 25 km/h in rush hour and 40 km/h otherwise.
    """

    peak_kmh: float
    off_peak_kmh: float

    def __post_init__(self) -> None:
        # frozen=True blocks normal assignment, so object.__setattr__ is the
        # standard way to store the cleaned (float) values during creation.
        object.__setattr__(self, "peak_kmh", _validate_speed("peak_kmh", self.peak_kmh))
        object.__setattr__(
            self, "off_peak_kmh", _validate_speed("off_peak_kmh", self.off_peak_kmh)
        )


@dataclass(frozen=True)
class EtaConfig:
    """The rulebook: which ambulance types exist, their speeds, and peak hours.

    The object is immutable and validates itself when created, so an invalid
    configuration can never exist.

    Attributes:
        speeds_kmh: Maps an ambulance type name (for example ``"BLS"``) to its
            ``SpeedProfile``. Stored as a read-only copy.
        peak_hours: Hours of the day (0-23) treated as peak traffic. Any
            collection of ints is accepted; it is stored as a ``frozenset``.
    """

    speeds_kmh: Mapping[str, SpeedProfile]
    peak_hours: Collection[int]

    def __post_init__(self) -> None:
        if not isinstance(self.speeds_kmh, Mapping) or len(self.speeds_kmh) == 0:
            raise ConfigError("speeds_kmh must be a non-empty mapping.")

        checked_speeds: dict[str, SpeedProfile] = {}
        for name, profile in self.speeds_kmh.items():
            if not isinstance(name, str) or not name.strip():
                raise ConfigError("Ambulance type names must be non-empty strings.")
            if not isinstance(profile, SpeedProfile):
                raise ConfigError(f"The speed profile for '{name}' must be a SpeedProfile.")
            checked_speeds[name] = profile

        if isinstance(self.peak_hours, (str, bytes)) or not isinstance(
            self.peak_hours, Collection
        ):
            raise ConfigError("peak_hours must be a collection of whole numbers.")
        checked_hours: set[int] = set()
        for hour in self.peak_hours:
            if isinstance(hour, bool) or not isinstance(hour, Integral):
                raise ConfigError("Every peak hour must be a whole number.")
            if not MIN_HOUR <= int(hour) <= MAX_HOUR:
                raise ConfigError(f"Every peak hour must be between {MIN_HOUR} and {MAX_HOUR}.")
            checked_hours.add(int(hour))

        # Store private, read-only copies so later changes to the objects the
        # caller passed in cannot silently change this configuration.
        object.__setattr__(self, "speeds_kmh", MappingProxyType(checked_speeds))
        object.__setattr__(self, "peak_hours", frozenset(checked_hours))

    @property
    def allowed_ambulance_types(self) -> tuple[str, ...]:
        """The ambulance type names this configuration supports."""
        return tuple(self.speeds_kmh)

    def is_peak_hour(self, hour: int) -> bool:
        """Return True if ``hour`` is a peak hour. ``hour`` must already be validated."""
        return hour in self.peak_hours


# Default settings.
#  - Ambulance type: only "BLS" is supported. CONFIRMED by the mentor.
#    (Adding a type later is one new entry below; no other code changes.)
#  - Hour format (whole integer) and output rounding (2 decimals): CONFIRMED by
#    the mentor. They are applied in validation.py and eta.py, not here.
#  - Peak hours 8-10 and 17-20: accepted by the mentor.
#  - Speeds (25 km/h peak, 40 km/h off-peak): accepted by the mentor. They are
#    still illustrative averages, not measured data.
DEFAULT_CONFIG: EtaConfig = EtaConfig(
    speeds_kmh={
        "BLS": SpeedProfile(peak_kmh=25.0, off_peak_kmh=40.0),
    },
    peak_hours=frozenset({8, 9, 10, 17, 18, 19, 20}),
)