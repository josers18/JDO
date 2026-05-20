"""Tests for CSV serialization."""
from __future__ import annotations

from pathlib import Path

import pytest

from customer_hydration.csv_writer import write_csv
from customer_hydration.preflight import PreflightCache


@pytest.fixture
def cache() -> PreflightCache:
    return PreflightCache(field_sets={"Account": {"Name", "Industry", "External_ID__c"}})


def test_writes_header_and_rows(tmp_path: Path, cache: PreflightCache):
    rows = [
        {"Name": "Alice", "Industry": "Tech", "External_ID__c": "HYDRATE-RT-1"},
        {"Name": "Bob", "Industry": "Finance", "External_ID__c": "HYDRATE-RT-2"},
    ]
    path = tmp_path / "account.csv"
    result = write_csv(rows, "Account", cache, path)
    content = path.read_bytes()
    assert b"\n" in content
    assert b"\r\n" not in content
    text = content.decode("utf-8")
    assert text.startswith("External_ID__c,Industry,Name\n")
    assert "HYDRATE-RT-1,Tech,Alice" in text
    assert result.rows_written == 2
    assert result.dropped_fields == set()


def test_drops_unknown_fields_silently(tmp_path: Path, cache: PreflightCache):
    rows = [
        {"Name": "Alice", "GhostField__c": "x", "External_ID__c": "HYDRATE-RT-1"},
    ]
    path = tmp_path / "account.csv"
    result = write_csv(rows, "Account", cache, path)
    text = path.read_text(encoding="utf-8")
    assert "GhostField__c" not in text
    assert result.dropped_fields == {"GhostField__c"}


def test_handles_empty_rows(tmp_path: Path, cache: PreflightCache):
    path = tmp_path / "account.csv"
    result = write_csv([], "Account", cache, path)
    assert result.rows_written == 0
    # Empty CSV file is created (header-only or fully empty per impl choice).
    assert path.exists()


def test_quotes_values_containing_commas(tmp_path: Path, cache: PreflightCache):
    rows = [{"Name": "Alice, Inc.", "Industry": "Tech", "External_ID__c": "HYDRATE-RT-1"}]
    path = tmp_path / "account.csv"
    write_csv(rows, "Account", cache, path)
    text = path.read_text(encoding="utf-8")
    assert '"Alice, Inc."' in text


def test_renders_none_as_empty_string(tmp_path: Path, cache: PreflightCache):
    rows = [{"Name": "Alice", "Industry": None, "External_ID__c": "HYDRATE-RT-1"}]
    path = tmp_path / "account.csv"
    write_csv(rows, "Account", cache, path)
    lines = path.read_text(encoding="utf-8").splitlines()
    # header + one data row
    assert len(lines) == 2
    # row should have an empty field where Industry would be
    fields = lines[1].split(",")
    assert "" in fields
