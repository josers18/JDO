"""Unit tests for credit_bureau deriver (rule 17).

All bureau scores derive from one archetype.business_credit_quality latent.
Positive correlation: PAYDEX, Delinquency, Intelliscore, Equifax Credit Risk.
Inverse correlation: DNB Failure, Equifax Failure.
"""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.credit_bureau import CreditBureauDeriver


def _arch(*, business_credit_quality=0.7, is_person=False, persona="commercial",
          business_size="mid", account_id="001xx000000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2017, 1, 15),
        record_type="Business" if not is_person else "FSC Person Accounts",
        is_person=is_person, persona=persona,
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=business_size, industry_code="522110",
        business_credit_quality=business_credit_quality,
    )


def test_deriver_metadata():
    d = CreditBureauDeriver()
    assert d.name == "credit_bureau"
    assert "DNB_PAYDEX_Score__c" in d.fields
    assert "Equifax_Credit_Risk_Score__c" in d.fields
    assert "INS_FEIN_Tax_ID__c" in d.fields


def test_applies_to_business_returns_true():
    d = CreditBureauDeriver()
    assert d.applies_to(_arch(is_person=False)) is True


def test_applies_to_person_returns_false():
    """Person accounts use credit_personal, not credit_bureau."""
    d = CreditBureauDeriver()
    assert d.applies_to(_arch(is_person=True)) is False


def test_paydex_in_range_1_to_100():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000P{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 1 <= out["DNB_PAYDEX_Score__c"] <= 100


def test_delinquency_in_range_101_to_670():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000D{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 101 <= out["DNB_Delinquency_Score__c"] <= 670


def test_failure_in_range_1001_to_1610():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000F{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 1001 <= out["DNB_Failure_Score__c"] <= 1610


def test_intelliscore_in_range_1_to_100():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000I{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 1 <= out["Experian_Intelliscore__c"] <= 100


def test_equifax_credit_risk_in_range_101_to_992():
    d = CreditBureauDeriver()
    for i in range(200):
        a = _arch(account_id=f"001xx00000Q{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 101 <= out["Equifax_Credit_Risk_Score__c"] <= 992


def test_rule_17_paydex_positively_correlates_with_credit_quality():
    """High business_credit_quality → high PAYDEX (≥75 mean across 100 samples)."""
    d = CreditBureauDeriver()
    high_paydex = []
    low_paydex = []
    for i in range(100):
        a_high = _arch(account_id=f"001xx0000H{i:05d}", business_credit_quality=0.95)
        a_low = _arch(account_id=f"001xx0000L{i:05d}", business_credit_quality=0.10)
        high_paydex.append(
            d.derive(a_high, {"Id": a_high.account_id},
                     seeded_rng(a_high.account_id))["DNB_PAYDEX_Score__c"]
        )
        low_paydex.append(
            d.derive(a_low, {"Id": a_low.account_id},
                     seeded_rng(a_low.account_id))["DNB_PAYDEX_Score__c"]
        )
    assert sum(high_paydex) / len(high_paydex) >= 75
    assert sum(low_paydex) / len(low_paydex) <= 30


def test_rule_17_failure_score_inversely_correlates_with_credit_quality():
    """High business_credit_quality → LOW failure score; vice versa."""
    d = CreditBureauDeriver()
    high_failure = []  # produced by HIGH credit_quality (should be low values)
    low_failure = []   # produced by LOW credit_quality (should be high values)
    for i in range(100):
        a_high = _arch(account_id=f"001xx0000HF{i:04d}", business_credit_quality=0.95)
        a_low = _arch(account_id=f"001xx0000LF{i:04d}", business_credit_quality=0.10)
        high_failure.append(
            d.derive(a_high, {"Id": a_high.account_id},
                     seeded_rng(a_high.account_id))["DNB_Failure_Score__c"]
        )
        low_failure.append(
            d.derive(a_low, {"Id": a_low.account_id},
                     seeded_rng(a_low.account_id))["DNB_Failure_Score__c"]
        )
    # high credit_quality → low failure score (closer to 1001)
    # low credit_quality → high failure score (closer to 1610)
    assert sum(high_failure) / len(high_failure) <= 1200
    assert sum(low_failure) / len(low_failure) >= 1450


def test_fein_is_nine_digit_string():
    d = CreditBureauDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    fein = out["INS_FEIN_Tax_ID__c"]
    assert len(fein) == 9
    assert fein.isdigit()


def test_fein_is_deterministic_per_account():
    d = CreditBureauDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1["INS_FEIN_Tax_ID__c"] == out2["INS_FEIN_Tax_ID__c"]


def test_fitch_rating_is_known_grade():
    d = CreditBureauDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["Fitch_Rating__c"] in (
        "AAA", "AA", "A", "BBB", "BB", "B", "CCC"
    )
    assert out["Fitch_Category__c"] in ("Investment Grade", "Speculative")


def test_deriver_is_deterministic():
    d = CreditBureauDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
