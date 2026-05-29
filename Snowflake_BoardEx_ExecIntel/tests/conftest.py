"""Per-dataset pytest config — Plan 10 ALL-ACCOUNTS audience (rebroadcast).

Plan 10 audience was originally `CLIENT_CATEGORY == 'Commercial Banking'`
which produced 960 rows = 97% empty profiles. The rebroadcast widens the
audience to **all accounts** (36,813 anchors) × 24-month history → ~884K
rows. The ONLY audience predicate now is `ACCOUNT_ID` non-empty; CLIENT_CATEGORY
no longer gates emission.

This conftest:
  - `in_audience_anchors` returns the full SAMPLE_ANCHORS slice (no filter).
  - `out_of_audience_anchors` returns `[]` — there is no real-anchor
    out-of-audience class anymore (only synthetic empty-ACCOUNT_ID anchors,
    constructed inline by individual tests).
  - `commercial_banking_fixture` keeps the original 5-anchor synthetic
    Commercial Banking cohort for cohort-specific tests against
    EMPLOYEE_COUNT > 5000 enterprise-band assertions (the shared
    100-anchor SAMPLE_ANCHORS still has zero Commercial Banking BUSINESS
    members at that scale).
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


# ---------------------------------------------------------------------------
# 5-anchor synthetic Commercial Banking cohort — preserved from the previous
# conftest. Used by the cohort-specific BUSINESS-band tests (EMPLOYEE_COUNT
# > 5000) because the shared 100-anchor fixture has zero Commercial Banking
# anchors at enterprise scale.
# ---------------------------------------------------------------------------

COMMERCIAL_BANKING_FIXTURE = [
    # Mid-market enterprise: ~$50M revenue, 250 employees.
    {
        "ACCOUNT_ID": "TEST_CB_001_MIDMARKET",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Manufacturing",
        "ANNUAL_REVENUE": 50_000_000,
        "EMPLOYEE_COUNT": 250,
        "INTERLOCK_DEGREE": 1,
    },
    # Regulated bank: ~$5B revenue, 8,000 employees. (>5000 — cohort-band test target.)
    {
        "ACCOUNT_ID": "TEST_CB_002_REGULATED_BANK",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Finance",
        "ANNUAL_REVENUE": 5_000_000_000,
        "EMPLOYEE_COUNT": 8_000,
        "INTERLOCK_DEGREE": 3,
    },
    # Family business: ~$15M revenue, 80 employees.
    {
        "ACCOUNT_ID": "TEST_CB_003_FAMILY_BUSINESS",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Retail",
        "ANNUAL_REVENUE": 15_000_000,
        "EMPLOYEE_COUNT": 80,
        "INTERLOCK_DEGREE": 0,
    },
    # Recent IPO: ~$200M revenue, 600 employees.
    {
        "ACCOUNT_ID": "TEST_CB_004_RECENT_IPO",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Tech",
        "ANNUAL_REVENUE": 200_000_000,
        "EMPLOYEE_COUNT": 600,
        "INTERLOCK_DEGREE": 2,
    },
    # Large cap: ~$15B revenue, 25,000 employees. (>5000 — cohort-band test target.)
    {
        "ACCOUNT_ID": "TEST_CB_005_LARGE_CAP",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Energy",
        "ANNUAL_REVENUE": 15_000_000_000,
        "EMPLOYEE_COUNT": 25_000,
        "INTERLOCK_DEGREE": 4,
    },
]


@pytest.fixture
def all_anchors():
    """The full 100-anchor fixture (50 person + 50 business)."""
    return SAMPLE_ANCHORS


@pytest.fixture
def in_audience_anchors(all_anchors):
    """Plan 10 rebroadcast audience: all accounts (no CLIENT_CATEGORY filter).

    Returns the full SAMPLE_ANCHORS slice unfiltered. The only audience
    predicate is `ACCOUNT_ID` non-empty, which every fixture anchor satisfies.
    """
    return list(all_anchors)


@pytest.fixture
def out_of_audience_anchors():
    """Empty list — Plan 10 rebroadcast is all-accounts.

    There is no real-anchor out-of-audience class. The empty-ACCOUNT_ID
    failure mode is constructed inline in `test_empty_account_id_raises`.
    """
    return []


@pytest.fixture
def commercial_banking_fixture():
    """5-anchor synthetic Commercial Banking cohort.

    Used by cohort-specific BUSINESS-band tests on EMPLOYEE_COUNT > 5000.
    The shared 100-anchor SAMPLE_ANCHORS has zero Commercial Banking
    anchors at enterprise scale, so this inline fixture covers the
    mid-market / regulated-bank / family-business / recent-IPO / large-cap
    EMPLOYEE_COUNT bands.
    """
    return COMMERCIAL_BANKING_FIXTURE


@pytest.fixture
def person_anchors(all_anchors):
    """Persons subset — used by the personal-household defaults test."""
    return [a for a in all_anchors if a.get("ACCOUNT_TYPE_FLAG") == "PERSON"]


@pytest.fixture
def business_anchors(all_anchors):
    """BUSINESS subset with EMPLOYEE_COUNT > 100 — full-governance band."""
    return [
        a for a in all_anchors
        if a.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"
        and int(a.get("EMPLOYEE_COUNT") or 0) > 100
    ]
