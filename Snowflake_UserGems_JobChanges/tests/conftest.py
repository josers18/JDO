"""Per-dataset pytest config for Plan 15 (UserGems Job Changes).

Like Plan 14, this conftest does NOT use the shared 100-anchor SAMPLE_ANCHORS
fixture. Plan 15's tests need specific EMPLOYEE_COUNT bands (the roster size
drives event volume), shared INDUSTRY values (the Existing Client destination
pool prefers the same industry) and a Wealth Management pool.

Fixtures (plan section 4, Task 3):
  - EMPLOYERS: 10 non-household BUSINESS anchors, 2 per employee band
    (1-10 / 11-50 / 51-200 / 201-1000 / 1001+). Two industries repeat so the
    same-industry pool has more than one member; one anchor has NULL INDUSTRY.
  - BORING_ANCHOR: INDUSTRY / EMPLOYEE_COUNT / CLIENT_CATEGORY all NULL (in
    audience via the COALESCE predicate). Kept outside EMPLOYERS so the
    band-coverage tests stay at 10 anchors.
  - WEALTH_POOL: 5 Wealth Management PERSON account ids.
  - make_boardex(): builds a synthetic {(ACCOUNT_ID, month): flag} dict.
"""
from datetime import date

import pytest


def _biz(n, industry, employees, category="Commercial Banking", name=None):
    return {
        "ORG_ID": "JDO",
        "ACCOUNT_ID": f"001UG0000000{n:03d}AAA",
        "ACCOUNT_NAME": name or f"Fixture Employer {n}",
        "ACCOUNT_TYPE_FLAG": "BUSINESS",
        "CLIENT_CATEGORY": category,
        "INDUSTRY": industry,
        "EMPLOYEE_COUNT": employees,
    }


EMPLOYERS = [
    _biz(1, "Restaurant", 6, category="Small Business", name="Harbor Grill Group"),
    _biz(2, "Construction", 9, category=None, name="Keystone Builders"),
    _biz(3, "Restaurant", 35, category="Small Business", name="Fireside Hospitality"),
    _biz(4, "Technology", 48, name="Northwind Software"),
    _biz(5, "Manufacturing", 120, name="Granite Precision Parts"),
    _biz(6, None, 180, category="Gold", name="Atlas Holdings"),
    _biz(7, "Technology", 450, name="Bluepeak Systems"),
    _biz(8, "Manufacturing", 900, name="Ironwood Fabrication"),
    _biz(9, "Logistics", 2500, name="Meridian Freight"),
    _biz(10, "Healthcare", 12000, name="Cedar Valley Health"),
]

BORING_ANCHOR = {
    "ORG_ID": "JDO",
    "ACCOUNT_ID": "001UG0000000099AAA",
    "ACCOUNT_NAME": "Plain Business",
    "ACCOUNT_TYPE_FLAG": "BUSINESS",
    "CLIENT_CATEGORY": None,
    "INDUSTRY": None,
    "EMPLOYEE_COUNT": None,
}

WEALTH_POOL = [f"001UGW000000{n:03d}AAA" for n in (5, 3, 1, 4, 2)]  # unsorted on purpose

OUT_OF_AUDIENCE_ANCHORS = [
    {"ORG_ID": "JDO", "ACCOUNT_ID": "001UG0000000901AAA", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Household", "INDUSTRY": None, "EMPLOYEE_COUNT": None},
    {"ORG_ID": "JDO", "ACCOUNT_ID": "001UG0000000902AAA", "ACCOUNT_TYPE_FLAG": "PERSON",
     "CLIENT_CATEGORY": "Wealth Management", "INDUSTRY": None, "EMPLOYEE_COUNT": None},
    {"ORG_ID": "JDO", "ACCOUNT_ID": "", "ACCOUNT_TYPE_FLAG": "BUSINESS",
     "CLIENT_CATEGORY": "Small Business", "INDUSTRY": "Restaurant", "EMPLOYEE_COUNT": 4},
]


def months_between(first: date, last: date) -> list[date]:
    """First-of-month dates from first to last inclusive."""
    out, m = [], date(first.year, first.month, 1)
    while m <= last:
        out.append(m)
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    return out


def make_boardex(anchors, months, true_cells=frozenset(), default=False):
    """{(ACCOUNT_ID, month): flag} for every anchor x month.

    true_cells: set of (ACCOUNT_ID, month) set to `not default`.
    """
    return {
        (a["ACCOUNT_ID"], m): (not default) if (a["ACCOUNT_ID"], m) in true_cells else default
        for a in anchors
        for m in months
    }


@pytest.fixture
def employers():
    return EMPLOYERS


@pytest.fixture
def boring_anchor():
    return BORING_ANCHOR


@pytest.fixture
def wealth_pool():
    return WEALTH_POOL


@pytest.fixture
def out_of_audience_anchors():
    return OUT_OF_AUDIENCE_ANCHORS


@pytest.fixture
def ctx():
    from sp_generate_usergems_job_changes import Ctx
    return Ctx(EMPLOYERS + [BORING_ANCHOR], WEALTH_POOL)
