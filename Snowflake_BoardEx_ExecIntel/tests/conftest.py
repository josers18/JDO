"""Per-dataset pytest config — Plan 10 cohort-fixture override.

Plan 10 audience: `CLIENT_CATEGORY == 'Commercial Banking'`. **Plan 10 is the
first Cumulus dataset where the shared 100-anchor `SAMPLE_ANCHORS` fixture has
zero relevant cohort members** (Commercial Banking is ~2.6% of the anchor
pool and the SAMPLE_ANCHORS slice is Retail / Wealth / Household / Small
Business heavy). Filtering SAMPLE_ANCHORS would drop every cohort-specific
test silently, and the Plan 5/6 graceful-skip pattern would do the same.

Instead, this conftest **does not consult SAMPLE_ANCHORS at all** for cohort
tests. It defines an inline 5-anchor `COMMERCIAL_BANKING_FIXTURE` covering
the EMPLOYEE_COUNT / INTERLOCK_DEGREE bias bands (mid-market enterprise,
regulated bank, family business, recent IPO, large cap) and a small
`OUT_OF_AUDIENCE_FIXTURE` of 3 non-Commercial-Banking anchors used to
exercise the audience-rejection path. Rolled across 6+ months in the row
factory tests, the 5-anchor cohort yields ~30 rows — enough to surface all
5 governance-rating tiers and every bias band.

This deviation is documented in `Snowflake_BoardEx_ExecIntel/AGENTS.md` and
in the rowspec attachment.
"""
import pytest


# 5 hand-picked Commercial Banking anchors spanning the EMPLOYEE_COUNT bias
# bands and the INTERLOCK_DEGREE distribution. All BUSINESS-typed (Commercial
# Banking is enterprise by definition); INDUSTRY / ANNUAL_REVENUE / EMPLOYEE_COUNT
# all populated.
COMMERCIAL_BANKING_FIXTURE = [
    # Mid-market enterprise: ~$50M revenue, 250 employees. Hits the
    # small-to-mid BOARD_SIZE band [5, 10] and modest INTERLOCK_DEGREE.
    {
        "ACCOUNT_ID": "TEST_CB_001_MIDMARKET",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Manufacturing",
        "ANNUAL_REVENUE": 50_000_000,
        "EMPLOYEE_COUNT": 250,
        "INTERLOCK_DEGREE": 1,
    },
    # Regulated bank: ~$5B revenue, 8,000 employees. Hits the mid-market
    # BOARD_SIZE band [7, 12] with elevated INTERLOCK_DEGREE.
    {
        "ACCOUNT_ID": "TEST_CB_002_REGULATED_BANK",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Finance",
        "ANNUAL_REVENUE": 5_000_000_000,
        "EMPLOYEE_COUNT": 8_000,
        "INTERLOCK_DEGREE": 3,
    },
    # Family business: ~$15M revenue, 80 employees. Hits the smallest band
    # [5, 8] and zero INTERLOCK_DEGREE.
    {
        "ACCOUNT_ID": "TEST_CB_003_FAMILY_BUSINESS",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Retail",
        "ANNUAL_REVENUE": 15_000_000,
        "EMPLOYEE_COUNT": 80,
        "INTERLOCK_DEGREE": 0,
    },
    # Recent IPO: ~$200M revenue, 600 employees. Hits the small-to-mid
    # BOARD_SIZE band [5, 10] with moderate INTERLOCK_DEGREE.
    {
        "ACCOUNT_ID": "TEST_CB_004_RECENT_IPO",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Commercial Banking",
        "INDUSTRY": "Tech",
        "ANNUAL_REVENUE": 200_000_000,
        "EMPLOYEE_COUNT": 600,
        "INTERLOCK_DEGREE": 2,
    },
    # Large cap: ~$15B revenue, 25,000 employees. Hits the large-enterprise
    # BOARD_SIZE band [9, 15] and high INTERLOCK_DEGREE.
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


# 3 inline anchors that fail the Commercial Banking predicate. Used to
# exercise `_anchor_in_audience` False path and `_row_for` audience-violator
# rejection. Spans Retail PERSON, Wealth PERSON, and Small Business BUSINESS
# so we cover both ACCOUNT_TYPE_FLAG values and the most common drift
# categories.
OUT_OF_AUDIENCE_FIXTURE = [
    {
        "ACCOUNT_ID": "TEST_OOA_001_RETAIL_PERSON",
        "ACCOUNT_TYPE_FLAG": "PERSON",
        "CLIENT_CATEGORY": "Retail",
        "BIRTHDATE": "1985-04-12",
        "ANNUAL_INCOME": 95_000,
    },
    {
        "ACCOUNT_ID": "TEST_OOA_002_WEALTH_PERSON",
        "ACCOUNT_TYPE_FLAG": "PERSON",
        "CLIENT_CATEGORY": "Wealth Management",
        "BIRTHDATE": "1962-09-30",
        "ANNUAL_INCOME": 425_000,
    },
    {
        "ACCOUNT_ID": "TEST_OOA_003_SMALL_BUSINESS",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": "Small Business",
        "INDUSTRY": "Retail",
        "ANNUAL_REVENUE": 2_500_000,
        "EMPLOYEE_COUNT": 12,
        "INTERLOCK_DEGREE": 0,
    },
]


@pytest.fixture
def in_audience_anchors():
    """Plan 10 cohort: 5 inline synthetic Commercial Banking anchors.

    Does NOT filter SAMPLE_ANCHORS — Commercial Banking is absent from the
    shared 100-anchor fixture, so we ignore it entirely. See module docstring.
    """
    return COMMERCIAL_BANKING_FIXTURE


@pytest.fixture
def out_of_audience_anchors():
    """3 inline non-Commercial-Banking anchors (Retail PERSON, Wealth PERSON,
    Small Business BUSINESS) for the audience-rejection path."""
    return OUT_OF_AUDIENCE_FIXTURE
