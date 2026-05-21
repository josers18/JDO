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

    # Try to parse the JSON payload. Modern `sf` always emits JSON to stdout
    # even on non-zero exit (with the failure details in `result.jobInfo`).
    # Non-zero exit alone is NOT a reliable failure signal — the CLI returns
    # exit 1 for benign warnings (e.g., "@salesforce/cli update available")
    # as well as real job failures. The JSON payload is authoritative.
    payload = None
    parse_err = None
    if proc.stdout:
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            parse_err = str(exc)
            # Try the last `{...}` block — sf sometimes prefixes status lines
            idx = proc.stdout.rfind("{")
            if idx >= 0:
                try:
                    payload = json.loads(proc.stdout[idx:])
                    parse_err = None
                except json.JSONDecodeError:
                    pass

    if payload is not None:
        # Got a JSON payload — the job ran. Use the actual job stats, not the
        # exit code, to decide success/failure. records_failed > 0 is reported
        # via BulkLoadResult so the caller (parallel.py) can apply its own
        # retry/abort policy rather than us raising here.
        job_info = payload.get("result", {}).get("jobInfo", {})
        records_processed = int(job_info.get("numberRecordsProcessed", 0))
        records_failed = int(job_info.get("numberRecordsFailed", 0))
        return BulkLoadResult(
            records_processed=records_processed,
            records_failed=records_failed,
        )

    # No parseable JSON — that's a genuine subprocess/CLI failure
    # (sf not installed, network down, JSON-malformed response, etc.).
    raise RuntimeError(
        f"sf data upsert bulk failed (exit {proc.returncode}, no JSON payload): "
        f"{proc.stderr.strip()[:500] or proc.stdout.strip()[:500]} "
        f"(parse_err={parse_err!r})"
    )
