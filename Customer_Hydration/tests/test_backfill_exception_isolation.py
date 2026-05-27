"""Tests for per-deriver exception isolation (spec §6.2 row 'Deriver raises exception')."""
from datetime import date

import pytest

from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers._registry import Registry


def _arch() -> PersonaArchetype:
    return PersonaArchetype(
        account_id="001xx000000ABC", created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts", is_person=True, persona="retail",
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


class _GoodDeriver:
    name = "good"
    fields = ["GoodField__c"]

    def applies_to(self, archetype):
        return True

    def derive(self, archetype, record, rng):
        return {"GoodField__c": "good"}


class _BadDeriver:
    name = "bad"
    fields = ["BadField__c"]

    def applies_to(self, archetype):
        return True

    def derive(self, archetype, record, rng):
        raise ValueError("simulated deriver crash")


def test_one_bad_deriver_does_not_block_good_derivers():
    """Registry.run continues past a bad deriver and still produces good output."""
    r = Registry()
    r.register(_BadDeriver())
    r.register(_GoodDeriver())
    out = r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    # The good deriver's output is still in the candidates dict
    assert out.get("GoodField__c") == "good"
    # The bad deriver did NOT add anything
    assert "BadField__c" not in out


def test_registry_records_errors_per_deriver():
    """Bad deriver failures are captured on registry.errors."""
    r = Registry()
    r.register(_BadDeriver())
    r.register(_GoodDeriver())
    out = r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    # Errors list has one entry for the bad deriver
    errors = r.errors
    assert len(errors) == 1
    assert errors[0]["deriver"] == "bad"
    assert errors[0]["account_id"] == "001xx000000ABC"
    assert "ValueError" in errors[0]["exception"]


def test_errors_clear_between_runs():
    """Registry.errors should not accumulate across rows. Resets on each run() call."""
    r = Registry()
    r.register(_BadDeriver())
    r.run(_arch(), {"Id": "001xx0001"}, seeded_rng("a"))
    assert len(r.errors) == 1
    r.run(_arch(), {"Id": "001xx0002"}, seeded_rng("b"))
    # After the second run, errors list should reflect the second run only
    assert len(r.errors) == 1
    assert r.errors[0]["account_id"] == "001xx000000ABC"  # archetype's id


def test_no_errors_when_all_derivers_succeed():
    """Healthy derivers leave registry.errors empty."""
    r = Registry()
    r.register(_GoodDeriver())
    r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    assert r.errors == []


def test_applies_to_exception_also_isolated():
    """A bug in applies_to (not just derive) should also be caught."""
    r = Registry()

    class _BrokenAppliesTo:
        name = "broken"
        fields = ["X"]

        def applies_to(self, archetype):
            raise RuntimeError("applies_to crashed")

        def derive(self, archetype, record, rng):
            return {"X": 1}

    r.register(_BrokenAppliesTo())
    r.register(_GoodDeriver())
    out = r.run(_arch(), {"Id": "001xx"}, seeded_rng("001xx"))
    # GoodDeriver still ran
    assert out.get("GoodField__c") == "good"
    # The broken deriver's failure was captured
    assert any(e["deriver"] == "broken" for e in r.errors)
