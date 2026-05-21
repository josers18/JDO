"""PartyProfile — native FSC mirror of Person Accounts and business Contacts.

Plan 4 / Task 6: emit PartyProfile rows for every Person Account customer
plus every business Contact, with HouseholdAccountId set when the customer
is a household member.

Bridge field: none — uses shared AccountId / ContactId.
Phase 3 dependency: Account + Contact External_ID__c -> Salesforce Id maps
(AccountId / ContactId / HouseholdAccountId all carry ``RESOLVE:`` markers).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PartyProfileBundle:
    """All PartyProfile rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def _full_name(account_or_contact: dict) -> str:
    first = account_or_contact.get("FirstName") or ""
    last = account_or_contact.get("LastName") or ""
    return f"{first} {last}".strip()


def generate_party_profiles(
    *,
    person_account_rows: list[dict],
    business_contact_rows: list[dict],
    household_membership_map: dict[str, str],
) -> PartyProfileBundle:
    """Generate PartyProfile rows for Person Accounts and business Contacts.

    Args:
      person_account_rows: HYDRATE-RT-*, HYDRATE-WL-* Person Account
        dicts (from retail.py / wealth.py).
      business_contact_rows: business Contact dicts (currently empty in
        Plan 2 — kept for future business-contact support).
      household_membership_map: member External_ID__c -> household
        External_ID__c (from ``HouseholdRequest.member_external_ids``).

    Returns:
      PartyProfileBundle. ProfileType is "Person" for individuals and
      "Organization" for business contacts. HouseholdAccountId is set
      only when the member's external id is in ``household_membership_map``.
    """
    bundle = PartyProfileBundle()

    for pa in person_account_rows:
        ext_id = pa.get("External_ID__c")
        if ext_id is None:
            continue
        full = _full_name(pa)
        row: dict = {
            "Name": f"{full} - Customer",
            "AccountId": f"RESOLVE:{ext_id}",
            "ProfileType": "Person",
            "Status": "Active",
        }
        household_ext_id = household_membership_map.get(ext_id)
        if household_ext_id is not None:
            row["HouseholdAccountId"] = f"RESOLVE:{household_ext_id}"
        bundle.rows.append(row)

    for contact in business_contact_rows:
        # Business contacts use External_Id__c (lowercase d) per AGENTS.md.
        ext_id = contact.get("External_Id__c") or contact.get("External_ID__c")
        if ext_id is None:
            continue
        full = _full_name(contact)
        row = {
            "Name": f"{full} - Customer",
            "ContactId": f"RESOLVE:{ext_id}",
            "ProfileType": "Organization",
            "Status": "Active",
        }
        bundle.rows.append(row)

    return bundle
