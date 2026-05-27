"""Unit tests for credit_personal deriver (rules 2, 3)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.credit_personal import CreditPersonalDeriver


def _arch(*, income_band="middle", is_person=True, persona="retail",
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona=persona,
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = CreditPersonalDeriver()
    assert d.name == "credit_personal"
    assert d.fields == ["FinServ__CreditScore__c", "FinServ__CreditRating__c"]


def test_applies_to_person_account_returns_true():
    d = CreditPersonalDeriver()
    assert d.applies_to(_arch(is_person=True)) is True


def test_applies_to_business_account_returns_false():
    """Business credit lives in credit_bureau, not credit_personal."""
    d = CreditPersonalDeriver()
    assert d.applies_to(_arch(is_person=False, persona="commercial")) is False


def test_rule_2_credit_score_in_fico_range():
    """All scores must be 300–850 across 1000 archetypes."""
    d = CreditPersonalDeriver()
    for i in range(1000):
        a = _arch(account_id=f"001xx00000F{i:05d}")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert 300 <= out["FinServ__CreditScore__c"] <= 850


def test_rule_2_score_distribution_shifts_with_income_band():
    """Higher income bands → higher mean credit score."""
    d = CreditPersonalDeriver()
    entry_scores = []
    uhnw_scores = []
    for i in range(500):
        a_entry = _arch(account_id=f"001xx00000E{i:05d}", income_band="entry")
        a_uhnw = _arch(account_id=f"001xx00000U{i:05d}", income_band="uhnw")
        entry_scores.append(
            d.derive(a_entry, {"Id": a_entry.account_id},
                     seeded_rng(a_entry.account_id))["FinServ__CreditScore__c"]
        )
        uhnw_scores.append(
            d.derive(a_uhnw, {"Id": a_uhnw.account_id},
                     seeded_rng(a_uhnw.account_id))["FinServ__CreditScore__c"]
        )
    entry_mean = sum(entry_scores) / len(entry_scores)
    uhnw_mean = sum(uhnw_scores) / len(uhnw_scores)
    # entry band centered around 580; uhnw around 810
    assert 540 <= entry_mean <= 620
    assert 780 <= uhnw_mean <= 840


def test_rule_3_rating_derives_from_score_buckets():
    """<580=Poor, <670=Fair, <740=Good, <800=Very Good, ≥800=Excellent."""
    from customer_hydration.derivers.credit_personal import _rating_from_score
    assert _rating_from_score(500) == "Poor"
    assert _rating_from_score(579) == "Poor"
    assert _rating_from_score(580) == "Fair"
    assert _rating_from_score(669) == "Fair"
    assert _rating_from_score(670) == "Good"
    assert _rating_from_score(739) == "Good"
    assert _rating_from_score(740) == "Very Good"
    assert _rating_from_score(799) == "Very Good"
    assert _rating_from_score(800) == "Excellent"
    assert _rating_from_score(850) == "Excellent"


def test_rule_3_paired_fill_uses_existing_score():
    """If record already has CreditScore, derive Rating from it (not from rng)."""
    d = CreditPersonalDeriver()
    a = _arch()
    record = {
        "Id": a.account_id,
        "FinServ__CreditScore__c": 720,
        "FinServ__CreditRating__c": None,
    }
    out = d.derive(a, record, seeded_rng(a.account_id))
    # 720 → Good band
    assert out["FinServ__CreditRating__c"] == "Good"
    # Don't propose a CreditScore for a record that already has one
    assert "FinServ__CreditScore__c" not in out


def test_rule_3_paired_fill_uses_existing_rating():
    """If record already has Rating, derive Score (median of the band)."""
    d = CreditPersonalDeriver()
    a = _arch()
    record = {
        "Id": a.account_id,
        "FinServ__CreditScore__c": None,
        "FinServ__CreditRating__c": "Good",
    }
    out = d.derive(a, record, seeded_rng(a.account_id))
    # Good band is [670, 740) → median 705
    assert 670 <= out["FinServ__CreditScore__c"] < 740
    # Don't propose a Rating for a record that already has one
    assert "FinServ__CreditRating__c" not in out


def test_deriver_is_deterministic():
    d = CreditPersonalDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
