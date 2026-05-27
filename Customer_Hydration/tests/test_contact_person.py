"""Unit tests for the person-side of contact deriver (rule 24)."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers.contact import ContactDeriver


def _arch(*, age=40, gender="Male", is_person=True,
          account_id="001xx000000ABC") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts" if is_person else "Business",
        is_person=is_person, persona="retail",
        age=age, gender=gender, marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def test_deriver_metadata():
    d = ContactDeriver()
    assert d.name == "contact"
    assert "MiddleName" in d.fields
    assert "PersonTitle" in d.fields
    assert "AccountNumber" in d.fields


def test_applies_to_person_only_in_4b():
    d = ContactDeriver()
    assert d.applies_to(_arch(is_person=True)) is True
    # Plan 4b: returns False for business (Plan 4c will extend).
    assert d.applies_to(_arch(is_person=False)) is False


def test_middle_name_is_single_letter():
    d = ContactDeriver()
    a = _arch()
    out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert len(out["MiddleName"]) == 1
    assert out["MiddleName"].isalpha()


def test_rule_24_under_30_female_skews_ms():
    """Rule 24: under 30 + female → {Ms 70, Miss 25, Dr 5}."""
    d = ContactDeriver()
    ms_count = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000F{i:06d}", age=25, gender="Female")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["PersonTitle"] == "Ms":
            ms_count += 1
    assert ms_count >= 300  # ≥60% Ms expected


def test_rule_24_50plus_male_skews_mr():
    """Rule 24: 50+ + male → {Mr 60, Dr 25, Sr 10, Hon 5}."""
    d = ContactDeriver()
    mr_count = 0
    for i in range(500):
        a = _arch(account_id=f"001xx0000M{i:06d}", age=58, gender="Male")
        out = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
        if out["PersonTitle"] == "Mr":
            mr_count += 1
    assert mr_count >= 250  # ≥50% Mr expected


def test_account_number_is_formatted():
    """AccountNumber = formatted from External_ID__c (numeric or hash-based)."""
    d = ContactDeriver()
    a = _arch()
    record = {"Id": a.account_id, "External_ID__c": "HYDRATE-RTL-000123"}
    out = d.derive(a, record, seeded_rng(a.account_id))
    # Account number should be a non-empty string
    assert isinstance(out["AccountNumber"], str)
    assert len(out["AccountNumber"]) >= 6


def test_description_topoff_skipped_when_already_populated():
    """Description is a top-off — only fill if record is null."""
    d = ContactDeriver()
    a = _arch()
    # With existing description
    out_existing = d.derive(
        a, {"Id": a.account_id, "Description": "Existing customer note"},
        seeded_rng(a.account_id),
    )
    assert "Description" not in out_existing

    # With null description
    out_null = d.derive(
        a, {"Id": a.account_id, "Description": None},
        seeded_rng(a.account_id),
    )
    assert "Description" in out_null
    assert isinstance(out_null["Description"], str)


def test_deriver_is_deterministic():
    d = ContactDeriver()
    a = _arch()
    out1 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    out2 = d.derive(a, {"Id": a.account_id}, seeded_rng(a.account_id))
    assert out1 == out2
