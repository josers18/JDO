"""Tests for build_archetype — the coherence layer (spec §4.1)."""
import json
from datetime import date
from pathlib import Path

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype, build_archetype
from customer_hydration.derivers._helpers import seeded_rng

FIXTURES = Path(__file__).parent / "fixtures" / "accounts"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def test_persona_archetype_is_frozen_dataclass():
    """Archetype must be immutable so derivers can't mutate it accidentally."""
    a = PersonaArchetype(
        account_id="001xx000000ABC",
        created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts",
        is_person=True,
        persona="retail",
        age=45,
        gender="Male",
        marital_status="Single",
        household_size=1,
        income_band="middle",
        credit_quality=0.7,
        net_worth_multiple=2.5,
        tenure_years=5.0,
        engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None,
        industry_code=None,
        business_credit_quality=None,
    )
    with pytest.raises(Exception):  # FrozenInstanceError
        a.age = 99


def test_build_archetype_reads_anchors_from_record():
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])

    assert a.account_id == "001xx000000RTL01"
    assert a.created_date == date(2018, 4, 12)
    assert a.record_type == "FSC Person Accounts"
    assert a.is_person is True
    assert a.persona == "retail"


def test_build_archetype_age_from_birthdate():
    """When PersonBirthdate is present, age is computed deterministically."""
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    # 1971-08-23 → age 54 as of 2026-05-26 (today varies in real run; pin via reference_date if needed)
    assert 54 <= a.age <= 55


def test_build_archetype_marital_status_from_existing_field():
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    assert a.marital_status == "Married"


def test_build_archetype_household_size_includes_self_plus_dependents():
    """Spec rule 11: household_size = 1 + max(NumberOfDependents, marital_implied)."""
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    # NumberOfDependents=2 → household_size=3
    assert a.household_size == 3


def test_build_archetype_income_band_for_retail():
    record = load_fixture("retail_55yo_affluent")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])
    # AnnualIncome=$250k → affluent band
    assert a.income_band == "affluent"


def test_build_archetype_business_branch():
    """Business accounts get business_size + industry_code; person fields are defaults."""
    record = load_fixture("business_mid_size")
    rng = seeded_rng(record["Id"])
    a = build_archetype(record, rng, life_events=[])

    assert a.is_person is False
    assert a.persona == "commercial"
    assert a.business_size == "mid"
    assert a.industry_code is not None  # 'Banking' → some NAICS code
    assert a.business_credit_quality is not None
    assert 0.0 <= a.business_credit_quality <= 1.0
