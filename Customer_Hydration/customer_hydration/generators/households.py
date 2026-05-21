"""Household generator (Plan 2 / Task 8 + Plan 3 / Task 6).

Plan 3 expands the Plan 2 generator with ``AccountContactRelation`` rows
that wire each member Person Account to its household.

Why this needs a resolver pattern: the FSC household standard surface is
``AccountContactRelation`` (ACR). ``ACR.AccountId`` points to the
household Account — that one we can resolve via the bulk API's external
id reference (``Account.External_ID__c``) since the Household Account
DOES carry our ``HYDRATE-HH-NNN`` external id. ``ACR.ContactId`` points
to the member's Person Account auto-generated Contact, which has NO
external id we can know client-side. Plan 3's loader (Wave-A) loads
member Person Accounts first, then queries back the resulting
Account → Contact pairs and substitutes them into pre-emitted ACR rows
that carry a ``RESOLVE:HYDRATE-RT-NNN`` (or ``-WL-``) marker on the
``ContactId`` column. The marker scheme is owned by
``loader/id_resolver.py`` — this generator only emits the markers.

Plan 2 contract preserved: the household Account row shape is
byte-identical to Plan 2 output. The new field on ``HouseholdBundle`` is
strictly additive (``acrs`` defaults to an empty list) and the new
parameter ``acr_starting_seq`` defaults to ``1`` — Plan 2 callers that
pass the original kwargs and read only ``bundle.households`` continue to
work unchanged.

Idempotency: ``External_ID__c`` and ``FinServ__SourceSystemId__c`` both
carry ``HYDRATE-HH-{seq:06d}`` for households and ``HYDRATE-ACR-{seq:06d}``
for ACR rows. Mirroring across both fields keeps legacy + native
idempotency lookups consistent (the spec convention used for every
Account-shaped row in this package).

Roles assignment: Plan 3 keeps the persona-driven multiselect simple —
the first member is ``Spouse`` and any subsequent members are
``Dependent``. This is intentionally crude; refinement is an
explicit Plan 4 follow-up.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class HouseholdRequest:
    """One household to materialize.

    ``surname`` drives the Account.Name ("{surname} Household") and the
    Description copy. ``member_external_ids`` is consumed by both the
    description's "Members: N" hint AND (Plan 3) the ACR row emission —
    one ACR row per member, in list order.
    """

    surname: str
    member_external_ids: list[str]


@dataclass
class HouseholdBundle:
    """Output bundle for the household generator.

    ``households`` — Household Account rows (Plan 2).
    ``acrs`` — AccountContactRelation rows (Plan 3). Empty list when no
    requests have members; never absent. ``ContactId`` carries a
    ``RESOLVE:`` marker that the multi-wave loader rewrites post-Wave-A.
    """

    households: list[dict] = field(default_factory=list)
    acrs: list[dict] = field(default_factory=list)


def generate_households(
    *,
    seed: int,
    starting_seq: int,
    requests: list[HouseholdRequest],
    household_rt_id: str,
    acr_starting_seq: int = 1,
) -> HouseholdBundle:
    """Generate Household Account rows AND AccountContactRelation rows.

    The generator is fully deterministic from inputs alone — no RNG draws
    today. ``seed`` is accepted for API parity with the other generators
    and to keep the signature stable when later plans add randomized
    flavor (description variants, BillingState/City derived from members,
    etc.).

    Args:
      seed: RNG seed (currently unused; reserved for future flavor).
      starting_seq: starting integer for ``HYDRATE-HH-{seq:06d}``.
      requests: list of HouseholdRequest — one Household row per request,
        plus one ACR row per member (across all requests).
      household_rt_id: RecordTypeId for the IndustriesHousehold record
        type. Passed in so the runner can pick the active id at runtime
        (the org has historically had duplicate ids for this RT).
      acr_starting_seq: starting integer for ``HYDRATE-ACR-{seq:06d}``.
        Independent of ``starting_seq`` so the runner can partition
        external-id ranges cleanly across CSV bundles. Defaults to 1.

    Returns:
      HouseholdBundle with one Household Account dict per request and
      one ACR dict per (request, member) pair, in deterministic order.
    """
    # Reserved for future randomized flavor (description variants,
    # member-derived address picking). Output is deterministic from
    # inputs alone.
    del seed

    bundle = HouseholdBundle()

    # ACR sequence counter advances across requests (not per-request) so
    # External_ID__c is globally unique within the bundle.
    acr_idx = 0

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

        # Emit one ACR row per member. AccountId stays as the bare
        # household external id — the runner header-rewrites the column
        # to Account.External_ID__c so the bulk API resolves natively.
        # ContactId carries a RESOLVE: marker since Person Account
        # auto-Contact ids are not knowable client-side; the multi-wave
        # loader rewrites these post-Wave-A.
        for member_pos, member_ext_id in enumerate(req.member_external_ids):
            acr_ext_id = f"HYDRATE-ACR-{acr_starting_seq + acr_idx:06d}"
            # Persona-driven role: first member is Spouse, rest Dependent.
            # Plan 3 keeps this crude on purpose — refinement is a Plan 4
            # follow-up that will read persona anchors.
            role = "Spouse" if member_pos == 0 else "Dependent"

            acr = {
                "AccountId": ext_id,
                "ContactId": f"RESOLVE:{member_ext_id}",
                "Roles": role,
                "IsActive": True,
                "External_ID__c": acr_ext_id,
                "FinServ__SourceSystemId__c": acr_ext_id,
            }
            bundle.acrs.append(acr)
            acr_idx += 1

    return bundle
