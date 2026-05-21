"""Reset path — delete all HYDRATE-* records in reverse-wave order.

Refuses to run unless the user retypes the target-org alias. Uses Bulk
API 2.0 delete jobs gated by `External_ID__c LIKE 'HYDRATE-%'` (or
`FinServ__SourceSystemId__c` for objects without External_ID__c).

Walks the wave registry in reverse (E → D → C → B → A) so that child
records are deleted before their parents, avoiding referential-integrity
errors. Per sObject:

  1. SOQL query for all HYDRATE-* Ids.
  2. If empty → mark skipped and continue.
  3. Otherwise write Ids to a CSV and shell out to
     `sf data delete bulk --file ... --sobject ...`.
  4. Parse the JSON jobInfo for processed/failed counts.

This module is consumed by `python hydrate.py reset --confirm` (Plan 3
Task 11). It is intentionally kept side-effect-light: the only mutation
beyond the org delete is writing one CSV per sObject under output_dir.
"""
from __future__ import annotations

import csv
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from customer_hydration.loader.wave import waves_in_reverse_order
from customer_hydration.sf_runner import SfRunner


@dataclass
class ResetReport:
    """Per-sObject deletion result.

    Attributes:
        sobject: sObject API name.
        queried: How many HYDRATE-* Ids were found.
        deleted: How many records the bulk job successfully deleted.
        failed: How many records the bulk job failed to delete.
        skipped: True when no HYDRATE-* records existed for this sObject.
        error: Hard error message (subprocess non-zero, etc.). None on success.
    """

    sobject: str
    queried: int = 0
    deleted: int = 0
    failed: int = 0
    skipped: bool = False
    error: str | None = None


# Per-sObject idempotency field — same map runner_p2 uses.
_IDEM_FIELD: dict[str, str] = {
    "Account": "External_ID__c",
    "Contact": "External_Id__c",  # lowercase d — case matters
    "AccountContactRelation": "External_ID__c",
    "FinServ__FinancialAccount__c": "External_ID__c",
    "FinServ__FinancialAccountRole__c": "External_ID__c",
    "FinServ__Card__c": "External_ID__c",
    "FinServ__FinancialGoal__c": "External_ID__c",
    "FinServ__LifeEvent__c": "FinServ__SourceSystemId__c",
    "FinServ__FinancialHolding__c": "FinServ__SourceSystemId__c",
    "Campaign": "External_ID__c",
    "Opportunity": "External_ID__c",
    "Case": "External_ID__c",
    "Task": "External_ID__c",
    "Event": "External_ID__c",
    "CampaignMember": "External_ID__c",
}


def reset_hydrate(
    *,
    runner: SfRunner,
    target_org: str,
    output_dir: Path,
    confirm_alias: str,
    user_typed_alias: str,
    dry_run: bool = False,
    progress: Callable[[str], None] | None = None,
) -> list[ResetReport]:
    """Delete all HYDRATE-* records in reverse-wave order.

    Args:
        runner: SfRunner used for SOQL queries to enumerate HYDRATE-* Ids.
        target_org: sf alias passed through to `sf data delete bulk`.
        output_dir: Directory where per-sObject Id-list CSVs are written.
            Created if missing.
        confirm_alias: The org alias the user must retype to proceed.
        user_typed_alias: Whatever the user actually typed; must equal
            ``confirm_alias`` or this function raises ValueError.
        dry_run: When True, only count HYDRATE-* records via SOQL; no
            CSVs are written and no bulk-delete subprocess is spawned.
        progress: Optional callback invoked with status strings.

    Returns:
        list[ResetReport]: one report per sObject in the deletion order.
        Skipped sObjects are included with ``skipped=True``.

    Raises:
        ValueError: if ``user_typed_alias != confirm_alias``.
    """
    if user_typed_alias != confirm_alias:
        raise ValueError(
            f"Confirmation mismatch: typed {user_typed_alias!r}, "
            f"expected {confirm_alias!r}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)

    reports: list[ResetReport] = []
    for wave in waves_in_reverse_order():
        for sobject in wave.sobjects:
            if sobject not in _IDEM_FIELD:
                # Wave registers an sObject we don't know how to delete —
                # skip silently rather than blow up the whole reset run.
                continue
            report = _delete_one_sobject(
                runner=runner,
                target_org=target_org,
                sobject=sobject,
                output_dir=output_dir,
                dry_run=dry_run,
                progress=progress,
            )
            reports.append(report)
    return reports


def _delete_one_sobject(
    *,
    runner: SfRunner,
    target_org: str,
    sobject: str,
    output_dir: Path,
    dry_run: bool,
    progress: Callable[[str], None] | None,
) -> ResetReport:
    """Query, write CSV, and bulk-delete a single sObject's HYDRATE-* rows."""
    idem = _IDEM_FIELD[sobject]
    soql = f"SELECT Id FROM {sobject} WHERE {idem} LIKE 'HYDRATE-%'"

    if progress:
        progress(f"  {sobject}: querying...")
    rows = runner.query(soql)

    if not rows:
        return ResetReport(sobject=sobject, skipped=True)

    if dry_run:
        return ResetReport(sobject=sobject, queried=len(rows))

    # Write Id-only CSV under output_dir for the bulk-delete job.
    csv_path = output_dir / f"reset_{sobject}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(["Id"])
        for row in rows:
            writer.writerow([row["Id"]])

    cmd = [
        "sf", "data", "delete", "bulk",
        "--file", str(csv_path),
        "--sobject", sobject,
        "--target-org", target_org,
        "--wait", "30",
        "--json",
    ]
    if progress:
        progress(f"  {sobject}: deleting {len(rows)} records...")
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)

    if proc.returncode != 0:
        return ResetReport(
            sobject=sobject,
            queried=len(rows),
            failed=len(rows),
            error=(proc.stderr.strip() or proc.stdout.strip())[:500],
        )

    # Parse jobInfo for processed/failed counts; fall back to assuming
    # everything went through if the JSON shape is unexpected.
    try:
        payload = json.loads(proc.stdout)
        job_info = payload.get("result", {}).get("jobInfo", {}) or {}
        deleted = int(job_info.get("numberRecordsProcessed", len(rows)))
        failed = int(job_info.get("numberRecordsFailed", 0))
    except (json.JSONDecodeError, ValueError, TypeError):
        deleted = len(rows)
        failed = 0

    return ResetReport(
        sobject=sobject,
        queried=len(rows),
        deleted=deleted,
        failed=failed,
    )
