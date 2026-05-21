"""Bulk API 2.0 wrapper around `sf data upsert bulk`.

For Plan 1: one job per CSV, synchronous wait, raise on non-zero exit.
Plan 3 adds parallelism, retry policy, and checkpoint integration.

Note: `sf data import bulk` is INSERT-only and rejects `--external-id`. We use
`sf data upsert bulk` so duplicate runs (same External_ID__c values) update
in place rather than creating duplicates.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class BulkLoadResult:
    records_processed: int
    records_failed: int


def bulk_upsert(
    csv_path: Path,
    sobject: str,
    external_id_field: str,
    target_org: str,
    *,
    wait_minutes: int = 30,
) -> BulkLoadResult:
    """Run `sf data upsert bulk` against a single CSV and parse the result."""
    cmd = [
        "sf", "data", "upsert", "bulk",
        "--file", str(csv_path),
        "--sobject", sobject,
        "--external-id", external_id_field,
        "--target-org", target_org,
        "--line-ending", "LF",
        "--wait", str(wait_minutes),
        "--json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            f"sf data upsert bulk failed (exit {proc.returncode}): "
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        # `sf data upsert bulk` sometimes emits non-JSON status lines before the JSON;
        # take the last `{...}` block.
        idx = proc.stdout.rfind("{")
        payload = json.loads(proc.stdout[idx:])

    job_info = payload.get("result", {}).get("jobInfo", {})
    return BulkLoadResult(
        records_processed=int(job_info.get("numberRecordsProcessed", 0)),
        records_failed=int(job_info.get("numberRecordsFailed", 0)),
    )
