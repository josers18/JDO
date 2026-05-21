"""Tests for the Campaigns generator (Plan 2 / Task 10).

Plan 2 scope is intentionally narrow:

  - Emit the 10 hardcoded Campaign rows from spec §3 (deterministic;
    not seeded — names/types/statuses are pinned by the spec table).
  - Compute a CampaignMember *plan* (request objects) keyed by persona,
    but DO NOT emit CampaignMember rows. CampaignMember requires
    ``ContactId`` or ``LeadId`` to resolve at insert time, and neither
    is knowable client-side until the parent customer Person Accounts
    have loaded and the platform has auto-created their Contact rows.
    Plan 3's multi-wave loader consumes the request plan and emits the
    actual CampaignMember rows.

These tests pin down:
  - exactly 10 campaigns; External_ID__c set HYDRATE-CMP-001..010
  - names/types/statuses match the spec table
  - IsActive is derived from Status
  - StartDate < EndDate for every campaign
  - bundle does NOT expose a ``members`` attribute (Plan 3's surface)
  - persona-targeted member plan obeys the spec rules
  - unknown persona raises ValueError
  - same seed produces identical member plan (determinism)
"""
from __future__ import annotations

import pytest

from customer_hydration.generators.campaigns import (
    CampaignBundle,
    CampaignMemberBundle,
    CampaignMemberRequest,
    generate_campaign_members,
    generate_campaigns,
    plan_campaign_members,
)


# Spec table — pinned here so any drift in campaigns.py fails loudly.
EXPECTED_CAMPAIGN_IDS = [
    "HYDRATE-CMP-001",
    "HYDRATE-CMP-002",
    "HYDRATE-CMP-003",
    "HYDRATE-CMP-004",
    "HYDRATE-CMP-005",
    "HYDRATE-CMP-006",
    "HYDRATE-CMP-007",
    "HYDRATE-CMP-008",
    "HYDRATE-CMP-009",
    "HYDRATE-CMP-010",
]

EXPECTED_CAMPAIGN_NAMES = {
    "HYDRATE-CMP-001": "HELOC Refi Outreach Q2",
    "HYDRATE-CMP-002": "Auto Loan Rate Drop Promo",
    "HYDRATE-CMP-003": "Premier Checking Onboarding",
    "HYDRATE-CMP-004": "Wealth Tax Strategy Webinar 2026",
    "HYDRATE-CMP-005": "Wealth Estate Planning Roundtable",
    "HYDRATE-CMP-006": "SBA Awareness Q1 2026",
    "HYDRATE-CMP-007": "Treasury Modernization Brief",
    "HYDRATE-CMP-008": "Commercial RM Roundtable",
    "HYDRATE-CMP-009": "Multi-Persona Spring Newsletter",
    "HYDRATE-CMP-010": "Mobile Banking Adoption",
}

# Standard Campaign.Type picklist values that the spec table draws from.
VALID_CAMPAIGN_TYPES = {
    "Conference",
    "Webinar",
    "Trade Show",
    "Public Relations",
    "Partners",
    "Referral Program",
    "Advertisement",
    "Banner Ads",
    "Direct Mail",
    "Email",
    "Telemarketing",
    "Other",
}

# Standard Campaign.Status picklist values.
VALID_CAMPAIGN_STATUSES = {"Planned", "In Progress", "Completed", "Aborted"}


class TestGenerateCampaigns:
    def test_generates_exactly_10_campaigns(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        assert isinstance(bundle, CampaignBundle)
        assert len(bundle.campaigns) == 10

    def test_external_ids_match_spec(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        ids = [c["External_ID__c"] for c in bundle.campaigns]
        assert sorted(ids) == sorted(EXPECTED_CAMPAIGN_IDS)
        # IDs are unique.
        assert len(set(ids)) == 10

    def test_campaign_names_match_spec(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        for c in bundle.campaigns:
            ext_id = c["External_ID__c"]
            assert c["Name"] == EXPECTED_CAMPAIGN_NAMES[ext_id], (
                f"Campaign {ext_id} name drifted from spec"
            )

    def test_campaign_types_in_valid_picklist(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        for c in bundle.campaigns:
            assert c["Type"] in VALID_CAMPAIGN_TYPES, (
                f"Campaign {c['External_ID__c']} has invalid Type {c['Type']!r}"
            )

    def test_campaign_status_values_in_valid_picklist(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        for c in bundle.campaigns:
            assert c["Status"] in VALID_CAMPAIGN_STATUSES, (
                f"Campaign {c['External_ID__c']} has invalid Status "
                f"{c['Status']!r}"
            )

    def test_is_active_true_for_planned_or_in_progress(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        for c in bundle.campaigns:
            if c["Status"] in {"Planned", "In Progress"}:
                assert c["IsActive"] is True, (
                    f"{c['External_ID__c']}: IsActive should be True for "
                    f"Status={c['Status']}"
                )
            else:
                assert c["IsActive"] is False, (
                    f"{c['External_ID__c']}: IsActive should be False for "
                    f"Status={c['Status']}"
                )

    def test_dates_are_consistent(self, fixed_seed):
        bundle = generate_campaigns(seed=fixed_seed)
        for c in bundle.campaigns:
            assert c["StartDate"] < c["EndDate"], (
                f"{c['External_ID__c']}: StartDate {c['StartDate']} is not "
                f"before EndDate {c['EndDate']}"
            )

    def test_no_campaign_member_rows_in_plan_2(self, fixed_seed):
        # Plan 2 scope reduction: CampaignMember rows are deferred to Plan
        # 3 because they require resolved ContactId/LeadId. The bundle
        # MUST NOT expose a ``members`` (or ``campaign_members``)
        # attribute — Plan 3 will introduce that surface explicitly.
        bundle = generate_campaigns(seed=fixed_seed)
        assert not hasattr(bundle, "members")
        assert not hasattr(bundle, "campaign_members")


class TestPlanCampaignMembers:
    """Persona-targeted CampaignMember plan."""

    # Hardcoded campaign-id buckets (must match generator's internals).
    RETAIL_IDS = {
        "HYDRATE-CMP-001",
        "HYDRATE-CMP-002",
        "HYDRATE-CMP-003",
        "HYDRATE-CMP-010",
    }
    WEALTH_IDS = {"HYDRATE-CMP-004", "HYDRATE-CMP-005"}
    SMB_IDS = {"HYDRATE-CMP-006"}
    COMMERCIAL_IDS = {"HYDRATE-CMP-007", "HYDRATE-CMP-008"}
    MIXED_ID = "HYDRATE-CMP-009"

    def test_retail_customer_gets_1_to_3_retail_campaigns(self, fixed_seed):
        # Use many retail customers to get strong signal across the
        # randint(1, 3) range and the optional mixed campaign.
        personas = {f"HYDRATE-RT-{i:06d}": "retail" for i in range(1, 51)}
        plan = plan_campaign_members(
            seed=fixed_seed, customer_personas=personas
        )
        # Group by customer and check each.
        by_cust: dict[str, list[CampaignMemberRequest]] = {}
        for req in plan:
            by_cust.setdefault(req.customer_external_id, []).append(req)
        for ext_id, reqs in by_cust.items():
            retail_hits = [r for r in reqs if r.campaign_external_id in self.RETAIL_IDS]
            assert 1 <= len(retail_hits) <= 3, (
                f"{ext_id}: expected 1-3 retail campaigns, got "
                f"{len(retail_hits)}"
            )
            # Every entry is either retail or the mixed campaign.
            for r in reqs:
                assert (
                    r.campaign_external_id in self.RETAIL_IDS
                    or r.campaign_external_id == self.MIXED_ID
                ), (
                    f"{ext_id}: unexpected campaign "
                    f"{r.campaign_external_id} for retail persona"
                )
                assert r.customer_persona == "retail"

    def test_wealth_customer_gets_1_to_2_wealth_campaigns(self, fixed_seed):
        personas = {f"HYDRATE-WL-{i:06d}": "wealth" for i in range(1, 31)}
        plan = plan_campaign_members(
            seed=fixed_seed, customer_personas=personas
        )
        by_cust: dict[str, list[CampaignMemberRequest]] = {}
        for req in plan:
            by_cust.setdefault(req.customer_external_id, []).append(req)
        for ext_id, reqs in by_cust.items():
            wealth_hits = [r for r in reqs if r.campaign_external_id in self.WEALTH_IDS]
            assert 1 <= len(wealth_hits) <= 2, (
                f"{ext_id}: expected 1-2 wealth campaigns, got "
                f"{len(wealth_hits)}"
            )
            for r in reqs:
                assert (
                    r.campaign_external_id in self.WEALTH_IDS
                    or r.campaign_external_id == self.MIXED_ID
                ), (
                    f"{ext_id}: unexpected campaign "
                    f"{r.campaign_external_id} for wealth persona"
                )
                assert r.customer_persona == "wealth"

    def test_smb_customer_gets_at_least_1_smb_campaign(self, fixed_seed):
        personas = {f"HYDRATE-SB-{i:06d}": "smb" for i in range(1, 21)}
        plan = plan_campaign_members(
            seed=fixed_seed, customer_personas=personas
        )
        by_cust: dict[str, list[CampaignMemberRequest]] = {}
        for req in plan:
            by_cust.setdefault(req.customer_external_id, []).append(req)
        for ext_id, reqs in by_cust.items():
            smb_hits = [r for r in reqs if r.campaign_external_id in self.SMB_IDS]
            assert len(smb_hits) >= 1, (
                f"{ext_id}: expected at least 1 SMB campaign, got "
                f"{len(smb_hits)}"
            )
            for r in reqs:
                # SMB is allowed to spill into commercial.
                assert (
                    r.campaign_external_id in self.SMB_IDS
                    or r.campaign_external_id in self.COMMERCIAL_IDS
                ), (
                    f"{ext_id}: unexpected campaign "
                    f"{r.campaign_external_id} for smb persona"
                )
                assert r.customer_persona == "smb"

    def test_commercial_customer_gets_at_least_1_commercial_campaign(
        self, fixed_seed
    ):
        personas = {f"HYDRATE-CM-{i:06d}": "commercial" for i in range(1, 21)}
        plan = plan_campaign_members(
            seed=fixed_seed, customer_personas=personas
        )
        by_cust: dict[str, list[CampaignMemberRequest]] = {}
        for req in plan:
            by_cust.setdefault(req.customer_external_id, []).append(req)
        for ext_id, reqs in by_cust.items():
            commercial_hits = [
                r for r in reqs if r.campaign_external_id in self.COMMERCIAL_IDS
            ]
            assert len(commercial_hits) >= 1, (
                f"{ext_id}: expected at least 1 commercial campaign, got "
                f"{len(commercial_hits)}"
            )
            for r in reqs:
                assert (
                    r.campaign_external_id in self.COMMERCIAL_IDS
                    or r.campaign_external_id == self.MIXED_ID
                ), (
                    f"{ext_id}: unexpected campaign "
                    f"{r.campaign_external_id} for commercial persona"
                )
                assert r.customer_persona == "commercial"

    def test_unknown_persona_raises_value_error(self, fixed_seed):
        personas = {"HYDRATE-RT-000001": "platinum_unicorn"}
        with pytest.raises(ValueError, match="platinum_unicorn"):
            plan_campaign_members(
                seed=fixed_seed, customer_personas=personas
            )

    def test_same_seed_produces_identical_member_plan(self, fixed_seed):
        # Mix of all four personas to exercise every branch.
        personas = {
            "HYDRATE-RT-000001": "retail",
            "HYDRATE-RT-000002": "retail",
            "HYDRATE-WL-000001": "wealth",
            "HYDRATE-SB-000001": "smb",
            "HYDRATE-CM-000001": "commercial",
        }
        plan1 = plan_campaign_members(
            seed=fixed_seed, customer_personas=personas
        )
        plan2 = plan_campaign_members(
            seed=fixed_seed, customer_personas=personas
        )
        assert plan1 == plan2


class TestGenerateCampaignMembers:
    """Plan 3 CampaignMember row generator.

    Exercises ``generate_campaign_members`` — the function that turns
    the Plan 2 ``plan_campaign_members`` request list into CampaignMember
    row dicts. The platform requires resolved ContactId/LeadId, so rows
    here carry a ``RESOLVE:HYDRATE-RT-NNN`` marker on ContactId; the
    runner rewrites those markers between Wave-A (Person Account load)
    and Wave-E (CampaignMember load).
    """

    # Standard Status picklist values for CampaignMember.
    VALID_STATUS_VALUES = {"Sent", "Responded", "Registered", "Attended"}
    RESPONDED_VALUES = {"Responded", "Registered", "Attended"}

    def _sample_requests(self, n: int = 25) -> list[CampaignMemberRequest]:
        """Build a stable list of requests covering retail customers.

        Plan 3's ContactId resolution path is the retail (Person Account)
        case, so the row generator's marker behavior is exercised on
        retail customer external ids.
        """
        return [
            CampaignMemberRequest(
                campaign_external_id=f"HYDRATE-CMP-{(i % 10) + 1:03d}",
                customer_external_id=f"HYDRATE-RT-{i + 1:06d}",
                customer_persona="retail",
            )
            for i in range(n)
        ]

    def test_generates_one_member_per_request(self, fixed_seed):
        requests = self._sample_requests(25)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        assert isinstance(bundle, CampaignMemberBundle)
        assert len(bundle.members) == len(requests)

    def test_external_ids_sequential_with_cmpmem_prefix(self, fixed_seed):
        requests = self._sample_requests(7)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        ext_ids = [m["External_ID__c"] for m in bundle.members]
        assert ext_ids == [
            "HYDRATE-CMPMEM-000001",
            "HYDRATE-CMPMEM-000002",
            "HYDRATE-CMPMEM-000003",
            "HYDRATE-CMPMEM-000004",
            "HYDRATE-CMPMEM-000005",
            "HYDRATE-CMPMEM-000006",
            "HYDRATE-CMPMEM-000007",
        ]
        # Honors a non-1 starting_seq too.
        bundle2 = generate_campaign_members(
            seed=fixed_seed, starting_seq=42, requests=requests[:3]
        )
        assert [m["External_ID__c"] for m in bundle2.members] == [
            "HYDRATE-CMPMEM-000042",
            "HYDRATE-CMPMEM-000043",
            "HYDRATE-CMPMEM-000044",
        ]

    def test_campaign_id_passes_through_external_id(self, fixed_seed):
        requests = self._sample_requests(15)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        for req, member in zip(requests, bundle.members):
            assert member["CampaignId"] == req.campaign_external_id, (
                f"CampaignId should pass through Campaign External_ID__c "
                f"untouched (runner rewrites the column header)."
            )

    def test_contact_id_uses_resolve_marker(self, fixed_seed):
        requests = self._sample_requests(10)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        for req, member in zip(requests, bundle.members):
            assert member["ContactId"].startswith("RESOLVE:HYDRATE-RT-"), (
                f"ContactId for retail customer must carry a "
                f"RESOLVE:HYDRATE-RT- marker; got {member['ContactId']!r}"
            )
            # Marker payload is the customer external id verbatim.
            assert member["ContactId"] == f"RESOLVE:{req.customer_external_id}"

    def test_status_in_4_value_set(self, fixed_seed):
        # Use a large request list so the weighted draw exercises the
        # picklist broadly.
        requests = self._sample_requests(200)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        for member in bundle.members:
            assert member["Status"] in self.VALID_STATUS_VALUES, (
                f"Unexpected Status {member['Status']!r}"
            )

    def test_has_responded_true_when_status_indicates_response(self, fixed_seed):
        requests = self._sample_requests(200)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        responded = [
            m for m in bundle.members if m["Status"] in self.RESPONDED_VALUES
        ]
        # With weights (40/25/20/15) and 200 draws, we should always see
        # at least a few responded entries.
        assert responded, (
            "Expected at least one Responded/Registered/Attended row "
            "across 200 draws — weights drift?"
        )
        for m in responded:
            assert m["HasResponded"] is True, (
                f"HasResponded must be True when Status="
                f"{m['Status']!r}; got {m['HasResponded']!r}"
            )

    def test_has_responded_false_when_status_is_sent(self, fixed_seed):
        requests = self._sample_requests(200)
        bundle = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        sent = [m for m in bundle.members if m["Status"] == "Sent"]
        assert sent, (
            "Expected at least one Sent row across 200 draws — weights drift?"
        )
        for m in sent:
            assert m["HasResponded"] is False, (
                f"HasResponded must be False when Status='Sent'; "
                f"got {m['HasResponded']!r}"
            )

    def test_same_seed_produces_identical_output(self, fixed_seed):
        requests = self._sample_requests(40)
        bundle1 = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        bundle2 = generate_campaign_members(
            seed=fixed_seed, starting_seq=1, requests=requests
        )
        assert bundle1.members == bundle2.members
