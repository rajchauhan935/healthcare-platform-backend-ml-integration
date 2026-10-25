"""Request and response shapes for ``POST /eta`` (Phase 5).

The request fields are deliberately typed ``Any``. If they were typed ``float`` or
``int``, pydantic would quietly accept ``"8"``, ``8.0``, ``true`` or a numeric string
and convert it. Our contract is strict (``hour`` must be a real integer, latitudes
must be real numbers), so pydantic only checks that each field is PRESENT, and the
Phase 1 validators in ``ml/eta/validation.py`` check the type and range.

Extra fields in the request are ignored (pydantic's default).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

REQUEST_FIELDS = ("fromLat", "fromLng", "toLat", "toLng", "hour", "ambulanceType")


class EtaRequest(BaseModel):
    """The request body. All six fields are required."""

    model_config = ConfigDict(extra="ignore")

    fromLat: Any = Field(description="Start latitude, number from -90 to 90.", examples=[28.6139])
    fromLng: Any = Field(description="Start longitude, number from -180 to 180.", examples=[77.209])
    toLat: Any = Field(description="End latitude, number from -90 to 90.", examples=[28.5355])
    toLng: Any = Field(description="End longitude, number from -180 to 180.", examples=[77.391])
    hour: Any = Field(description="Hour of day, whole number from 0 to 23.", examples=[14])
    ambulanceType: Any = Field(description='Ambulance type. Only "BLS" is supported.', examples=["BLS"])


class EtaResponse(BaseModel):
    """The successful response. Both numbers are rounded to 2 decimals."""

    etaMinutes: float = Field(description="Estimated travel time in minutes (an estimate, not a guarantee).")
    distanceKm: float = Field(description="Straight-line (Haversine) distance in kilometres.")


class HealthResponse(BaseModel):
    status: str
    modelLoaded: bool