"""FastAPI app for the ETA service (Phase 5, ticket AI-06).

Run from the project folder (virtual environment active):

    uvicorn api.main:app --host 127.0.0.1 --port 8000

Endpoints:
    POST /eta     -> {"etaMinutes": ..., "distanceKm": ...}  (or 422 for bad input)
    GET  /health  -> {"status": "ok", "modelLoaded": true|false}

The learned model is used when possible; otherwise the baseline answers, and the
optional response header ``X-ETA-Source`` says which one ("model" or "baseline").

ETAs are ESTIMATES from a model trained on fake data, not guaranteed arrival times.
This service is not for real emergency dispatch.

Error bodies use the usual FastAPI shape ``{"detail": [{"loc", "msg", "type"}]}`` but
NEVER repeat the submitted values (no ``input`` field).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from api.schemas import REQUEST_FIELDS, EtaRequest, EtaResponse, HealthResponse
from ml.eta.estimator import EtaEstimator
from ml.eta.model import MODEL_DIR
from ml.eta.validation import InvalidInputError

SOURCE_HEADER = "X-ETA-Source"


def _get_estimator(request: Request) -> EtaEstimator:
    estimator = getattr(request.app.state, "estimator", None)
    if estimator is None:
        # Only possible if the app was used without its startup (lifespan) step.
        raise RuntimeError("The ETA estimator is not ready: the app startup did not run.")
    return estimator


def _clean_errors(errors: list[dict]) -> list[dict]:
    """Keep only where, what and the error type. Drops ``input``, ``ctx`` and ``url``."""
    return [
        {
            "loc": [part if isinstance(part, int) else str(part) for part in error.get("loc", ())],
            "msg": str(error.get("msg", "Invalid request.")),
            "type": str(error.get("type", "value_error")),
        }
        for error in errors
    ]


async def _validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _clean_errors(list(error.errors()))})


def _invalid_input_response(error: InvalidInputError) -> JSONResponse:
    # The message starts with the field name and never contains the submitted value.
    message = str(error)
    first_word = message.split(" ", 1)[0]
    loc = ["body", first_word] if first_word in REQUEST_FIELDS else ["body"]
    return JSONResponse(
        status_code=422,
        content={"detail": [{"loc": loc, "msg": message, "type": "value_error"}]},
    )


def create_app(model_dir: Path | str = MODEL_DIR) -> FastAPI:
    """Build the app. The model is loaded once at startup from ``model_dir``."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # If the model cannot be loaded this logs an ERROR and serves the baseline.
        app.state.estimator = EtaEstimator.from_model_dir(model_dir)
        yield

    app = FastAPI(
        title="ETA service",
        version="0.1.0",
        description=(
            "Estimated travel time for an ambulance trip (BLS only). Estimates from a model "
            "trained on FAKE data; not guaranteed arrival times; not for real dispatch."
        ),
        lifespan=lifespan,
    )
    app.add_exception_handler(RequestValidationError, _validation_error_handler)  # type: ignore[arg-type]

    @app.post("/eta", response_model=EtaResponse, responses={422: {"description": "Invalid request"}})
    def post_eta(body: EtaRequest, request: Request, response: Response) -> object:
        estimator = _get_estimator(request)
        try:
            outcome = estimator.estimate(
                body.fromLat,
                body.fromLng,
                body.toLat,
                body.toLng,
                body.hour,
                body.ambulanceType,
            )
        except InvalidInputError as error:
            return _invalid_input_response(error)
        response.headers[SOURCE_HEADER] = outcome.source
        return outcome.result

    @app.get("/health", response_model=HealthResponse)
    def get_health(request: Request) -> dict[str, object]:
        return {"status": "ok", "modelLoaded": _get_estimator(request).model_loaded}

    return app


app = create_app()