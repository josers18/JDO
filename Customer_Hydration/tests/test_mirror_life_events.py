"""Tests for the legacy → native LifeEvent mirror.

Covers the pure logic (parsing, request translation, seq preservation).
SOQL/Bulk org-touching paths are exercised via runner-level smoke runs,
not duplicated as mocks here.
"""
from __future__ import annotations

from datetime import date

import pytest

from customer_hydration.mirror_life_events import (
    LegacyRow,
    _generate_native_rows_with_legacy_seqs,
    to_native_requests,
)


@pytest.fixture
def sample_legacy_rows() -> list[LegacyRow]:
    return [
        LegacyRow(
            seq=1,
            client_external_id="HYDRATE-RT-000002",
            event_type="New Job",
            event_date=date(2026, 3, 28),
        ),
        LegacyRow(
            seq=42,
            client_external_id="HYDRATE-WL-001234",
            event_type="Retirement",
            event_date=date(2026, 1, 1),
        ),
        LegacyRow(
            seq=12518,
            client_external_id="HYDRATE-CM-000099",
            event_type="College",
            event_date=date(2025, 8, 15),
        ),
    ]


class TestToNativeRequests:
    def test_translates_each_legacy_event_type(
        self, sample_legacy_rows: list[LegacyRow],
    ) -> None:
        out = to_native_requests(sample_legacy_rows)
        assert [r.event_type for r in out] == ["Job", "Retirement", "Graduation"]

    def test_preserves_client_and_date(
        self, sample_legacy_rows: list[LegacyRow],
    ) -> None:
        out = to_native_requests(sample_legacy_rows)
        assert out[0].client_account_external_id == "HYDRATE-RT-000002"
        assert out[1].event_date == date(2026, 1, 1)

    def test_skips_unmapped_event_types(self, capsys) -> None:
        # Defensive — if a future legacy row carries an event_type that
        # isn't in LEGACY_TO_NATIVE_EVENT_TYPE, it should be dropped (with
        # a warning), not crash the mirror or fabricate a fallback.
        out = to_native_requests([
            LegacyRow(
                seq=1,
                client_external_id="HYDRATE-RT-000001",
                event_type="Inheritance",  # not in jdo's legacy picklist
                event_date=date(2026, 1, 1),
            ),
        ])
        assert out == []
        warn = capsys.readouterr().err
        assert "unmapped legacy event_type" in warn


class TestGenerateNativeRowsWithLegacySeqs:
    def test_native_seqs_match_legacy_seqs(
        self, sample_legacy_rows: list[LegacyRow],
    ) -> None:
        # The whole point of the mirror — HYDRATE-LE-007842 must produce
        # HYDRATE-NLE-007842 deterministically across re-runs. If the
        # generator's monotonic seq counter were used, the mirror output
        # would re-number rows starting at the legacy minimum, breaking
        # idempotency on subsequent legacy adds.
        rows = _generate_native_rows_with_legacy_seqs(sample_legacy_rows)
        assert [r["External_ID__c"] for r in rows] == [
            "HYDRATE-NLE-000001",
            "HYDRATE-NLE-000042",
            "HYDRATE-NLE-012518",
        ]

    def test_one_row_per_legacy_row(
        self, sample_legacy_rows: list[LegacyRow],
    ) -> None:
        rows = _generate_native_rows_with_legacy_seqs(sample_legacy_rows)
        assert len(rows) == len(sample_legacy_rows)

    def test_event_date_is_iso_datetime(
        self, sample_legacy_rows: list[LegacyRow],
    ) -> None:
        rows = _generate_native_rows_with_legacy_seqs(sample_legacy_rows)
        # PersonLifeEvent.EventDate is xsd:dateTime; the native generator
        # appends T00:00:00.000Z. Verifies the mirror inherits that
        # behavior rather than re-implementing date formatting.
        assert rows[0]["EventDate"] == "2026-03-28T00:00:00.000Z"

    def test_primary_person_id_uses_resolve_marker(
        self, sample_legacy_rows: list[LegacyRow],
    ) -> None:
        rows = _generate_native_rows_with_legacy_seqs(sample_legacy_rows)
        assert rows[0]["PrimaryPersonId"] == "RESOLVE:HYDRATE-RT-000002"

    def test_skips_unmapped_event_types_silently(self) -> None:
        # Same defensive behavior as to_native_requests but on the
        # row-generation path. Rows with bad legacy event_types are
        # dropped silently — to_native_requests already warned (or will
        # warn if invoked separately).
        rows = _generate_native_rows_with_legacy_seqs([
            LegacyRow(
                seq=1, client_external_id="HYDRATE-RT-000001",
                event_type="Inheritance", event_date=date(2026, 1, 1),
            ),
            LegacyRow(
                seq=2, client_external_id="HYDRATE-RT-000002",
                event_type="New Job", event_date=date(2026, 1, 1),
            ),
        ])
        assert len(rows) == 1
        assert rows[0]["External_ID__c"] == "HYDRATE-NLE-000002"
