"""Phase 4 backfill orchestrator.

Reads existing Account records, builds a PersonaArchetype per record, runs
the deriver registry, null-filters the candidates, writes a sparse CSV, and
(unless --dry-run) bulk-upserts via External_ID__c. Optionally triggers the
Account DC stream refresh after upsert.

In Plan 4a, only the skeleton is implemented — no derivers registered, no
bulk upsert, no DC refresh. Plans 4b–4d add those capabilities.

See spec docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from customer_hydration.derivers._archetype import build_archetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers._registry import Registry


def _build_registry() -> Registry:
    """Build the deriver registry. In Plan 4a this returns an empty registry;
    Plans 4b/4c register the 7 derivers."""
    return Registry()


def run_backfill(
    *,
    target_org: str,
    output_dir: Path,
    dry_run: bool = False,
    records: list[dict] | None = None,
    life_events_by_id: dict[str, list[dict]] | None = None,
) -> int:
    """Run the Phase 4 backfill against the given records.

    Args:
        target_org: SF org alias (used by Plan 4d to issue real SOQL).
        output_dir: Where to write manifest, CSV, and logs.
        dry_run: If True, skip the bulk upsert and DC refresh steps.
        records: Pre-fetched Account records. In Plan 4a, callers always inject
                 these (no live SOQL yet). In Plan 4d the orchestrator will
                 fetch from the org when records is None.
        life_events_by_id: Map of account Id → list of LifeEvent dicts.

    Returns:
        Exit code (0 on success).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    records = records or []
    life_events_by_id = life_events_by_id or {}

    registry = _build_registry()
    rows_with_deltas = 0
    rows_skipped_already_full = 0
    output_buffer: list[dict[str, Any]] = []

    started_at = datetime.now(timezone.utc).isoformat()

    for record in records:
        rng = seeded_rng(record["Id"])
        archetype = build_archetype(
            record,
            rng,
            life_events=life_events_by_id.get(record["Id"], []),
        )
        candidates = registry.run(archetype, record, rng)
        delta = {f: v for f, v in candidates.items() if record.get(f) is None}
        if not delta:
            rows_skipped_already_full += 1
            continue
        rows_with_deltas += 1
        output_buffer.append(
            {
                "External_ID__c": record.get("External_ID__c") or f"BACKFILL-{record['Id']}",
                **delta,
            }
        )

    # Write CSV (always; sparse is OK)
    csv_path = output_dir / "account_backfill.csv"
    if output_buffer:
        all_cols = sorted({k for row in output_buffer for k in row.keys()})
        lines = [",".join(all_cols)]
        for row in output_buffer:
            lines.append(",".join(str(row.get(c, "")) for c in all_cols))
        csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    else:
        csv_path.write_text("External_ID__c\n", encoding="utf-8")

    completed_at = datetime.now(timezone.utc).isoformat()

    manifest = {
        "run_id": output_dir.name,
        "target_org": target_org,
        "started_at": started_at,
        "completed_at": completed_at,
        "rc": 0,
        "phase_0": {"fields_owned_by_derivers": registry.all_owned_fields()},
        "query": {
            "rows_queried": len(records),
            "filter": {"persona": None, "record_type": None},
        },
        "derivation": {
            "rows_with_deltas": rows_with_deltas,
            "rows_skipped_already_full": rows_skipped_already_full,
            "rows_skipped_no_external_id": 0,
            "rows_with_deriver_errors": 0,
            "per_field_fill_counts": {},
            "per_persona_counts": {},
        },
        "bulk_load": None if dry_run else {"status": "not_implemented_in_4a"},
        "dc_refresh": None,
        "errors": [],
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    return 0
