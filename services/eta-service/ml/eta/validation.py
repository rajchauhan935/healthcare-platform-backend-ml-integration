"""Strict input validation for the ETA estimator.

Each function checks one value and either returns it in a clean form or raises
``InvalidInputError``. Nothing is silently converted: ``"8"`` is not turned into
``8``, ``"als"`` is not turned into ``"ALS"``, and ``95`` is not clamped to
``90``. Error messages name the field and the rule but never repeat the value
that was sent, so they are safe to show to API callers.
"""

from __future__ import annotations

import math
from numbers import Integral, Real

from ml.eta.config import (
    DEFAULT_CONFIG,
    MAX_HOUR,
    MAX_LATITUDE,
    MAX_LONGITUDE,
    MIN_HOUR,
    MIN_LATITUDE,
    MIN_LONGITUDE,
    EtaConfig,
)

__all__ = [
    "InvalidInputError",
    "validate_ambulance_type",
    "validate_hour",
    "validate_latitude",
    "validate_longitude",
]


class InvalidInputError(ValueError):
    """Raised when a request value is missing, the wrong type, out of range or not finite."""


def _validate_number_in_range(
    value: object, field_name: str, minimum: float, maximum: float
) -> float:
    """Return ``value`` as a float after checking type, finiteness and range."""
    # bool is a subclass of int in Python, so True would otherwise pass as 1.
    if isinstance(value, bool) or not isinstance(value, Real):
        raise InvalidInputError(f"{field_name} must be a number.")
    try:
        number = float(value)
    except OverflowError as error:  # for example an integer with 400 digits
        raise InvalidInputError(f"{field_name} must be a finite number.") from error
    if not math.isfinite(number):  # rejects NaN, inf and -inf
        raise InvalidInputError(f"{field_name} must be a finite number.")
    if not minimum <= number <= maximum:
        raise InvalidInputError(f"{field_name} must be between {minimum:g} and {maximum:g}.")
    return number


def validate_latitude(value: object, field_name: str = "latitude") -> float:
    """Validate a latitude in degrees (-90 to 90, inclusive) and return it as a float."""
    return _validate_number_in_range(value, field_name, MIN_LATITUDE, MAX_LATITUDE)


def validate_longitude(value: object, field_name: str = "longitude") -> float:
    """Validate a longitude in degrees (-180 to 180, inclusive) and return it as a float."""
    return _validate_number_in_range(value, field_name, MIN_LONGITUDE, MAX_LONGITUDE)


def validate_hour(value: object, field_name: str = "hour") -> int:
    """Validate an hour of the day: a whole number from 0 to 23. Returns an int.

    Floats such as ``8.0`` are rejected on purpose. The mentor confirmed that
    ``hour`` is an integer (still worth mentioning to Naga for the Node side).
    """
    if isinstance(value, bool) or not isinstance(value, Integral):
        raise InvalidInputError(f"{field_name} must be a whole number (integer).")
    hour = int(value)
    if not MIN_HOUR <= hour <= MAX_HOUR:
        raise InvalidInputError(f"{field_name} must be between {MIN_HOUR} and {MAX_HOUR}.")
    return hour


def validate_ambulance_type(
    value: object,
    config: EtaConfig = DEFAULT_CONFIG,
    field_name: str = "ambulanceType",
) -> str:
    """Validate that ``value`` is exactly one of the configured ambulance types.

    The match is case-sensitive and exact, so ``"bls"`` is rejected when the
    configured name is ``"BLS"``. The mentor confirmed that only ``"BLS"`` is
    supported for now (casing is still worth confirming with Naga).
    """
    # Check the type first: an unhashable value such as a list would otherwise
    # crash the dictionary lookup below.
    if not isinstance(value, str) or value not in config.speeds_kmh:
        allowed = ", ".join(config.allowed_ambulance_types)
        raise InvalidInputError(f"{field_name} must be one of: {allowed}.")
    return value