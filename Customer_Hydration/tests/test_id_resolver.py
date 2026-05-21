"""Tests for loader/id_resolver.py — post-wave ID resolution.

Covers IdResolver population from the org (mocked SfRunner), marker
resolution across the three internal maps, JSON persistence round-trip,
and the in-place CSV column rewriter (`rewrite_csv_resolve_markers`).
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from customer_hydration.loader.id_resolver import (
    IdResolver,
    rewrite_csv_resolve_markers,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_runner(query_results: list[list[dict]] | list[dict]) -> MagicMock:
    """Build a mocked SfRunner.

    If a list-of-lists is passed, successive calls return successive lists;
    otherwise a single static list is returned every call.
    """
    runner = MagicMock()
    if query_results and isinstance(query_results[0], list):
        runner.query.side_effect = query_results
    else:
        runner.query.return_value = query_results
    return runner


# ---------------------------------------------------------------------------
# TestResolverPopulate
# ---------------------------------------------------------------------------


class TestResolverPopulate:
    def test_populate_from_org_external_id_map(self) -> None:
        runner = _make_runner([
            # First call: Account External_ID__c
            [
                {"Id": "001AA00000A", "External_ID__c": "HYDRATE-RT-000001"},
                {"Id": "001AA00000B", "External_ID__c": "HYDRATE-RT-000002"},
                {"Id": "001AA00000C", "External_ID__c": "HYDRATE-RT-000003"},
            ],
            # Second call: Person Account contact-by-account
            [],
        ])
        resolver = IdResolver()
        loaded = resolver.populate_from_org(runner, "Account")
        assert loaded == 3
        assert resolver.by_external_id["HYDRATE-RT-000001"] == "001AA00000A"
        assert resolver.by_external_id["HYDRATE-RT-000003"] == "001AA00000C"

    def test_populate_uses_correct_soql(self) -> None:
        runner = _make_runner([[], []])
        resolver = IdResolver()
        resolver.populate_from_org(runner, "Account")
        first_soql = runner.query.call_args_list[0].args[0]
        assert "External_ID__c LIKE 'HYDRATE-%'" in first_soql
        assert "FROM Account" in first_soql

    def test_populate_with_source_system_id_routes_to_ssid_map(self) -> None:
        runner = _make_runner([
            {"Id": "a01AA00001", "FinServ__SourceSystemId__c": "HYDRATE-HOLD-0001"},
            {"Id": "a01AA00002", "FinServ__SourceSystemId__c": "HYDRATE-HOLD-0002"},
        ])
        resolver = IdResolver()
        loaded = resolver.populate_from_org(
            runner,
            "FinServ__FinancialHolding__c",
            external_id_field="FinServ__SourceSystemId__c",
        )
        assert loaded == 2
        assert resolver.by_source_system_id["HYDRATE-HOLD-0001"] == "a01AA00001"
        assert resolver.by_external_id == {}
        # Holding objects don't trigger Person-Account contact map call
        assert runner.query.call_count == 1

    def test_populate_account_also_loads_contact_map(self) -> None:
        runner = _make_runner([
            # Account map call
            [{"Id": "001AA00000A", "External_ID__c": "HYDRATE-RT-000001"}],
            # Person Account → Contact call
            [
                {
                    "Id": "003AA00000P",
                    "AccountId": "001AA00000A",
                    "Account": {"External_ID__c": "HYDRATE-RT-000001"},
                },
            ],
        ])
        resolver = IdResolver()
        resolver.populate_from_org(runner, "Account")
        assert runner.query.call_count == 2
        second_soql = runner.query.call_args_list[1].args[0]
        assert "FROM Contact" in second_soql
        assert "Account.IsPersonAccount = true" in second_soql
        assert resolver.contact_id_by_account_external_id["HYDRATE-RT-000001"] == "003AA00000P"


# ---------------------------------------------------------------------------
# TestResolverResolve
# ---------------------------------------------------------------------------


class TestResolverResolve:
    def test_resolves_external_id_marker(self) -> None:
        resolver = IdResolver(by_external_id={"HYDRATE-RT-000001": "001AA00000A"})
        assert resolver.resolve("RESOLVE:HYDRATE-RT-000001") == "001AA00000A"

    def test_resolves_source_system_id_marker(self) -> None:
        resolver = IdResolver(by_source_system_id={"HYDRATE-HOLD-0001": "a01AA00001"})
        assert resolver.resolve("RESOLVE:HYDRATE-HOLD-0001") == "a01AA00001"

    def test_resolves_account_external_to_contact_id(self) -> None:
        resolver = IdResolver(
            contact_id_by_account_external_id={"HYDRATE-RT-000001": "003AA00000P"},
        )
        assert resolver.resolve("RESOLVE:HYDRATE-RT-000001") == "003AA00000P"

    def test_returns_none_for_unknown_marker(self) -> None:
        resolver = IdResolver()
        assert resolver.resolve("RESOLVE:HYDRATE-NOPE") is None

    def test_passes_through_non_marker_strings(self) -> None:
        resolver = IdResolver()
        assert resolver.resolve("001am000ABCDEFG") == "001am000ABCDEFG"

    def test_returns_none_for_empty_string(self) -> None:
        resolver = IdResolver()
        assert resolver.resolve("") is None


# ---------------------------------------------------------------------------
# TestPersistence
# ---------------------------------------------------------------------------


class TestPersistence:
    def test_save_and_load_roundtrip(self, tmp_path: Path) -> None:
        resolver = IdResolver(
            by_external_id={"HYDRATE-RT-000001": "001AA00000A"},
            by_source_system_id={"HYDRATE-HOLD-0001": "a01AA00001"},
            contact_id_by_account_external_id={"HYDRATE-RT-000001": "003AA00000P"},
        )
        path = tmp_path / "subdir" / "resolver.json"
        resolver.save(path)
        assert path.exists()

        loaded = IdResolver.load(path)
        assert loaded.by_external_id == resolver.by_external_id
        assert loaded.by_source_system_id == resolver.by_source_system_id
        assert (
            loaded.contact_id_by_account_external_id
            == resolver.contact_id_by_account_external_id
        )
        # File is JSON
        data = json.loads(path.read_text(encoding="utf-8"))
        assert "by_external_id" in data

    def test_load_from_missing_file_raises(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            IdResolver.load(tmp_path / "nope.json")


# ---------------------------------------------------------------------------
# TestRewriteCsv
# ---------------------------------------------------------------------------


def _write_csv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    lines = [",".join(header)]
    for row in rows:
        lines.append(",".join(row))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


class TestRewriteCsv:
    def test_rewrites_single_column(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "acr.csv"
        _write_csv(
            csv_path,
            ["AccountId", "ContactId", "Roles"],
            [
                ["001AA00000A", "RESOLVE:HYDRATE-RT-000001", "Owner"],
                ["001AA00000B", "RESOLVE:HYDRATE-RT-000002", "Owner"],
            ],
        )
        resolver = IdResolver(
            contact_id_by_account_external_id={
                "HYDRATE-RT-000001": "003AA00000P",
                "HYDRATE-RT-000002": "003AA00000Q",
            }
        )
        kept, dropped = rewrite_csv_resolve_markers(csv_path, ["ContactId"], resolver)
        assert (kept, dropped) == (2, 0)
        text = csv_path.read_text(encoding="utf-8")
        assert "003AA00000P" in text
        assert "003AA00000Q" in text
        assert "RESOLVE:" not in text

    def test_rewrites_multiple_columns(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "task.csv"
        _write_csv(
            csv_path,
            ["Subject", "WhatId", "WhoId"],
            [["Call", "RESOLVE:HYDRATE-RT-000001", "RESOLVE:HYDRATE-RT-000002"]],
        )
        resolver = IdResolver(
            by_external_id={
                "HYDRATE-RT-000001": "001AA00000A",
                "HYDRATE-RT-000002": "003AA00000Q",
            },
        )
        kept, dropped = rewrite_csv_resolve_markers(
            csv_path, ["WhatId", "WhoId"], resolver,
        )
        assert (kept, dropped) == (1, 0)
        text = csv_path.read_text(encoding="utf-8")
        assert "001AA00000A" in text
        assert "003AA00000Q" in text

    def test_drops_row_when_marker_unresolvable(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "cm.csv"
        _write_csv(
            csv_path,
            ["CampaignId", "ContactId"],
            [
                ["701AA0001", "RESOLVE:HYDRATE-RT-000001"],
                ["701AA0001", "RESOLVE:HYDRATE-RT-MISSING"],
                ["701AA0001", "RESOLVE:HYDRATE-RT-000002"],
            ],
        )
        resolver = IdResolver(
            contact_id_by_account_external_id={
                "HYDRATE-RT-000001": "003AA00000P",
                "HYDRATE-RT-000002": "003AA00000Q",
            },
        )
        kept, dropped = rewrite_csv_resolve_markers(csv_path, ["ContactId"], resolver)
        assert (kept, dropped) == (2, 1)
        text = csv_path.read_text(encoding="utf-8")
        assert "MISSING" not in text
        assert "003AA00000P" in text
        assert "003AA00000Q" in text

    def test_preserves_non_marker_values(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "raw.csv"
        _write_csv(
            csv_path,
            ["AccountId", "ContactId"],
            [["001AA00000A", "003AA00000Q"]],  # both raw IDs
        )
        resolver = IdResolver()
        kept, dropped = rewrite_csv_resolve_markers(
            csv_path, ["AccountId", "ContactId"], resolver,
        )
        assert (kept, dropped) == (1, 0)
        text = csv_path.read_text(encoding="utf-8")
        assert "001AA00000A" in text
        assert "003AA00000Q" in text

    def test_empty_csv_is_noop(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "empty.csv"
        csv_path.write_text("AccountId,ContactId\n", encoding="utf-8")
        resolver = IdResolver()
        kept, dropped = rewrite_csv_resolve_markers(
            csv_path, ["ContactId"], resolver,
        )
        assert (kept, dropped) == (0, 0)
        assert csv_path.read_text(encoding="utf-8") == "AccountId,ContactId\n"

    def test_uses_lf_line_endings_after_rewrite(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "lf.csv"
        _write_csv(
            csv_path,
            ["AccountId", "ContactId"],
            [["001AA00000A", "RESOLVE:HYDRATE-RT-000001"]],
        )
        resolver = IdResolver(
            contact_id_by_account_external_id={"HYDRATE-RT-000001": "003AA00000P"},
        )
        rewrite_csv_resolve_markers(csv_path, ["ContactId"], resolver)
        raw = csv_path.read_bytes()
        assert b"\r\n" not in raw
        assert b"\n" in raw

    def test_returns_kept_dropped_counts(self, tmp_path: Path) -> None:
        csv_path = tmp_path / "mixed.csv"
        _write_csv(
            csv_path,
            ["AccountId", "ContactId"],
            [
                ["001AA00000A", "RESOLVE:HYDRATE-RT-000001"],
                ["001AA00000B", "RESOLVE:HYDRATE-RT-MISSING"],
            ],
        )
        resolver = IdResolver(
            contact_id_by_account_external_id={"HYDRATE-RT-000001": "003AA00000P"},
        )
        result = rewrite_csv_resolve_markers(csv_path, ["ContactId"], resolver)
        assert result == (1, 1)


# ---------------------------------------------------------------------------
# TestResolverWantDisambiguation
#
# Regression coverage for the FIELD_INTEGRITY_EXCEPTION bug seen at Wave C
# during Plan 3 / Task 12 live load: the resolver's account-first lookup
# returned a ``001*`` Account Id for ``ACR.ContactId`` because the same
# external id (HYDRATE-RT-XXXXXX) keys both the Account map and the
# implicit Person-Account Contact map. ``want="contact"`` forces the
# Contact-typed (``003*``) lookup; ``want="id"`` (default) keeps legacy
# behavior for Account / FA references.
# ---------------------------------------------------------------------------


class TestResolverWantDisambiguation:
    def test_resolve_with_want_contact_returns_contact_id(self) -> None:
        # Both maps are populated with the SAME external id — the bug case.
        resolver = IdResolver(
            by_external_id={"HYDRATE-RT-000001": "001AA00000A"},
            contact_id_by_account_external_id={
                "HYDRATE-RT-000001": "003AA00000P",
            },
        )
        assert (
            resolver.resolve("RESOLVE:HYDRATE-RT-000001", want="contact")
            == "003AA00000P"
        )

    def test_resolve_with_want_id_returns_account_id(self) -> None:
        resolver = IdResolver(
            by_external_id={"HYDRATE-RT-000001": "001AA00000A"},
            contact_id_by_account_external_id={
                "HYDRATE-RT-000001": "003AA00000P",
            },
        )
        # Default and explicit "id" should both return the Account id.
        assert resolver.resolve("RESOLVE:HYDRATE-RT-000001") == "001AA00000A"
        assert (
            resolver.resolve("RESOLVE:HYDRATE-RT-000001", want="id")
            == "001AA00000A"
        )

    def test_rewrite_csv_with_dict_columns_uses_per_column_kind(
        self, tmp_path: Path,
    ) -> None:
        # Mixed CSV: AccountId (001) + ContactId (003) sharing the same
        # external id key. Per-column ``want`` must produce different ids.
        csv_path = tmp_path / "acr_mixed.csv"
        _write_csv(
            csv_path,
            ["AccountId", "ContactId", "Roles"],
            [
                [
                    "RESOLVE:HYDRATE-RT-000001",
                    "RESOLVE:HYDRATE-RT-000001",
                    "Owner",
                ],
            ],
        )
        resolver = IdResolver(
            by_external_id={"HYDRATE-RT-000001": "001AA00000A"},
            contact_id_by_account_external_id={
                "HYDRATE-RT-000001": "003AA00000P",
            },
        )
        kept, dropped = rewrite_csv_resolve_markers(
            csv_path,
            {"AccountId": "id", "ContactId": "contact"},
            resolver,
        )
        assert (kept, dropped) == (1, 0)
        text = csv_path.read_text(encoding="utf-8")
        assert "001AA00000A" in text  # Account got the 001 id
        assert "003AA00000P" in text  # Contact got the 003 id
        assert "RESOLVE:" not in text

    def test_rewrite_csv_with_list_columns_defaults_to_id(
        self, tmp_path: Path,
    ) -> None:
        # Backward compat: passing a list still works and applies want="id".
        csv_path = tmp_path / "task_list.csv"
        _write_csv(
            csv_path,
            ["Subject", "WhatId"],
            [["Call", "RESOLVE:HYDRATE-RT-000001"]],
        )
        resolver = IdResolver(
            by_external_id={"HYDRATE-RT-000001": "001AA00000A"},
            contact_id_by_account_external_id={
                "HYDRATE-RT-000001": "003AA00000P",
            },
        )
        kept, dropped = rewrite_csv_resolve_markers(
            csv_path, ["WhatId"], resolver,
        )
        assert (kept, dropped) == (1, 0)
        text = csv_path.read_text(encoding="utf-8")
        # List form must default to "id" — Account id, NOT Contact id.
        assert "001AA00000A" in text
        assert "003AA00000P" not in text
