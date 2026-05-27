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
