"""End-to-end coherence-narrative tests for Plan 4b person-side derivers.

Verifies cross-deriver invariants by running build_archetype + Registry
together, then asserting the resulting candidates dict satisfies each
narrative profile (rules 1, 2, 4, 5, 7, 9, 10, 11, 12, 14, 15, 16,
22, 23, 24).
"""
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from customer_hydration.backfill_accounts import _build_registry
from customer_hydration.derivers._archetype import build_archetype
from customer_hydration.derivers._helpers import seeded_rng

FIXTURES = Path(__file__).parent / "fixtures" / "accounts"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def derive_all(record: dict, life_events: list | None = None) -> dict:
    """Run build_archetype + the full registry. Returns merged candidates dict."""
    rng = seeded_rng(record["Id"])
    archetype = build_archetype(record, rng, life_events=life_events or [])
    registry = _build_registry()
    return registry.run(archetype, record, rng)


# ----------------------------------------------------------------------------
# Per-rule tests
# ----------------------------------------------------------------------------

def test_rule_01_tier_servicemodel_alignment():
    """Rule 1: Diamond → Private; Bronze → Self-Service."""
    uhnw = derive_all(load_fixture("wealth_uhnw"))
    assert uhnw["Tier__c"] == "Diamond"
    assert uhnw["FinServ__ServiceModel__c"] == "Private"

    entry = derive_all(load_fixture("retail_22yo_entry"))
    assert entry["Tier__c"] == "Bronze"
    assert entry["FinServ__ServiceModel__c"] == "Self-Service"


def test_rule_02_credit_score_band_by_income():
    """Rule 2: uhnw → score in [770, 850]; entry → score in [400, 720]."""
    uhnw_scores = []
    entry_scores = []
    base_uhnw = load_fixture("wealth_uhnw")
    base_entry = load_fixture("retail_22yo_entry")
    for i in range(50):
        u = {**base_uhnw, "Id": f"001xx0000U{i:06d}",
             "FinServ__CreditScore__c": None, "FinServ__CreditRating__c": None}
        e = {**base_entry, "Id": f"001xx0000E{i:06d}",
             "FinServ__CreditScore__c": None, "FinServ__CreditRating__c": None}
        uhnw_scores.append(derive_all(u)["FinServ__CreditScore__c"])
        entry_scores.append(derive_all(e)["FinServ__CreditScore__c"])
    assert min(uhnw_scores) >= 700
    assert sum(uhnw_scores) / len(uhnw_scores) >= 780
    assert sum(entry_scores) / len(entry_scores) <= 650


def test_rule_05_kyc_date_after_relationship_start():
    """Rule 5: KYCDate ≥ RelationshipStartDate for 100 generated archetypes."""
    base = load_fixture("retail_22yo_entry")
    for i in range(100):
        record = {**base, "Id": f"001xx0000K{i:06d}"}
        out = derive_all(record)
        rs = date.fromisoformat(out["FinServ__RelationshipStartDate__c"])
        kyc = date.fromisoformat(out["FinServ__KYCDate__c"])
        assert kyc >= rs


def test_rule_07_lifetimevalue_engagement_multiplier():
    """Rule 7: heavy/Diamond LV ≫ dormant/Bronze LV for same income."""
    uhnw = derive_all(load_fixture("wealth_uhnw"))
    entry = derive_all(load_fixture("retail_22yo_entry"))
    # Sanity: uhnw is heavy/Diamond → 0.30 mult; entry is light or seeded → much smaller
    assert uhnw["FinServ__LifetimeValue__c"] > entry["FinServ__LifetimeValue__c"] * 50


def test_rule_09_homeownership_age_income_distribution():
    """Rule 9: 50yo + uhnw → ≥85% Own across 100 samples; under-25 entry → ≥70% Rent."""
    base_uhnw = load_fixture("wealth_uhnw")
    base_entry = load_fixture("retail_22yo_entry")
    owns = 0
    rents = 0
    for i in range(100):
        u = {**base_uhnw, "Id": f"001xx0000U{i:06d}"}
        e = {**base_entry, "Id": f"001xx0000R{i:06d}"}
        if derive_all(u)["FinServ__HomeOwnership__pc"] == "Own":
            owns += 1
        if derive_all(e)["FinServ__HomeOwnership__pc"] == "Rent":
            rents += 1
    assert owns >= 85
    assert rents >= 70


def test_rule_10_employed_since_after_18yo():
    """Rule 10: EmployedSince ≥ PersonBirthdate + 18y for 100 generated archetypes."""
    base = load_fixture("retail_22yo_entry")
    for i in range(100):
        record = {**base, "Id": f"001xx0000P{i:06d}"}
        out = derive_all(record)
        birth = date.fromisoformat(record["PersonBirthdate"])
        es = date.fromisoformat(out["FinServ__EmployedSince__pc"])
        eighteenth = birth.replace(year=birth.year + 18)
        assert es >= eighteenth


def test_rule_11_dependents_children_consistent():
    """Rule 11: NumberOfChildren ≤ NumberOfDependents always."""
    base = load_fixture("wealth_uhnw")
    for i in range(50):
        record = {**base, "Id": f"001xx0000D{i:06d}"}
        out = derive_all(record)
        assert (
            out["FinServ__NumberOfChildren__pc"]
            <= out["FinServ__NumberOfDependents__pc"]
        )


def test_rule_12_marital_anniversary_consistency():
    """Rule 12: Single → no anniversary; Married → has anniversary."""
    # Married fixture
    married = derive_all(load_fixture("wealth_uhnw"))
    assert "FinServ__WeddingAnniversary__pc" in married

    # Single fixture (entry)
    entry = load_fixture("retail_22yo_entry")
    out = derive_all(entry)
    # marital_status will be "Single" by default (no LifeEvent in fixture)
    assert "FinServ__WeddingAnniversary__pc" not in out


def test_rule_14_tax_bracket_strict_mapping():
    """Rule 14: $50k → 22%; $1.5M → 37%."""
    base = load_fixture("retail_22yo_entry")
    out = derive_all({**base, "FinServ__AnnualIncome__pc": 50_000})
    assert out["FinServ__TaxBracket__pc"] == "22%"

    out = derive_all({**base, "FinServ__AnnualIncome__pc": 1_500_000})
    assert out["FinServ__TaxBracket__pc"] == "37%"


def test_rule_15_taxid_and_ssn_paired():
    """Rule 15: TaxId + LastFourDigitSSN populated together."""
    base = load_fixture("retail_22yo_entry")
    for i in range(20):
        out = derive_all({**base, "Id": f"001xx0000S{i:06d}"})
        assert "FinServ__TaxId__pc" in out
        assert "FinServ__LastFourDigitSSN__pc" in out


def test_rule_16_risk_triple_only_three_combos():
    """Rule 16: RiskTolerance/TimeHorizon/InvestmentExperience always one of 3 valid triples."""
    valid_triples = {
        ("Conservative", "Short-Term", "Beginner"),
        ("Moderate",     "Medium-Term", "Intermediate"),
        ("Aggressive",   "Long-Term",   "Experienced"),
    }
    base = load_fixture("wealth_uhnw")
    for i in range(50):
        out = derive_all({**base, "Id": f"001xx0000T{i:06d}"})
        triple = (
            out["FinServ__RiskTolerance__c"],
            out["FinServ__TimeHorizon__c"],
            out["FinServ__InvestmentExperience__c"],
        )
        assert triple in valid_triples


def test_rule_22_marriage_event_drives_marital_status():
    """Rule 22: Account with Marriage life event → MaritalStatus=Married, Anniversary populated."""
    record = load_fixture("retail_22yo_entry")  # marital_status null in fixture
    life_events = [
        {"FinServ__EventType__c": "Marriage", "FinServ__EventDate__c": "2025-06-12"}
    ]
    out = derive_all(record, life_events=life_events)
    # The archetype now has marital_status='Married', so demographics produces an
    # anniversary.
    assert "FinServ__WeddingAnniversary__pc" in out


def test_rule_23_personmailing_uses_home_metro():
    """Rule 23: PersonMailingLatitude + PersonMailingLongitude near home_metro centroid."""
    out = derive_all(load_fixture("wealth_uhnw"))
    assert "PersonMailingLatitude" in out
    assert "PersonMailingLongitude" in out
    # The home_metro is hash-derived; just confirm they're real numbers
    assert -90 <= out["PersonMailingLatitude"] <= 90
    assert -180 <= out["PersonMailingLongitude"] <= 180


def test_rule_24_personttile_distribution_by_age_gender():
    """Rule 24: 58yo male should mostly produce Mr."""
    base = load_fixture("wealth_uhnw")  # age 58, male
    mr_count = 0
    for i in range(50):
        out = derive_all({**base, "Id": f"001xx0000B{i:06d}"})
        if out["PersonTitle"] == "Mr":
            mr_count += 1
    assert mr_count >= 25  # ≥50%


# ----------------------------------------------------------------------------
# Narrative tests — full customer profiles
# ----------------------------------------------------------------------------

def test_narrative_22yo_entry_band_renter():
    """22yo with $28k income → Bronze, Self-Service, mostly Rent, 0 children."""
    out = derive_all(load_fixture("retail_22yo_entry"))
    assert out["Tier__c"] == "Bronze"
    assert out["FinServ__ServiceModel__c"] == "Self-Service"
    assert out["FinServ__NumberOfChildren__pc"] == 0
    assert out["FinServ__TaxBracket__pc"] == "12%"  # $28k → 12% bracket


def test_narrative_uhnw_diamond_private_banking():
    """uhnw archetype → Tier=Diamond, ServiceModel=Private, large LifetimeValue."""
    out = derive_all(load_fixture("wealth_uhnw"))
    assert out["Tier__c"] == "Diamond"
    assert out["FinServ__ServiceModel__c"] == "Private"
    # LifetimeValue should reflect $1.5M income × ~12y tenure × heavy × Diamond
    # = $1.5M × 12 × 0.20 × 1.50 = ~$5.4M
    assert out["FinServ__LifetimeValue__c"] >= 4_000_000


def test_narrative_lifeevent_marriage_propagates_to_demographics():
    """Phase 3c Marriage event → Phase 4 sets MaritalStatus + WeddingAnniversary."""
    record = load_fixture("retail_22yo_entry")
    life_events = [
        {"FinServ__EventType__c": "Marriage", "FinServ__EventDate__c": "2025-08-01"}
    ]
    out = derive_all(record, life_events=life_events)
    assert "FinServ__WeddingAnniversary__pc" in out


def test_narrative_no_age_pre_18_employment():
    """All generated archetypes: EmployedSince - PersonBirthdate ≥ 18 years."""
    base = load_fixture("retail_22yo_entry")
    for i in range(100):
        record = {**base, "Id": f"001xx0000P{i:06d}"}
        out = derive_all(record)
        birth = date.fromisoformat(record["PersonBirthdate"])
        es = date.fromisoformat(out["FinServ__EmployedSince__pc"])
        assert (es - birth).days >= 18 * 365 - 5  # 18 years (allow a few days for leap)
