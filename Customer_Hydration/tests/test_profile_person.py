"""Unit tests for the person-side of profile deriver (rules 1, 16)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.profile import ProfileDeriver


def _arch(*, income_band="middle", is_person=True, persona="retail", age=40,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona=persona,
        age=age, gender="Male", marital_status="Single",
        household_size=1, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = ProfileDeriver()
    assert d.name == "profile"
    assert "Tier__c" in d.fields
    assert "FinServ__ServiceModel__c" in d.fields
    assert "FinServ__RiskTolerance__c" in d.fields


def test_rule_1_tier_from_income_band():
    """Diamond/Platinum/Gold/Silver/Bronze from uhnw/hnw/affluent/middle/entry."""
    d = ProfileDeriver()
    cases = [
        ("entry",    "Bronze"),
        ("middle",   "Silver"),
        ("affluent", "Gold"),
        ("hnw",      "Platinum"),
        ("uhnw",     "Diamond"),
    ]
    for band, expected_tier in cases:
        a = _arch(income_band=band)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert out["Tier__c"] == expected_tier, f"income_band={band}"


def test_rule_1_service_model_from_tier():
    """Diamond→Private; Platinum→Premier; Gold→Standard; Silver/Bronze→Self-Service."""
    d = ProfileDeriver()
    cases = [
        ("entry",    "Self-Service"),
        ("middle",   "Self-Service"),
        ("affluent", "Standard"),
        ("hnw",      "Premier"),
        ("uhnw",     "Private"),
    ]
    for band, expected_sm in cases:
        a = _arch(income_band=band)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert out["FinServ__ServiceModel__c"] == expected_sm, f"income_band={band}"


def test_status_is_active():
    d = ProfileDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__Status__c"] == "Active"


def test_customer_type_for_person_account_is_individual():
    """Rule: CustomerType from RT — Person Account → Individual."""
    d = ProfileDeriver()
    a = _arch(is_person=True)
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__CustomerType__c"] == "Individual"


def test_net_worth_uses_rollup_sum_times_multiple():
    """NetWorth = (Investments + Deposits + NonfinAssets - Liabilities) × net_worth_multiple."""
    d = ProfileDeriver()
    a = _arch()
    record = {
        "Id": a.account_id,
        "FinServ__TotalInvestments__c": 100_000,
        "FinServ__TotalBankDeposits__c": 50_000,
        "FinServ__TotalNonfinancialAssets__c": 250_000,
        "FinServ__TotalLiabilities__c": 100_000,
    }
    out = d.derive(a, record, seeded_rng(a.account_id))
    base = 100_000 + 50_000 + 250_000 - 100_000  # = 300_000
    expected = base * a.net_worth_multiple
    assert out["FinServ__NetWorth__c"] == pytest.approx(expected, rel=0.001)


def test_net_worth_skipped_when_rollups_missing():
    """If any rollup is null, skip NetWorth (don't write garbage)."""
    d = ProfileDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__NetWorth__c" not in out


def test_rule_16_risk_triple_is_one_of_three_combos():
    """RiskTolerance + TimeHorizon + InvestmentExperience must be one of three triples."""
    d = ProfileDeriver()
    valid_triples = {
        ("Conservative", "Short-Term", "Beginner"),
        ("Moderate",     "Medium-Term", "Intermediate"),
        ("Aggressive",   "Long-Term",   "Experienced"),
    }
    for i in range(100):
        a = _arch(account_id=f"001xx00000R{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        triple = (
            out["FinServ__RiskTolerance__c"],
            out["FinServ__TimeHorizon__c"],
            out["FinServ__InvestmentExperience__c"],
        )
        assert triple in valid_triples, f"got incoherent triple {triple}"


def test_rule_16_wealth_persona_skews_aggressive():
    """Wealth persona should have ≥ 50% Aggressive triple."""
    d = ProfileDeriver()
    aggressive = 0
    for i in range(500):
        a = _arch(account_id=f"001xx00000W{i:05d}", persona="wealth", income_band="hnw")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["FinServ__RiskTolerance__c"] == "Aggressive":
            aggressive += 1
    assert aggressive >= 250


def test_borrowing_history_is_picklist_value():
    d = ProfileDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__BorrowingHistory__c"] in (
        "Excellent", "Good", "Fair", "Poor", "None"
    )


def test_deriver_is_deterministic():
    d = ProfileDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
