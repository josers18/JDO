"""Tests for customer_hydration.derivers._helpers."""
import pytest
from customer_hydration.derivers._helpers import seeded_rng, weighted_pick, income_band, business_size


def test_seeded_rng_returns_random_instance():
    rng = seeded_rng("001xx000000ABC")
    assert hasattr(rng, "random")
    assert hasattr(rng, "gauss")


def test_seeded_rng_is_deterministic():
    """Same account_id must produce identical RNG sequence across calls."""
    rng1 = seeded_rng("001xx000000ABC")
    rng2 = seeded_rng("001xx000000ABC")
    seq1 = [rng1.random() for _ in range(10)]
    seq2 = [rng2.random() for _ in range(10)]
    assert seq1 == seq2


def test_seeded_rng_differs_per_id():
    """Different account_ids produce different sequences (with high probability)."""
    rng1 = seeded_rng("001xx000000ABC")
    rng2 = seeded_rng("001xx000000XYZ")
    seq1 = [rng1.random() for _ in range(5)]
    seq2 = [rng2.random() for _ in range(5)]
    assert seq1 != seq2


def test_weighted_pick_returns_value_from_list():
    rng = seeded_rng("test_pick_1")
    result = weighted_pick(rng, ["A", "B", "C"], [0.5, 0.3, 0.2])
    assert result in ("A", "B", "C")


def test_weighted_pick_is_deterministic():
    rng1 = seeded_rng("test_pick_2")
    rng2 = seeded_rng("test_pick_2")
    r1 = weighted_pick(rng1, ["X", "Y", "Z"], [0.1, 0.5, 0.4])
    r2 = weighted_pick(rng2, ["X", "Y", "Z"], [0.1, 0.5, 0.4])
    assert r1 == r2


def test_weighted_pick_respects_weights_at_scale():
    """Heavily-weighted value should dominate across many draws."""
    rng = seeded_rng("test_pick_3")
    counts = {"A": 0, "B": 0}
    for _ in range(1000):
        result = weighted_pick(rng, ["A", "B"], [0.95, 0.05])
        counts[result] += 1
    assert counts["A"] > 800
    assert counts["B"] < 200


def test_weighted_pick_rejects_mismatched_lengths():
    rng = seeded_rng("test_pick_4")
    with pytest.raises(ValueError):
        weighted_pick(rng, ["A", "B"], [0.5, 0.3, 0.2])


def test_weighted_pick_rejects_empty():
    rng = seeded_rng("test_pick_5")
    with pytest.raises(ValueError):
        weighted_pick(rng, [], [])


def test_income_band_thresholds():
    """Spec §4.1 step 4: entry < $50k, middle < $150k, affluent < $400k, hnw < $1M, uhnw ≥ $1M."""
    assert income_band(25_000) == "entry"
    assert income_band(49_999) == "entry"
    assert income_band(50_000) == "middle"
    assert income_band(80_000) == "middle"
    assert income_band(149_999) == "middle"
    assert income_band(150_000) == "affluent"
    assert income_band(250_000) == "affluent"
    assert income_band(399_999) == "affluent"
    assert income_band(400_000) == "hnw"
    assert income_band(750_000) == "hnw"
    assert income_band(999_999) == "hnw"
    assert income_band(1_000_000) == "uhnw"
    assert income_band(50_000_000) == "uhnw"


def test_income_band_handles_none():
    assert income_band(None) == "entry"


def test_business_size_thresholds():
    """Spec §4.1 step 4: micro < $1M, small < $10M, mid < $100M, large < $1B, enterprise ≥ $1B."""
    assert business_size(50_000) == "micro"
    assert business_size(999_999) == "micro"
    assert business_size(1_000_000) == "small"
    assert business_size(9_999_999) == "small"
    assert business_size(10_000_000) == "mid"
    assert business_size(99_999_999) == "mid"
    assert business_size(100_000_000) == "large"
    assert business_size(999_999_999) == "large"
    assert business_size(1_000_000_000) == "enterprise"
    assert business_size(50_000_000_000) == "enterprise"


def test_business_size_handles_none():
    assert business_size(None) == "micro"


def test_deriver_protocol_imports():
    """Sanity: the Protocol class is importable."""
    from customer_hydration.derivers._base import Deriver

    assert Deriver is not None
    assert hasattr(Deriver, "name") or "name" in Deriver.__annotations__


from customer_hydration.derivers._pairs import PAIRED_FIELDS, paired_partner


def test_paired_fields_is_list_of_tuples():
    assert isinstance(PAIRED_FIELDS, list)
    for pair in PAIRED_FIELDS:
        assert isinstance(pair, tuple)
        assert len(pair) == 2


def test_paired_fields_contains_credit_pair():
    assert ("FinServ__CreditScore__c", "FinServ__CreditRating__c") in PAIRED_FIELDS


def test_paired_partner_returns_other_field():
    assert paired_partner("FinServ__CreditScore__c") == "FinServ__CreditRating__c"
    assert paired_partner("FinServ__CreditRating__c") == "FinServ__CreditScore__c"


def test_paired_partner_returns_none_when_not_paired():
    assert paired_partner("Industry") is None


def test_read_paired_value_returns_own_when_populated():
    from customer_hydration.derivers._pairs import read_paired_value

    record = {"FinServ__CreditScore__c": 720, "FinServ__CreditRating__c": None}
    assert read_paired_value(record, "FinServ__CreditScore__c") == (
        "FinServ__CreditScore__c",
        720,
    )


def test_read_paired_value_returns_partner_when_only_partner_populated():
    from customer_hydration.derivers._pairs import read_paired_value

    record = {"FinServ__CreditScore__c": None, "FinServ__CreditRating__c": "Good"}
    assert read_paired_value(record, "FinServ__CreditScore__c") == (
        "FinServ__CreditRating__c",
        "Good",
    )


def test_read_paired_value_returns_none_when_both_null():
    from customer_hydration.derivers._pairs import read_paired_value

    record = {"FinServ__CreditScore__c": None, "FinServ__CreditRating__c": None}
    assert read_paired_value(record, "FinServ__CreditScore__c") is None


def test_read_paired_value_returns_none_when_field_unpaired():
    from customer_hydration.derivers._pairs import read_paired_value

    record = {"Industry": "Banking"}
    assert read_paired_value(record, "Industry") is None


from datetime import date

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._registry import Registry


def test_registry_starts_empty():
    r = Registry()
    assert r.derivers == []


def test_registry_register_and_run():
    r = Registry()

    class FakeDeriver:
        name = "fake"
        fields = ["X"]

        def applies_to(self, archetype):
            return True

        def derive(self, archetype, record, rng):
            return {"X": 1}

    r.register(FakeDeriver())
    archetype = PersonaArchetype(
        account_id="001x", created_date=date(2020, 1, 1),
        record_type="x", is_person=True, persona="retail",
        age=30, gender="Male", marital_status="Single", household_size=1,
        income_band="middle", credit_quality=0.5, net_worth_multiple=1.0,
        tenure_years=5.0, engagement_level="regular", home_metro="X, Y",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    rng = seeded_rng("001x")
    out = r.run(archetype, {"Id": "001x"}, rng)
    assert out == {"X": 1}


def test_registry_skips_non_applicable_deriver():
    r = Registry()

    class SkipDeriver:
        name = "skip"
        fields = ["Y"]

        def applies_to(self, archetype):
            return False

        def derive(self, archetype, record, rng):
            return {"Y": 2}

    r.register(SkipDeriver())
    archetype = PersonaArchetype(
        account_id="001x", created_date=date(2020, 1, 1),
        record_type="x", is_person=True, persona="retail",
        age=30, gender="Male", marital_status="Single", household_size=1,
        income_band="middle", credit_quality=0.5, net_worth_multiple=1.0,
        tenure_years=5.0, engagement_level="regular", home_metro="X, Y",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    rng = seeded_rng("001x")
    out = r.run(archetype, {"Id": "001x"}, rng)
    assert out == {}


from customer_hydration.derivers._helpers import load_picklist_yaml


def test_load_picklist_yaml_returns_values_and_weights():
    entry = load_picklist_yaml("FinServ__KYCStatus__c")
    assert entry["values"] == ["Approved", "Pending", "Expired"]
    assert entry["weights"] == [0.90, 0.08, 0.02]


def test_load_picklist_yaml_returns_none_when_missing():
    assert load_picklist_yaml("Some__NonExistent__c") is None


def test_load_picklist_yaml_loads_all_eight_phase_4b_fields():
    expected = [
        "FinServ__KYCStatus__c",
        "FinServ__HomeOwnership__pc",
        "Tier__c",
        "FinServ__ServiceModel__c",
        "FinServ__CustomerType__c",
        "FinServ__Status__c",
        "FinServ__RiskTolerance__c",
        "FinServ__BorrowingHistory__c",
    ]
    for field in expected:
        entry = load_picklist_yaml(field)
        assert entry is not None, f"{field} missing from backfill_picklists.yaml"
        assert "values" in entry
        assert "weights" in entry
        assert len(entry["values"]) == len(entry["weights"])
