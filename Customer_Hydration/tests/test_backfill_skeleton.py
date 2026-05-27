"""Smoke tests for the Phase 4 backfill_accounts skeleton (no derivers yet)."""
import json
from pathlib import Path

import pytest

from customer_hydration import backfill_accounts


def test_run_backfill_returns_zero_on_empty_input(tmp_path):
    """With no records, run_backfill produces an empty CSV and exits rc=0."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[],
        life_events_by_id={},
    )
    assert rc == 0
    assert (out_dir / "manifest.json").exists()


def test_run_backfill_builds_archetype_per_record(tmp_path):
    """With one record, run_backfill builds an archetype but writes empty CSV
    (no derivers registered yet)."""
    out_dir = tmp_path / "run"
    record = json.loads(
        Path(__file__).parent.joinpath("fixtures/accounts/retail_55yo_affluent.json").read_text()
    )
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[record],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["query"]["rows_queried"] == 1
    # No derivers registered → no deltas
    assert manifest["derivation"]["rows_with_deltas"] == 0


def test_run_backfill_dry_run_skips_bulk_upsert(tmp_path):
    """--dry-run mode never calls the loader."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[],
        life_events_by_id={},
    )
    assert rc == 0
    # No bulk_job log file in dry-run mode
    assert not (out_dir / "bulk_job.log").exists()
