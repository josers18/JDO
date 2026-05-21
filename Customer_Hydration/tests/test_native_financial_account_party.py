"""Tests for the FinancialAccountParty generator (Plan 4 / Task 8)."""
from __future__ import annotations

import pytest

from customer_hydration.native.financial_account_party import (
    NativeFinancialAccountPartyBundle,
    generate_native_financial_account_parties,
)


def _legacy_role(
    *,
    fa_ext_id: str = "HYDRATE-FA-000001",
    related_account: str | None = "HYDRATE-RT-001",
    related_contact: str | None = None,
    role: str = "Primary Owner",
    far_ext_id: str = "HYDRATE-FAR-000001",
) -> dict:
    """Build a legacy FA-Role row in post-fieldmap shape (matches retail.py)."""
    row: dict = {
        "FinServ__FinancialAccount__c": fa_ext_id,
        "FinServ__Role__c": role,
        "FinServ__Active__c": True,
        "FinServ__StartDate__c": "2024-01-01",
        "External_ID__c": far_ext_id,
    }
    if related_account is not None:
        row["FinServ__RelatedAccount__c"] = related_account
    if related_contact is not None:
        row["FinServ__RelatedContact__c"] = related_contact
    return row


@pytest.fixture
def three_legacy_roles() -> list[dict]:
    return [
        _legacy_role(
            fa_ext_id="HYDRATE-FA-000001",
            related_account="HYDRATE-RT-001",
            far_ext_id="HYDRATE-FAR-000001",
        ),
        _legacy_role(
            fa_ext_id="HYDRATE-FA-000002",
            related_account="HYDRATE-RT-002",
            far_ext_id="HYDRATE-FAR-000002",
        ),
        _legacy_role(
            fa_ext_id="HYDRATE-FA-000003",
            related_account="HYDRATE-HH-000001",
            role="Joint Owner",
            far_ext_id="HYDRATE-FAR-000003",
        ),
    ]


class TestGenerateNativeFinancialAccountParties:
    def test_generates_one_party_per_legacy_role(
        self,
        three_legacy_roles: list[dict],
    ) -> None:
        bundle = generate_native_financial_account_parties(
            legacy_role_rows=three_legacy_roles
        )
        assert isinstance(bundle, NativeFinancialAccountPartyBundle)
        assert len(bundle.rows) == 3

    def test_financial_account_id_uses_native_resolve_marker(
        self,
        three_legacy_roles: list[dict],
    ) -> None:
        bundle = generate_native_financial_account_parties(
            legacy_role_rows=three_legacy_roles
        )
        # Marker prefix must be RESOLVE-NFA: (distinct from the plain
        # RESOLVE: marker used for legacy Account/Contact party Ids).
        assert bundle.rows[0]["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-000001"
        assert bundle.rows[1]["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-000002"
        assert bundle.rows[2]["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-000003"

    def test_account_id_keeps_legacy_resolve_marker(
        self,
        three_legacy_roles: list[dict],
    ) -> None:
        # Party side is RESOLVE: (no -NFA suffix) — resolved via legacy
        # Account/External_ID map.
        bundle = generate_native_financial_account_parties(
            legacy_role_rows=three_legacy_roles
        )
        assert bundle.rows[0]["AccountId"] == "RESOLVE:HYDRATE-RT-001"
        assert bundle.rows[1]["AccountId"] == "RESOLVE:HYDRATE-RT-002"
        assert bundle.rows[2]["AccountId"] == "RESOLVE:HYDRATE-HH-000001"

    def test_role_copied_from_legacy(
        self,
        three_legacy_roles: list[dict],
    ) -> None:
        bundle = generate_native_financial_account_parties(
            legacy_role_rows=three_legacy_roles
        )
        assert bundle.rows[0]["Role"] == "Primary Owner"
        assert bundle.rows[1]["Role"] == "Primary Owner"
        assert bundle.rows[2]["Role"] == "Joint Owner"

    def test_handles_contact_role(self) -> None:
        # When the legacy row has FinServ__RelatedContact__c populated
        # (and no related Account), the native row binds via ContactId.
        legacy = [
            _legacy_role(
                fa_ext_id="HYDRATE-FA-000010",
                related_account=None,
                related_contact="HYDRATE-CT-000005",
                role="Authorized Signer",
                far_ext_id="HYDRATE-FAR-000010",
            )
        ]
        bundle = generate_native_financial_account_parties(legacy_role_rows=legacy)
        assert len(bundle.rows) == 1
        row = bundle.rows[0]
        assert row["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-000010"
        assert row["ContactId"] == "RESOLVE:HYDRATE-CT-000005"
        assert "AccountId" not in row
        assert row["Role"] == "Authorized Signer"

    def test_default_legacy_to_native_map_uses_identity_rename(self) -> None:
        # Without an explicit map the generator must default to a pure
        # HYDRATE-FA-NNN -> HYDRATE-NFA-NNN rename keyed off the same
        # numeric suffix.
        legacy = [
            _legacy_role(fa_ext_id="HYDRATE-FA-042042", far_ext_id="HYDRATE-FAR-1"),
        ]
        bundle = generate_native_financial_account_parties(legacy_role_rows=legacy)
        assert bundle.rows[0]["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-042042"

    def test_explicit_map_overrides_default(self) -> None:
        # When a key is present in the explicit map, the rename uses the
        # mapped value (not the identity rename).
        legacy = [
            _legacy_role(fa_ext_id="HYDRATE-FA-000001", far_ext_id="HYDRATE-FAR-1"),
            _legacy_role(fa_ext_id="HYDRATE-FA-000002", far_ext_id="HYDRATE-FAR-2"),
        ]
        explicit = {
            "HYDRATE-FA-000001": "HYDRATE-NFA-999999",
            # Second entry intentionally absent — should fall back to identity rename.
        }
        bundle = generate_native_financial_account_parties(
            legacy_role_rows=legacy,
            legacy_fa_to_native_fa=explicit,
        )
        assert bundle.rows[0]["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-999999"
        assert bundle.rows[1]["FinancialAccountId"] == "RESOLVE-NFA:HYDRATE-NFA-000002"
