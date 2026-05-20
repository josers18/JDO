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
    mock_run.return_value = _completed_proc(1, "", "boom")
    with pytest.raises(RuntimeError, match="boom"):
        bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")


@patch("customer_hydration.loader.subprocess.run")
def test_surfaces_failed_records(mock_run, csv_path):
    mock_run.return_value = _completed_proc(0, '{"result": {"jobInfo": {"numberRecordsProcessed": 10, "numberRecordsFailed": 2}}}')
    result = bulk_upsert(csv_path, "Account", "External_ID__c", "jdo-fw51xz")
    assert result.records_processed == 10
    assert result.records_failed == 2
