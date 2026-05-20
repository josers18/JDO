"""Tests for the Household generator (Plan 2 / Task 8).

Plan 2 scope is intentionally narrow — the generator emits Household
Account rows (RecordType ``IndustriesHousehold``) and nothing else.
``AccountContactRelation`` wiring is deferred to Plan 3 because joining
each member's Person Account auto-Contact id requires a multi-wave
loader (members must already exist in the org before the ACR row can
resolve ``ContactId``).

These tests pin down:
  - one row per request, sequenced External_ID__c (HYDRATE-HH-{seq:06d})
  - household name, RecordTypeId, ClientCategory wiring
  - description references member count
  - Plan 2 does NOT emit ACR rows (bundle.households is the only list)
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

    def test_no_acr_rows_emitted_in_plan_2(self, gen_kwargs):
        # Plan 2 scope reduction: ACR rows are deferred to Plan 3 (needs
        # multi-wave loader to resolve Person Account auto-Contact ids).
        # Bundle MUST NOT expose an `acrs` attribute — surface this
        # contract so Plan 3 can introduce it explicitly later without
        # accidentally inheriting an empty-by-default field.
        bundle = generate_households(**gen_kwargs)
        assert not hasattr(bundle, "acrs")

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_households(**gen_kwargs)
        bundle2 = generate_households(**gen_kwargs)
        assert bundle1.households == bundle2.households
