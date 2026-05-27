"""Tests for the Phase 4d post-derive value translator."""
import pytest

from customer_hydration.backfill.value_translator import (
    translate_delta,
    translation_summary,
)


def test_translates_known_picklist_value():
    """Tier=Diamond → A per the YAML mapping."""
    out = translate_delta({"Tier__c": "Diamond"})
    assert out["Tier__c"] == "A"


def test_passes_through_unmapped_field():
    """Fields without a YAML rule are unchanged."""
    out = translate_delta({"FinServ__CreditScore__c": 720})
    assert out["FinServ__CreditScore__c"] == 720


def test_passes_through_unmapped_value():
    """A field with rules but a value not in those rules is unchanged."""
    out = translate_delta({"Tier__c": "SomeOrgSpecificTierValue"})
    assert out["Tier__c"] == "SomeOrgSpecificTierValue"


def test_does_not_translate_non_string_values():
    """Numeric values (e.g., currency) pass through even when the field
    has translation rules. Translation is for picklist strings only."""
    out = translate_delta({"FinServ__CreditScore__c": 720, "Tier__c": "Bronze"})
    assert out["FinServ__CreditScore__c"] == 720
    assert out["Tier__c"] == "C"


def test_translates_multiple_fields_in_one_call():
    out = translate_delta({
        "Tier__c": "Platinum",
        "FinServ__ServiceModel__c": "Premier",
        "FinServ__CustomerType__c": "Individual",
    })
    assert out["Tier__c"] == "A"
    assert out["FinServ__ServiceModel__c"] == "Tier 1"
    assert out["FinServ__CustomerType__c"] == "Relational"


def test_does_not_mutate_input():
    """translate_delta returns a new dict; input is unchanged."""
    delta = {"Tier__c": "Diamond"}
    out = translate_delta(delta)
    assert delta == {"Tier__c": "Diamond"}  # original unchanged
    assert out == {"Tier__c": "A"}


def test_handles_empty_delta():
    assert translate_delta({}) == {}


def test_translation_summary_contains_known_fields():
    """The summary helper exposes which fields have translation rules."""
    summary = translation_summary()
    assert "Tier__c" in summary
    assert "FinServ__ServiceModel__c" in summary
    assert "Diamond" in summary["Tier__c"]


def test_real_jdo_translations():
    """Regression test: every spec-output value seen in the jdo-uqj0jr live
    run that the org rejected should now translate to a valid org value."""
    rejected = {
        "Tier__c": ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
        "FinServ__ServiceModel__c": ["Self-Service", "Standard", "Premier", "Private"],
        "FinServ__CustomerType__c": ["Individual", "Business", "Trust"],
    }
    for field, values in rejected.items():
        for v in values:
            out = translate_delta({field: v})
            # Every value must translate to *something*
            assert out.get(field) is not None, f"{field}={v} dropped to None"
            # And the translated value must NOT be the original (since the
            # original was rejected by the org)
            assert out[field] != v, f"{field}={v} still passes through unchanged"
