"""Phase 4d sparse-CSV builder + bulk_upsert wrapper.

The sparse-CSV builder forces External_ID__c to column 0 (so demos and
manifests are readable) and uses csv.DictWriter for proper escaping. The
bulk_upsert wrapper just calls into the existing loader._legacy module.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from customer_hydration.loader._legacy import bulk_upsert as _bulk_upsert


PARTIAL_FAILURE_THRESHOLD_PCT: float = 1.0  # > this % failed rows → rc=2 (spec §6.1)


def write_sparse_csv(csv_path: Path, rows: list[dict[str, Any]]) -> None:
    """Write a sparse CSV with External_ID__c first, remaining columns sorted.

    LF line endings (Bulk API 2.0 requirement, AGENTS.md note 4).
    Properly escaped via csv.DictWriter.
    Empty rows produces a header-only file with just External_ID__c.
    """
    csv_path = Path(csv_path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    if not rows:
        # Header-only file
        with csv_path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write("External_ID__c\n")
        return

    # Collect all columns across rows; force External_ID__c to position 0.
    all_cols = set()
    for row in rows:
        all_cols.update(row.keys())
    all_cols.discard("External_ID__c")
    columns = ["External_ID__c", *sorted(all_cols)]

    # Write with explicit LF newline (Bulk API 2.0 requires it; csv.DictWriter
    # honors the file's newline= setting).
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=columns, lineterminator="\n", extrasaction="ignore"
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def upsert_to_org(
    *,
    csv_path: Path,
    target_org: str,
    sobject: str = "Account",
    external_id_field: str = "External_ID__c",
    wait_minutes: int = 30,
):
    """Wrapper around loader._legacy.bulk_upsert. Returns its BulkLoadResult."""
    return _bulk_upsert(
        csv_path=csv_path,
        sobject=sobject,
        external_id_field=external_id_field,
        target_org=target_org,
        wait_minutes=wait_minutes,
    )
