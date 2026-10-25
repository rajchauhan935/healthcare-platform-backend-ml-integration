"""Tests for api/main.py (Phase 5, ticket AI-06: POST /eta with baseline fallback).

These use FastAPI's TestClient (needs ``httpx``), the REAL saved model and real
request/response handling, with no mocks of our own code. Failures are created by
really breaking a copy of the model folder, or by swapping in a tiny stand-in model
that raises on purpose.
"""

from __future__ import annotations

import json
import shutil
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import SOURCE_HEADER, create_app
from ml.eta.estimator import EtaEstimator
from ml.eta.eta import predict_eta
from ml.eta.model import MODEL_DIR, LoadedModel, load_model, predict_eta_with_model

# A normal trip, about 19.8 km, inside the trained distance range, off-peak hour.
PAYLOAD = {
    "fromLat": 28.6139,
    "fromLng": 77.2090,
    "toLat": 28.5355,
    "toLng": 77.3910,
    "hour": 14,
    "ambulanceType": "BLS",
}
FIELDS = list(PAYLOAD)


def _payload(**changes: object) -> dict:
    return {**PAYLOAD, **changes}


def _args(payload: dict) -> tuple:
    return tuple(payload[name] for name in FIELDS)


@pytest.fixture()
def client() -> Iterator[TestClient]:
    # ``with`` runs the app startup, which loads the model.
    with TestClient(create_app(MODEL_DIR)) as test_client:
        yield test_client


class _RaisingModel:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def predict(self, features: object) -> np.ndarray:
        raise self.error


class _FixedModel:
    def __init__(self, value: float) -> None:
        self.value = value

    def predict(self, features: object) -> np.ndarray:
        return np.array([self.value])


def _estimator_with(model: object) -> EtaEstimator:
    loaded = LoadedModel(
        estimator=model,  # type: ignore[arg-type]
        metadata={"trainingDistanceKm": {"min": 0.5, "max": 22.0}},
    )
    return EtaEstimator(loaded)


# --- Happy path -----------------------------------------------------------------------
def test_valid_request_returns_200_with_the_two_contract_fields(client: TestClient) -> None:
    response = client.post("/eta", json=PAYLOAD)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"etaMinutes", "distanceKm"}
    assert isinstance(body["etaMinutes"], float)
    assert body["distanceKm"] == 19.8
    assert body["etaMinutes"] > 0
    assert response.headers["content-type"].startswith("application/json")


def test_normal_request_is_answered_by_the_model(client: TestClient) -> None:
    response = client.post("/eta", json=PAYLOAD)
    assert response.headers[SOURCE_HEADER] == "model"
    expected = predict_eta_with_model(load_model(MODEL_DIR), *_args(PAYLOAD))
    assert response.json() == expected


def test_numbers_have_at_most_two_decimals(client: TestClient) -> None:
    body = client.post("/eta", json=PAYLOAD).json()
    for name in ("etaMinutes", "distanceKm"):
        assert round(body[name], 2) == body[name]


def test_same_request_gives_the_same_answer(client: TestClient) -> None:
    first = client.post("/eta", json=PAYLOAD)
    second = client.post("/eta", json=PAYLOAD)
    assert first.json() == second.json()


def test_extra_fields_are_ignored(client: TestClient) -> None:
    plain = client.post("/eta", json=PAYLOAD)
    extra = client.post("/eta", json=_payload(patientName="x", priority=3))
    assert extra.status_code == 200
    assert extra.json() == plain.json()
    assert "patientName" not in extra.text


def test_whole_number_coordinates_are_accepted(client: TestClient) -> None:
    # JSON has no int/float split for coordinates: 28 is a valid number.
    response = client.post("/eta", json=_payload(fromLat=28, fromLng=77, toLat=29, toLng=78))
    assert response.status_code == 200


# --- Fallback to the baseline ----------------------------------------------------------
def test_identical_points_return_zero_from_the_baseline(client: TestClient) -> None:
    response = client.post("/eta", json=_payload(toLat=28.6139, toLng=77.2090))
    assert response.status_code == 200
    assert response.json() == {"etaMinutes": 0.0, "distanceKm": 0.0}
    assert response.headers[SOURCE_HEADER] == "baseline"


@pytest.mark.parametrize(
    "changes",
    [
        {"toLat": 28.6148, "toLng": 77.2090},  # about 0.1 km: shorter than training data
        {"toLat": 28.9000, "toLng": 77.6000},  # about 50 km: longer than training data
    ],
)
def test_distance_outside_the_trained_range_uses_the_baseline(
    client: TestClient, changes: dict
) -> None:
    payload = _payload(**changes)
    response = client.post("/eta", json=payload)
    assert response.status_code == 200
    assert response.headers[SOURCE_HEADER] == "baseline"
    assert response.json() == predict_eta(*_args(payload))


def test_missing_model_files_serve_the_baseline(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "no_models_here")) as test_client:
        response = test_client.post("/eta", json=PAYLOAD)
        assert response.status_code == 200
        assert response.headers[SOURCE_HEADER] == "baseline"
        assert response.json() == predict_eta(*_args(PAYLOAD))
        assert test_client.get("/health").json() == {"status": "ok", "modelLoaded": False}


def test_damaged_model_file_serves_the_baseline(tmp_path: Path) -> None:
    model_dir = tmp_path / "models"
    shutil.copytree(MODEL_DIR, model_dir)
    joblib_file = next(model_dir.glob("*.joblib"))
    joblib_file.write_bytes(joblib_file.read_bytes()[:-50] + b"damaged-on-purpose")
    with TestClient(create_app(model_dir)) as test_client:
        response = test_client.post("/eta", json=PAYLOAD)
        assert response.status_code == 200
        assert response.headers[SOURCE_HEADER] == "baseline"


@pytest.mark.parametrize(
    "model",
    [_RaisingModel(ValueError("boom")), _FixedModel(-3.0), _FixedModel(float("nan"))],
)
def test_model_failing_during_a_request_serves_the_baseline(client: TestClient, model: object) -> None:
    client.app.state.estimator = _estimator_with(model)
    response = client.post("/eta", json=PAYLOAD)
    assert response.status_code == 200
    assert response.headers[SOURCE_HEADER] == "baseline"
    assert response.json() == predict_eta(*_args(PAYLOAD))


def test_an_unexpected_bug_gives_500_without_leaking_details() -> None:
    app = create_app(MODEL_DIR)
    # raise_server_exceptions=False: behave like a real server and return the 500.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        app.state.estimator = _estimator_with(_RaisingModel(RuntimeError("secret-internal-detail")))
        response = test_client.post("/eta", json=PAYLOAD)
    assert response.status_code == 500
    assert "secret-internal-detail" not in response.text
    assert "28.6139" not in response.text


# --- Validation: 422 ------------------------------------------------------------------------
@pytest.mark.parametrize("missing", FIELDS)
def test_each_missing_field_gives_422_naming_that_field(client: TestClient, missing: str) -> None:
    payload = {name: value for name, value in PAYLOAD.items() if name != missing}
    response = client.post("/eta", json=payload)
    assert response.status_code == 422
    assert any(missing in item["loc"] for item in response.json()["detail"])


BAD_VALUES = [
    ("fromLat", None),
    ("fromLat", "28.6"),
    ("fromLat", True),
    ("fromLat", 90.5),
    ("fromLat", -91),
    ("fromLat", [28.6]),
    ("fromLng", 181),
    ("fromLng", "abc"),
    ("toLat", 91),
    ("toLat", {"a": 1}),
    ("toLng", -181),
    ("toLng", False),
    ("hour", 8.0),
    ("hour", 8.5),
    ("hour", "8"),
    ("hour", True),
    ("hour", None),
    ("hour", -1),
    ("hour", 24),
    ("ambulanceType", "bls"),
    ("ambulanceType", "ALS"),
    ("ambulanceType", " BLS"),
    ("ambulanceType", 1),
    ("ambulanceType", None),
    pytest.param("fromLat", 10**400, id="fromLat-huge-whole-number"),
]


@pytest.mark.parametrize(("field", "value"), BAD_VALUES)
def test_bad_values_give_422_naming_the_field(client: TestClient, field: str, value: object) -> None:
    response = client.post("/eta", json=_payload(**{field: value}))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail and all(set(item) == {"loc", "msg", "type"} for item in detail)
    assert any(field in item["loc"] for item in detail)


def test_422_never_echoes_the_submitted_values(client: TestClient) -> None:
    marker_values = {
        "fromLat": "SECRET-LAT-111",
        "hour": "SECRET-HOUR-222",
        "ambulanceType": "SECRET-TYPE-333",
    }
    for field, marker in marker_values.items():
        response = client.post("/eta", json=_payload(**{field: marker}))
        assert response.status_code == 422
        assert marker not in response.text
        assert '"input"' not in response.text
        assert '"ctx"' not in response.text


def test_missing_field_422_has_no_input_key(client: TestClient) -> None:
    payload = {name: value for name, value in PAYLOAD.items() if name != "hour"}
    response = client.post("/eta", json=payload)
    for item in response.json()["detail"]:
        assert "input" not in item


def test_first_error_follows_the_contract_order(client: TestClient) -> None:
    # Both fromLat and hour are bad: the first field in contract order is reported.
    response = client.post("/eta", json=_payload(fromLat=999, hour=99))
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "fromLat"]


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_nan_and_infinity_are_rejected(client: TestClient, literal: str) -> None:
    body = (
        '{"fromLat": %s, "fromLng": 77.2, "toLat": 28.5, "toLng": 77.3, '
        '"hour": 14, "ambulanceType": "BLS"}' % literal
    )
    response = client.post("/eta", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"not json at all SECRET-RAW-444",
        b'{"fromLat": 28.6, ',
        b"[]",
        b'"just a string SECRET-RAW-444"',
        b"123",
        b"null",
    ],
)
def test_broken_or_wrong_shaped_bodies_give_422_without_echo(client: TestClient, raw: bytes) -> None:
    response = client.post("/eta", content=raw, headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert "SECRET-RAW-444" not in response.text
    assert '"input"' not in response.text


# --- Other endpoints and routes ------------------------------------------------------------------
def test_health_reports_the_model_is_loaded(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "modelLoaded": True}


def test_get_on_eta_is_not_allowed(client: TestClient) -> None:
    assert client.get("/eta").status_code == 405


def test_unknown_path_gives_404(client: TestClient) -> None:
    assert client.get("/nope").status_code == 404


def test_openapi_page_lists_the_eta_route(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/eta" in response.json()["paths"]


def test_a_committed_model_metadata_file_matches_the_served_range() -> None:
    # The fallback relies on this range, so make sure the saved file really has it.
    metadata = json.loads(next(MODEL_DIR.glob("*.json")).read_text(encoding="utf-8"))
    assert 0 < metadata["trainingDistanceKm"]["min"] < metadata["trainingDistanceKm"]["max"]