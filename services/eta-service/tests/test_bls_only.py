"""Regression tests for the mentor's decision: only the "BLS" ambulance type.

Kept in a new file so no existing Phase 1 test has to be edited.
"""

from __future__ import annotations

import pytest

from ml.eta.config import DEFAULT_CONFIG
from ml.eta.validation import InvalidInputError, validate_ambulance_type


def test_default_config_supports_only_bls() -> None:
    assert DEFAULT_CONFIG.allowed_ambulance_types == ("BLS",)


@pytest.mark.parametrize("name", ["ALS", "ICU", "als", "icu", "bls"])
def test_other_ambulance_types_are_rejected(name: str) -> None:
    with pytest.raises(InvalidInputError):
        validate_ambulance_type(name)


def test_bls_is_accepted() -> None:
    assert validate_ambulance_type("BLS") == "BLS"