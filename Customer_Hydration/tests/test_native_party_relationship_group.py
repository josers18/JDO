"""Tests for the PartyRelationshipGroup generator (Plan 4 / Task 5)."""
from __future__ import annotations

import pytest

from customer_hydration.native.party_relationship_group import (
    PartyRelationshipGroupBundle,
    generate_party_relationship_groups,
)


def _household(
    ext_id: str = "HYDRATE-HH-000001",
    *,
    surname: str = "Smith",
    description: str = "Household group for the Smith family. Members: 2.",
) -> dict:
    return {
        "Name": f"{surname} Household",
        "RecordTypeId": "012000000000001",
        "Type": "Household",
        "Industry": "Personal",
        "FinServ__ClientCategory__c": "Household",
        "Description": description,
        "External_ID__c": ext_id,
        "FinServ__SourceSystemId__c": ext_id,
    }


@pytest.fixture
def three_households() -> list[dict]:
    return [
        _household("HYDRATE-HH-000001", surname="Smith"),
        _household("HYDRATE-HH-000002", surname="Jones"),
        _household("HYDRATE-HH-000003", surname="Garcia"),
    ]


class TestGeneratePartyRelationshipGroups:
    def test_generates_one_per_household(
        self,
        three_households: list[dict],
    ) -> None:
        bundle = generate_party_relationship_groups(
            household_account_rows=three_households
        )
        assert isinstance(bundle, PartyRelationshipGroupBundle)
        assert len(bundle.rows) == 3

    def test_account_id_uses_resolve_marker(
        self,
        three_households: list[dict],
    ) -> None:
        bundle = generate_party_relationship_groups(
            household_account_rows=three_households
        )
        assert bundle.rows[0]["AccountId"] == "RESOLVE:HYDRATE-HH-000001"
        assert bundle.rows[1]["AccountId"] == "RESOLVE:HYDRATE-HH-000002"
        assert bundle.rows[2]["AccountId"] == "RESOLVE:HYDRATE-HH-000003"

    def test_relationship_group_type_is_household(
        self,
        three_households: list[dict],
    ) -> None:
        bundle = generate_party_relationship_groups(
            household_account_rows=three_households
        )
        for row in bundle.rows:
            assert row["RelationshipGroupType"] == "Household"

    def test_name_copied_from_household(
        self,
        three_households: list[dict],
    ) -> None:
        bundle = generate_party_relationship_groups(
            household_account_rows=three_households
        )
        assert bundle.rows[0]["Name"] == "Smith Household"
        assert bundle.rows[1]["Name"] == "Jones Household"
        assert bundle.rows[2]["Name"] == "Garcia Household"

    def test_description_copied(self) -> None:
        households = [
            _household(
                "HYDRATE-HH-000001",
                surname="Smith",
                description="Custom description for the Smiths.",
            )
        ]
        bundle = generate_party_relationship_groups(
            household_account_rows=households
        )
        assert bundle.rows[0]["Description"] == "Custom description for the Smiths."
