"""Tests for the Phase 4d sparse-CSV builder and bulk_upsert wrapper."""
import csv
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from customer_hydration.backfill.upsert import (
    write_sparse_csv,
    upsert_to_org,
    PARTIAL_FAILURE_THRESHOLD_PCT,
)


def test_write_sparse_csv_external_id_is_first_column(tmp_path):
    """External_ID__c MUST be column 0 regardless of alphabetical position."""
    rows = [
        {"External_ID__c": "HYDRATE-RTL-001", "Tier__c": "Bronze", "AnnualRevenue": 0},
    ]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        header = fh.readline().strip().split(",")
    assert header[0] == "External_ID__c"


def test_write_sparse_csv_remaining_columns_sorted(tmp_path):
    """Non-external-id columns are sorted alphabetically for determinism."""
    rows = [
        {"External_ID__c": "X1", "Tier__c": "Bronze", "AnnualRevenue": 0,
         "FinServ__CreditScore__c": 700},
    ]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        header = fh.readline().strip().split(",")
    assert header == ["External_ID__c", "AnnualRevenue", "FinServ__CreditScore__c", "Tier__c"]


def test_write_sparse_csv_blank_cells_for_missing_keys(tmp_path):
    """Sparse rows: cells absent in a row's dict come out as empty strings."""
    rows = [
        {"External_ID__c": "X1", "Tier__c": "Bronze"},
        {"External_ID__c": "X2", "FinServ__CreditScore__c": 700},
    ]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        reader = csv.DictReader(fh)
        records = list(reader)
    # First row has Tier but not CreditScore
    assert records[0]["Tier__c"] == "Bronze"
    assert records[0]["FinServ__CreditScore__c"] == ""
    # Second row has CreditScore but not Tier
    assert records[1]["Tier__c"] == ""
    assert records[1]["FinServ__CreditScore__c"] == "700"


def test_write_sparse_csv_escapes_commas_in_values(tmp_path):
    """Values containing commas (Description text) must be properly escaped."""
    rows = [{
        "External_ID__c": "X1",
        "Description": "A, B, and C are clients",
    }]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    with out.open() as fh:
        reader = csv.DictReader(fh)
        records = list(reader)
    assert records[0]["Description"] == "A, B, and C are clients"


def test_write_sparse_csv_lf_line_endings(tmp_path):
    """Bulk API 2.0 requires LF, not CRLF (AGENTS.md note 4)."""
    rows = [{"External_ID__c": "X1", "Tier__c": "Bronze"}]
    out = tmp_path / "out.csv"
    write_sparse_csv(out, rows)
    raw = out.read_bytes()
    assert b"\r\n" not in raw
    assert raw.endswith(b"\n")


def test_write_sparse_csv_handles_empty_rows(tmp_path):
    """Empty input: writes a header-only file with just External_ID__c."""
    out = tmp_path / "out.csv"
    write_sparse_csv(out, [])
    text = out.read_text()
    assert text.strip() == "External_ID__c"


def test_partial_failure_threshold_is_one_percent():
    """Spec §6.1: failedRowPct > 1% → rc=2."""
    assert PARTIAL_FAILURE_THRESHOLD_PCT == 1.0


def test_upsert_to_org_invokes_bulk_upsert_and_returns_result(tmp_path, monkeypatch):
    """The wrapper calls loader._legacy.bulk_upsert and returns the result."""
    csv_path = tmp_path / "out.csv"
    csv_path.write_text("External_ID__c,Tier__c\nX1,Bronze\n")

    fake_result = MagicMock()
    fake_result.records_processed = 1
    fake_result.records_failed = 0

    monkeypatch.setattr(
        "customer_hydration.backfill.upsert._bulk_upsert",
        lambda **kwargs: fake_result,
    )
    result = upsert_to_org(
        csv_path=csv_path,
        target_org="mock",
        sobject="Account",
        external_id_field="External_ID__c",
    )
    assert result is fake_result
