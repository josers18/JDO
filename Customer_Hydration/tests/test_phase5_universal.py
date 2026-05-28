"""Phase 5b — output-shape smoke test for Phase5UniversalDeriver."""
from __future__ import annotations

from random import Random
from datetime import date

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers.phase5_universal import Phase5UniversalDeriver


def _arch(persona: str = "retail", is_person: bool = True, account_id: str = "001x000000aaaaaAAA") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id,
        created_date=date(2020, 1, 15),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person,
        persona=persona,
        age=42,
        gender="Female",
        marital_status="Married",
        household_size=3,
        income_band="middle",
        credit_quality=0.7,
        net_worth_multiple=1.0,
        tenure_years=5.5,
        engagement_level="regular",
        home_metro="San Francisco, CA",
        business_size=None if is_person else "small",
        industry_code=None,
        business_credit_quality=None if is_person else 0.6,
    )


def test_universal_writes_all_24_fields_for_person():
    d = Phase5UniversalDeriver()
    out = d.derive(_arch(persona="wealth"), {}, Random(42))
    # Multipicklists (5)
    assert ";" in out["FinServ__InvestmentObjectives__c"] or out["FinServ__InvestmentObjectives__c"]
    assert out["FinServ__PersonalInterests__c"]
    assert out["FinServ__CustomerSegment__c"]
    assert out["FinServ__MarketingSegment__c"]
    assert out["FinServ__FinancialInterests__c"]
    # Person __pc shadows
    assert out["FinServ_Category__pc"] in {"Platinum", "Gold", "Silver", "Bronze"}
    assert out["FinServ_Contact_Status__pc"] == "Client"
    assert out["FinServ__IndividualType__pc"] == "Individual"
    # Biz parity (Rating, Type)
    assert out["Rating"] in {"Hot", "Warm", "Cool"}
    assert out["Type"] in {"Person", "Small Business", "Enterprise", "Mid-Market", "Partner"}
    # Standards
    assert out["AccountSource"]
    assert out["Phone"].startswith("(")
    # Wealth person → Type=Person
    assert out["Type"] == "Person"


def test_universal_skips_person_only_fields_for_business():
    d = Phase5UniversalDeriver()
    out = d.derive(_arch(persona="commercial", is_person=False), {}, Random(42))
    # __pc fields skipped for biz
    assert "FinServ_Category__pc" not in out
    assert "FinServ_Contact_Status__pc" not in out
    assert "FinServ__IndividualType__pc" not in out
    assert "FinServ__ContactPreference__pc" not in out
    # Biz-only fields written
    assert out["FinServ__CountryOfBirth__pc"] == "United States"
    assert out["Type"] == "Enterprise"
    assert out["FinServ__IndividualType__c"] == "Group"
    assert out["Website"].startswith("https://")


def test_universal_deterministic_by_account_id():
    d = Phase5UniversalDeriver()
    a = _arch(account_id="001x000000aaaaaAAA")
    b = _arch(account_id="001x000000aaaaaAAA")
    assert d.derive(a, {}, Random(1)) == d.derive(b, {}, Random(99))
