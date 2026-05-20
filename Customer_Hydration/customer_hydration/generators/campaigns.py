"""Campaigns + CampaignMember planning (Plan 2 / Task 10).

Plan 2 scope:
  - Emit the 10 hardcoded Campaign rows from spec §3. Names, types,
    statuses, and target persona are pinned by the spec table — they
    are NOT randomized. The seed only influences the per-campaign
    ``ExpectedResponse`` and ``NumberSent`` numeric flavor so that
    repeated runs at the same seed produce byte-identical CSVs.
  - Compute a CampaignMember *plan* (request objects) keyed by persona.
    Plan 2 does NOT emit CampaignMember rows: the platform requires
    ``ContactId`` or ``LeadId`` at insert time, and neither is knowable
    client-side until the parent customer Person Accounts have been
    loaded and the platform has auto-created their Contact rows. Plan
    3's multi-wave loader consumes the request plan, queries back the
    auto-created Contact ids, and emits the actual CampaignMember rows.

This is the same scope-reduction pattern households.py uses for
AccountContactRelation — Plan 2 generates the parents, Plan 3 wires
the joins.

Idempotency: each Campaign carries ``External_ID__c`` =
``HYDRATE-CMP-{NNN}`` from the spec table. Reloading replaces the same
10 rows.

Picklist values:
  - Campaign.Type values used here (Email, Webinar, Direct Mail,
    Conference) are all in the standard Campaign.Type picklist. The
    spec table mentions "Event" — Salesforce's standard picklist
    spells that as "Conference", which is what we emit.
  - Campaign.Status uses the four standard values: Planned / In
    Progress / Completed / Aborted.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta


# --- Hardcoded spec table (do not reorder; tests pin the IDs). -----------

# Note: spec writeup says "Event" for HYDRATE-CMP-005 and HYDRATE-CMP-008,
# but the standard Campaign.Type picklist spells that as "Conference".
# We emit "Conference" so the picklist accepts the value as-is.
_CAMPAIGN_SPEC: list[dict] = [
    {
        "id": "HYDRATE-CMP-001",
        "name": "HELOC Refi Outreach Q2",
        "type": "Email",
        "status": "In Progress",
        "persona": "retail",
        "description": "Q2 outreach to mortgage holders eligible for HELOC.",
    },
    {
        "id": "HYDRATE-CMP-002",
        "name": "Auto Loan Rate Drop Promo",
        "type": "Email",
        "status": "Completed",
        "persona": "retail",
        "description": "Q1 promo for auto loan refinancing.",
    },
    {
        "id": "HYDRATE-CMP-003",
        "name": "Premier Checking Onboarding",
        "type": "Email",
        "status": "In Progress",
        "persona": "retail",
        "description": "New Premier Checking customer onboarding sequence.",
    },
    {
        "id": "HYDRATE-CMP-004",
        "name": "Wealth Tax Strategy Webinar 2026",
        "type": "Webinar",
        "status": "Completed",
        "persona": "wealth",
        "description": "Q1 wealth tax-strategy webinar.",
    },
    {
        "id": "HYDRATE-CMP-005",
        "name": "Wealth Estate Planning Roundtable",
        "type": "Conference",
        "status": "In Progress",
        "persona": "wealth",
        "description": "Estate planning event for legacy clients.",
    },
    {
        "id": "HYDRATE-CMP-006",
        "name": "SBA Awareness Q1 2026",
        "type": "Direct Mail",
        "status": "Completed",
        "persona": "smb",
        "description": "Q1 SBA loan awareness campaign.",
    },
    {
        "id": "HYDRATE-CMP-007",
        "name": "Treasury Modernization Brief",
        "type": "Email",
        "status": "In Progress",
        "persona": "commercial",
        "description": "Treasury services modernization brief for mid-market.",
    },
    {
        "id": "HYDRATE-CMP-008",
        "name": "Commercial RM Roundtable",
        "type": "Conference",
        "status": "Planned",
        "persona": "commercial",
        "description": "Quarterly commercial RM roundtable.",
    },
    {
        "id": "HYDRATE-CMP-009",
        "name": "Multi-Persona Spring Newsletter",
        "type": "Email",
        "status": "Completed",
        "persona": "mixed",
        "description": "Quarterly spring newsletter (all personas).",
    },
    {
        "id": "HYDRATE-CMP-010",
        "name": "Mobile Banking Adoption",
        "type": "Email",
        "status": "In Progress",
        "persona": "retail",
        "description": "Push for retail mobile banking adoption.",
    },
]


# Anchor the Plan 2 "today" so generated dates are deterministic across
# runs (no real ``date.today()`` calls in pure generators). 2026-05-20
# matches the spec/AGENTS anchor era.
_TODAY = date(2026, 5, 20)


# Persona → campaign-id buckets used by ``plan_campaign_members``. These
# are the same buckets the test class hardcodes; keep them in sync.
_RETAIL_CAMPAIGNS: list[str] = [
    "HYDRATE-CMP-001",
    "HYDRATE-CMP-002",
    "HYDRATE-CMP-003",
    "HYDRATE-CMP-010",
]
_WEALTH_CAMPAIGNS: list[str] = ["HYDRATE-CMP-004", "HYDRATE-CMP-005"]
_SMB_CAMPAIGNS: list[str] = ["HYDRATE-CMP-006"]
_COMMERCIAL_CAMPAIGNS: list[str] = ["HYDRATE-CMP-007", "HYDRATE-CMP-008"]
_MIXED_CAMPAIGN: str = "HYDRATE-CMP-009"

VALID_PERSONAS: frozenset[str] = frozenset(
    {"retail", "wealth", "smb", "commercial"}
)


@dataclass
class CampaignBundle:
    """Output bundle for the campaigns generator (Plan 2 scope).

    Intentionally exposes ONLY ``campaigns``. A ``members`` /
    ``campaign_members`` attribute is NOT present — Plan 3 will add
    it on its own bundle (or here, when the multi-wave loader lands).
    Tests assert the absence to keep the Plan 2 contract pinned.
    """

    campaigns: list[dict] = field(default_factory=list)


@dataclass
class CampaignMemberRequest:
    """One pending CampaignMember linkage (Plan 3 will materialize)."""

    campaign_external_id: str
    customer_external_id: str
    customer_persona: str


def generate_campaigns(*, seed: int) -> CampaignBundle:
    """Emit the 10 hardcoded Campaign rows.

    The spec table pins names/types/statuses/personas. ``seed`` only
    drives the numeric flavor fields ``ExpectedResponse`` and
    ``NumberSent`` so re-runs at the same seed produce byte-identical
    rows.

    StartDate/EndDate are derived from Status against an anchored
    "today" (``2026-05-20``):
      - Completed   : StartDate = today - 120d, EndDate = +60d
      - In Progress : StartDate = today - 30d , EndDate = +60d
      - Planned     : StartDate = today + 30d , EndDate = +60d

    IsActive is True iff Status in {Planned, In Progress}.
    """
    rng = random.Random(seed)
    bundle = CampaignBundle()

    for spec in _CAMPAIGN_SPEC:
        status = spec["status"]
        if status == "Completed" or status == "Aborted":
            start = _TODAY - timedelta(days=120)
        elif status == "In Progress":
            start = _TODAY - timedelta(days=30)
        else:  # Planned
            start = _TODAY + timedelta(days=30)
        end = start + timedelta(days=60)

        is_active = status in {"Planned", "In Progress"}

        campaign = {
            "Name": spec["name"],
            "Type": spec["type"],
            "Status": status,
            "IsActive": is_active,
            "StartDate": start.isoformat(),
            "EndDate": end.isoformat(),
            "ExpectedResponse": rng.randint(50, 200),
            "NumberSent": rng.randint(100, 1000),
            "Description": spec["description"],
            "External_ID__c": spec["id"],
        }
        bundle.campaigns.append(campaign)

    return bundle


def plan_campaign_members(
    *,
    seed: int,
    customer_personas: dict[str, str],
) -> list[CampaignMemberRequest]:
    """Compute the persona-targeted CampaignMember plan.

    Args:
      seed: RNG seed for deterministic membership selection.
      customer_personas: mapping of customer External_ID__c → persona
        key (one of ``VALID_PERSONAS``). Insertion order is preserved
        in the returned plan.

    Returns:
      List of CampaignMemberRequest objects. Plan 2 does NOT emit
      CampaignMember rows from these — the platform requires resolved
      ContactId/LeadId. Plan 3's multi-wave loader consumes this list.

    Raises:
      ValueError: if any persona value is not in ``VALID_PERSONAS``.
    """
    # Validate up-front — surface every offending key in one shot so
    # callers don't have to re-run after each fix.
    bad = {
        ext_id: persona
        for ext_id, persona in customer_personas.items()
        if persona not in VALID_PERSONAS
    }
    if bad:
        raise ValueError(
            f"Unknown persona(s) in customer_personas: {bad!r}. "
            f"Valid: {sorted(VALID_PERSONAS)}"
        )

    rng = random.Random(seed)
    plan: list[CampaignMemberRequest] = []

    for ext_id, persona in customer_personas.items():
        if persona == "retail":
            n = rng.randint(1, 3)
            chosen = rng.sample(_RETAIL_CAMPAIGNS, k=n)
            if rng.random() < 0.30:
                chosen.append(_MIXED_CAMPAIGN)
        elif persona == "wealth":
            n = rng.randint(1, 2)
            chosen = rng.sample(_WEALTH_CAMPAIGNS, k=n)
            if rng.random() < 0.40:
                chosen.append(_MIXED_CAMPAIGN)
        elif persona == "smb":
            chosen = list(_SMB_CAMPAIGNS)
            if rng.random() < 0.30:
                chosen.append(rng.choice(_COMMERCIAL_CAMPAIGNS))
        else:  # commercial — guarded by the validation block above
            n = rng.randint(1, 2)
            chosen = rng.sample(_COMMERCIAL_CAMPAIGNS, k=n)
            if rng.random() < 0.20:
                chosen.append(_MIXED_CAMPAIGN)

        for cmp_id in chosen:
            plan.append(
                CampaignMemberRequest(
                    campaign_external_id=cmp_id,
                    customer_external_id=ext_id,
                    customer_persona=persona,
                )
            )

    return plan
