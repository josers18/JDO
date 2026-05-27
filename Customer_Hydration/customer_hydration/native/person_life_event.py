"""PersonLifeEvent — native FSC standard object (Phase 3 augment).

The legacy ``FinServ__LifeEvent__c`` lineage exists in this org but is NOT
ingested by Data Cloud — only the native ``PersonLifeEvent`` object is
mapped to ``ssot__PersonLifeEvent__dlm`` via the ``PersonLifeEvent_Home``
data stream.

This generator produces native PersonLifeEvent rows in lockstep with the
legacy generator (``customer_hydration.generators.lifecycle``) so segments
that read from the native lineage (e.g. ``WealthRecentLifeEvent``) see
the same events. Per AGENTS.md "Schema continuity (dual lineage)" — emit
both for any concept covered by both objects.

Picklist mapping (legacy → native):
  New Baby     → Baby
  New Job      → Job
  New Home     → Home
  College      → Graduation
  New Business → Job        (closest available — no "Business" value)
  Retirement   → Retirement

PrimaryPersonId references the auto-Contact created when the Person
Account loads. The augment runner uses ``IdResolver.contact_id_by_
account_external_id`` to resolve the ``RESOLVE:HYDRATE-{persona}-NNN``
marker post-Account-resolution.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


# Maps the legacy generator's event_type to the native picklist value the
# org accepts. Verified via describe on jdo-uqj0jr (2026-05-26).
LEGACY_TO_NATIVE_EVENT_TYPE: dict[str, str] = {
    "New Baby": "Baby",
    "New Job": "Job",
    "New Home": "Home",
    "College": "Graduation",
    "New Business": "Job",
    "Retirement": "Retirement",
}


# Restrictive picklist on jdo-uqj0jr — anything else fails at load time.
VALID_NATIVE_EVENT_TYPES: frozenset[str] = frozenset(
    LEGACY_TO_NATIVE_EVENT_TYPE.values()
)


@dataclass
class NativePersonLifeEventRequest:
    """Per-event spec — one request → one PersonLifeEvent row.

    ``client_account_external_id`` is the Person Account's External_ID__c
    (HYDRATE-RT-* / HYDRATE-WL-* / etc.). The augment runner rewrites the
    ``PrimaryPersonId`` ``RESOLVE:`` marker to the auto-Contact's Id at
    load time.
    """

    client_account_external_id: str
    event_type: str  # native picklist value (mapped via LEGACY_TO_NATIVE_EVENT_TYPE)
    event_date: date


@dataclass
class NativePersonLifeEventBundle:
    """All PersonLifeEvent rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def generate_native_person_life_events(
    *,
    starting_seq: int,
    requests: list[NativePersonLifeEventRequest],
) -> NativePersonLifeEventBundle:
    """Generate PersonLifeEvent rows from request specs.

    Args:
      starting_seq: first integer for ``HYDRATE-NLE-{seq:06d}`` (External_ID__c).
        Distinct from legacy's ``HYDRATE-LE-*`` so the two lineages keep
        separate seq pointers.
      requests: list of NativePersonLifeEventRequest — one row per request.

    Returns:
      NativePersonLifeEventBundle with one row dict per request.

    Raises:
      ValueError: if any request's ``event_type`` is not a valid native
        picklist value.
    """
    bundle = NativePersonLifeEventBundle()

    for i, req in enumerate(requests):
        if req.event_type not in VALID_NATIVE_EVENT_TYPES:
            raise ValueError(
                f"Invalid event_type {req.event_type!r}. "
                f"Must be one of: {sorted(VALID_NATIVE_EVENT_TYPES)}"
            )

        ext_id = f"HYDRATE-NLE-{starting_seq + i:06d}"
        # PersonLifeEvent.EventDate is xsd:dateTime — Bulk rejects the
        # bare date form (verified live: "'2026-03-28' is not a valid
        # value for the type xsd:dateTime"). Anchor to midnight UTC.
        event_iso = f"{req.event_date.isoformat()}T00:00:00.000Z"
        bundle.rows.append({
            "Name": f"{req.event_type} - {req.event_date.isoformat()}",
            "EventType": req.event_type,
            "EventDate": event_iso,
            # IdResolver.contact_id_by_account_external_id swaps this for
            # the Person Account's auto-Contact Id at load time.
            "PrimaryPersonId": f"RESOLVE:{req.client_account_external_id}",
            "External_ID__c": ext_id,
            "SourceSystem": "Cumulus Hydration",
            "SourceSystemIdentifier": ext_id,
        })

    return bundle


def map_legacy_event_type(legacy_value: str) -> str:
    """Translate a legacy ``FinServ__EventType__c`` value to its native
    ``PersonLifeEvent.EventType`` equivalent.

    Raises KeyError if the legacy value isn't in the dual-lineage map —
    fail loud so a typo or new legacy value surfaces as a test failure
    rather than a silent drop.
    """
    return LEGACY_TO_NATIVE_EVENT_TYPE[legacy_value]
