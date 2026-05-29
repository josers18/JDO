"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and exposes Plan 8's all-accounts audience.

Plan 8 audience (rebroadcast 2026-05-28): every anchor with a non-empty
ACCOUNT_ID. The dataset originally filtered to `CLIENT_CATEGORY = 'Wealth
Management'` (~3,920 rows / 19 fixture anchors), but the rebroadcast widens
to all 36,813 anchors × 24 months of history (~884K rows) so that demo
dashboards have MGP coverage for ~all customer profiles, not just the 11%
Wealth Management slice.

`out_of_audience_anchors` therefore returns an empty list — the only
out-of-audience condition is an empty/missing ACCOUNT_ID, which is asserted
directly in the L1 test rather than through a cohort fixture. Tests that
depend on a non-empty out-of-audience cohort `pytest.skip`.
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
    """The full 100-anchor fixture (50 PERSON + 50 BUSINESS)."""
    return SAMPLE_ANCHORS


@pytest.fixture
def in_audience_anchors(all_anchors):
    """Plan 8 (rebroadcast) audience predicate: any anchor with a non-empty
    ACCOUNT_ID — i.e. all 100 fixture anchors."""
    return [a for a in all_anchors if a.get("ACCOUNT_ID")]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """No fixture-level out-of-audience cohort exists under the all-accounts
    rebroadcast — every fixture row has a non-empty ACCOUNT_ID. Returns an
    empty list; tests that need a violator should `pytest.skip` rather than
    fabricate one (empty-ACCOUNT_ID is exercised directly via a literal in
    the L1 suite)."""
    return []
