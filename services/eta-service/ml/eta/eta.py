"""Baseline ETA estimator: Haversine distance divided by an average speed.

IMPORTANT: the values returned here are ESTIMATES, NOT guaranteed arrival times.
They use straight-line distance and assumed average speeds (see ``config.py``),
not live traffic, real roads, weather or vehicle availability. They have not
been validated against real-world data and must not be used for real emergency
dispatch decisions.

How it works, in one example: two points 20 km apart, off-peak, at 40 km/h.
20 km / 40 km/h = 0.5 hours = 30 minutes.
"""

from __future__ import annotations

import math
from typing import TypedDict

from ml.eta.config import DEFAULT_CONFIG, EtaConfig
from ml.eta.validation import (
    validate_ambulance_type,
    validate_hour,
    validate_latitude,
    validate_longitude,
)

__all__ = [
    "EARTH_RADIUS_KM",
    "OUTPUT_DECIMALS",
    "EtaResult",
    "haversine_distance_km",
    "predict_eta",
]

# Mean Earth radius in kilometres. Haversine treats the Earth as a perfect
# sphere, so results can differ from true surface distance by up to ~0.5%.
EARTH_RADIUS_KM: float = 6371.0088

# Decimals in the returned values. CONFIRMED by the mentor (2 decimals).
OUTPUT_DECIMALS: int = 2

_MINUTES_PER_HOUR: float = 60.0


class EtaResult(TypedDict):
    """The result of ``predict_eta``. Key names are the agreed API contract."""

    etaMinutes: float
    distanceKm: float


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance for coordinates that are ALREADY validated (degrees)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    # Defensive guard: floating-point error can push ``a`` a hair above 1.0
    # (we saw 1.0000000000000002) for points on opposite sides of the Earth.
    # math.asin accepts only -1..1, so clamp ``a`` into 0..1. In a 3-million-
    # sample search this clamp never changed a result, so it is insurance only.
    a = min(1.0, max(0.0, a))
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def haversine_distance_km(
    fromLat: float, fromLng: float, toLat: float, toLng: float
) -> float:
    """Straight-line (great-circle) distance in kilometres between two points.

    The inputs are validated first, so invalid coordinates raise
    ``InvalidInputError``. The result is NOT rounded. Identical points return 0.0.
    """
    lat1 = validate_latitude(fromLat, "fromLat")
    lng1 = validate_longitude(fromLng, "fromLng")
    lat2 = validate_latitude(toLat, "toLat")
    lng2 = validate_longitude(toLng, "toLng")
    return _haversine_km(lat1, lng1, lat2, lng2)


def predict_eta(
    fromLat: float,
    fromLng: float,
    toLat: float,
    toLng: float,
    hour: int,
    ambulanceType: str,
    *,
    config: EtaConfig = DEFAULT_CONFIG,
) -> EtaResult:
    """Estimate travel time and distance between two points (baseline formula).

    This is an ESTIMATE, not a guaranteed arrival time (see the module docstring).

    Args:
        fromLat, fromLng: Start point in degrees (-90..90, -180..180).
        toLat, toLng: End point in degrees.
        hour: Hour of day as a whole integer, 0-23.
        ambulanceType: Exact, case-sensitive type name, for example ``"BLS"``.
        config: Speed table and peak hours. Defaults to ``DEFAULT_CONFIG``.

    Returns:
        ``{"etaMinutes": float, "distanceKm": float}``, both non-negative and
        rounded to 2 decimals. Identical start and end points are valid and give
        0.0 for both (CONFIRMED with mentor). The ETA is computed from the
        unrounded distance, so do not recompute it from the rounded distanceKm.

    Raises:
        InvalidInputError: If any argument is missing, the wrong type, out of
            range, NaN, infinite, or not a supported ambulance type.
    """
    # Validate in the order of the contract fields; the first bad one is reported.
    lat1 = validate_latitude(fromLat, "fromLat")
    lng1 = validate_longitude(fromLng, "fromLng")
    lat2 = validate_latitude(toLat, "toLat")
    lng2 = validate_longitude(toLng, "toLng")
    valid_hour = validate_hour(hour, "hour")
    valid_type = validate_ambulance_type(ambulanceType, config, "ambulanceType")

    distance_km = _haversine_km(lat1, lng1, lat2, lng2)

    profile = config.speeds_kmh[valid_type]
    speed_kmh = profile.peak_kmh if config.is_peak_hour(valid_hour) else profile.off_peak_kmh

    eta_minutes = distance_km / speed_kmh * _MINUTES_PER_HOUR

    return {
        "etaMinutes": round(eta_minutes, OUTPUT_DECIMALS),
        "distanceKm": round(distance_km, OUTPUT_DECIMALS),
    }