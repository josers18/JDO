"""Tests for Phase 0 pre-flight."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from customer_hydration.preflight import PreflightCache, run_preflight


def _describe_with_fields(*field_names: str) -> dict:
    return {"fields": [{"name": n} for n in field_names]}


class TestPreflightCache:
    def test_known_fields_returns_describe_field_set(self):
        cache = PreflightCache(
            field_sets={"Account": {"Id", "Name", "External_ID__c"}}
        )
        assert cache.known_fields("Account") == {"Id", "Name", "External_ID__c"}

    def test_known_fields_raises_for_unknown_object(self):
        cache = PreflightCache(field_sets={})
        with pytest.raises(KeyError, match="Account"):
            cache.known_fields("Account")

    def test_drop_unknown_fields_keeps_only_known_columns(self):
        cache = PreflightCache(
            field_sets={"Account": {"Name", "External_ID__c"}}
        )
        rows = [
            {"Name": "Alice", "External_ID__c": "HYDRATE-RT-1", "GhostField__c": "x"},
            {"Name": "Bob", "External_ID__c": "HYDRATE-RT-2", "GhostField__c": "y"},
        ]
        result, dropped = cache.drop_unknown_fields(rows, "Account")
        assert dropped == {"GhostField__c"}
        assert all("GhostField__c" not in r for r in result)
        assert all("Name" in r and "External_ID__c" in r for r in result)


class TestRunPreflight:
    def test_describes_each_requested_object_once(self):
        runner = MagicMock()
        runner.describe.side_effect = lambda obj: _describe_with_fields("Id", "Name", f"{obj}_marker__c")
        cache = run_preflight(runner, ["Account", "Contact"])
        assert runner.describe.call_count == 2
        assert cache.known_fields("Account") == {"Id", "Name", "Account_marker__c"}
        assert cache.known_fields("Contact") == {"Id", "Name", "Contact_marker__c"}

    def test_returns_empty_set_when_describe_returns_no_fields(self):
        runner = MagicMock()
        runner.describe.return_value = {"fields": []}
        cache = run_preflight(runner, ["Account"])
        assert cache.known_fields("Account") == set()
