"""Tests for the native BusinessMilestone generator (Plan 4 / Task 4).

Native-only — no legacy counterpart in jdo-fw51xz, so OriginalLegacyGoalId__c
is always null. Picklist is restrictive (7 values).
"""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.native.business_milestone import (
    BusinessMilestoneRequest,
    NativeBusinessMilestoneBundle,
    generate_business_milestones,
)


@pytest.fixture
def sample_requests() -> list[BusinessMilestoneRequest]:
    return [
        BusinessMilestoneRequest(
            business_external_id="HYDRATE-SMB-000001",
            milestone_type="Founded",
            milestone_date=date(2018, 1, 15),
            description="Company founded.",
        ),
        BusinessMilestoneRequest(
            business_external_id="HYDRATE-SMB-000001",
            milestone_type="Funding Round",
            milestone_date=date(2020, 6, 1),
        ),
        BusinessMilestoneRequest(
            business_external_id="HYDRATE-COM-000001",
            milestone_type="Acquisition",
            milestone_date=date(2024, 3, 10),
        ),
    ]


class TestGenerateBusinessMilestones:
    def test_generates_one_per_request(
        self,
        sample_requests: list[BusinessMilestoneRequest],
    ) -> None:
        bundle = generate_business_milestones(
            starting_seq=1, requests=sample_requests
        )
        assert isinstance(bundle, NativeBusinessMilestoneBundle)
        assert len(bundle.rows) == 3

    def test_external_id_starts_with_nms_prefix(
        self,
        sample_requests: list[BusinessMilestoneRequest],
    ) -> None:
        bundle = generate_business_milestones(
            starting_seq=1, requests=sample_requests
        )
        for row in bundle.rows:
            assert row["External_ID__c"].startswith("HYDRATE-NMS-")
        assert bundle.rows[0]["External_ID__c"] == "HYDRATE-NMS-000001"
        assert bundle.rows[2]["External_ID__c"] == "HYDRATE-NMS-000003"

    def test_legacy_goal_id_field_left_null(
        self,
        sample_requests: list[BusinessMilestoneRequest],
    ) -> None:
        bundle = generate_business_milestones(
            starting_seq=1, requests=sample_requests
        )
        for row in bundle.rows:
            assert row.get("OriginalLegacyGoalId__c") is None

    def test_primary_account_id_uses_resolve_marker(
        self,
        sample_requests: list[BusinessMilestoneRequest],
    ) -> None:
        bundle = generate_business_milestones(
            starting_seq=1, requests=sample_requests
        )
        assert bundle.rows[0]["PrimaryAccountId"] == "RESOLVE:HYDRATE-SMB-000001"
        assert bundle.rows[1]["PrimaryAccountId"] == "RESOLVE:HYDRATE-SMB-000001"
        assert bundle.rows[2]["PrimaryAccountId"] == "RESOLVE:HYDRATE-COM-000001"

    def test_invalid_milestone_type_raises_valueerror(self) -> None:
        bad = [
            BusinessMilestoneRequest(
                business_external_id="HYDRATE-SMB-000001",
                milestone_type="Bankruptcy",  # not in 7-value picklist
                milestone_date=date(2024, 1, 1),
            )
        ]
        with pytest.raises(ValueError, match="Invalid milestone_type"):
            generate_business_milestones(starting_seq=1, requests=bad)

    def test_milestone_date_emitted_as_iso(
        self,
        sample_requests: list[BusinessMilestoneRequest],
    ) -> None:
        bundle = generate_business_milestones(
            starting_seq=1, requests=sample_requests
        )
        assert bundle.rows[0]["MilestoneDate"] == "2018-01-15"
        assert bundle.rows[1]["MilestoneDate"] == "2020-06-01"
        assert bundle.rows[2]["MilestoneDate"] == "2024-03-10"

    def test_same_inputs_produce_identical_output(
        self,
        sample_requests: list[BusinessMilestoneRequest],
    ) -> None:
        a = generate_business_milestones(starting_seq=1, requests=sample_requests)
        b = generate_business_milestones(starting_seq=1, requests=sample_requests)
        assert a.rows == b.rows
