"""LifeEvent generator (Plan 2 / Task 7 — LifeEvents only; goals are in goals.py).

Emits FinServ__LifeEvent__c rows from a list of LifeEventRequests — one
row per persona-flavored milestone (Birth of child, New job, New home,
College, New business, Retirement). LifeEvents attach to a Person
Account via FinServ__Client__c.

This object's schema diverges from the spec — the fieldmap encodes:

  Spec / logical                Physical (org)            Notes
  ---------------------------   -----------------------   --------
  FinServ__Account__c           FinServ__Client__c        renamed
  FinServ__Contact__c           (dropped)                 not used
  FinServ__Status__c            (dropped)                 not used

Picklist surface for FinServ__EventType__c on jdo-fw51xz is RESTRICTIVE.
The spec assumed Marriage / Divorce / Death of Spouse / Inheritance /
Sale of Business / Diagnosis — none of those are valid here. Only six
values are accepted: New Baby, New Job, New Home, College, New Business,
Retirement. The generator raises ValueError on anything else so callers
fail fast in unit tests rather than at load time on the org.

Idempotency: this object has NO External_ID__c — only
FinServ__SourceSystemId__c. The generator emits
``HYDRATE-LE-{seq:06d}`` into FinServ__SourceSystemId__c and never sets
External_ID__c (the loader keys on SourceSystemId for upserts on this
sObject).
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date

from customer_hydration.fieldmap import JDO_FIELDMAP


# Restrictive picklist on this org — verified via describe.
VALID_EVENT_TYPES = frozenset(
    {
        "New Baby",
        "New Job",
        "New Home",
        "College",
        "New Business",
        "Retirement",
    }
)


# Per-event-type discussion-note copy. Gives demos a human-readable
# "what would the banker actually do here?" surface — much better than
# a generic "lifecycle event recorded" note.
_DISCUSSION_NOTES: dict[str, str] = {
    "New Baby": (
        "Family celebrating arrival. Discuss 529 setup, life insurance "
        "review, and beneficiary updates."
    ),
    "New Job": (
        "Client transitioned employers. Review old 401(k) for rollover "
        "and update direct deposit."
    ),
    "New Home": (
        "Recent home purchase. Review HELOC eligibility, homeowner's "
        "insurance, and emergency fund."
    ),
    "College": (
        "Family member entering college. Review 529 distributions, "
        "FAFSA timing, and tuition payment plan."
    ),
    "New Business": (
        "Client launched a new venture. Discuss SBA financing, business "
        "checking, and treasury services."
    ),
    "Retirement": (
        "Client retiring. Review IRA distributions, Social Security "
        "claim strategy, and estate plan."
    ),
}


@dataclass
class LifeEventRequest:
    """Per-event spec — one request → one FinServ__LifeEvent__c row.

    client_account_external_id is the External_ID__c of the Person
    Account the event attaches to (HYDRATE-RT-* / HYDRATE-WL-* / etc.).
    event_type MUST be one of the six picklist values in
    VALID_EVENT_TYPES; the generator passes the value through to the
    org's FinServ__EventType__c. event_date is calendar-aware, anchored
    to the spec §2 30/10/60 split (30% past 12 mo, 10% next 6 mo, 60% N/A
    — only callers in the past/future bins emit a request).
    """

    client_account_external_id: str
    event_type: str
    event_date: date


@dataclass
class LifeEventBundle:
    """All FinServ__LifeEvent__c rows produced for a batch."""

    life_events: list[dict] = field(default_factory=list)


def generate_life_events(
    *,
    seed: int,
    starting_seq: int,
    requests: list[LifeEventRequest],
) -> LifeEventBundle:
    """Generate FinServ__LifeEvent__c rows from life-event requests.

    Determinism: a single Random(seed) is constructed up front to keep
    the generator's behavior reproducible even when future enhancements
    add randomness (e.g. paraphrased note variants). Today the output
    is fully deterministic from inputs alone, but the seed contract is
    preserved.

    Raises ValueError if any request.event_type isn't in
    VALID_EVENT_TYPES — fail fast in unit tests rather than discovering
    a restricted picklist mismatch at org-load time.
    """
    # Constructed for forward-compat with future randomized flavor; the
    # current logic is deterministic from inputs alone.
    _ = random.Random(seed)
    bundle = LifeEventBundle()

    for i, req in enumerate(requests):
        if req.event_type not in VALID_EVENT_TYPES:
            raise ValueError(
                f"Invalid event_type {req.event_type!r}; must be one of "
                f"{sorted(VALID_EVENT_TYPES)}"
            )

        ssid = f"HYDRATE-LE-{starting_seq + i:06d}"
        event_iso = req.event_date.isoformat()

        # Build logical row using spec field names where renames apply
        # (FinServ__Account__c, FinServ__Contact__c, FinServ__Status__c)
        # and physical names where no rename applies. The fieldmap then
        # translates FinServ__Account__c → FinServ__Client__c and DROPS
        # FinServ__Contact__c and FinServ__Status__c.
        logical = {
            "Name": f"{req.event_type} - {event_iso}",
            "FinServ__EventType__c": req.event_type,
            "FinServ__EventDate__c": event_iso,
            "FinServ__DiscussionNote__c": _DISCUSSION_NOTES[req.event_type],
            # Renamed → FinServ__Client__c.
            "FinServ__Account__c": req.client_account_external_id,
            # Dropped by fieldmap — emitted only so the rename surface
            # stays in one place (fieldmap.py).
            "FinServ__Contact__c": None,
            # Dropped by fieldmap — see above.
            "FinServ__Status__c": "Confirmed",
            # No External_ID__c on this object — SourceSystemId is the
            # idempotency key.
            "FinServ__SourceSystemId__c": ssid,
        }

        bundle.life_events.append(
            JDO_FIELDMAP.apply("FinServ__LifeEvent__c", logical)
        )

    return bundle
