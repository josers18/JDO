"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 8 Wealth-Management-audience overrides.

Plan 8 audience: `CLIENT_CATEGORY == 'Wealth Management'`. Of SAMPLE_ANCHORS'
100 anchors, 19 (TEST-PERSON-26 through TEST-PERSON-44) carry the Wealth
Management category. Cohort-specific tests must `pytest.skip` if this drops
below 3 (per Plan 5/6 pattern).
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
    """Plan 8 audience predicate: CLIENT_CATEGORY = 'Wealth Management'."""
    return [a for a in all_anchors if a["CLIENT_CATEGORY"] == "Wealth Management"]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the Wealth Management predicate (Retail / Small Business
    / Commercial Banking + all BUSINESS rows)."""
    return [a for a in all_anchors if a["CLIENT_CATEGORY"] != "Wealth Management"]
