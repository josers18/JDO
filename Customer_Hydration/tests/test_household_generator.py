"""Tests for the Household generator (Plan 2 / Task 8 + Plan 3 / Task 6).

Plan 3 expands scope: the generator now emits BOTH Household Account
rows (RecordType ``IndustriesHousehold``) AND the matching
``AccountContactRelation`` rows that wire each member Person Account to
the household.

The Person Account auto-generated Contact id is not knowable until
member Person Accounts have been loaded into the org — so for every
ACR row we emit a ``ContactId`` of ``RESOLVE:HYDRATE-RT-NNN`` /
``RESOLVE:HYDRATE-WL-NNN``. Plan 3's loader (``id_resolver.py`` from
Task 5) substitutes the real Contact id post-Wave-A using the
``contact_id_by_account_external_id`` map. ``AccountId`` stays as the
plain ``HYDRATE-HH-NNN`` external id; the runner header-rewrites it to
``Account.External_ID__c`` so the bulk API resolves it natively.

These tests pin down:
  - one row per request, sequenced External_ID__c (HYDRATE-HH-{seq:06d})
  - household name, RecordTypeId, ClientCategory wiring
  - description references member count
  - one ACR row per member, with Spouse/Dependent role assignment
  - ACR ContactId carries the ``RESOLVE:`` marker for post-wave fixup
  - ACR External_ID__c is sequenced from acr_starting_seq
  - determinism on repeated calls with the same seed
"""
from __future__ import annotations

import pytest

from customer_hydration.generators.households import (
    HouseholdBundle,
    HouseholdRequest,
    generate_households,
)


# Active IndustriesHousehold RT id on jdo-fw51xz (verified in plan
# context). Tests pass it as a parameter so the runner can pick the
# correct id at runtime — generator is RT-id-agnostic.
HOUSEHOLD_RT_ID = "012am000001mrZpAAI"


@pytest.fixture
def sample_requests() -> list[HouseholdRequest]:
    return [
        HouseholdRequest(
            surname="Johnson",
            member_external_ids=[
                "HYDRATE-RT-000001",
                "HYDRATE-RT-000002",
            ],
        ),
        HouseholdRequest(
            surname="Patel",
            member_external_ids=[
                "HYDRATE-WL-000001",
                "HYDRATE-WL-000002",
                "HYDRATE-WL-000003",
            ],
        ),
        HouseholdRequest(
            surname="Nguyen",
            member_external_ids=["HYDRATE-RT-000003"],
        ),
    ]


@pytest.fixture
def gen_kwargs(fixed_seed, sample_requests):
    return {
        "seed": fixed_seed,
        "starting_seq": 1,
        "requests": sample_requests,
        "household_rt_id": HOUSEHOLD_RT_ID,
    }


class TestGenerateHouseholds:
    def test_generates_one_household_per_request(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        assert isinstance(bundle, HouseholdBundle)
        assert len(bundle.households) == len(gen_kwargs["requests"])

    def test_external_ids_sequential(self, gen_kwargs):
        gen_kwargs["starting_seq"] = 5
        bundle = generate_households(**gen_kwargs)
        for i, hh in enumerate(bundle.households):
            ext_id = hh["External_ID__c"]
            assert ext_id == f"HYDRATE-HH-{5 + i:06d}"
            # SourceSystemId mirrors External_ID__c — single idempotency
            # surface across both legacy + native lookups.
            assert hh["FinServ__SourceSystemId__c"] == ext_id
            # Tail is exactly 6 digits zero-padded.
            assert len(ext_id.split("-")[-1]) == 6

    def test_household_has_correct_record_type_id(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        for hh in bundle.households:
            assert hh["RecordTypeId"] == HOUSEHOLD_RT_ID

    def test_household_name_uses_surname(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        names = [hh["Name"] for hh in bundle.households]
        assert names == [
            "Johnson Household",
            "Patel Household",
            "Nguyen Household",
        ]

    def test_household_client_category_is_household(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        for hh in bundle.households:
            assert hh["FinServ__ClientCategory__c"] == "Household"
            # Type is the free-text Account.Type field — also "Household".
            assert hh["Type"] == "Household"
            assert hh["Industry"] == "Personal"

    def test_description_mentions_member_count(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        for hh, req in zip(bundle.households, gen_kwargs["requests"]):
            desc = hh["Description"]
            assert isinstance(desc, str) and desc.strip()
            assert req.surname in desc
            # Member count appears verbatim in the description.
            assert str(len(req.member_external_ids)) in desc

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_households(**gen_kwargs)
        bundle2 = generate_households(**gen_kwargs)
        assert bundle1.households == bundle2.households
        # Plan 3: the ACR rows are now part of the bundle and must also
        # be deterministic across repeated calls.
        assert bundle1.acrs == bundle2.acrs


class TestAcrEmission:
    """Plan 3 / Task 6 — AccountContactRelation rows."""

    def test_acrs_emitted_one_per_member(self, gen_kwargs):
        # sample_requests has 2 + 3 + 1 = 6 members across 3 households.
        bundle = generate_households(**gen_kwargs)
        total_members = sum(
            len(req.member_external_ids) for req in gen_kwargs["requests"]
        )
        assert total_members == 6
        assert len(bundle.acrs) == total_members

    def test_acr_external_ids_sequential(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        for i, acr in enumerate(bundle.acrs):
            ext_id = f"HYDRATE-ACR-{1 + i:06d}"
            assert acr["External_ID__c"] == ext_id
            # Mirror SourceSystemId — same idempotency convention as every
            # other Account-shaped surface in this package.
            assert acr["FinServ__SourceSystemId__c"] == ext_id

    def test_acr_account_id_links_to_household(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        # First request "Johnson" with 2 members → first 2 ACRs link to
        # HYDRATE-HH-000001. Second "Patel" with 3 members → next 3 ACRs
        # link to HYDRATE-HH-000002. Third "Nguyen" with 1 member → last
        # ACR links to HYDRATE-HH-000003.
        expected = (
            ["HYDRATE-HH-000001"] * 2
            + ["HYDRATE-HH-000002"] * 3
            + ["HYDRATE-HH-000003"] * 1
        )
        assert [acr["AccountId"] for acr in bundle.acrs] == expected

    def test_acr_contact_id_uses_resolve_marker(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        # Each ACR's ContactId is the member's Person Account external id
        # prefixed with RESOLVE: — Plan 3's id_resolver.py rewrites these
        # to real Contact ids post-Wave-A using the
        # contact_id_by_account_external_id map.
        expected = [
            "RESOLVE:HYDRATE-RT-000001",
            "RESOLVE:HYDRATE-RT-000002",
            "RESOLVE:HYDRATE-WL-000001",
            "RESOLVE:HYDRATE-WL-000002",
            "RESOLVE:HYDRATE-WL-000003",
            "RESOLVE:HYDRATE-RT-000003",
        ]
        assert [acr["ContactId"] for acr in bundle.acrs] == expected

    def test_acr_roles_assigned_spouse_then_dependent(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        # First member of each household → "Spouse"; remainder → "Dependent".
        # Johnson: Spouse, Dependent. Patel: Spouse, Dependent, Dependent.
        # Nguyen: Spouse.
        expected = [
            "Spouse",
            "Dependent",
            "Spouse",
            "Dependent",
            "Dependent",
            "Spouse",
        ]
        assert [acr["Roles"] for acr in bundle.acrs] == expected

    def test_acr_is_active_default_true(self, gen_kwargs):
        bundle = generate_households(**gen_kwargs)
        for acr in bundle.acrs:
            assert acr["IsActive"] is True

    def test_acr_starting_seq_param_respected(self, gen_kwargs):
        # Caller supplies its own ACR external-id sequence so the runner
        # can cleanly partition External_ID__c ranges across CSV bundles.
        gen_kwargs["acr_starting_seq"] = 100
        bundle = generate_households(**gen_kwargs)
        assert bundle.acrs[0]["External_ID__c"] == "HYDRATE-ACR-000100"
        assert bundle.acrs[-1]["External_ID__c"] == "HYDRATE-ACR-000105"
