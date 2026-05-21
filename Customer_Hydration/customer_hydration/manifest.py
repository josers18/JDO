"""Run-manifest writer.

Each invocation of `hydrate.py` creates output/run-{ts}/manifest.json
that captures seed, flags, row counts, timing, and any failures. This is
the audit trail and also what `dc-status` reads later (Plan 5).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class RunManifest:
    run_id: str
    target_org: str
    seed: int
    started_at: str
    flags: dict[str, Any] = field(default_factory=dict)
    object_status: dict[str, dict] = field(default_factory=dict)
    completed_waves: list[str] = field(default_factory=list)
    finished_at: str | None = None
    exit_code: int | None = None

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2, default=str), encoding="utf-8")


def new_run_manifest(target_org: str, seed: int, flags: dict) -> RunManifest:
    """Build a fresh manifest with a sortable run_id."""
    now = datetime.now(timezone.utc)
    run_id = "run-" + now.strftime("%Y-%m-%dT%H%M")
    return RunManifest(
        run_id=run_id,
        target_org=target_org,
        seed=seed,
        started_at=now.isoformat(),
        flags=flags,
    )
