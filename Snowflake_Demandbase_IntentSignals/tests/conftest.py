"""Per-dataset pytest config for Plan 14 (Demandbase Intent Signals).

Unlike Plans 1-13, this conftest does NOT pull the shared 100-anchor
SAMPLE_ANCHORS fixture: the Plan 14 audience is non-household BUSINESS
anchors, and the bias tests need specific INDUSTRY / ANNUAL_REVENUE shapes.
The inline 12-anchor fixture (plan section 4, Task 3) covers:

  - 8 INDUSTRY values: Restaurant, Construction, Real Estate, Wholesale,
    Logistics, Healthcare, Technology, Manufacturing
  - 1 NULL INDUSTRY (with revenue)
  - 1 Commercial Banking anchor at ANNUAL_REVENUE >= $25M
  - 1 anchor with ANNUAL_REVENUE NULL
  - 1 "boring" anchor: INDUSTRY / ANNUAL_REVENUE / EMPLOYEE_COUNT all NULL
    and CLIENT_CATEGORY NULL (in audience via the COALESCE predicate)

Out-of-audience anchors (PERSON and Household containers) live in a
separate fixture so the audience-scoping test can assert they raise.
"""
import pytest


def _biz(n, industry, revenue, employees, category="Small Business"):
    return {
        "ORG_ID": "JDO",
        "ACCOUNT_ID": f"001DB0000000{n:03d}AAA",
        "ACCOUNT_NAME": f"Fixture Business {n}",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": category,
        "INDUSTRY": industry,
        "ANNUAL_REVENUE": revenue,
        "EMPLOYEE_COUNT": employees,
    }


DEMANDBASE_ANCHORS = [
    _biz(1, "Restaurant", 720_000, 6),
    _biz(2, "Construction", 710_000, 5),
    _biz(3, "Real Estate", 800_000, 4),
    _biz(4, "Wholesale", 730_000, 7),
    _biz(5, "Logistics", 24_000_000, 140, category="Commercial Banking"),
    _biz(6, "Healthcare", 770_000, 9),
    _biz(7, "Technology", 4_500_000, 45, category=None),
    _biz(8, "Manufacturing", 2_000_000, 30),
    _biz(9, None, 650_000, 5),                                    # NULL INDUSTRY
    _biz(10, "Wholesale Distribution", 29_000_000, 620,
         category="Commercial Banking"),                          # CB >= $25M
    _biz(11, "Professional Services", None, 12, category="Gold"),  # revenue NULL
    _biz(12, None, None, None, category=None),                    # boring case
]

BORING_ANCHOR = DEMANDBASE_ANCHORS[11]

OUT_OF_AUDIENCE_ANCHORS = [
    {"ORG_ID": "JDO", "ACCOUNT_ID": "001DB0000000901AAA", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Household", "INDUSTRY": None, "ANNUAL_REVENUE": None,
     "EMPLOYEE_COUNT": None},
    {"ORG_ID": "JDO", "ACCOUNT_ID": "001DB0000000902AAA", "ACCOUNT_TYPE_FLAG": "PERSON",
     "CLIENT_CATEGORY": "Retail", "INDUSTRY": None, "ANNUAL_REVENUE": None,
     "EMPLOYEE_COUNT": None},
    {"ORG_ID": "JDO", "ACCOUNT_ID": "", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Small Business", "INDUSTRY": "Restaurant",
     "ANNUAL_REVENUE": 500_000, "EMPLOYEE_COUNT": 4},
]


@pytest.fixture
def in_audience_anchors():
    return DEMANDBASE_ANCHORS


@pytest.fixture
def out_of_audience_anchors():
    return OUT_OF_AUDIENCE_ANCHORS


@pytest.fixture
def boring_anchor():
    return BORING_ANCHOR
