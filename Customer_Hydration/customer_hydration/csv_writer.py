"""Write CSV files for Bulk API 2.0 ingestion.

Conventions:
- UTF-8, LF line endings (Bulk API 2.0 requires LF, not CRLF).
- Columns sorted alphabetically for determinism (so test fixtures
  comparing CSVs byte-for-byte are stable across runs).
- Unknown fields (per Phase 0 preflight) silently dropped.
- None values rendered as empty fields.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from customer_hydration.preflight import PreflightCache


@dataclass
class WriteResult:
    rows_written: int
    dropped_fields: set[str]


def write_csv(
    rows: list[dict],
    sobject: str,
    cache: PreflightCache,
    path: Path,
) -> WriteResult:
    """Write rows to path as a Bulk API 2.0 compatible CSV.

    Drops fields not in the preflight cache. Returns counts + dropped set.
    """
    cleaned, dropped = cache.drop_unknown_fields(rows, sobject)

    columns = sorted({k for row in cleaned for k in row.keys()})

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=columns, lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in cleaned:
            writer.writerow({c: ("" if row.get(c) is None else row[c]) for c in columns})

    return WriteResult(rows_written=len(cleaned), dropped_fields=dropped)
