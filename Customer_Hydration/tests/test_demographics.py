"""Unit tests for demographics deriver (rules 9, 10, 11, 12, 14, 15)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.demographics import DemographicsDeriver


def _arch(*, age=40, income_band="middle", marital_status="Single",
          household_size=1, gender="Male", is_person=True,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona="retail",
        age=age, gender=gender, marital_status=marital_status,
        household_size=household_size, income_band=income_band,
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = DemographicsDeriver()
    assert d.name == "demographics"
    assert "FinServ__HomeOwnership__pc" in d.fields
    assert "FinServ__TaxBracket__pc" in d.fields
    assert "FinServ__TaxId__pc" in d.fields


def test_applies_to_returns_false_for_business():
    d = DemographicsDeriver()
    assert d.applies_to(_arch(is_person=False)) is False


def test_applies_to_returns_true_for_person():
    d = DemographicsDeriver()
    assert d.applies_to(_arch(is_person=True)) is True


def test_rule_9_homeownership_under_25_skews_rent():
    """Rule 9: under 25 → {Rent 80, Own 15, Other 5}."""
    d = DemographicsDeriver()
    rents = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000Y{i:06d}", age=22, income_band="entry")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["FinServ__HomeOwnership__pc"] == "Rent":
            rents += 1
    assert rents >= 350  # ≥70% Rent expected


def test_rule_9_homeownership_50_affluent_skews_own():
    """Rule 9: 40+ + affluent+ → {Own 92, Rent 5, Other 3}."""
    d = DemographicsDeriver()
    owns = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000O{i:06d}", age=55, income_band="hnw")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["FinServ__HomeOwnership__pc"] == "Own":
            owns += 1
    assert owns >= 420  # ≥84% Own expected


def test_rule_10_employed_since_after_age_18():
    """Rule 10: EmployedSince ≥ today − age + 18 years (clipped before write)."""
    d = DemographicsDeriver()
    today = date.today()
    for i in range(100):
        a = _arch(account_id=f"001xx0000E{i:06d}", age=22)
        record = {
            "Id": a.account_id,
            "PersonBirthdate": (today.replace(year=today.year - a.age)).isoformat(),
        }
        out = d.derive(a, record, seeded_rng(a.account_id))
        es = date.fromisoformat(out["FinServ__EmployedSince__pc"])
        # Birthdate + 18y is the floor
        birth = date.fromisoformat(record["PersonBirthdate"])
        eighteenth_birthday = birth.replace(year=birth.year + 18)
        assert es >= eighteenth_birthday


def test_rule_11_dependents_within_household_bound():
    """Rule 11: NumberOfDependents ∈ [0, household_size − 1]."""
    d = DemographicsDeriver()
    a = _arch(household_size=4)
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    deps = out["FinServ__NumberOfDependents__pc"]
    assert 0 <= deps <= 3  # household_size - 1


def test_rule_11_children_at_most_dependents():
    """Rule 11: NumberOfChildren ≤ NumberOfDependents."""
    d = DemographicsDeriver()
    for i in range(50):
        a = _arch(account_id=f"001xx0000C{i:06d}", household_size=4)
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        assert (
            out["FinServ__NumberOfChildren__pc"]
            <= out["FinServ__NumberOfDependents__pc"]
        )


def test_rule_12_single_has_no_anniversary():
    """Rule 12: MaritalStatus=Single → WeddingAnniversary null (not in delta)."""
    d = DemographicsDeriver()
    a = _arch(marital_status="Single")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__WeddingAnniversary__pc" not in out


def test_rule_12_married_has_anniversary():
    """Rule 12: MaritalStatus=Married → WeddingAnniversary populated."""
    d = DemographicsDeriver()
    a = _arch(marital_status="Married")
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__WeddingAnniversary__pc" in out
    # Sanity: anniversary should be a real date
    date.fromisoformat(out["FinServ__WeddingAnniversary__pc"])


def test_rule_14_tax_bracket_strict_from_income():
    """Rule 14: TaxBracket strict mapping from AnnualIncome (no rng)."""
    d = DemographicsDeriver()
    cases = [
        (10_000,    "10%"),
        (50_000,    "22%"),
        (200_000,   "32%"),
        (500_000,   "35%"),
        (1_500_000, "37%"),
    ]
    for income, expected in cases:
        a = _arch()
        out = d.derive(
            a, {"Id": a.account_id, "FinServ__AnnualIncome__pc": income},
            seeded_rng(a.account_id),
        )
        assert out["FinServ__TaxBracket__pc"] == expected, f"income={income}"


def test_rule_15_tax_id_and_ssn_paired():
    """Rule 15: TaxId__pc + LastFourDigitSSN__pc always populated together."""
    d = DemographicsDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__TaxId__pc" in out
    assert "FinServ__LastFourDigitSSN__pc" in out
    # Last-four SSN must be a 4-digit string
    assert len(out["FinServ__LastFourDigitSSN__pc"]) == 4


def test_tax_id_deterministic_per_account():
    """Same account_id → same TaxId, last4 across runs."""
    d = DemographicsDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1["FinServ__TaxId__pc"] == out2["FinServ__TaxId__pc"]
    assert (
        out1["FinServ__LastFourDigitSSN__pc"]
        == out2["FinServ__LastFourDigitSSN__pc"]
    )


def test_communication_preferences_present():
    d = DemographicsDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert "FinServ__ContactPreference__pc" in out


def test_country_of_residence_default_us():
    d = DemographicsDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out["FinServ__CountryOfResidence__pc"] == "United States"
