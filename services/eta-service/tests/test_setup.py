"""Phase 0 smoke tests: confirm the project skeleton and dependencies work."""

import importlib

import pytest


@pytest.mark.parametrize("module_name", ["ml", "ml.eta", "api"])
def test_project_packages_import(module_name: str) -> None:
    """Our own packages can be imported from the project root."""
    assert importlib.import_module(module_name) is not None


@pytest.mark.parametrize(
    "module_name",
    ["numpy", "pandas", "sklearn", "joblib", "fastapi", "httpx", "uvicorn"],
)
def test_required_dependencies_installed(module_name: str) -> None:
    """Every third-party library the project needs is installed."""
    assert importlib.import_module(module_name) is not None