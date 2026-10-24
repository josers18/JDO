"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides the held-away audience overrides
(personal: Retail + Wealth; business: Small Business + Commercial Banking)."""
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


_PERSON = ("Retail", "Wealth Management")
_BUSINESS = ("Small Business", "Commercial Banking")


@pytest.fixture
def person_audience_anchors(all_anchors):
    """Personal held-away: CLIENT_CATEGORY IN ('Retail', 'Wealth Management')."""
    return [a for a in all_anchors if a.get("CLIENT_CATEGORY") in _PERSON]


@pytest.fixture
def business_audience_anchors(all_anchors):
    """Business held-away: CLIENT_CATEGORY IN ('Small Business', 'Commercial Banking').

    Includes the BUSINESS-flag rows and the PA-as-SMB / PA-as-Commercial
    PERSON rows (sole proprietors get business accounts too).
    """
    return [a for a in all_anchors if a.get("CLIENT_CATEGORY") in _BUSINESS]


@pytest.fixture
def in_audience_anchors(person_audience_anchors, business_audience_anchors):
    """Full audience: personal + business."""
    return person_audience_anchors + business_audience_anchors


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the predicate (Household / null CLIENT_CATEGORY)."""
    return [a for a in all_anchors
            if a.get("CLIENT_CATEGORY") not in _PERSON + _BUSINESS]
