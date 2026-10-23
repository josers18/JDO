"""Per-dataset pytest config - loads the shared 100-anchor fixture from
Snowflake_Cumulus_Common via importlib (avoids a tests-package collision)."""
import importlib.util
import sys
from pathlib import Path

import pytest

_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "Snowflake_Cumulus_Common"
    / "tests"
    / "fixtures"
    / "sample_anchors.py"
)
_spec = importlib.util.spec_from_file_location("_cumulus_common_sample_anchors", _FIXTURE_PATH)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["_cumulus_common_sample_anchors"] = _mod
_spec.loader.exec_module(_mod)

# The shared fixture predates the ORG_ID anchor column; stamp 'JDO' locally so
# rows match the shape V_ACCOUNT_ANCHORS exposes in production.
SAMPLE_ANCHORS = [{"ORG_ID": "JDO", **a} for a in _mod.SAMPLE_ANCHORS]


@pytest.fixture
def all_anchors():
    """The full 100-anchor fixture (50 person + 50 business), ORG_ID-stamped."""
    return SAMPLE_ANCHORS


@pytest.fixture
def business_anchors(all_anchors):
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]


@pytest.fixture
def person_anchors(all_anchors):
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
