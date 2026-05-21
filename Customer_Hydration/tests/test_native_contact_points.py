"""Tests for the ContactPoint* generator (Plan 4 / Task 7)."""
from __future__ import annotations

import pytest

from customer_hydration.native.contact_points import (
    ContactPointBundle,
    generate_contact_points,
)


def _person_account(
    ext_id: str = "HYDRATE-RT-000001",
    *,
    first: str = "Alice",
    last: str = "Smith",
    street: str = "123 Main St",
    city: str = "Austin",
    state: str = "TX",
    postal: str = "78701",
    country: str = "US",
    email: str = "alice@example.com",
    phone: str = "+1-512-555-0100",
) -> dict:
    return {
        "FirstName": first,
        "LastName": last,
        "PersonMailingStreet": street,
        "PersonMailingCity": city,
        "PersonMailingState": state,
        "PersonMailingPostalCode": postal,
        "PersonMailingCountry": country,
        "PersonEmail": email,
        "PersonHomePhone": phone,
        "External_ID__c": ext_id,
    }


@pytest.fixture
def two_person_accounts() -> list[dict]:
    return [
        _person_account("HYDRATE-RT-000001"),
        _person_account(
            "HYDRATE-RT-000002",
            first="Bob",
            last="Smith",
            street="456 Oak Ave",
            city="Dallas",
            state="TX",
            postal="75201",
            email="bob@example.com",
            phone="+1-214-555-0101",
        ),
    ]


class TestGenerateContactPoints:
    def test_emits_one_address_per_person_account(
        self,
        two_person_accounts: list[dict],
    ) -> None:
        bundle = generate_contact_points(
            person_account_rows=two_person_accounts,
            business_contact_rows=[],
        )
        assert isinstance(bundle, ContactPointBundle)
        assert len(bundle.addresses) == 2

    def test_emits_one_email_per_person_account(
        self,
        two_person_accounts: list[dict],
    ) -> None:
        bundle = generate_contact_points(
            person_account_rows=two_person_accounts,
            business_contact_rows=[],
        )
        assert len(bundle.emails) == 2

    def test_emits_one_phone_per_person_account(
        self,
        two_person_accounts: list[dict],
    ) -> None:
        bundle = generate_contact_points(
            person_account_rows=two_person_accounts,
            business_contact_rows=[],
        )
        assert len(bundle.phones) == 2

    def test_address_fields_copied_from_person_account(
        self,
        two_person_accounts: list[dict],
    ) -> None:
        bundle = generate_contact_points(
            person_account_rows=two_person_accounts,
            business_contact_rows=[],
        )
        addr0 = bundle.addresses[0]
        assert addr0["Street"] == "123 Main St"
        assert addr0["City"] == "Austin"
        assert addr0["State"] == "TX"
        assert addr0["PostalCode"] == "78701"
        assert addr0["Country"] == "US"
        assert addr0["IsPrimary"] is True

    def test_email_address_copied(
        self,
        two_person_accounts: list[dict],
    ) -> None:
        bundle = generate_contact_points(
            person_account_rows=two_person_accounts,
            business_contact_rows=[],
        )
        assert bundle.emails[0]["EmailAddress"] == "alice@example.com"
        assert bundle.emails[1]["EmailAddress"] == "bob@example.com"
        for email in bundle.emails:
            assert email["IsPrimary"] is True

    def test_parent_id_uses_resolve_marker(
        self,
        two_person_accounts: list[dict],
    ) -> None:
        bundle = generate_contact_points(
            person_account_rows=two_person_accounts,
            business_contact_rows=[],
        )
        assert bundle.addresses[0]["ParentId"] == "RESOLVE:HYDRATE-RT-000001"
        assert bundle.emails[0]["ParentId"] == "RESOLVE:HYDRATE-RT-000001"
        assert bundle.phones[0]["ParentId"] == "RESOLVE:HYDRATE-RT-000001"
        assert bundle.addresses[1]["ParentId"] == "RESOLVE:HYDRATE-RT-000002"
