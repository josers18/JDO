"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common and provides Plan 9 all-accounts audience overrides
plus an `available_edge_types` fixture for the cross-plan-dependency surface."""
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
    """Plan 9 audience: `1=1` — all anchors are in audience."""
    return list(all_anchors)


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Plan 9 audience is `1=1` — no real anchor is out-of-audience.

    The only failure mode is a synthetic row with an empty/missing ACCOUNT_ID,
    which the L1 tests construct inline rather than expecting from the fixture.
    """
    return []


@pytest.fixture
def available_edge_types():
    """Default test set: all 7 EDGE_TYPEs.

    Individual tests override this (e.g. `{"SELF"}` for the SELF-fallback
    invariant, `set()` to force the unconditional fallback path).
    """
    return {
        "SELF",
        "HOUSEHOLD",
        "CORPORATE_PARENT",
        "BOARD_MEMBER",
        "ADVISOR_BOOK",
        "REFERRAL",
        "BUSINESS_OWNER",
    }
