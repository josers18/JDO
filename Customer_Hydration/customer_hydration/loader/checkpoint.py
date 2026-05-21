"""Run-state checkpointing for crash-resume.

Writes ``output/run-{ts}/checkpoint.json`` after each wave (and after each
CSV inside a wave finishes) so that ``hydrate.py resume`` can pick up
where a crashed run left off.

The checkpoint records:

* identification of the run (run_id, target org, seed, started_at, flags)
* which waves have completed (``completed_waves``)
* which wave is currently in flight (``in_progress_wave``)
* per-CSV status keyed by sObject name (``object_status``)
* ID resolution hand-off paths from Phase 3 (``id_resolution``)
* terminal state (``finished_at``, ``exit_code``)

A run is "resumable" iff ``in_progress_wave`` is set AND ``exit_code`` is
``None`` — i.e. the process was interrupted mid-wave without writing a
terminal exit code.

# Plan 3 / Task 4
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Per-CSV status
# ---------------------------------------------------------------------------


@dataclass
class CsvStatus:
    """Per-CSV load status within a wave.

    Stored on :class:`RunCheckpoint.object_status` as a plain dict (so the
    checkpoint round-trips through JSON without custom decoders), but this
    dataclass documents the canonical shape and provides defaults.
    """

    sobject: str
    csv_path: str
    rows_written: int = 0
    records_processed: int = 0
    records_failed: int = 0
    in_progress: bool = False
    completed: bool = False
    error: str | None = None


# ---------------------------------------------------------------------------
# RunCheckpoint
# ---------------------------------------------------------------------------


@dataclass
class RunCheckpoint:
    """Serializable snapshot of an in-flight or completed hydration run."""

    run_id: str
    seed: int
    target_org: str
    started_at: str
    flags: dict[str, Any] = field(default_factory=dict)
    completed_waves: list[str] = field(default_factory=list)
    in_progress_wave: str | None = None
    object_status: dict[str, dict[str, Any]] = field(default_factory=dict)
    id_resolution: dict[str, str] = field(default_factory=dict)
    finished_at: str | None = None
    exit_code: int | None = None

    # ------- persistence ----------------------------------------------------

    def write(self, path: Path) -> None:
        """Atomically-ish write the checkpoint as pretty-printed JSON.

        Parent directories are created on demand so callers don't have to
        pre-create ``output/run-{ts}/``.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(asdict(self), indent=2, default=str),
            encoding="utf-8",
        )

    @classmethod
    def read(cls, path: Path) -> "RunCheckpoint":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(**data)

    # ------- predicates -----------------------------------------------------

    def is_resumable(self) -> bool:
        """Return True if this checkpoint represents an interrupted run."""
        return self.in_progress_wave is not None and self.exit_code is None

    def is_complete(self) -> bool:
        """Return True if the run finished cleanly (exit_code == 0)."""
        return self.exit_code == 0 and self.in_progress_wave is None

    # ------- mutators -------------------------------------------------------

    def mark_wave_started(self, wave_name: str) -> None:
        self.in_progress_wave = wave_name

    def mark_wave_completed(self, wave_name: str) -> None:
        if wave_name not in self.completed_waves:
            self.completed_waves.append(wave_name)
        if self.in_progress_wave == wave_name:
            self.in_progress_wave = None

    def update_csv_status(self, sobject: str, **fields: Any) -> None:
        """Merge keyword fields into ``object_status[sobject]``."""
        if sobject not in self.object_status:
            self.object_status[sobject] = {}
        self.object_status[sobject].update(fields)


# ---------------------------------------------------------------------------
# Constructors / discovery
# ---------------------------------------------------------------------------


def new_checkpoint(target_org: str, seed: int, flags: dict[str, Any]) -> RunCheckpoint:
    """Build a fresh checkpoint with a sortable, minute-precision run_id."""
    now = datetime.now(timezone.utc)
    run_id = "run-" + now.strftime("%Y-%m-%dT%H%M")
    return RunCheckpoint(
        run_id=run_id,
        seed=seed,
        target_org=target_org,
        started_at=now.isoformat(),
        flags=flags,
    )


def find_latest_resumable(output_dir: Path) -> RunCheckpoint | None:
    """Scan ``output_dir`` for the most recent resumable run.

    Looks for ``run-*/checkpoint.json`` files, sorts by run_id descending
    (the timestamp is embedded in the directory name, so lexicographic
    sort == chronological sort), and returns the first one whose checkpoint
    is_resumable(). Returns ``None`` if the directory is missing or no
    resumable run exists.

    Corrupt or unreadable checkpoint files are silently skipped — they
    can't be resumed regardless, and we don't want one stale file to
    block discovery of a newer good one.
    """
    if not output_dir.is_dir():
        return None
    candidates = sorted(output_dir.glob("run-*/checkpoint.json"), reverse=True)
    for path in candidates:
        try:
            cp = RunCheckpoint.read(path)
        except Exception:
            continue
        if cp.is_resumable():
            return cp
    return None
