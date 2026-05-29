"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 12 all-accounts-audience overrides.

Plan 12 audience (rebroadcast scope): every anchor with a non-empty
``ACCOUNT_ID`` — no ``CLIENT_CATEGORY`` filter. This widens the cohort from
the original Wealth+Commercial 4,880-row design to ~36,813 anchors (~884K
rows over a 24-week roll). The cascade-NULL boring case stays load-bearing,
and the per-category call-rate tier (Commercial > Wealth > Small Business >
Retail/Household > Default) keeps the cohort biases sensible across the
broader audience.
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
    """Plan 12 audience (rebroadcast): every anchor with a non-empty
    ACCOUNT_ID. No CLIENT_CATEGORY filter — degenerate audience."""
    return [a for a in all_anchors if a.get("ACCOUNT_ID")]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Degenerate-audience: no fixture anchor is out-of-scope. Cohort
    tests that depend on an out-of-audience pool ``pytest.skip``."""
    return []
