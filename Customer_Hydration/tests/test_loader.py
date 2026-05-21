"""Tests for the bulk-load wrapper."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration.loader import bulk_upsert, BulkLoadResult


@pytest.fixture
def csv_path(tmp_path: Path) -> Path:
    p = tmp_path / "account.csv"
    p.write_text("Name,External_ID__c\nAlice,HYDRATE-RT-1\n", encoding="utf-8")
    return p


def _completed_proc(returncode=0, stdout="", stderr=""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.stdout = stdout
    proc.stderr = stderr
    return proc


@patch("customer_hydration.loader.subprocess.run")
def test_invokes_sf_data_upsert_bulk_with_correct_args(mock_run, csv_path):
    mock_run.return_value = _completed_proc(0, '{"result": {"jobInfo": {"numberRecordsProcessed": 1, "numberRecordsFailed": 0}}}')
    result = bulk_upsert(
        csv_path, "Account", "External_ID__c", "jdo-fw51xz",
    )
    assert mock_run.called
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "sf"
    # `sf data import bulk` is insert-only; we MUST use `upsert bulk` so
    # `--external-id` is honored and same-key reruns update in place.
    assert "data" in cmd and "upsert" in cmd and "bulk" in cmd
    assert "import" not in cmd
    assert "--file" in cmd
    assert str(csv_path) in cmd
    assert "--sobject" in cmd
    assert "Account" in cmd
    assert "--target-org" in cmd
    assert "jdo-fw51xz" in cmd
    assert "--line-ending" in cmd
    assert "LF" in cmd
    assert "--external-id" in cmd
    assert "External_ID__c" in cmd
    assert isinstance(result, BulkLoadResult)
    assert result.records_processed == 1
    assert result.records_failed == 0


@patch("customer_hydration.loader.subprocess.run")
def test_raises_on_nonzero_exit(mock_run, csv_path):
    # Non-zero exit AND no JSON payload — that's a genuine subprocess/CLI
    # failure (sf not installed, malformed response, etc.) and should raise.
    mock_run.return_value = _completed_proc(1, "", "boom")
    with pytest.raises(RuntimeError, match="boom"):
        bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")


@patch("customer_hydration.loader.subprocess.run")
def test_surfaces_failed_records(mock_run, csv_path):
    mock_run.return_value = _completed_proc(0, '{"result": {"jobInfo": {"numberRecordsProcessed": 10, "numberRecordsFailed": 2}}}')
    result = bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")
    assert result.records_processed == 10
    assert result.records_failed == 2


@patch("customer_hydration.loader.subprocess.run")
def test_returns_result_on_nonzero_exit_with_valid_json(mock_run, csv_path):
    # Bug-fix case: `sf` exits 1 (e.g., emitted an update-available warning to
    # stderr) but stdout has a clean JSON payload showing the job actually
    # succeeded with numberRecordsFailed=0. Must NOT raise — the JSON payload
    # is authoritative, not the exit code.
    mock_run.return_value = _completed_proc(
        returncode=1,
        stdout='{"result": {"jobInfo": {"numberRecordsProcessed": 5, "numberRecordsFailed": 0}}}',
        stderr="",
    )
    result = bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")
    assert isinstance(result, BulkLoadResult)
    assert result.records_processed == 5
    assert result.records_failed == 0


@patch("customer_hydration.loader.subprocess.run")
def test_returns_result_when_stderr_has_update_warning(mock_run, csv_path):
    # Explicit regression test for the production smoke failure: stderr carries
    # the SF CLI update-available warning, exit=1, but stdout has valid JSON
    # with numberRecordsFailed=0. Records DID load — must NOT raise.
    mock_run.return_value = _completed_proc(
        returncode=1,
        stdout='{"result": {"jobInfo": {"numberRecordsProcessed": 42, "numberRecordsFailed": 0}}}',
        stderr="Warning: @salesforce/cli update available from 2.134.6 to 2.135.7",
    )
    result = bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")
    assert isinstance(result, BulkLoadResult)
    assert result.records_processed == 42
    assert result.records_failed == 0


@patch("customer_hydration.loader.subprocess.run")
def test_records_failed_propagates_via_result_not_exception(mock_run, csv_path):
    # When the bulk job actually had failed records, that's surfaced via the
    # BulkLoadResult so parallel.py's retry policy can decide what to do.
    # The wrapper itself must NOT raise.
    mock_run.return_value = _completed_proc(
        returncode=1,
        stdout='{"result": {"jobInfo": {"numberRecordsProcessed": 10, "numberRecordsFailed": 2}}}',
        stderr="",
    )
    result = bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")
    assert isinstance(result, BulkLoadResult)
    assert result.records_processed == 10
    assert result.records_failed == 2
