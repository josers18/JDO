"""Per-dataset pytest config — pulls the shared 100-anchor fixture from
Snowflake_Cumulus_Common via importlib (avoids tests-package collision)
and provides Plan 2 BUSINESS-audience overrides."""
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

# Multi-org migration (umbrella ROLLOUT.md Phase A): the shared fixture predates
# the ORG_ID anchor column. Stamp 'JDO' locally so Plan 3's row factory and
# schema tests see the same shape V_ACCOUNT_ANCHORS exposes in production.
SAMPLE_ANCHORS = [{"ORG_ID": "JDO", **a} for a in SAMPLE_ANCHORS]

import pytest  # noqa: E402


@pytest.fixture
def all_anchors():
    """The full 100-anchor fixture (50 person + 50 business), ORG_ID-stamped."""
    return SAMPLE_ANCHORS


@pytest.fixture
def in_audience_anchors(all_anchors):
    """Plan 2 audience predicate: ACCOUNT_TYPE_FLAG = 'BUSINESS'."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the predicate."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] != "BUSINESS"]
