"""BusinessMilestone — native FSC standard object (no legacy counterpart in jdo-fw51xz).

Plan 4 / Task 4: emit native BusinessMilestone rows for SMB and Commercial
customers. The legacy FinServ__BusinessMilestone__c object is NOT installed
in jdo-fw51xz (verified Plan 1 prelude), so this is native-only with no
legacy bridge — ``OriginalLegacyGoalId__c`` is left null.

Bridge field: none
PrimaryAccountId: ``RESOLVE:HYDRATE-SMB-NNN`` / ``RESOLVE:HYDRATE-COM-NNN``
markers consumed by the loader at Wave-G load time.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


# Restrictive picklist — verified Plan 1 prelude. The org's MilestoneType
# accepts these 7 values; anything else raises ValueError so callers don't
# discover the typo at load time.
_VALID_MILESTONE_TYPES = frozenset(
    {
        "Founded",
        "Funding Round",
        "Acquisition",
        "Expansion",
        "Leadership Change",
        "Revenue Milestone",
        "IPO",
    }
)


@dataclass
class BusinessMilestoneRequest:
    """Per-milestone spec — one request -> one BusinessMilestone row.

    ``business_external_id`` is the External_ID__c of the SMB or Commercial
    Account (HYDRATE-SMB-* or HYDRATE-COM-*) the milestone attaches to;
    the runner rewrites the ``RESOLVE:`` marker to a real Salesforce Id at
    Wave-G load time.
    """

    business_external_id: str
    milestone_type: str
    milestone_date: date
    description: str = ""


@dataclass
class NativeBusinessMilestoneBundle:
    """All BusinessMilestone rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def generate_business_milestones(
    *,
    starting_seq: int,
    requests: list[BusinessMilestoneRequest],
) -> NativeBusinessMilestoneBundle:
    """Generate BusinessMilestone rows from milestone requests.

    Args:
      starting_seq: starting integer for ``HYDRATE-NMS-{seq:06d}``.
      requests: list of BusinessMilestoneRequest — one row per request.

    Returns:
      NativeBusinessMilestoneBundle.

    Raises:
      ValueError: if any request's ``milestone_type`` is not in the
        7-value picklist.
    """
    bundle = NativeBusinessMilestoneBundle()

    for i, req in enumerate(requests):
        if req.milestone_type not in _VALID_MILESTONE_TYPES:
            raise ValueError(
                f"Invalid milestone_type {req.milestone_type!r}. "
                f"Must be one of: {sorted(_VALID_MILESTONE_TYPES)}"
            )

        ext_id = f"HYDRATE-NMS-{starting_seq + i:06d}"
        row: dict = {
            "Name": f"{req.milestone_type} - {req.business_external_id}",
            "MilestoneType": req.milestone_type,
            "MilestoneDate": req.milestone_date.isoformat(),
            "PrimaryAccountId": f"RESOLVE:{req.business_external_id}",
            "External_ID__c": ext_id,
            # No legacy counterpart for BusinessMilestone in jdo-fw51xz.
            "OriginalLegacyGoalId__c": None,
        }
        if req.description:
            row["Description"] = req.description

        bundle.rows.append(row)

    return bundle
