"""Household generator (Plan 2 / Task 8).

Plan 2 scope: emit Household Account rows ONLY (RecordType
``IndustriesHousehold``). ``AccountContactRelation`` wiring — the FSC
standard household membership surface — is deliberately deferred to
Plan 3.

Why ACR is deferred: AccountContactRelation.ContactId requires the
Person Account's auto-generated Contact id, which we cannot know until
the member Person Accounts have been loaded into the org. Plan 2's
loader is single-wave; Plan 3 introduces a multi-wave loader that
queries back loaded Person Account → Contact mappings between waves
and resolves the ACR rows then. Producing ACR rows here would leave a
dangling-id placeholder we have no way to resolve in Plan 2's loader.

The Plan promise of "65% retail / 90% wealth household membership"
still holds — Plan 3 owns the actual ACR rows.

Idempotency: ``External_ID__c`` and ``FinServ__SourceSystemId__c`` both
carry ``HYDRATE-HH-{seq:06d}``. Mirroring the value across both fields
keeps legacy + native idempotency lookups consistent (the spec convention
we use for every Account-shaped row).
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class HouseholdRequest:
    """One household to materialize.

    ``surname`` drives the Account.Name ("{surname} Household") and the
    Description copy. ``member_external_ids`` is informational in Plan 2
    — it influences only the description's "Members: N" hint. Plan 3
    consumes the same list to emit the AccountContactRelation rows.
    """

    surname: str
    member_external_ids: list[str]


@dataclass
class HouseholdBundle:
    """Output bundle for the household generator (Plan 2 scope).

    Intentionally exposes only ``households``. ``acrs`` is NOT present —
    Plan 3 will add it on a different bundle (or here when the multi-wave
    loader lands). Tests assert the absence to keep Plan 2's contract
    pinned.
    """

    households: list[dict] = field(default_factory=list)


def generate_households(
    *,
    seed: int,
    starting_seq: int,
    requests: list[HouseholdRequest],
    household_rt_id: str,
) -> HouseholdBundle:
    """Generate Household Account rows.

    The generator is fully deterministic from inputs alone — no RNG draws
    today. ``seed`` is accepted for API parity with the other generators
    and to keep the signature stable when Plan 3 adds randomized flavor
    (description variants, BillingState/City derived from members, etc.).

    Args:
      seed: RNG seed (currently unused; reserved for future flavor).
      starting_seq: starting integer for HYDRATE-HH-{seq:06d}.
      requests: list of HouseholdRequest — one row per request.
      household_rt_id: RecordTypeId for the IndustriesHousehold record
        type. Passed in so the runner can pick the active id at runtime
        (the org has historically had duplicate ids for this RT).

    Returns:
      HouseholdBundle with one Household Account dict per request.
    """
    # Reserved for future randomized flavor (description variants,
    # member-derived address picking). Plan 2 output is deterministic
    # from inputs alone.
    del seed

    bundle = HouseholdBundle()

    for i, req in enumerate(requests):
        ext_id = f"HYDRATE-HH-{starting_seq + i:06d}"
        member_count = len(req.member_external_ids)

        household = {
            "Name": f"{req.surname} Household",
            "RecordTypeId": household_rt_id,
            # Account.Type is free-text in this org; "Household" reads
            # cleanly in list views and reports.
            "Type": "Household",
            "Industry": "Personal",
            "FinServ__ClientCategory__c": "Household",
            "Description": (
                f"Household group for the {req.surname} family. "
                f"Members: {member_count}."
            ),
            "External_ID__c": ext_id,
            "FinServ__SourceSystemId__c": ext_id,
        }

        bundle.households.append(household)

    return bundle
