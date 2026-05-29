"""Per-dataset pytest config — Plan 13 RE-SCOPED to per-BUSINESS account.

Plan 13 was originally instrument-scoped (TICKER PK, INSTRUMENT_UNIVERSE
audience, 2,004 rows). It is now **account-scoped** (ACCOUNT_ID PK,
audience = `ACCOUNT_TYPE_FLAG = 'BUSINESS'`, ~11,389 distinct anchors x
90-day backfill = ~1.025M rows). Mimics Moody's commercial credit risk
issuer ratings on COMPANIES (not on instruments) — same Aaa/Aa1.../C
scale + outlook + LIQUIDITY_TIER, but per-COMPANY.

The L1 fixture pulls the shared 100-anchor SAMPLE_ANCHORS via importlib
(Plan 1 / Plan 2 pattern — avoids tests-package collision with Cumulus_Common)
and filters to BUSINESS anchors. ~50 of the 100 fixture anchors are BUSINESS;
the other ~50 are PERSONs (out-of-audience).
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
    """Plan 13 audience predicate: ACCOUNT_TYPE_FLAG = 'BUSINESS'."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]


@pytest.fixture
def out_of_audience_anchors(all_anchors):
    """Anchors that fail the predicate (PERSONs)."""
    return [a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] != "BUSINESS"]
