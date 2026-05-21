"""PartyRelationshipGroup — native FSC mirror of household Accounts.

Plan 4 / Task 5: emit one PartyRelationshipGroup row per HYDRATE-HH-*
household. ``AccountId`` carries a ``RESOLVE:`` marker so the runner can
substitute the household Account's real Salesforce Id at Wave-F load time.

Bridge field: none — this object has no External_ID__c. Idempotency is via
the natural key (Name, AccountId), so the loader uses upsert-by-natural-key
semantics in Wave F.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PartyRelationshipGroupBundle:
    """All PartyRelationshipGroup rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def generate_party_relationship_groups(
    *,
    household_account_rows: list[dict],
) -> PartyRelationshipGroupBundle:
    """Generate PartyRelationshipGroup rows from household Account rows.

    Args:
      household_account_rows: HYDRATE-HH-* Account dicts produced by
        ``generators.households.generate_households`` (the
        ``HouseholdBundle.households`` field).

    Returns:
      PartyRelationshipGroupBundle with one row per household.
    """
    bundle = PartyRelationshipGroupBundle()

    for household in household_account_rows:
        ext_id = household.get("External_ID__c")
        if ext_id is None:
            continue

        row: dict = {
            "Name": household.get("Name"),
            "AccountId": f"RESOLVE:{ext_id}",
            "RelationshipGroupType": "Household",
            "Description": household.get("Description"),
        }
        bundle.rows.append(row)

    return bundle
