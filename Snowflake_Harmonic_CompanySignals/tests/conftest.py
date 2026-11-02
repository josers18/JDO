"""Per-dataset pytest config for Plan 16 (Harmonic Company Signals).

Unlike Plans 1-13, this conftest does NOT pull the shared 100-anchor
SAMPLE_ANCHORS fixture. The Plan 16 row factory takes the anchor plus a
per-account ZoomInfo dict (first-of-month date -> {EMPLOYEE_BAND,
FOUNDED_YEAR}), and the tests need every band and specific industries.

The inline 10-anchor fixture (plan section 4, Task 3) covers:

  - every EMPLOYEE_BAND in the audience: 1-10 x4, 11-50 x2, 51-200,
    201-1000, 1001-5000, 5001-25000
  - INDUSTRY: Technology, Healthcare, Restaurant, Construction,
    Professional Services and NULL
  - FOUNDED_YEAR from 2010 to 2024. The 2024 Technology anchor is young
    enough that its first round lands inside the 36-month test window,
    so a Bootstrapped -> funded transition is exercised.
  - ID suffixes are chosen (not assumed) so the fixture shows every
    FUNDING_STATUS: anchor 1 goes Bootstrapped -> Angel-Seed in 2025-10,
    anchor 7 is Venture-Backed, anchor 8 is PE-Backed. The destiny test
    asserts this, so a seeding change that breaks it fails loudly.
  - the boring anchor: INDUSTRY NULL, band 1-10, founded 2010, with a
    bootstrapped destiny (asserted in the test, not assumed).

Out-of-audience anchors (PERSON, Household, empty id) live in a separate
fixture so the audience-scoping test can assert they raise.
"""
from datetime import date

import pytest


def _biz(n, industry, category="Small Business", suffix="AAA"):
    return {
        "ORG_ID": "JDO",
        "ACCOUNT_ID": f"001HM0000000{n:03d}{suffix}",
        "ACCOUNT_NAME": f"Fixture Startup {n}",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": category,
        "INDUSTRY": industry,
    }


# (anchor, EMPLOYEE_BAND, FOUNDED_YEAR)
HARMONIC_FIXTURE = [
    (_biz(1, "Technology", suffix="AAL"),                    "1-10",       2024),  # Pre-Seed 2025-10, Seed 2027-01
    (_biz(2, "Restaurant"),                                  "1-10",       2015),
    (_biz(3, None, category=None),                           "1-10",       2010),  # boring
    (_biz(4, "Construction"),                                "1-10",       2012),
    (_biz(5, "Healthcare"),                                  "11-50",      2014),
    (_biz(6, "Professional Services"),                       "11-50",      2011),
    (_biz(7, "Technology", category="Commercial Banking", suffix="AAC"), "51-200", 2016),  # venture to Series B
    (_biz(8, "Technology", category="Commercial Banking", suffix="AAB"), "201-1000", 2013),  # PE-Backed
    (_biz(9, "Healthcare", category="Commercial Banking"),   "1001-5000",  2010),
    (_biz(10, "Professional Services", category="Commercial Banking"), "5001-25000", 2012),
]

BORING_INDEX = 2

OUT_OF_AUDIENCE_ANCHORS = [
    {"ORG_ID": "JDO", "ACCOUNT_ID": "001HM0000000901AAA", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Household", "INDUSTRY": None},
    {"ORG_ID": "JDO", "ACCOUNT_ID": "001HM0000000902AAA", "ACCOUNT_TYPE_FLAG": "PERSON",
     "CLIENT_CATEGORY": "Retail", "INDUSTRY": None},
    {"ORG_ID": "JDO", "ACCOUNT_ID": "", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Small Business", "INDUSTRY": "Technology"},
]


def zi_const(band, founded, start=date(2023, 1, 1), end=date(2030, 12, 1)):
    """Synthetic per-account ZoomInfo dict with a constant band and founded year
    for every month in [start, end] (first-of-month keys)."""
    out = {}
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        out[date(y, m, 1)] = {"EMPLOYEE_BAND": band, "FOUNDED_YEAR": founded}
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


@pytest.fixture
def fixture_rows():
    """[(anchor, zi, band, founded)] for the 10 in-audience anchors."""
    return [(a, zi_const(b, f), b, f) for a, b, f in HARMONIC_FIXTURE]


@pytest.fixture
def boring():
    a, b, f = HARMONIC_FIXTURE[BORING_INDEX]
    return a, zi_const(b, f), b, f


@pytest.fixture
def out_of_audience_anchors():
    return OUT_OF_AUDIENCE_ANCHORS
