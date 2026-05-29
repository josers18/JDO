"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 7 all-accounts audience overrides.

Plan 7 deviates from Plans 1-6: every anchor is in audience (no predicate).
The conftest reflects that — `in_audience_anchors == all_anchors`, and
`out_of_audience_anchors == []` (tests that consume it must `pytest.skip`).
"""
import importlib.util
import sys
from pathlib import Path

# Load the shared fixture module directly from its file path so we don't
# collide with the local `tests/` package (which would shadow Cumulus_Common's
# own `tests/` namespace if we just appended its root to sys.path).
_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "Snowflake_Cumulus_Common"
    / "tests"
    / "fixtures"
    / "sample_anchors.py"
)
_spec = importlib.util.spec_from_file_location(
    "_cumulus_common_sample_anchors", _FIXTURE_PATH
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["_cumulus_common_sample_anchors"] = _mod
_spec.loader.exec_module(_mod)
SAMPLE_ANCHORS = _mod.SAMPLE_ANCHORS

import pytest  # noqa: E402


@pytest.fixture
def all_anchors():
    """The full 100-anchor fixture (50 person + 50 business)."""
    return SAMPLE_ANCHORS


@pytest.fixture
def in_audience_anchors(all_anchors):
    """Plan 7 audience: ALL accounts (no predicate). Returns the full
    100-anchor fixture unchanged."""
    return list(all_anchors)


@pytest.fixture
def out_of_audience_anchors():
    """Plan 7 has no out-of-audience cohort. Returns an empty list — tests
    that depend on this fixture must `pytest.skip(...)` if it's empty."""
    return []
