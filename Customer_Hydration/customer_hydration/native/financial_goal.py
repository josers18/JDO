"""FinancialGoal — native FSC mirror of FinServ__FinancialGoal__c.

Plan 4 / Task 3: emit native FinancialGoal rows with LegacyId__c bridge.

Bridge field: LegacyId__c (verified in jdo-fw51xz: native FinancialGoal
has both External_ID__c and LegacyId__c)
Phase 3 dependency: legacy Goal External_ID__c -> legacy Goal Salesforce Id map

Pure shape transformation: takes legacy FinServ__FinancialGoal__c rows
(already post-fieldmap, so FinServ__Type__c / FinServ__TargetValue__c /
FinServ__ActualValue__c are the keys) and emits one native row per legacy
row whose External_ID__c is present in ``legacy_id_map``.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class NativeFinancialGoalBundle:
    """All native FinancialGoal rows produced for a batch."""

    rows: list[dict] = field(default_factory=list)


def generate_native_financial_goals(
    *,
    starting_seq: int,
    legacy_goal_rows: list[dict],
    legacy_id_map: dict[str, str],
) -> NativeFinancialGoalBundle:
    """Generate native FinancialGoal rows mirroring legacy Goal rows.

    Args:
      starting_seq: starting integer for ``HYDRATE-NGOAL-{seq:06d}``.
      legacy_goal_rows: post-fieldmap legacy FinServ__FinancialGoal__c
        rows from goals.py.
      legacy_id_map: External_ID__c -> legacy Goal Salesforce Id.

    Returns:
      NativeFinancialGoalBundle. Rows whose legacy External_ID__c is not
      present in ``legacy_id_map`` are silently skipped.
    """
    bundle = NativeFinancialGoalBundle()
    out_idx = 0

    for legacy in legacy_goal_rows:
        legacy_ext_id = legacy.get("External_ID__c")
        if legacy_ext_id is None:
            continue
        legacy_sf_id = legacy_id_map.get(legacy_ext_id)
        if legacy_sf_id is None:
            continue

        native_ext_id = f"HYDRATE-NGOAL-{starting_seq + out_idx:06d}"
        out_idx += 1

        row: dict = {
            "Name": legacy.get("Name"),
            "Type": legacy.get("FinServ__Type__c"),
            "Status": legacy.get("FinServ__Status__c"),
            "TargetValue": legacy.get("FinServ__TargetValue__c"),
            "ActualValue": legacy.get("FinServ__ActualValue__c"),
            "TargetDate": legacy.get("FinServ__TargetDate__c"),
            "LegacyId__c": legacy_sf_id,
            "External_ID__c": native_ext_id,
        }
        bundle.rows.append(row)

    return bundle
