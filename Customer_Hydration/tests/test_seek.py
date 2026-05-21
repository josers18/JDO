"""Tests for the External-ID seek-pointer module."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from customer_hydration.seek import compute_next_seq, parse_seq_from_external_id


class TestParseSeqFromExternalId:
    def test_parses_zero_padded_six_digit_seq(self):
        assert parse_seq_from_external_id("HYDRATE-RT-007421") == 7421

    def test_parses_seq_with_leading_zeros(self):
        assert parse_seq_from_external_id("HYDRATE-RT-000001") == 1

    def test_parses_seq_with_no_leading_zeros(self):
        assert parse_seq_from_external_id("HYDRATE-WL-1234567") == 1234567

    def test_returns_none_for_non_hydrate_external_id(self):
        assert parse_seq_from_external_id("LEGACY-ABC-001") is None

    def test_returns_none_for_malformed_external_id(self):
        assert parse_seq_from_external_id("HYDRATE-RT") is None

    def test_returns_none_for_empty_string(self):
        assert parse_seq_from_external_id("") is None


class TestComputeNextSeq:
    def test_returns_one_when_org_has_no_existing_records(self):
        runner = MagicMock()
        runner.query.return_value = []
        assert compute_next_seq(runner, "HYDRATE-RT", "Account") == 1
        runner.query.assert_called_once()

    def test_returns_max_plus_one_when_records_exist(self):
        runner = MagicMock()
        runner.query.return_value = [
            {"External_ID__c": "HYDRATE-RT-000001"},
            {"External_ID__c": "HYDRATE-RT-000005"},
            {"External_ID__c": "HYDRATE-RT-000003"},
        ]
        assert compute_next_seq(runner, "HYDRATE-RT", "Account") == 6

    def test_ignores_unparseable_external_ids(self):
        runner = MagicMock()
        runner.query.return_value = [
            {"External_ID__c": "HYDRATE-RT-000010"},
            {"External_ID__c": "JUNK-VALUE"},
            {"External_ID__c": None},
        ]
        assert compute_next_seq(runner, "HYDRATE-RT", "Account") == 11

    def test_uses_correct_soql_for_account(self):
        runner = MagicMock()
        runner.query.return_value = []
        compute_next_seq(runner, "HYDRATE-RT", "Account")
        sql = runner.query.call_args[0][0]
        assert "External_ID__c" in sql
        assert "FROM Account" in sql
        assert "HYDRATE-RT-%" in sql
