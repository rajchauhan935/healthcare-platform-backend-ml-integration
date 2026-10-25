"""Model-with-fallback ETA estimator (Phase 5, ticket AI-06).

``EtaEstimator`` is the one object the API talks to. It tries the learned model
and falls back to the Phase 2 baseline when the model cannot be used. It does not
depend on FastAPI, so it can be tested on its own.

When the baseline is used instead of the model (``source == "baseline"``):

* the model file could not be loaded (a startup ERROR is logged),
* the trip distance is outside the distance range the model was trained on
  (this includes identical start and end points, distance 0),
* the model failed or returned an invalid value (``ModelPredictionError``).

What is NEVER hidden by the fallback: ``InvalidInputError`` (bad request values)
and any unrelated programming error. Those keep raising.

Logs never contain request values (no coordinates), only the reason.

This is an ESTIMATE from a model trained on fake data, not a guaranteed arrival
time, and not for real emergency dispatch.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from pathlib import Path

from ml.eta.config import DEFAULT_CONFIG, EtaConfig
from ml.eta.eta import EtaResult, haversine_distance_km, predict_eta
from ml.eta.model import (
    MODEL_DIR,
    LoadedModel,
    ModelLoadError,
    ModelPredictionError,
    load_model,
    predict_eta_with_model,
)
from ml.eta.validation import (
    validate_ambulance_type,
    validate_hour,
    validate_latitude,
    validate_longitude,
)

__all__ = [
    "SOURCE_BASELINE",
    "SOURCE_MODEL",
    "EtaEstimator",
    "EtaOutcome",
]

logger = logging.getLogger(__name__)

SOURCE_MODEL = "model"
SOURCE_BASELINE = "baseline"

REASON_MODEL_UNAVAILABLE = "model_unavailable"
REASON_OUT_OF_RANGE = "distance_outside_training_range"
REASON_MODEL_FAILED = "model_failed"


@dataclass(frozen=True)
class EtaOutcome:
    """An ETA result plus where it came from.

    ``source`` is "model" or "baseline". ``fallbackReason`` is None when the model
    was used, otherwise a short code saying why the baseline was used.
    """

    result: EtaResult
    source: str
    fallbackReason: str | None = None


def _training_range(loaded: LoadedModel) -> tuple[float, float]:
    """Read the trained distance range (km) from the model metadata, or raise ModelLoadError."""
    raw = loaded.metadata.get("trainingDistanceKm")
    try:
        low = float(raw["min"])  # type: ignore[index]
        high = float(raw["max"])  # type: ignore[index]
    except (KeyError, TypeError, ValueError) as error:
        raise ModelLoadError("Model metadata has no usable trainingDistanceKm range.") from error
    if not (math.isfinite(low) and math.isfinite(high)) or not 0.0 <= low <= high:
        raise ModelLoadError("Model metadata has an invalid trainingDistanceKm range.")
    return low, high


class EtaEstimator:
    """Estimate an ETA with the model when possible, with the baseline otherwise."""

    def __init__(self, loaded: LoadedModel | None, config: EtaConfig = DEFAULT_CONFIG) -> None:
        self._config = config
        self._loaded = loaded
        self._range: tuple[float, float] | None = None
        if loaded is not None:
            # A model with no usable distance range cannot be used safely: raise now,
            # at construction, rather than guessing.
            self._range = _training_range(loaded)

    @classmethod
    def from_model_dir(
        cls, model_dir: Path | str = MODEL_DIR, config: EtaConfig = DEFAULT_CONFIG
    ) -> EtaEstimator:
        """Load the model; if that fails, log an ERROR and return a baseline-only estimator."""
        try:
            return cls(load_model(model_dir, config), config)
        except ModelLoadError as error:
            logger.error(
                "ETA model could not be loaded; every request will use the baseline. Reason: %s",
                error,
            )
            return cls(None, config)

    @property
    def model_loaded(self) -> bool:
        return self._loaded is not None

    def estimate(
        self,
        fromLat: float,
        fromLng: float,
        toLat: float,
        toLng: float,
        hour: int,
        ambulanceType: str,
    ) -> EtaOutcome:
        """Return the ETA and its source.

        Raises:
            InvalidInputError: bad request values (never replaced by the fallback).
        """
        # Validate first, in contract order. The first error is raised, never hidden.
        lat1 = validate_latitude(fromLat, "fromLat")
        lng1 = validate_longitude(fromLng, "fromLng")
        lat2 = validate_latitude(toLat, "toLat")
        lng2 = validate_longitude(toLng, "toLng")
        valid_hour = validate_hour(hour, "hour")
        validate_ambulance_type(ambulanceType, self._config, "ambulanceType")

        def baseline(reason: str) -> EtaOutcome:
            result = predict_eta(
                lat1, lng1, lat2, lng2, valid_hour, ambulanceType, config=self._config
            )
            return EtaOutcome(result, SOURCE_BASELINE, reason)

        if self._loaded is None or self._range is None:
            return baseline(REASON_MODEL_UNAVAILABLE)

        distance_km = haversine_distance_km(lat1, lng1, lat2, lng2)
        low, high = self._range
        if not low <= distance_km <= high:
            return baseline(REASON_OUT_OF_RANGE)

        try:
            result = predict_eta_with_model(
                self._loaded,
                lat1,
                lng1,
                lat2,
                lng2,
                valid_hour,
                ambulanceType,
                config=self._config,
            )
        except ModelPredictionError as error:
            logger.warning("ETA model failed for one request; used the baseline. Reason: %s", error)
            return baseline(REASON_MODEL_FAILED)
        return EtaOutcome(result, SOURCE_MODEL, None)