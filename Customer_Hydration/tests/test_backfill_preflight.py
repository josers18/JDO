"""Tests for the Phase 4d writability preflight."""
from unittest.mock import MagicMock

import pytest

from customer_hydration.backfill.preflight import find_unwritable_fields


def _describe_payload(fields: list[dict]) -> dict:
    """Wrap a list of field-describe dicts in the shape SfRunner.describe returns."""
    return {"fields": fields}


def test_find_unwritable_returns_empty_when_all_updateable():
    """Healthy case: every candidate field has updateable=True."""
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "Tier__c", "updateable": True},
        {"name": "FinServ__CreditScore__c", "updateable": True},
    ])
    out = find_unwritable_fields(sf, "Account", ["Tier__c", "FinServ__CreditScore__c"])
    assert out == set()


def test_find_unwritable_catches_formula_fields():
    """A field with updateable=False is flagged as unwritable."""
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "Tier__c", "updateable": True},
        {"name": "FinServ__LengthOfRelationship__c", "updateable": False},
    ])
    out = find_unwritable_fields(
        sf, "Account",
        ["Tier__c", "FinServ__LengthOfRelationship__c"],
    )
    assert out == {"FinServ__LengthOfRelationship__c"}


def test_find_unwritable_only_returns_candidates_not_full_set():
    """Fields not in candidate_fields are never returned even if unwritable."""
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "Tier__c", "updateable": True},
        {"name": "FinServ__LengthOfRelationship__c", "updateable": False},
        {"name": "SomeOtherFormula__c", "updateable": False},  # not a candidate
    ])
    out = find_unwritable_fields(sf, "Account", ["Tier__c", "FinServ__LengthOfRelationship__c"])
    assert out == {"FinServ__LengthOfRelationship__c"}
    assert "SomeOtherFormula__c" not in out


def test_find_unwritable_handles_empty_candidates():
    """Empty input → empty output (no describe call needed)."""
    sf = MagicMock()
    out = find_unwritable_fields(sf, "Account", [])
    assert out == set()
    sf.describe.assert_not_called()


def test_find_unwritable_handles_describe_failure_gracefully():
    """If describe raises, return empty set + log warning. Don't crash the run."""
    sf = MagicMock()
    sf.describe.side_effect = RuntimeError("sf describe failed")
    out = find_unwritable_fields(sf, "Account", ["Tier__c"])
    assert out == set()


def test_find_unwritable_handles_describe_payload_in_result_wrapper():
    """sf CLI sometimes wraps describe payload in {'result': {...}}."""
    sf = MagicMock()
    sf.describe.return_value = {"result": {"fields": [
        {"name": "Tier__c", "updateable": True},
        {"name": "FinServ__BillingAddress__pc", "updateable": False},
    ]}}
    out = find_unwritable_fields(sf, "Account", ["Tier__c", "FinServ__BillingAddress__pc"])
    assert out == {"FinServ__BillingAddress__pc"}


def test_find_unwritable_treats_missing_updateable_as_writable():
    """Defensive: if `updateable` key is missing, default to writable (don't drop)."""
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "Tier__c"},  # no updateable key
    ])
    out = find_unwritable_fields(sf, "Account", ["Tier__c"])
    assert out == set()


def test_numeric_field_constraints_returns_precision_scale_pairs():
    """numeric_field_constraints reads precision+scale from describe payload."""
    from customer_hydration.backfill.preflight import numeric_field_constraints
    from unittest.mock import MagicMock
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "DNB_Failure_Score__c", "type": "double",
         "precision": 3, "scale": 0},
        {"name": "FinServ__CreditScore__c", "type": "double",
         "precision": 18, "scale": 0},
        {"name": "Tier__c", "type": "picklist"},  # not numeric
    ])
    out = numeric_field_constraints(
        sf, "Account",
        ["DNB_Failure_Score__c", "FinServ__CreditScore__c", "Tier__c"],
    )
    assert out == {
        "DNB_Failure_Score__c": (3, 0),
        "FinServ__CreditScore__c": (18, 0),
    }
    assert "Tier__c" not in out


def test_value_exceeds_field_range_for_jdo_dnb_failure():
    """DNB_Failure_Score__c precision=3 scale=0 → max 999. The deriver
    generates 1001-1610, all of which exceed the org's range."""
    from customer_hydration.backfill.preflight import value_exceeds_field_range
    assert value_exceeds_field_range(1610, (3, 0)) is True
    assert value_exceeds_field_range(1001, (3, 0)) is True
    assert value_exceeds_field_range(999, (3, 0)) is False
    assert value_exceeds_field_range(0, (3, 0)) is False
    # None passes through
    assert value_exceeds_field_range(None, (3, 0)) is False
    # Strings (from misformed delta) pass through
    assert value_exceeds_field_range("not a number", (3, 0)) is False


def test_find_unwritable_drops_fields_not_in_describe():
    """If a candidate field isn't in the org's describe at all (e.g.,
    Cust360_Contact_Picture_URL__pc doesn't exist on jdo-uqj0jr), it's
    treated as unwritable so the orchestrator strips it before bulk submit."""
    from unittest.mock import MagicMock
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "Tier__c", "updateable": True},
    ])
    out = find_unwritable_fields(
        sf, "Account",
        ["Tier__c", "Cust360_Contact_Picture_URL__pc", "FinServ__SomeMissingField__pc"],
    )
    assert "Cust360_Contact_Picture_URL__pc" in out
    assert "FinServ__SomeMissingField__pc" in out
    assert "Tier__c" not in out


def test_find_unwritable_real_jdo_problem_fields():
    """Regression test for the 4 fields that broke the first jdo-uqj0jr live run:
    FinServ__BillingAddress__pc, FinServ__LengthOfRelationship__c,
    FinServ__ShippingAddress__pc, JigsawCompanyId."""
    sf = MagicMock()
    sf.describe.return_value = _describe_payload([
        {"name": "FinServ__BillingAddress__pc", "updateable": False},
        {"name": "FinServ__LengthOfRelationship__c", "updateable": False},
        {"name": "FinServ__ShippingAddress__pc", "updateable": False},
        {"name": "JigsawCompanyId", "updateable": False},
        {"name": "Tier__c", "updateable": True},  # control: writable
    ])
    candidates = [
        "FinServ__BillingAddress__pc",
        "FinServ__LengthOfRelationship__c",
        "FinServ__ShippingAddress__pc",
        "JigsawCompanyId",
        "Tier__c",
    ]
    out = find_unwritable_fields(sf, "Account", candidates)
    assert out == {
        "FinServ__BillingAddress__pc",
        "FinServ__LengthOfRelationship__c",
        "FinServ__ShippingAddress__pc",
        "JigsawCompanyId",
    }
    assert "Tier__c" not in out
