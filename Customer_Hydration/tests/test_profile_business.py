"""Unit tests for the B2B branch of profile deriver (rule 18)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.profile import ProfileDeriver


def _arch_business(*, business_size="mid", account_id="001xx000000BIZ01",
                   annual_revenue=50_000_000) -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0,
        # archetype.income_band for B2B was set from revenue band per
        # spec §4.1 step 4: micro→entry, small→middle, mid→affluent,
        # large→hnw, enterprise→uhnw
        income_band={"micro": "entry", "small": "middle", "mid": "affluent",
                     "large": "hnw", "enterprise": "uhnw"}[business_size],
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=business_size, industry_code="522110",
        business_credit_quality=0.7,
    )


def test_applies_to_business_returns_true():
    """Plan 4c: profile applies to both person and business."""
    d = ProfileDeriver()
    assert d.applies_to(_arch_business()) is True


def test_business_branch_skips_person_fields():
    """Tier__c is person-side. NetWorth is person-side. ServiceModel is
    person-side. None should be in the B2B output."""
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "Tier__c" not in out
    assert "FinServ__NetWorth__c" not in out
    assert "FinServ__ServiceModel__c" not in out
    assert "FinServ__RiskTolerance__c" not in out


def test_business_customer_type_is_business():
    """B2B records get CustomerType=Business."""
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__CustomerType__c"] == "Business"


def test_business_status_is_active():
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__Status__c"] == "Active"


def test_rule_18_micro_business_revenue_and_employees():
    """Rule 18: micro → revenue $50k–$1M, employees 1–10."""
    d = ProfileDeriver()
    for i in range(50):
        a = _arch_business(account_id=f"001xx0000M{i:05d}", business_size="micro")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        rev = out.get("AnnualRevenue")
        emps = out.get("NumberOfEmployees")
        if rev is not None:
            assert 50_000 <= rev < 1_000_000, f"micro got revenue {rev}"
        if emps is not None:
            assert 1 <= emps <= 10, f"micro got {emps} employees"


def test_rule_18_mid_business_revenue_and_employees():
    """Rule 18: mid → revenue $10M–$100M, employees 50–500."""
    d = ProfileDeriver()
    for i in range(50):
        a = _arch_business(account_id=f"001xx0000I{i:05d}", business_size="mid")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        rev = out.get("AnnualRevenue")
        emps = out.get("NumberOfEmployees")
        if rev is not None:
            assert 10_000_000 <= rev < 100_000_000, f"mid got revenue {rev}"
        if emps is not None:
            assert 50 <= emps <= 500, f"mid got {emps} employees"


def test_rule_18_enterprise_revenue_and_employees():
    """Rule 18: enterprise → revenue ≥$1B, employees ≥5000."""
    d = ProfileDeriver()
    for i in range(50):
        a = _arch_business(account_id=f"001xx0000E{i:05d}", business_size="enterprise")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        rev = out.get("AnnualRevenue")
        emps = out.get("NumberOfEmployees")
        if rev is not None:
            assert rev >= 1_000_000_000, f"enterprise got revenue {rev}"
        if emps is not None:
            assert emps >= 5000, f"enterprise got {emps} employees"


def test_existing_revenue_not_overwritten():
    """If record already has AnnualRevenue, deriver doesn't propose a new one."""
    d = ProfileDeriver()
    a = _arch_business()
    record = {"Id": a.account_id, "AnnualRevenue": 12_345_000}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "AnnualRevenue" not in out


def test_total_revenue_for_b2b():
    """B2B accounts get FinServ__TotalRevenue__c (mirror of AnnualRevenue)."""
    d = ProfileDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    rev = out.get("AnnualRevenue")
    total = out.get("FinServ__TotalRevenue__c")
    if rev is not None and total is not None:
        # TotalRevenue should equal AnnualRevenue (one-to-one mirror)
        assert total == pytest.approx(rev, rel=0.001)


def test_business_branch_is_deterministic():
    d = ProfileDeriver()
    a = _arch_business()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
