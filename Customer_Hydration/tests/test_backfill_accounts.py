"""Phase 4d integration tests — orchestrator + loader/refresh wiring (spec §7.4)."""
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration import backfill_accounts


def _fixture_record(account_id="001xx0000RTL01") -> dict:
    return {
        "Id": account_id,
        "External_ID__c": "HYDRATE-RTL-000001",
        "RecordType.Name": "FSC Person Accounts",
        "IsPersonAccount": True,
        "CreatedDate": "2018-04-12T10:00:00Z",
        "PersonBirthdate": "1971-08-23",
        "PersonGender": "Female",
        "FinServ__MaritalStatus__pc": "Married",
        "FinServ__NumberOfDependents__pc": 2,
        "FinServ__AnnualIncome__pc": 250000,
        "AnnualRevenue": None,
        "FinServ__LastInteraction__c": "2026-05-12",
        "Industry": None,
    }


def test_dry_run_skips_bulk_upsert_and_dc_refresh(tmp_path):
    """--dry-run mode: write CSV + manifest, don't call loader or DC refresh."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    assert (out_dir / "account_backfill.csv").exists()
    assert (out_dir / "manifest.json").exists()
    manifest = json.loads((out_dir / "manifest.json").read_text())
    # Bulk and DC sections are None / absent in dry-run
    assert manifest["bulk_load"] is None
    assert manifest["dc_refresh"] is None


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_full_run_calls_bulk_upsert_and_refresh(
    mock_refresh, mock_upsert, tmp_path,
):
    """Non-dry-run: bulk_upsert called once, dc_refresh called once."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 1
    fake_bulk.records_failed = 0
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = ("Triggered", "07Lxx00004XY", None)

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    assert mock_upsert.call_count == 1
    assert mock_refresh.call_count == 1
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["bulk_load"]["rows_processed"] == 1
    assert manifest["dc_refresh"]["status"] == "Triggered"


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_skip_refresh_stream_flag(mock_refresh, mock_upsert, tmp_path):
    """--skip-refresh-stream: bulk_upsert called, dc_refresh NOT called."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 1
    fake_bulk.records_failed = 0
    mock_upsert.return_value = fake_bulk

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        skip_refresh_stream=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    assert mock_upsert.call_count == 1
    assert mock_refresh.call_count == 0


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_bulk_partial_failure_above_threshold_returns_rc_2(
    mock_refresh, mock_upsert, tmp_path,
):
    """If bulk_upsert reports >1% failed rows → exit rc=2."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 100
    fake_bulk.records_failed = 5  # 5% failed > 1% threshold
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = ("Triggered", "07Lxx", None)

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        records=[_fixture_record(account_id=f"001xx{i:08d}") for i in range(100)],
        life_events_by_id={},
    )
    assert rc == 2


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_strict_mode_treats_any_failure_as_rc_2(
    mock_refresh, mock_upsert, tmp_path,
):
    """--strict: even 1 failed row out of 100 (1%) → rc=2."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 100
    fake_bulk.records_failed = 1  # 1% — at threshold but not over
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = ("Triggered", "07Lxx", None)

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        strict=True,
        records=[_fixture_record(account_id=f"001xx{i:08d}") for i in range(100)],
        life_events_by_id={},
    )
    assert rc == 2


@patch("customer_hydration.backfill_accounts.upsert_to_org")
@patch("customer_hydration.backfill_accounts.refresh_account_stream")
def test_dc_refresh_policy_skipped_does_not_fail_run(
    mock_refresh, mock_upsert, tmp_path,
):
    """DC stream returns PolicySkipped → manifest captures it, rc still 0."""
    fake_bulk = MagicMock()
    fake_bulk.records_processed = 1
    fake_bulk.records_failed = 0
    mock_upsert.return_value = fake_bulk
    mock_refresh.return_value = (
        "PolicySkipped", None,
        "Stream is in UPSERT refresh mode — use dc-stream-full-refresh-via-ui",
    )

    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=False,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["dc_refresh"]["status"] == "PolicySkipped"
    assert "dc-stream-full-refresh-via-ui" in manifest["dc_refresh"]["fallback_message"]


def test_require_external_id_skips_rows_without_one(tmp_path):
    """--require-external-id: records missing External_ID__c are skipped, not BACKFILL-stamped."""
    record_no_ext = _fixture_record()
    del record_no_ext["External_ID__c"]
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        require_external_id=True,
        records=[record_no_ext],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["derivation"]["rows_skipped_no_external_id"] == 1
    assert manifest["derivation"]["rows_with_deltas"] == 0


def test_persona_filter_passes_to_query(tmp_path):
    """When records=None and --persona retail set, the SOQL query uses HYDRATE-RTL- prefix."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = []  # empty result set, just want to verify the SOQL
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        persona="retail",
        sf_runner=sf_runner,  # injected for testing
        records=None,
        life_events_by_id=None,
    )
    assert rc == 0
    # The first call's first positional arg is the SOQL string
    soql = sf_runner.query.call_args_list[0][0][0]
    assert "HYDRATE-RTL-" in soql


def test_record_type_filter_passes_to_query(tmp_path):
    """--record-type Business → SOQL contains the RT clause."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = []
    out_dir = tmp_path / "run"
    backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        record_type="Business",
        sf_runner=sf_runner,
        records=None,
        life_events_by_id=None,
    )
    soql = sf_runner.query.call_args_list[0][0][0]
    assert "RecordType.Name" in soql
    assert "Business" in soql


def test_limit_caps_query_size(tmp_path):
    """--limit 50 → SOQL contains LIMIT 50."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = []
    out_dir = tmp_path / "run"
    backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        limit=50,
        sf_runner=sf_runner,
        records=None,
        life_events_by_id=None,
    )
    soql = sf_runner.query.call_args_list[0][0][0]
    assert "LIMIT 50" in soql


def test_per_field_fill_counts_in_manifest(tmp_path):
    """Manifest's derivation.per_field_fill_counts records each field's count."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    counts = manifest["derivation"]["per_field_fill_counts"]
    # At least Tier__c and CreditScore should appear (deriver-produced)
    assert counts.get("Tier__c", 0) >= 1
    assert counts.get("FinServ__CreditScore__c", 0) >= 1


def test_per_persona_counts_in_manifest(tmp_path):
    """Manifest's derivation.per_persona_counts records the count per persona."""
    out_dir = tmp_path / "run"
    rc = backfill_accounts.run_backfill(
        target_org="mock",
        output_dir=out_dir,
        dry_run=True,
        records=[_fixture_record()],
        life_events_by_id={},
    )
    assert rc == 0
    manifest = json.loads((out_dir / "manifest.json").read_text())
    counts = manifest["derivation"]["per_persona_counts"]
    assert counts.get("retail", 0) == 1
