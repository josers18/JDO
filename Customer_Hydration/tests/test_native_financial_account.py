"""Tests for the native FinancialAccount generator (Plan 4 / Task 2).

Verifies the legacy -> native bridge, External_ID prefix scheme,
required-field propagation, and defensive skipping when the legacy id
map is incomplete.
"""
from __future__ import annotations

import pytest

from customer_hydration.native.financial_account import (
    NativeFinancialAccountBundle,
    generate_native_financial_accounts,
)


def _legacy_fa(
    ext_id: str = "HYDRATE-FA-000001",
    *,
    name: str = "Cumulus Everyday Checking - 1234",
    fa_number: str = "****1234",
    fa_type: str = "Deposits",
    status: str = "Open",
    balance: float = 1234.56,
    open_date: str = "2024-03-15",
    interest_rate: float = 0.0001,
    owner_id: str = "005000000000001",
) -> dict:
    """Build a post-fieldmap legacy FA row dict."""
    return {
        "Name": name,
        "FinServ__FinancialAccountNumber__c": fa_number,
        "FinServ__FinancialAccountType__c": fa_type,
        "FinServ__Status__c": status,
        "FinServ__Balance__c": balance,
        "FinServ__OpenDate__c": open_date,
        "FinServ__InterestRate__c": interest_rate,
        "OwnerId": owner_id,
        "External_ID__c": ext_id,
        "FinServ__SourceSystemId__c": ext_id,
    }


@pytest.fixture
def three_legacy_fas() -> list[dict]:
    return [
        _legacy_fa("HYDRATE-FA-000001", name="Checking 1", balance=500.0),
        _legacy_fa("HYDRATE-FA-000002", name="Savings 1", balance=12500.0),
        _legacy_fa("HYDRATE-FA-000003", name="Brokerage 1", balance=87000.0),
    ]


@pytest.fixture
def full_id_map() -> dict[str, str]:
    return {
        "HYDRATE-FA-000001": "a01000000000001",
        "HYDRATE-FA-000002": "a01000000000002",
        "HYDRATE-FA-000003": "a01000000000003",
    }


class TestGenerateNativeFinancialAccounts:
    def test_generates_one_native_per_legacy(
        self,
        three_legacy_fas: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        assert isinstance(bundle, NativeFinancialAccountBundle)
        assert len(bundle.rows) == 3

    def test_legacy_id_field_set_from_id_map(
        self,
        three_legacy_fas: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        assert bundle.rows[0]["LegacyId__c"] == "a01000000000001"
        assert bundle.rows[1]["LegacyId__c"] == "a01000000000002"
        assert bundle.rows[2]["LegacyId__c"] == "a01000000000003"

    def test_external_id_starts_with_nfa_prefix(
        self,
        three_legacy_fas: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        for row in bundle.rows:
            assert row["External_ID__c"].startswith("HYDRATE-NFA-")
        assert bundle.rows[0]["External_ID__c"] == "HYDRATE-NFA-000001"
        assert bundle.rows[2]["External_ID__c"] == "HYDRATE-NFA-000003"

    def test_required_fields_populated(
        self,
        three_legacy_fas: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        row = bundle.rows[0]
        assert row["Name"] == "Checking 1"
        assert row["FinancialAccountNumber"] == "****1234"
        assert row["Type"] == "Deposits"

    def test_balance_copied_from_legacy(
        self,
        three_legacy_fas: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        assert bundle.rows[0]["Balance"] == 500.0
        assert bundle.rows[1]["Balance"] == 12500.0
        assert bundle.rows[2]["Balance"] == 87000.0

    def test_skips_rows_with_unresolved_legacy_id(
        self,
        three_legacy_fas: list[dict],
    ) -> None:
        partial_map = {
            "HYDRATE-FA-000001": "a01000000000001",
            # HYDRATE-FA-000002 deliberately missing
            "HYDRATE-FA-000003": "a01000000000003",
        }
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=partial_map,
        )
        assert len(bundle.rows) == 2
        legacy_ids = {row["LegacyId__c"] for row in bundle.rows}
        assert legacy_ids == {"a01000000000001", "a01000000000003"}

    def test_owner_id_copied(
        self,
        full_id_map: dict[str, str],
    ) -> None:
        legacy = [_legacy_fa("HYDRATE-FA-000001", owner_id="005ABCDEF000001")]
        bundle = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=legacy,
            legacy_id_map={"HYDRATE-FA-000001": "a01000000000001"},
        )
        assert bundle.rows[0]["OwnerId"] == "005ABCDEF000001"

    def test_same_input_produces_identical_output(
        self,
        three_legacy_fas: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        a = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        b = generate_native_financial_accounts(
            starting_seq=1,
            legacy_fa_rows=three_legacy_fas,
            legacy_id_map=full_id_map,
        )
        assert a.rows == b.rows
