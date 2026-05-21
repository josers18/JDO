"""FinancialAccount — native FSC mirror of FinServ__FinancialAccount__c.

Plan 4 / Task 2: emit FinancialAccount rows with LegacyId__c set to the
legacy FA's Salesforce Id (resolved Phase 3, post-Wave-D).

Bridge field: LegacyId__c (existing on the native object in jdo-fw51xz)
Phase 3 dependency: legacy FA External_ID__c -> legacy FA Salesforce Id map

Pure shape transformation: takes the legacy bundle's FA rows (already in
post-fieldmap physical-name form, e.g. FinServ__OpenDate__c, FinServ__Ownership__c)
and emits one native row per legacy row whose External_ID__c is present in
``legacy_id_map``. Rows with unresolved legacy ids are skipped — this should
only happen when the loader's Wave-D queryback didn't catch a row, but we
guard defensively rather than emit broken bridges.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class NativeFinancialAccountBundle:
    """All native FinancialAccount rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def generate_native_financial_accounts(
    *,
    starting_seq: int,
    legacy_fa_rows: list[dict],
    legacy_id_map: dict[str, str],
) -> NativeFinancialAccountBundle:
    """Generate native FinancialAccount rows mirroring legacy FA rows.

    Args:
      starting_seq: starting integer for ``HYDRATE-NFA-{seq:06d}``
        External_ID__c sequencing.
      legacy_fa_rows: post-fieldmap legacy FinServ__FinancialAccount__c
        rows from the legacy generators (retail.py, wealth.py, smb.py,
        commercial.py).
      legacy_id_map: External_ID__c -> legacy FA Salesforce Id, populated
        by the runner's Wave-D queryback.

    Returns:
      NativeFinancialAccountBundle. Rows whose legacy External_ID__c is
      not present in ``legacy_id_map`` are silently skipped.
    """
    bundle = NativeFinancialAccountBundle()
    out_idx = 0

    for legacy in legacy_fa_rows:
        legacy_ext_id = legacy.get("External_ID__c")
        if legacy_ext_id is None:
            continue
        legacy_sf_id = legacy_id_map.get(legacy_ext_id)
        if legacy_sf_id is None:
            # Defensive skip: runner couldn't resolve this legacy row's Id.
            continue

        native_ext_id = f"HYDRATE-NFA-{starting_seq + out_idx:06d}"
        out_idx += 1

        row: dict = {
            "Name": legacy.get("Name"),
            "FinancialAccountNumber": legacy.get("FinServ__FinancialAccountNumber__c"),
            # legacy FA type is already a category value (Deposits/Loans/etc)
            # post-fieldmap picklist translation, so pass through directly.
            "Type": legacy.get("FinServ__FinancialAccountType__c"),
            "Status": legacy.get("FinServ__Status__c"),
            "Balance": legacy.get("FinServ__Balance__c"),
            "OpenedDate": legacy.get("FinServ__OpenDate__c"),
            "InterestRate": legacy.get("FinServ__InterestRate__c"),
            "OwnerId": legacy.get("OwnerId"),
            "LegacyId__c": legacy_sf_id,
            "External_ID__c": native_ext_id,
        }
        bundle.rows.append(row)

    return bundle
