"""Tests for the PartyProfile generator (Plan 4 / Task 6)."""
from __future__ import annotations

import pytest

from customer_hydration.native.party_profile import (
    PartyProfileBundle,
    generate_party_profiles,
)


def _person_account(
    ext_id: str = "HYDRATE-RT-000001",
    *,
    first: str = "Alice",
    last: str = "Smith",
) -> dict:
    return {
        "FirstName": first,
        "LastName": last,
        "External_ID__c": ext_id,
    }


@pytest.fixture
def four_person_accounts() -> list[dict]:
    return [
        _person_account("HYDRATE-RT-000001", first="Alice", last="Smith"),
        _person_account("HYDRATE-RT-000002", first="Bob", last="Smith"),
        _person_account("HYDRATE-WL-000001", first="Carol", last="Jones"),
        _person_account("HYDRATE-WL-000002", first="Dan", last="Garcia"),
    ]


class TestGeneratePartyProfiles:
    def test_generates_profile_per_person_account(
        self,
        four_person_accounts: list[dict],
    ) -> None:
        bundle = generate_party_profiles(
            person_account_rows=four_person_accounts,
            business_contact_rows=[],
            household_membership_map={},
        )
        assert isinstance(bundle, PartyProfileBundle)
        assert len(bundle.rows) == 4

    def test_household_account_id_set_when_member(
        self,
        four_person_accounts: list[dict],
    ) -> None:
        membership = {
            "HYDRATE-RT-000001": "HYDRATE-HH-000001",
            "HYDRATE-RT-000002": "HYDRATE-HH-000001",
        }
        bundle = generate_party_profiles(
            person_account_rows=four_person_accounts,
            business_contact_rows=[],
            household_membership_map=membership,
        )
        assert bundle.rows[0]["HouseholdAccountId"] == "RESOLVE:HYDRATE-HH-000001"
        assert bundle.rows[1]["HouseholdAccountId"] == "RESOLVE:HYDRATE-HH-000001"

    def test_household_account_id_null_when_not_member(
        self,
        four_person_accounts: list[dict],
    ) -> None:
        membership = {
            "HYDRATE-RT-000001": "HYDRATE-HH-000001",
            # 000002 NOT in membership map
        }
        bundle = generate_party_profiles(
            person_account_rows=four_person_accounts,
            business_contact_rows=[],
            household_membership_map=membership,
        )
        # First row is a member -> has HouseholdAccountId
        assert "HouseholdAccountId" in bundle.rows[0]
        # Second row not a member -> no key (or None)
        assert bundle.rows[1].get("HouseholdAccountId") is None

    def test_profile_type_person_for_individuals(
        self,
        four_person_accounts: list[dict],
    ) -> None:
        bundle = generate_party_profiles(
            person_account_rows=four_person_accounts,
            business_contact_rows=[],
            household_membership_map={},
        )
        for row in bundle.rows:
            assert row["ProfileType"] == "Person"

    def test_account_id_uses_resolve_marker(
        self,
        four_person_accounts: list[dict],
    ) -> None:
        bundle = generate_party_profiles(
            person_account_rows=four_person_accounts,
            business_contact_rows=[],
            household_membership_map={},
        )
        assert bundle.rows[0]["AccountId"] == "RESOLVE:HYDRATE-RT-000001"
        assert bundle.rows[2]["AccountId"] == "RESOLVE:HYDRATE-WL-000001"

    def test_status_is_active(
        self,
        four_person_accounts: list[dict],
    ) -> None:
        bundle = generate_party_profiles(
            person_account_rows=four_person_accounts,
            business_contact_rows=[],
            household_membership_map={},
        )
        for row in bundle.rows:
            assert row["Status"] == "Active"
