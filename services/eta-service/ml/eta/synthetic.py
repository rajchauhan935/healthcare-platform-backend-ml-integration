"""Synthetic ambulance-trip generator for the baseline evaluation (ticket AI-05).

EVERYTHING IN THIS FILE PRODUCES FAKE DATA. No real trips, patients, addresses or
traffic measurements are used. Results computed on this data say nothing about
real-world accuracy and must never be described as validated traffic predictions.

How one trip is made (all numbers below are invented assumptions):
  1. A start point is drawn inside a fake rectangular area and an end point a
     short random distance away.
  2. An hour (0-23) and a day of the week (0 = Monday) are drawn at random.
  3. Traffic level (low / medium / high) is drawn at random, with probabilities
     that depend on the hour and the day (busy weekday rush hours, quiet nights).
  4. A road type (local / arterial / highway) is drawn at random.
  5. The "true" travel time is: straight-line distance x a detour factor, divided
     by a road-and-traffic speed, plus a fixed start-up time, times random noise.

The baseline in ``eta.py`` knows none of the detour, road type, traffic level or
start-up time, which is why it is not simply "the answer plus noise".

Run it:  python -m ml.eta.synthetic
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pandas as pd

from ml.eta.config import (
    DEFAULT_CONFIG,
    MAX_HOUR,
    MAX_LATITUDE,
    MAX_LONGITUDE,
    MIN_HOUR,
    MIN_LATITUDE,
    MIN_LONGITUDE,
)
from ml.eta.eta import haversine_distance_km

__all__ = [
    "DEFAULT_N_TRIPS",
    "DEFAULT_OUTPUT_PATH",
    "DEFAULT_SEED",
    "DATA_SOURCE_LABEL",
    "DatasetError",
    "ROAD_TYPES",
    "TRAFFIC_LEVELS",
    "TRIP_COLUMNS",
    "generate_synthetic_trips",
    "load_trips_csv",
    "noiseless_travel_minutes",
    "save_trips_csv",
    "validate_trips_dataframe",
]

# --- Where files live (relative to the project, never an absolute path) ------
PROJECT_ROOT: Path = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_PATH: Path = PROJECT_ROOT / "data" / "synthetic_trips.csv"

# --- Dataset size and reproducibility ----------------------------------------
DEFAULT_N_TRIPS: int = 1000  # the PDF asks for at least 500
DEFAULT_SEED: int = 42  # same seed -> same table (on the same NumPy version)
MAX_N_TRIPS: int = 1_000_000  # safety limit against typing mistakes

DATA_SOURCE_LABEL: str = "synthetic"

# --- Column names. Fields shared with the API use the API contract names. ----
TRIP_COLUMNS: tuple[str, ...] = (
    "tripId",
    "dataSource",
    "fromLat",
    "fromLng",
    "toLat",
    "toLng",
    "distanceKm",
    "hour",
    "dayOfWeek",
    "ambulanceType",
    "trafficLevel",
    "roadType",
    "travelTimeMinutes",
)
_INTEGER_COLUMNS: tuple[str, ...] = ("tripId", "hour", "dayOfWeek")
_NUMERIC_COLUMNS: tuple[str, ...] = (
    "tripId",
    "fromLat",
    "fromLng",
    "toLat",
    "toLng",
    "distanceKm",
    "hour",
    "dayOfWeek",
    "travelTimeMinutes",
)

TRAFFIC_LEVELS: tuple[str, ...] = ("low", "medium", "high")
ROAD_TYPES: tuple[str, ...] = ("local", "arterial", "highway")

# --- Fake geography: an arbitrary rectangle, roughly the size of a large city.
# These are NOT real incident locations.
BOX_MIN_LAT: float = 28.40
BOX_MAX_LAT: float = 28.88
BOX_MIN_LNG: float = 76.84
BOX_MAX_LNG: float = 77.35
MAX_OFFSET_DEGREES: float = 0.15  # end point is at most this far from the start
MIN_TRIP_KM: float = 0.5  # shorter trips are re-drawn
COORDINATE_DECIMALS: int = 6
DISTANCE_DECIMALS: int = 3
TIME_DECIMALS: int = 2

# --- Traffic model (INVENTED). Probabilities are (low, medium, high). --------
# The synthetic world uses the same rush hours as the baseline's peak hours, as a
# deliberate simplification. It has its own copy so that editing config.py can
# never silently change an already-generated dataset.
RUSH_HOURS: frozenset[int] = frozenset({8, 9, 10, 17, 18, 19, 20})
NIGHT_HOURS: frozenset[int] = frozenset({0, 1, 2, 3, 4, 5})
WEEKEND_DAYS: frozenset[int] = frozenset({5, 6})  # Saturday, Sunday

TRAFFIC_PROBABILITIES: dict[str, tuple[float, float, float]] = {
    "night": (0.90, 0.09, 0.01),
    "weekday_rush": (0.10, 0.30, 0.60),
    "weekday_other": (0.45, 0.45, 0.10),
    "weekend_rush": (0.40, 0.40, 0.20),
    "weekend_other": (0.65, 0.30, 0.05),
}

# Probability of each road type, in the order of ROAD_TYPES (independent of distance).
ROAD_TYPE_PROBABILITIES: tuple[float, float, float] = (0.35, 0.45, 0.20)

# --- Travel-time model (INVENTED) --------------------------------------------
DETOUR_FACTOR: dict[str, float] = {"local": 1.40, "arterial": 1.25, "highway": 1.15}
BASE_SPEED_KMH: dict[str, float] = {"local": 30.0, "arterial": 45.0, "highway": 65.0}
TRAFFIC_SPEED_FACTOR: dict[str, float] = {"low": 1.0, "medium": 0.8, "high": 0.55}
START_UP_MINUTES: float = 1.0  # fixed time before the ambulance is moving
NOISE_SIGMA: float = 0.12  # log-normal noise: typical spread of about +/- 12%

_MAX_SAMPLING_ROUNDS: int = 100


class DatasetError(ValueError):
    """Raised when a trips table or file is missing, empty or not valid."""


def _check_whole_number(value: object, name: str, minimum: int, maximum: int) -> int:
    """Return ``value`` if it is a whole number (not a bool) within the limits."""
    if isinstance(value, bool) or not isinstance(value, (int, np.integer)):
        raise ValueError(f"{name} must be a whole number.")
    number = int(value)
    if not minimum <= number <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return number


def noiseless_travel_minutes(distance_km: float, road_type: str, traffic_level: str) -> float:
    """Travel time in minutes WITHOUT random noise, from the invented model above.

    Example: 10 km straight line, arterial road, medium traffic ->
    10 x 1.25 = 12.5 km of road at 45 x 0.8 = 36 km/h = 20.83 min, plus 1 min
    start-up = 21.83 min.
    """
    road_km = distance_km * DETOUR_FACTOR[road_type]
    speed_kmh = BASE_SPEED_KMH[road_type] * TRAFFIC_SPEED_FACTOR[traffic_level]
    return road_km / speed_kmh * 60.0 + START_UP_MINUTES


def _draw_trip_points(rng: np.random.Generator, n_trips: int) -> tuple[np.ndarray, np.ndarray]:
    """Draw ``n_trips`` valid start/end points; return (points, distances_km).

    ``points`` has columns fromLat, fromLng, toLat, toLng. Candidates whose end
    point falls outside the fake area, or that are shorter than MIN_TRIP_KM, are
    discarded and drawn again.
    """
    kept_points: list[np.ndarray] = []
    kept_distances: list[np.ndarray] = []
    total = 0
    for _ in range(_MAX_SAMPLING_ROUNDS):
        if total >= n_trips:
            break
        batch = max(2 * (n_trips - total), 64)
        from_lat = rng.uniform(BOX_MIN_LAT, BOX_MAX_LAT, batch)
        from_lng = rng.uniform(BOX_MIN_LNG, BOX_MAX_LNG, batch)
        to_lat = from_lat + rng.uniform(-MAX_OFFSET_DEGREES, MAX_OFFSET_DEGREES, batch)
        to_lng = from_lng + rng.uniform(-MAX_OFFSET_DEGREES, MAX_OFFSET_DEGREES, batch)
        points = np.round(
            np.column_stack([from_lat, from_lng, to_lat, to_lng]), COORDINATE_DECIMALS
        )
        inside = (
            (points[:, 2] >= BOX_MIN_LAT)
            & (points[:, 2] <= BOX_MAX_LAT)
            & (points[:, 3] >= BOX_MIN_LNG)
            & (points[:, 3] <= BOX_MAX_LNG)
        )
        points = points[inside]
        distances = np.array([haversine_distance_km(*row) for row in points], dtype=float)
        long_enough = distances >= MIN_TRIP_KM
        kept_points.append(points[long_enough])
        kept_distances.append(distances[long_enough])
        total += int(long_enough.sum())
    if total < n_trips:  # pragma: no cover - practically impossible
        raise RuntimeError("Could not draw enough valid trips; check the box settings.")
    return np.vstack(kept_points)[:n_trips], np.concatenate(kept_distances)[:n_trips]


def _traffic_scenario(hour: int, day_of_week: int) -> str:
    """Name the row of TRAFFIC_PROBABILITIES that applies to this hour and day."""
    if hour in NIGHT_HOURS:
        return "night"
    weekend = day_of_week in WEEKEND_DAYS
    rush = hour in RUSH_HOURS
    if weekend:
        return "weekend_rush" if rush else "weekend_other"
    return "weekday_rush" if rush else "weekday_other"


def _draw_categories(
    rng: np.random.Generator, probabilities: np.ndarray, labels: Sequence[str]
) -> np.ndarray:
    """For each row of ``probabilities`` (n x k), draw one of the k labels."""
    cumulative = np.cumsum(probabilities, axis=1)
    draws = rng.random(len(probabilities))
    index = (draws[:, None] >= cumulative).sum(axis=1)
    index = np.minimum(index, len(labels) - 1)  # guards a tiny float edge case
    return np.asarray(labels, dtype=object)[index]


def generate_synthetic_trips(
    n_trips: int = DEFAULT_N_TRIPS, seed: int = DEFAULT_SEED
) -> pd.DataFrame:
    """Generate ``n_trips`` FAKE ambulance trips, reproducibly from ``seed``.

    Returns a DataFrame with the columns in ``TRIP_COLUMNS``. The same inputs give
    the same table when run with the same NumPy version.
    """
    n_trips = _check_whole_number(n_trips, "n_trips", 1, MAX_N_TRIPS)
    seed = _check_whole_number(seed, "seed", 0, 2**32 - 1)
    rng = np.random.default_rng(seed)

    points, distances_km = _draw_trip_points(rng, n_trips)
    hours = rng.integers(MIN_HOUR, MAX_HOUR + 1, size=n_trips)
    days = rng.integers(0, 7, size=n_trips)

    scenario_rows = np.array(
        [TRAFFIC_PROBABILITIES[_traffic_scenario(int(h), int(d))] for h, d in zip(hours, days)]
    )
    traffic_levels = _draw_categories(rng, scenario_rows, TRAFFIC_LEVELS)
    road_rows = np.tile(np.array(ROAD_TYPE_PROBABILITIES), (n_trips, 1))
    road_types = _draw_categories(rng, road_rows, ROAD_TYPES)

    noiseless = np.array(
        [
            noiseless_travel_minutes(float(d), str(r), str(t))
            for d, r, t in zip(distances_km, road_types, traffic_levels)
        ]
    )
    noise = rng.lognormal(mean=0.0, sigma=NOISE_SIGMA, size=n_trips)
    travel_minutes = noiseless * noise

    trips = pd.DataFrame(
        {
            "tripId": np.arange(1, n_trips + 1),
            "dataSource": DATA_SOURCE_LABEL,
            "fromLat": points[:, 0],
            "fromLng": points[:, 1],
            "toLat": points[:, 2],
            "toLng": points[:, 3],
            "distanceKm": np.round(distances_km, DISTANCE_DECIMALS),
            "hour": hours,
            "dayOfWeek": days,
            "ambulanceType": DEFAULT_CONFIG.allowed_ambulance_types[0],
            "trafficLevel": traffic_levels,
            "roadType": road_types,
            "travelTimeMinutes": np.round(travel_minutes, TIME_DECIMALS),
        }
    )
    return trips[list(TRIP_COLUMNS)]


def validate_trips_dataframe(trips: pd.DataFrame) -> None:
    """Raise ``DatasetError`` unless ``trips`` is a complete, valid synthetic table."""
    if not isinstance(trips, pd.DataFrame):
        raise DatasetError("The trips data must be a pandas DataFrame.")
    if trips.empty:
        raise DatasetError("The trips table is empty.")

    missing = set(TRIP_COLUMNS) - set(trips.columns)
    unexpected = set(trips.columns) - set(TRIP_COLUMNS)
    if missing or unexpected:
        raise DatasetError(
            f"Columns do not match. Missing: {sorted(missing)}. Unexpected: {sorted(unexpected)}."
        )
    if trips[list(TRIP_COLUMNS)].isna().any().any():
        raise DatasetError("The trips table has missing values.")

    for column in _NUMERIC_COLUMNS:
        series = trips[column]
        if pd.api.types.is_bool_dtype(series) or not pd.api.types.is_numeric_dtype(series):
            raise DatasetError(f"Column {column} must be numeric.")
        if not np.isfinite(series.to_numpy(dtype=float)).all():
            raise DatasetError(f"Column {column} must contain only finite numbers.")
    for column in _INTEGER_COLUMNS:
        if not pd.api.types.is_integer_dtype(trips[column]):
            raise DatasetError(f"Column {column} must contain whole numbers.")

    ranges = {
        "fromLat": (MIN_LATITUDE, MAX_LATITUDE),
        "toLat": (MIN_LATITUDE, MAX_LATITUDE),
        "fromLng": (MIN_LONGITUDE, MAX_LONGITUDE),
        "toLng": (MIN_LONGITUDE, MAX_LONGITUDE),
        "hour": (MIN_HOUR, MAX_HOUR),
        "dayOfWeek": (0, 6),
    }
    for column, (low, high) in ranges.items():
        if not trips[column].between(low, high).all():
            raise DatasetError(f"Column {column} must be between {low} and {high}.")
    if (trips["distanceKm"] < 0).any():
        raise DatasetError("Column distanceKm must not be negative.")
    if (trips["travelTimeMinutes"] <= 0).any():
        raise DatasetError("Column travelTimeMinutes must be greater than 0.")

    allowed_values = {
        "ambulanceType": DEFAULT_CONFIG.allowed_ambulance_types,
        "trafficLevel": TRAFFIC_LEVELS,
        "roadType": ROAD_TYPES,
        "dataSource": (DATA_SOURCE_LABEL,),
    }
    for column, allowed in allowed_values.items():
        if not trips[column].isin(allowed).all():
            raise DatasetError(f"Column {column} has a value that is not allowed.")
    if trips["tripId"].duplicated().any():
        raise DatasetError("Column tripId must be unique.")


def save_trips_csv(trips: pd.DataFrame, path: Path | str = DEFAULT_OUTPUT_PATH) -> Path:
    """Validate ``trips`` and write it to ``path`` as CSV. Returns the path."""
    validate_trips_dataframe(trips)
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    trips.to_csv(output_path, index=False, lineterminator="\n")
    return output_path


def load_trips_csv(path: Path | str = DEFAULT_OUTPUT_PATH) -> pd.DataFrame:
    """Read a trips CSV and validate it. Raises ``DatasetError`` if it is not usable."""
    csv_path = Path(path)
    try:
        trips = pd.read_csv(csv_path, float_precision="round_trip")
    except FileNotFoundError as error:
        raise DatasetError(
            f"Dataset file not found: {csv_path}. Run 'python -m ml.eta.synthetic' first."
        ) from error
    except pd.errors.EmptyDataError as error:
        raise DatasetError(f"Dataset file is empty: {csv_path}.") from error
    validate_trips_dataframe(trips)
    return trips


def main(argv: Sequence[str] | None = None) -> int:
    """Command line entry point: generate the dataset and save it as CSV."""
    parser = argparse.ArgumentParser(description="Generate FAKE synthetic ambulance trips.")
    parser.add_argument("--rows", type=int, default=DEFAULT_N_TRIPS, help="number of trips")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="random seed")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="CSV path")
    args = parser.parse_args(argv)

    trips = generate_synthetic_trips(n_trips=args.rows, seed=args.seed)
    written = save_trips_csv(trips, args.output)
    print(f"Wrote {len(trips)} synthetic trips to {written} (seed {args.seed}).")
    print("All data is fake. It does not represent real traffic or real trips.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())