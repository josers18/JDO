"""Tests for loader/checkpoint.py — run-state persistence + resume detection."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from customer_hydration.loader.checkpoint import (
    CsvStatus,
    RunCheckpoint,
    find_latest_resumable,
    new_checkpoint,
)


# ---------------------------------------------------------------------------
# new_checkpoint
# ---------------------------------------------------------------------------


class TestNewCheckpoint:
    def test_run_id_format(self):
        cp = new_checkpoint(target_org="demo", seed=42, flags={})
        assert re.match(r"^run-\d{4}-\d{2}-\d{2}T\d{4}$", cp.run_id), cp.run_id

    def test_seed_and_target_org_set(self):
        cp = new_checkpoint(target_org="demo-org", seed=7, flags={})
        assert cp.seed == 7
        assert cp.target_org == "demo-org"

    def test_started_at_isoformat(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        # Must round-trip through fromisoformat without raising.
        from datetime import datetime

        parsed = datetime.fromisoformat(cp.started_at)
        assert parsed.tzinfo is not None

    def test_flags_propagated(self):
        flags = {"dry_run": True, "scale": "L"}
        cp = new_checkpoint(target_org="demo", seed=1, flags=flags)
        assert cp.flags == flags

    def test_completed_waves_starts_empty(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        assert cp.completed_waves == []

    def test_in_progress_wave_starts_none(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        assert cp.in_progress_wave is None


# ---------------------------------------------------------------------------
# State transitions
# ---------------------------------------------------------------------------


class TestCheckpointStateTransitions:
    def test_mark_wave_started_sets_in_progress(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.mark_wave_started("A")
        assert cp.in_progress_wave == "A"

    def test_mark_wave_completed_clears_in_progress(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.mark_wave_started("A")
        cp.mark_wave_completed("A")
        assert cp.in_progress_wave is None

    def test_mark_wave_completed_appends_to_completed_waves(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.mark_wave_started("A")
        cp.mark_wave_completed("A")
        cp.mark_wave_started("B")
        cp.mark_wave_completed("B")
        assert cp.completed_waves == ["A", "B"]

    def test_mark_wave_completed_no_duplicate_in_completed_waves(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.mark_wave_completed("A")
        cp.mark_wave_completed("A")
        assert cp.completed_waves == ["A"]

    def test_update_csv_status_creates_entry_for_new_sobject(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.update_csv_status("Account", rows_written=10, completed=True)
        assert cp.object_status["Account"] == {"rows_written": 10, "completed": True}

    def test_update_csv_status_merges_existing_entry(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.update_csv_status("Account", rows_written=10, in_progress=True)
        cp.update_csv_status("Account", in_progress=False, completed=True)
        assert cp.object_status["Account"] == {
            "rows_written": 10,
            "in_progress": False,
            "completed": True,
        }


# ---------------------------------------------------------------------------
# is_resumable
# ---------------------------------------------------------------------------


class TestIsResumable:
    def test_fresh_checkpoint_not_resumable(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        assert cp.is_resumable() is False

    def test_in_progress_wave_set_means_resumable(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.mark_wave_started("B")
        assert cp.exit_code is None
        assert cp.is_resumable() is True

    def test_completed_run_not_resumable(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.exit_code = 0
        assert cp.is_resumable() is False

    def test_failed_run_not_resumable(self):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        cp.mark_wave_started("C")
        cp.exit_code = 2
        assert cp.is_resumable() is False


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


class TestPersistence:
    def test_write_and_read_roundtrip(self, tmp_path: Path):
        cp = new_checkpoint(target_org="demo", seed=42, flags={"scale": "M"})
        cp.mark_wave_started("A")
        cp.update_csv_status("Account", rows_written=100, completed=True)
        cp.mark_wave_completed("A")
        cp.mark_wave_started("B")
        cp.id_resolution["Account"] = "output/run-x/resolved/Account.json"

        path = tmp_path / "checkpoint.json"
        cp.write(path)

        loaded = RunCheckpoint.read(path)
        assert loaded.run_id == cp.run_id
        assert loaded.seed == cp.seed
        assert loaded.target_org == cp.target_org
        assert loaded.started_at == cp.started_at
        assert loaded.flags == cp.flags
        assert loaded.completed_waves == cp.completed_waves
        assert loaded.in_progress_wave == cp.in_progress_wave
        assert loaded.object_status == cp.object_status
        assert loaded.id_resolution == cp.id_resolution
        assert loaded.finished_at == cp.finished_at
        assert loaded.exit_code == cp.exit_code

    def test_write_creates_parent_dirs(self, tmp_path: Path):
        cp = new_checkpoint(target_org="demo", seed=1, flags={})
        nested = tmp_path / "a" / "b" / "c" / "checkpoint.json"
        cp.write(nested)
        assert nested.exists()
        # Sanity: parsed JSON has run_id field.
        data = json.loads(nested.read_text(encoding="utf-8"))
        assert data["run_id"] == cp.run_id


# ---------------------------------------------------------------------------
# find_latest_resumable
# ---------------------------------------------------------------------------


def _write_run(output_dir: Path, run_id: str, *, in_progress: str | None, exit_code: int | None) -> Path:
    """Helper: create output_dir/<run_id>/checkpoint.json with given state."""
    cp = RunCheckpoint(
        run_id=run_id,
        seed=1,
        target_org="demo",
        started_at="2026-05-20T09:30:00+00:00",
        in_progress_wave=in_progress,
        exit_code=exit_code,
    )
    path = output_dir / run_id / "checkpoint.json"
    cp.write(path)
    return path


class TestFindLatestResumable:
    def test_returns_none_when_no_runs(self, tmp_path: Path):
        assert find_latest_resumable(tmp_path) is None

    def test_returns_none_when_output_dir_missing(self, tmp_path: Path):
        missing = tmp_path / "does-not-exist"
        assert find_latest_resumable(missing) is None

    def test_returns_resumable_run(self, tmp_path: Path):
        _write_run(tmp_path, "run-2026-05-20T0900", in_progress=None, exit_code=0)
        _write_run(tmp_path, "run-2026-05-20T1000", in_progress="C", exit_code=None)
        result = find_latest_resumable(tmp_path)
        assert result is not None
        assert result.run_id == "run-2026-05-20T1000"

    def test_picks_most_recent_when_multiple_resumable(self, tmp_path: Path):
        _write_run(tmp_path, "run-2026-05-20T0900", in_progress="B", exit_code=None)
        _write_run(tmp_path, "run-2026-05-20T1100", in_progress="C", exit_code=None)
        _write_run(tmp_path, "run-2026-05-20T1000", in_progress="D", exit_code=None)
        result = find_latest_resumable(tmp_path)
        assert result is not None
        assert result.run_id == "run-2026-05-20T1100"

    def test_returns_none_when_only_completed_runs_exist(self, tmp_path: Path):
        _write_run(tmp_path, "run-2026-05-20T0800", in_progress=None, exit_code=0)
        _write_run(tmp_path, "run-2026-05-20T0900", in_progress=None, exit_code=0)
        assert find_latest_resumable(tmp_path) is None


# ---------------------------------------------------------------------------
# CsvStatus dataclass smoke
# ---------------------------------------------------------------------------


class TestCsvStatus:
    def test_csv_status_defaults(self):
        status = CsvStatus(sobject="Account", csv_path="/tmp/account.csv")
        assert status.rows_written == 0
        assert status.records_processed == 0
        assert status.records_failed == 0
        assert status.in_progress is False
        assert status.completed is False
        assert status.error is None
