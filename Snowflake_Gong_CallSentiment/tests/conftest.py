"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 12 Wealth-Management +
Commercial-Banking-audience overrides.

Plan 12 audience: ``CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')``.

Of SAMPLE_ANCHORS' 100 anchors, the audience surfaces the 19 Wealth Management
PERSON entries (TEST-PERSON-26..44) plus a handful of Commercial Banking
fixture entries. Cohort-specific tests `pytest.skip` if the audience drops
below 3 (Plan 5/6/8 pattern).
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
    """Plan 12 audience predicate:
    ``CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')``.
    """
    return [
        a for a in all_anchors
        if a.get("CLIENT_CATEGORY") in ("Wealth Management", "Commercial Banking")
    ]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the Plan 12 predicate (Retail / Household /
    Small Business / null CLIENT_CATEGORY)."""
    return [
        a for a in all_anchors
        if a.get("CLIENT_CATEGORY") not in ("Wealth Management", "Commercial Banking")
    ]
