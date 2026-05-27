"""Smoke tests for the Phase 4 backfill_accounts skeleton (no derivers yet)."""
import json
import subprocess
import sys
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
    """With one record, run_backfill builds an archetype and produces deltas
    for null fields (since Plan 4b derivers are now registered)."""
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
    # Plan 4b: derivers are registered, so well-populated record still has some null fields that will be filled
    assert manifest["derivation"]["rows_with_deltas"] == 1


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


def test_cli_backfill_accounts_subcommand_registered():
    """`hydrate.py backfill-accounts --help` must exit 0 and mention the subcommand."""
    result = subprocess.run(
        [sys.executable, "hydrate.py", "backfill-accounts", "--help"],
        capture_output=True,
        text=True,
        cwd=Path(__file__).resolve().parents[1],  # repo root
    )
    assert result.returncode == 0, f"stderr: {result.stderr}"
    assert "backfill-accounts" in result.stdout or "--target-org" in result.stdout


def test_run_backfill_produces_csv_with_person_account_deltas(tmp_path):
    """End-to-end: a person-account record with nulls produces a non-empty CSV row."""
    out_dir = tmp_path / "run"
    record = json.loads(
        Path(__file__).parent.joinpath(
            "fixtures/accounts/retail_55yo_affluent.json"
        ).read_text()
    )
    # Force CreditScore to null so credit_personal will fill it
    record["FinServ__CreditScore__c"] = None
    record["FinServ__CreditRating__c"] = None
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[record],
        life_events_by_id={},
    )
    assert rc == 0

    csv_text = (out_dir / "account_backfill.csv").read_text()
    assert "External_ID__c" in csv_text
    # Header has the field columns from the registered derivers
    assert "Tier__c" in csv_text
    assert "FinServ__CreditScore__c" in csv_text
    assert "FinServ__RelationshipStartDate__c" in csv_text

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["derivation"]["rows_with_deltas"] == 1
    # All 6 derivers contribute fields
    owned = manifest["deriver_meta"]["fields_owned_by_derivers"]
    assert "FinServ__CreditScore__c" in owned
    assert "Tier__c" in owned
    assert "PersonMailingLatitude" in owned
    assert "PersonTitle" in owned
