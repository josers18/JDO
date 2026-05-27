"""Unit tests for the B2B branch of contact deriver (rules 19, 20, 21)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.contact import ContactDeriver


def _arch_business(*, business_size="mid", industry_code="522110",
                   account_id="001xx000000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=business_size, industry_code=industry_code,
        business_credit_quality=0.7,
    )


def test_applies_to_business_returns_true():
    d = ContactDeriver()
    assert d.applies_to(_arch_business()) is True


def test_business_branch_skips_person_fields():
    """B2B output MUST NOT contain person-only fields."""
    d = ContactDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    for f in ("MiddleName", "PersonTitle", "PersonAssistantName",
              "PersonAssistantPhone", "PersonDepartment", "PersonLeadSource",
              "Salutation"):
        assert f not in out, f"B2B should not contain {f}"


def test_rule_20_naics_from_industry_code():
    """NAICS_Code__c = archetype.industry_code directly."""
    d = ContactDeriver()
    a = _arch_business(industry_code="522110")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["NAICS_Code__c"] == "522110"


def test_rule_20_sic_derives_from_naics():
    """Sic and SicDesc populated together; consistent with NAICS."""
    d = ContactDeriver()
    a = _arch_business(industry_code="522110")  # Banking
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "Sic" in out
    assert "SicDesc" in out
    # 522110 → SIC 6020 (Commercial Banks)
    assert out["Sic"] == "6020"


def test_rule_19_ticker_only_for_large_or_enterprise():
    """Rule 19: TickerSymbol present iff business_size ∈ {large, enterprise}."""
    d = ContactDeriver()
    micro = d.derive(
        _arch_business(business_size="micro"),
        {"Id": "001xx_micro"}, seeded_rng("001xx_micro"),
    )
    small = d.derive(
        _arch_business(business_size="small"),
        {"Id": "001xx_small"}, seeded_rng("001xx_small"),
    )
    mid = d.derive(
        _arch_business(business_size="mid"),
        {"Id": "001xx_mid"}, seeded_rng("001xx_mid"),
    )
    large = d.derive(
        _arch_business(business_size="large"),
        {"Id": "001xx_large"}, seeded_rng("001xx_large"),
    )
    enterprise = d.derive(
        _arch_business(business_size="enterprise"),
        {"Id": "001xx_ent"}, seeded_rng("001xx_ent"),
    )
    assert "TickerSymbol" not in micro
    assert "TickerSymbol" not in small
    assert "TickerSymbol" not in mid
    assert "TickerSymbol" in large
    assert "TickerSymbol" in enterprise


def test_ticker_is_4_uppercase_letters():
    d = ContactDeriver()
    a = _arch_business(business_size="enterprise")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    ticker = out["TickerSymbol"]
    assert len(ticker) == 4
    assert ticker.isalpha()
    assert ticker == ticker.upper()


def test_rule_21_industry_topoff_skipped_with_real_account_source():
    """Rule 21: don't overwrite Industry if AccountSource indicates real-source data."""
    d = ContactDeriver()
    a = _arch_business()
    # Real-source: Industry should be skipped
    record_real = {"Id": a.account_id, "AccountSource": "Web", "Industry": None}
    out_real = d.derive(a, record_real, seeded_rng(a.account_id))
    assert "Industry" not in out_real

    # No AccountSource: Industry top-off allowed
    record_topoff = {"Id": a.account_id, "AccountSource": None, "Industry": None}
    out_topoff = d.derive(a, record_topoff, seeded_rng(a.account_id))
    assert "Industry" in out_topoff


def test_industry_topoff_skipped_when_industry_already_set():
    """If Industry is non-null, deriver doesn't propose a new one."""
    d = ContactDeriver()
    a = _arch_business()
    record = {"Id": a.account_id, "Industry": "Manufacturing"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "Industry" not in out


def test_type_and_rating_are_picklist_values():
    """Plan 4d hotfix (2026-05-27): YAML refreshed to match jdo-uqj0jr's
    actual Type and Rating picklists — Type accepts Person/Mid-Market/
    Small Business/Enterprise/Partner; Rating accepts Hot/Warm/Cool (NOT Cold)."""
    d = ContactDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["Type"] in (
        "Person", "Mid-Market", "Small Business", "Enterprise", "Partner"
    )
    assert out["Rating"] in ("Hot", "Warm", "Cool")


def test_business_branch_is_deterministic():
    d = ContactDeriver()
    a = _arch_business()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2


def test_jigsaw_and_jigsaw_company_id_paired():
    d = ContactDeriver()
    a = _arch_business()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "Jigsaw" in out
    assert "JigsawCompanyId" in out
    assert len(out["Jigsaw"]) >= 6
    assert len(out["JigsawCompanyId"]) >= 6
