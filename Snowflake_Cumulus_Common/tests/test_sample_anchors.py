"""Sanity tests for the shared 100-anchor fixture.

These tests prevent the fixture from silently drifting away from the
Cumulus spec's coverage requirements (e.g. all 4 client categories must
be represented, both account-type flags must appear).
"""
from collections import Counter
from datetime import datetime

from tests.fixtures.sample_anchors import SAMPLE_ANCHORS


def test_fixture_has_100_anchors():
    assert len(SAMPLE_ANCHORS) == 100


def test_fixture_has_50_persons_and_50_businesses():
    types = Counter(a["ACCOUNT_TYPE_FLAG"] for a in SAMPLE_ANCHORS)
    assert types["PERSON"] == 50
    assert types["BUSINESS"] == 50


def test_fixture_account_ids_are_unique():
    ids = [a["ACCOUNT_ID"] for a in SAMPLE_ANCHORS]
    assert len(ids) == len(set(ids))


def test_fixture_covers_all_four_client_categories():
    """Every dataset's audience predicate filters on CLIENT_CATEGORY; if
    the fixture is missing a category, that dataset's L1 tests can't
    exercise it."""
    cats = {a["CLIENT_CATEGORY"] for a in SAMPLE_ANCHORS}
    assert cats == {"Retail", "Wealth Management", "Small Business", "Commercial Banking"}


def test_persons_have_birthdate_and_no_business_fields():
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    for p in persons:
        assert p["BIRTHDATE"] is not None
        assert p["INDUSTRY"] is None
        assert p["ANNUAL_REVENUE"] is None
        assert p["EMPLOYEE_COUNT"] is None


def test_businesses_have_industry_revenue_and_no_birthdate():
    biz = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    for b in biz:
        assert b["BIRTHDATE"] is None
        assert b["INDUSTRY"] is not None
        assert b["ANNUAL_REVENUE"] is not None
        assert b["EMPLOYEE_COUNT"] is not None


def test_persons_span_age_bands():
    """Persons should cover Gen Z / Millennial / Gen X / Boomer."""
    today = datetime(2026, 5, 28)
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    ages = [(today - datetime.fromisoformat(p["BIRTHDATE"])).days // 365 for p in persons]
    assert any(a < 28 for a in ages),         "no Gen Z anchor"
    assert any(28 <= a < 44 for a in ages),   "no Millennial anchor"
    assert any(44 <= a < 60 for a in ages),   "no Gen X anchor"
    assert any(60 <= a < 78 for a in ages),   "no Boomer anchor"


def test_persons_span_income_bands():
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    incomes = [p["ANNUAL_INCOME"] for p in persons if p["ANNUAL_INCOME"] is not None]
    assert any(i < 50_000 for i in incomes),         "no low-income anchor"
    assert any(50_000 <= i < 150_000 for i in incomes), "no middle-income anchor"
    assert any(i >= 250_000 for i in incomes),       "no affluent anchor"


def test_persons_have_some_with_postal_code_some_without():
    """CoreLogic Property requires POSTAL_CODE; the fixture must include
    persons WITHOUT a postal code so the audience predicate filtering
    can be tested."""
    persons = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]
    with_zip = [p for p in persons if p["POSTAL_CODE"] is not None]
    without_zip = [p for p in persons if p["POSTAL_CODE"] is None]
    assert len(with_zip) >= 40, "need at least 40 persons with ZIP"
    assert len(without_zip) >= 2, "need at least 2 persons without ZIP for predicate tests"


def test_businesses_span_at_least_five_industries():
    """Business audience predicates may filter on INDUSTRY (e.g., D&B credit
    biases by industry); ≥5 distinct industries ensures audience-aware tests
    actually exercise different branches."""
    biz = [a for a in SAMPLE_ANCHORS if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]
    industries = {b["INDUSTRY"] for b in biz}
    assert len(industries) >= 5, f"only {len(industries)} distinct industries: {industries}"
