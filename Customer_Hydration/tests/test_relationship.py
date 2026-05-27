"""Unit tests for the relationship deriver (rules 4, 5, 6, 7, 8)."""
from datetime import date, timedelta
from random import Random

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.relationship import RelationshipDeriver


def make_archetype(
    *,
    persona: str = "retail",
    is_person: bool = True,
    age: int = 45,
    income_band: str = "middle",
    tenure_years: float = 5.0,
    engagement_level: str = "regular",
    created_date: date = date(2020, 1, 1),
    record_type: str = "FSC Person Accounts",
    account_id: str = "001xx000000ABC",
) -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=created_date,
        record_type=record_type, is_person=is_person, persona=persona,
        age=age, gender="Male", marital_status="Single",
        household_size=1, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=tenure_years, engagement_level=engagement_level,
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = RelationshipDeriver()
    assert d.name == "relationship"
    assert "FinServ__RelationshipStartDate__c" in d.fields
    assert "FinServ__KYCStatus__c" in d.fields
    assert "FinServ__LifetimeValue__c" in d.fields


def test_applies_to_returns_true_for_any_archetype_with_created_date():
    """Relationship fields apply to every account with a CreatedDate."""
    d = RelationshipDeriver()
    person = make_archetype()
    biz = make_archetype(is_person=False, persona="commercial",
                          record_type="Business")
    assert d.applies_to(person) is True
    assert d.applies_to(biz) is True


def test_rule_4_relationship_start_equals_created_date():
    """Rule 4: RelationshipStartDate = CreatedDate exactly."""
    d = RelationshipDeriver()
    a = make_archetype(created_date=date(2018, 4, 12))
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__RelationshipStartDate__c"] == "2018-04-12"


def test_length_of_relationship_matches_tenure_years():
    """LengthOfRelationship == archetype.tenure_years (rounded)."""
    d = RelationshipDeriver()
    a = make_archetype(tenure_years=11.3)
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__LengthOfRelationship__c"] == pytest.approx(11.3, abs=0.05)


def test_rule_5_kyc_date_after_relationship_start():
    """Rule 5: KYCDate ∈ [RelationshipStartDate, today] for 100 archetypes."""
    d = RelationshipDeriver()
    today = date.today()
    for i in range(100):
        a = make_archetype(
            account_id=f"001xx000000{i:06d}",
            created_date=date(2018, 1, 1),
        )
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        kyc = date.fromisoformat(out["FinServ__KYCDate__c"])
        assert a.created_date <= kyc <= today


def test_rule_6_kyc_status_distribution_skews_with_engagement():
    """Rule 6: dormant→approved ~60%, heavy→approved ~98%.

    Plan 4d hotfix (2026-05-27): the YAML now uses jdo-uqj0jr's actual KYC
    picklist values (Completed - Valid / In progress / Overdue) — semantically
    equivalent to the spec's Approved/Pending/Expired but the org's vocabulary.
    The deriver's _KYC_WEIGHTS_BY_ENGAGEMENT[level] is a 3-element weight tuple
    that weighted_pick zips with the YAML's 3-element values list in order.
    """
    d = RelationshipDeriver()
    APPROVED, PENDING, EXPIRED = "Completed - Valid", "In progress", "Overdue"
    dormant_counts = {APPROVED: 0, PENDING: 0, EXPIRED: 0}
    heavy_counts = {APPROVED: 0, PENDING: 0, EXPIRED: 0}
    for i in range(1000):
        ad = make_archetype(
            account_id=f"001xx000DOR{i:05d}",
            engagement_level="dormant",
        )
        ah = make_archetype(
            account_id=f"001xx000HVY{i:05d}",
            engagement_level="heavy",
        )
        d_out = d.derive(ad, {"Id": ad.account_id}, seeded_rng(ad.account_id))
        h_out = d.derive(ah, {"Id": ah.account_id}, seeded_rng(ah.account_id))
        dormant_counts[d_out["FinServ__KYCStatus__c"]] += 1
        heavy_counts[h_out["FinServ__KYCStatus__c"]] += 1
    # dormant: 60% Approved expected, allow [50, 70]
    assert 500 <= dormant_counts[APPROVED] <= 700
    # heavy: 98% Approved expected, allow [950, 1000]
    assert heavy_counts[APPROVED] >= 950
    # heavy never produces Expired
    assert heavy_counts[EXPIRED] == 0


def test_rule_7_lifetime_value_formula():
    """LifetimeValue = AnnualIncome × tenure_years × engagement_mult × tier_mult.
    heavy/Diamond = 0.30; dormant/Bronze = 0.02."""
    d = RelationshipDeriver()
    a_heavy = make_archetype(
        income_band="uhnw",  # → Diamond tier
        tenure_years=10.0,
        engagement_level="heavy",
    )
    record = {"Id": a_heavy.account_id, "FinServ__AnnualIncome__pc": 2_000_000}
    out_heavy = d.derive(a_heavy, record, seeded_rng(a_heavy.account_id))
    # Expected: 2_000_000 × 10 × 0.30 = $6M
    assert out_heavy["FinServ__LifetimeValue__c"] == pytest.approx(6_000_000, rel=0.01)

    a_dormant = make_archetype(
        income_band="entry",  # → Bronze tier
        tenure_years=2.0,
        engagement_level="dormant",
    )
    record = {"Id": a_dormant.account_id, "FinServ__AnnualIncome__pc": 30_000}
    out_dormant = d.derive(a_dormant, record, seeded_rng(a_dormant.account_id))
    # Expected: 30_000 × 2 × 0.02 = $1,200
    assert out_dormant["FinServ__LifetimeValue__c"] == pytest.approx(1_200, rel=0.01)


def test_lifetime_value_handles_missing_income():
    """If AnnualIncome is null, LifetimeValue is null too (don't write garbage)."""
    d = RelationshipDeriver()
    a = make_archetype()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out.get("FinServ__LifetimeValue__c") is None


def test_rule_8_next_review_cadence_by_tier():
    """Rule 8: Diamond:30d, Platinum:60d, Gold:90d, Silver:180d, Bronze:365d."""
    d = RelationshipDeriver()
    today = date.today()
    cases = [
        ("uhnw", 30),       # Diamond
        ("hnw", 60),        # Platinum
        ("affluent", 90),   # Gold
        ("middle", 180),    # Silver
        ("entry", 365),     # Bronze
    ]
    for band, days in cases:
        a = make_archetype(income_band=band)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        review = date.fromisoformat(out["FinServ__NextReview__c"])
        assert review == today + timedelta(days=days), \
            f"income_band={band} expected today+{days}d"


def test_last_interaction_topoff_only_when_null():
    """LastInteraction is a top-off field. Only fill if record value is null."""
    d = RelationshipDeriver()
    a = make_archetype(engagement_level="regular")
    # Record already has LastInteraction → deriver should NOT propose a value
    record = {"Id": a.account_id, "FinServ__LastInteraction__c": "2025-12-01"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    assert "FinServ__LastInteraction__c" not in out

    # Record has null → deriver proposes a date in the recent past
    record_null = {"Id": a.account_id, "FinServ__LastInteraction__c": None}
    out_null = d.derive(a, record_null, seeded_rng(a.account_id))
    li = date.fromisoformat(out_null["FinServ__LastInteraction__c"])
    today = date.today()
    assert (today - li).days <= 365


def test_deriver_is_deterministic():
    """Same archetype + same rng seed → identical output."""
    d = RelationshipDeriver()
    a = make_archetype()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
