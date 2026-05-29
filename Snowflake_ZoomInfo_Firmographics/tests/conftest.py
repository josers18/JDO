"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 11 BUSINESS-audience overrides.

Plan 11 audience: `ACCOUNT_TYPE_FLAG == 'BUSINESS'` — same predicate as
Plans 2 (MSCI) and 3 (D&B). Of SAMPLE_ANCHORS' 100 anchors, 50 carry the
BUSINESS flag, giving ample cohort headroom for distributional checks
(NULL-rate convergence on WEBSITE_DOMAIN / TECH_STACK_FLAGS) without the
per-anchor invariants Plan 8 needed for its narrow Wealth cohort.
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
    """Plan 11 audience predicate: ACCOUNT_TYPE_FLAG = 'BUSINESS'."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the BUSINESS predicate (PERSON anchors —
    Retail / Wealth / Commercial Banking customers)."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] != "BUSINESS"]
