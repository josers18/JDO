"""ContactPointAddress / ContactPointEmail / ContactPointPhone — native FSC contact points.

Plan 4 / Task 7: emit one of each per Person Account / business Contact,
mirroring the legacy direct fields. Data Cloud's harmonization step
prefers ContactPoint* objects over inline Account/Contact email/phone
fields — this generator gives Data Cloud a clean source.

ParentId carries a ``RESOLVE:`` marker pointing at the legacy Person
Account or business Contact. The runner rewrites it to a real Salesforce
Id at Wave-F load time.

Bridge field: none — these are leaf records keyed off the parent.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ContactPointBundle:
    """All ContactPoint* rows produced for a batch."""

    addresses: list[dict] = field(default_factory=list)
    emails: list[dict] = field(default_factory=list)
    phones: list[dict] = field(default_factory=list)


def _full_name(row: dict) -> str:
    first = row.get("FirstName") or ""
    last = row.get("LastName") or ""
    return f"{first} {last}".strip()


def _emit_for_person_account(pa: dict, bundle: ContactPointBundle) -> None:
    ext_id = pa.get("External_ID__c")
    if ext_id is None:
        return
    parent = f"RESOLVE:{ext_id}"
    full = _full_name(pa) or ext_id

    address = {
        "Name": f"{full} - Mailing",
        "ParentId": parent,
        "Street": pa.get("PersonMailingStreet"),
        "City": pa.get("PersonMailingCity"),
        "State": pa.get("PersonMailingState"),
        "PostalCode": pa.get("PersonMailingPostalCode"),
        "Country": pa.get("PersonMailingCountry"),
        "IsPrimary": True,
    }
    bundle.addresses.append(address)

    email = {
        "ParentId": parent,
        "EmailAddress": pa.get("PersonEmail"),
        "IsPrimary": True,
    }
    bundle.emails.append(email)

    phone = {
        "ParentId": parent,
        "TelephoneNumber": pa.get("PersonHomePhone") or pa.get("PersonMobilePhone"),
        "IsPrimary": True,
    }
    bundle.phones.append(phone)


def _emit_for_business_contact(contact: dict, bundle: ContactPointBundle) -> None:
    # Business Contacts use External_Id__c (lowercase d) per AGENTS.md.
    ext_id = contact.get("External_Id__c") or contact.get("External_ID__c")
    if ext_id is None:
        return
    parent = f"RESOLVE:{ext_id}"
    full = _full_name(contact) or ext_id

    address = {
        "Name": f"{full} - Mailing",
        "ParentId": parent,
        "Street": contact.get("MailingStreet"),
        "City": contact.get("MailingCity"),
        "State": contact.get("MailingState"),
        "PostalCode": contact.get("MailingPostalCode"),
        "Country": contact.get("MailingCountry"),
        "IsPrimary": True,
    }
    bundle.addresses.append(address)

    email = {
        "ParentId": parent,
        "EmailAddress": contact.get("Email"),
        "IsPrimary": True,
    }
    bundle.emails.append(email)

    phone = {
        "ParentId": parent,
        "TelephoneNumber": contact.get("Phone") or contact.get("MobilePhone"),
        "IsPrimary": True,
    }
    bundle.phones.append(phone)


def generate_contact_points(
    *,
    person_account_rows: list[dict],
    business_contact_rows: list[dict],
) -> ContactPointBundle:
    """Generate ContactPointAddress / Email / Phone rows.

    Emits one Address + one Email + one Phone per parent. Person Account
    fields read from PersonMailing*/PersonEmail/PersonHomePhone; business
    Contact fields read from Mailing*/Email/Phone.

    Args:
      person_account_rows: HYDRATE-RT-*, HYDRATE-WL-* Person Account dicts.
      business_contact_rows: business Contact dicts (empty in Plan 2).

    Returns:
      ContactPointBundle with three parallel lists.
    """
    bundle = ContactPointBundle()
    for pa in person_account_rows:
        _emit_for_person_account(pa, bundle)
    for contact in business_contact_rows:
        _emit_for_business_contact(contact, bundle)
    return bundle
