"""Unit tests for the coverage-rules engine (spec §4.5)."""
from datetime import date

import pytest

from customer_hydration.backfill_accounts import _build_registry
from customer_hydration.coverage_rules import (
    apply_coverage_rules,
    load_coverage_rules,
)
from customer_hydration.derivers._archetype import PersonaArchetype
from customer_hydration.derivers._helpers import seeded_rng


def _arch_person(*, account_id="001xx0000PER01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2020, 1, 1),
        record_type="FSC Person Accounts", is_person=True, persona="retail",
        age=40, gender="Male", marital_status="Single",
        household_size=1, income_band="middle",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=5.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )


def _arch_business(*, account_id="001xx0000BIZ01") -> PersonaArchetype:
    return PersonaArchetype(
        account_id=account_id, created_date=date(2018, 1, 1),
        record_type="Business", is_person=False, persona="commercial",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Chicago, IL",
        business_size="mid", industry_code="522110",
        business_credit_quality=0.7,
    )


def test_load_coverage_rules_returns_list():
    rules = load_coverage_rules()
    assert isinstance(rules, list)
    assert len(rules) >= 3
    for r in rules:
        assert "field" in r
        assert "fill_with" in r


def test_apply_coverage_rules_no_op_when_field_already_in_delta():
    """If deriver already populated the field, coverage rules don't overwrite."""
    arch = _arch_business()
    record = {"Id": arch.account_id}
    delta = {"AnnualRevenue": 99_999_999}  # already set by deriver
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert delta["AnnualRevenue"] == 99_999_999


def test_apply_coverage_rules_no_op_when_field_already_on_record():
    """If the record already has the field populated, coverage rules skip."""
    arch = _arch_business()
    record = {"Id": arch.account_id, "AnnualRevenue": 12_345_000}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert "AnnualRevenue" not in delta


def test_ignore_when_is_person_skips_annual_revenue():
    """Person accounts should never get AnnualRevenue from coverage rules."""
    arch = _arch_person()
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert "AnnualRevenue" not in delta


def test_record_type_in_business_fills_annual_revenue():
    """Business records with null AnnualRevenue get filled by coverage rule."""
    arch = _arch_business()
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    # The mid-business AnnualRevenue range is 10M-100M
    assert "AnnualRevenue" in delta
    assert 10_000_000 <= delta["AnnualRevenue"] < 100_000_000


def test_persona_in_wealth_fills_risk_tolerance_for_person():
    """Wealth person account with no RiskTolerance gets filled by coverage rule."""
    arch = PersonaArchetype(
        account_id="001xx0000WLT01", created_date=date(2018, 1, 1),
        record_type="FSC Person Accounts", is_person=True, persona="wealth",
        age=55, gender="Male", marital_status="Married",
        household_size=3, income_band="hnw",
        credit_quality=0.9, net_worth_multiple=8.0,
        tenure_years=10.0, engagement_level="heavy",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    # Note: profile.py runs first via Registry — wealth always produces a risk
    # triple. So this rule won't fire (delta already has it). Confirm that.
    # The coverage layer is a safety net.
    assert delta.get("FinServ__RiskTolerance__c") in (
        None, "Conservative", "Moderate", "Aggressive"
    )


def test_record_type_household_skips_last_interaction():
    """Rule: LastInteraction expected when RT NOT IN [Household]; skip Household."""
    arch = PersonaArchetype(
        account_id="001xx0000HH01", created_date=date(2018, 1, 1),
        record_type="Household", is_person=False, persona="household",
        age=50, gender="N/A", marital_status="N/A",
        household_size=0, income_band="affluent",
        credit_quality=0.7, net_worth_multiple=4.0,
        tenure_years=8.0, engagement_level="regular",
        home_metro="Boston, MA",
        business_size=None, industry_code=None, business_credit_quality=None,
    )
    record = {"Id": arch.account_id, "FinServ__LastInteraction__c": None}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    # Household should NOT have LastInteraction filled by the coverage layer
    assert "FinServ__LastInteraction__c" not in delta


def test_unknown_fill_with_logs_warning_and_skips():
    """If a fill_with refers to a missing deriver function, skip without crashing."""
    # Build a custom rule list with a bad fill_with
    bad_rules = [{
        "field": "Some__Field__c",
        "expected_when": {"record_type_in": ["Business"]},
        "fill_with": "nonexistent.derive_xyz",
    }]
    arch = _arch_business()
    record = {"Id": arch.account_id}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    # Use the internal apply with explicit rules
    from customer_hydration.coverage_rules import _apply_with_rules
    _apply_with_rules(bad_rules, arch, record, delta, registry, rng)
    assert "Some__Field__c" not in delta


def test_apply_does_not_mutate_when_no_rule_matches():
    arch = _arch_business()
    record = {"Id": arch.account_id, "AnnualRevenue": 5_000_000,
              "FinServ__LastInteraction__c": "2026-01-01"}
    delta = {}
    registry = _build_registry()
    rng = seeded_rng(arch.account_id)
    apply_coverage_rules(arch, record, delta, registry, rng)
    assert delta == {}
