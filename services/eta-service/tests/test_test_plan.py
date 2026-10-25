"""Guard test for docs/test_plan.md (Phase 6, ticket AI-06).

The test plan names exact tests (``tests/test_x.py::test_name``). This file checks that
every name in the document still exists, so the document cannot quietly go stale when a
test is renamed or deleted. It does NOT check that those tests pass: run ``pytest`` for that.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLAN_PATH = PROJECT_ROOT / "docs" / "test_plan.md"
REFERENCE = re.compile(r"`(tests/test_\w+\.py)::(test_\w+)`")
CASE_ID = re.compile(r"^[A-Z]\d+$")
MINIMUM_DOCUMENTED_CASES = 10  # the task plan asks for "at least 10 function/API tests"


def _plan_text() -> str:
    return PLAN_PATH.read_text(encoding="utf-8")


def _case_rows(text: str) -> list[list[str]]:
    """Return the cells of every table row whose first cell looks like a case ID."""
    rows = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells and CASE_ID.match(cells[0]):
            rows.append(cells)
    return rows


def _test_names_in(relative_path: str) -> set[str]:
    tree = ast.parse((PROJECT_ROOT / relative_path).read_text(encoding="utf-8"))
    return {node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)}


def missing_references(text: str) -> list[str]:
    """Names mentioned in ``text`` that do not exist in the tests folder."""
    missing = []
    for path, name in REFERENCE.findall(text):
        if not (PROJECT_ROOT / path).is_file() or name not in _test_names_in(path):
            missing.append(f"{path}::{name}")
    return missing


# --- The real document ---------------------------------------------------------------
def test_the_plan_file_exists_and_states_the_disclaimer() -> None:
    text = _plan_text()
    assert "not guaranteed" in text
    assert "fake" in text


def test_every_named_test_exists() -> None:
    assert missing_references(_plan_text()) == []


def test_at_least_ten_automated_cases_are_documented() -> None:
    rows = _case_rows(_plan_text())
    automated = [row for row in rows if REFERENCE.search(" ".join(row))]
    assert len(automated) >= MINIMUM_DOCUMENTED_CASES


def test_case_ids_are_unique() -> None:
    ids = [row[0] for row in _case_rows(_plan_text())]
    assert len(ids) == len(set(ids))


def test_every_case_without_a_test_is_a_manual_live_check() -> None:
    for row in _case_rows(_plan_text()):
        if not REFERENCE.search(" ".join(row)):
            assert row[0].startswith("L"), f"case {row[0]} names no test and is not a live check"


def test_the_plan_reports_the_real_run_counts() -> None:
    text = _plan_text()
    assert "584 passed" in text
    assert "61 passed" in text


# --- The checker itself must be able to fail -------------------------------------------
def test_the_checker_reports_a_test_that_does_not_exist() -> None:
    text = "`tests/test_eta.py::test_this_name_does_not_exist_anywhere`"
    assert missing_references(text) == ["tests/test_eta.py::test_this_name_does_not_exist_anywhere"]


def test_the_checker_reports_a_file_that_does_not_exist() -> None:
    text = "`tests/test_no_such_file.py::test_anything`"
    assert missing_references(text) == ["tests/test_no_such_file.py::test_anything"]


def test_the_checker_accepts_a_real_test() -> None:
    assert missing_references("`tests/test_eta.py::test_one_degree_of_latitude`") == []


@pytest.mark.parametrize(
    ("line", "is_case"),
    [
        ("| F1 | valid | x | y | `tests/test_eta.py::test_a` |", True),
        ("| L2 | invalid | x | y | z |", True),
        ("| ID | Type | What |", False),
        ("|---|---|---|", False),
        ("plain text | with | pipes", False),
    ],
)
def test_the_row_reader_picks_only_case_rows(line: str, is_case: bool) -> None:
    assert bool(_case_rows(line)) is is_case