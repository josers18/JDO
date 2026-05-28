"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 6 Retail+Wealth audience overrides."""
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
    """Plan 6 audience: CLIENT_CATEGORY IN ('Retail', 'Wealth Management').

    Per the v1.5 anchor distribution, these are entries 1-44 of the
    PERSON cohort (25 Retail + 19 Wealth Management) — 44 in-audience anchors.
    """
    return [a for a in all_anchors
            if a.get("CLIENT_CATEGORY") in ("Retail", "Wealth Management")]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the predicate (Household / Small Business /
    Commercial Banking / null CLIENT_CATEGORY).

    Includes BUSINESS-flag rows (Small Business + Commercial Banking) AND
    the PA-as-SMB / PA-as-Commercial PERSON rows (entries 45-50).
    """
    return [a for a in all_anchors
            if a.get("CLIENT_CATEGORY") not in ("Retail", "Wealth Management")]
