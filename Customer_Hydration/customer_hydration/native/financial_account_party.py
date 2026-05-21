"""FinancialAccountParty — native FSC mirror of FinServ__FinancialAccountRole__c.

Plan 4 / Task 8: emit FinancialAccountParty rows linking native FAs to
Account or Contact parties, mirroring the legacy FA Role data.

Bridge field: none — natural-key dedupe on (FinancialAccountId, AccountId|ContactId, Role)
Phase 3 dependency: native FA Salesforce Ids (post-Wave-F), legacy Account/Contact ID maps

The native ``FinancialAccountParty`` object does NOT carry an
``External_ID__c`` field. Idempotency is delegated to the runner's Wave-G
load step, which performs natural-key dedupe at insert time.

This generator's only job is to translate each legacy FA-Role row into the
native shape. Two distinct RESOLVE marker prefixes are emitted:

* ``RESOLVE-NFA:HYDRATE-NFA-NNNNNN`` for ``FinancialAccountId`` — resolved
  via a NATIVE-FA External_ID -> native FA Salesforce Id map populated by
  the runner's post-Wave-F queryback.
* ``RESOLVE:HYDRATE-RT-NNN`` (or ``HYDRATE-HH-NNN`` etc.) for
  ``AccountId`` — resolved via the existing legacy External_ID -> Account
  Id map already used elsewhere in Plan 3.

The two markers carry different prefixes so the runner's resolver can
route lookups to the correct ID map.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class NativeFinancialAccountPartyBundle:
    """All native FinancialAccountParty rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def generate_native_financial_account_parties(
    *,
    legacy_role_rows: list[dict],
    legacy_fa_to_native_fa: dict[str, str] | None = None,
) -> NativeFinancialAccountPartyBundle:
    """Convert each legacy FA Role row into a native FinancialAccountParty row.

    The legacy row carries::

        FinServ__FinancialAccount__c    -> HYDRATE-FA-NNNNNN
        FinServ__RelatedAccount__c      -> HYDRATE-RT-NNN (or HH/SMB/COM)
        FinServ__RelatedContact__c      -> HYDRATE-CT-NNN (when contact-keyed)
        FinServ__Role__c                -> "Primary Owner" (etc.)

    The native row needs ``FinancialAccountId`` to point at the NATIVE FA,
    encoded here as ``RESOLVE-NFA:HYDRATE-NFA-NNNNNN``. The
    ``legacy_fa_to_native_fa`` map translates the legacy FA External_ID
    (``HYDRATE-FA-*``) to the native FA External_ID (``HYDRATE-NFA-*``)
    during emission.

    When ``legacy_fa_to_native_fa`` is ``None``, the generator defaults to
    identity-with-rename: every ``HYDRATE-FA-NNN`` is mapped to
    ``HYDRATE-NFA-NNN`` (same numeric suffix), matching the convention
    used by ``generate_native_financial_accounts`` in Task 2 when
    ``starting_seq`` aligns 1:1 with the legacy FAs.

    Args:
        legacy_role_rows: post-fieldmap legacy ``FinServ__FinancialAccountRole__c``
            rows (see e.g. ``generators/retail.py``).
        legacy_fa_to_native_fa: optional explicit mapping of legacy FA
            External_ID -> native FA External_ID. Overrides the identity
            rename whenever a key is present.

    Returns:
        NativeFinancialAccountPartyBundle. Rows missing the required
        ``FinServ__FinancialAccount__c`` or both party fields are silently
        skipped — those represent malformed legacy rows the generators
        shouldn't have produced in the first place.
    """
    bundle = NativeFinancialAccountPartyBundle()
    explicit_map = legacy_fa_to_native_fa or {}

    for legacy in legacy_role_rows:
        legacy_fa_ext = legacy.get("FinServ__FinancialAccount__c")
        if not legacy_fa_ext:
            continue

        # Translate HYDRATE-FA-NNN -> HYDRATE-NFA-NNN. Explicit map wins;
        # fall back to identity-with-rename so smoke tests can call the
        # generator without first running Wave-D.
        if legacy_fa_ext in explicit_map:
            native_fa_ext = explicit_map[legacy_fa_ext]
        else:
            native_fa_ext = legacy_fa_ext.replace("HYDRATE-FA-", "HYDRATE-NFA-", 1)

        related_account = legacy.get("FinServ__RelatedAccount__c")
        related_contact = legacy.get("FinServ__RelatedContact__c")

        # Prefer Contact when populated — FSC role rows are typically
        # account-keyed for retail/SMB and only contact-keyed for the rare
        # signer-without-account case. This mirrors the legacy FA-Role
        # semantics where exactly one of the two sides is populated.
        if related_contact:
            party_field = "ContactId"
            party_marker = f"RESOLVE:{related_contact}"
        elif related_account:
            party_field = "AccountId"
            party_marker = f"RESOLVE:{related_account}"
        else:
            # Neither side populated — nothing to link to; skip.
            continue

        row: dict = {
            "FinancialAccountId": f"RESOLVE-NFA:{native_fa_ext}",
            party_field: party_marker,
            "Role": legacy.get("FinServ__Role__c"),
        }
        bundle.rows.append(row)

    return bundle
