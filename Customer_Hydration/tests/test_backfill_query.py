"""Tests for the Phase 4d SOQL query builder + chunked fetch (spec §5.1)."""
from unittest.mock import MagicMock, call

import pytest

from customer_hydration.backfill.query import (
    PERSONA_PREFIX_MAP,
    build_select_clause,
    build_where_clause,
    fetch_account_chunks,
)


def test_build_select_includes_owned_fields_plus_anchors():
    """SELECT must include owned-by-deriver fields PLUS read-only anchors
    (CreatedDate, RecordType.Name, IsPersonAccount, External_ID__c, Id, AnnualIncome,
    AnnualRevenue, Industry, AccountSource, FinServ__Total* rollups, BillingCity,
    ShippingCity, Description, PersonBirthdate, PersonGender, PersonGenderIdentity,
    FinServ__MaritalStatus__pc, FinServ__NumberOfDependents__pc,
    FinServ__LastInteraction__c)."""
    owned = ["FinServ__CreditScore__c", "Tier__c"]
    soql_select = build_select_clause(owned)
    # Required anchors
    assert "Id" in soql_select
    assert "External_ID__c" in soql_select
    assert "RecordType.Name" in soql_select
    assert "IsPersonAccount" in soql_select
    assert "CreatedDate" in soql_select
    assert "FinServ__AnnualIncome__pc" in soql_select
    assert "AnnualRevenue" in soql_select
    assert "PersonBirthdate" in soql_select
    # Owned fields
    assert "FinServ__CreditScore__c" in soql_select
    assert "Tier__c" in soql_select


def test_build_select_deduplicates():
    """If owned list and anchors overlap (rare but possible), no duplicate columns."""
    owned = ["Id", "FinServ__CreditScore__c"]  # Id is already an anchor
    soql_select = build_select_clause(owned)
    # Count occurrences of "Id," (with the trailing comma to disambiguate)
    fields = [f.strip() for f in soql_select.split(",")]
    assert fields.count("Id") == 1


def test_build_where_no_filters_returns_empty_string():
    assert build_where_clause(persona=None, record_type=None) == ""


def test_build_where_persona_uses_external_id_prefix():
    """--persona retail → WHERE External_ID__c LIKE 'HYDRATE-RTL-%'."""
    where = build_where_clause(persona="retail", record_type=None)
    assert "External_ID__c LIKE 'HYDRATE-RTL-%'" in where


def test_build_where_multiple_personas():
    """--persona retail,wealth → both prefixes joined with OR."""
    where = build_where_clause(persona="retail,wealth", record_type=None)
    assert "HYDRATE-RTL-" in where
    assert "HYDRATE-WLT-" in where
    assert " OR " in where


def test_build_where_record_type_filter():
    """--record-type Business → WHERE RecordType.Name = 'Business'."""
    where = build_where_clause(persona=None, record_type="Business")
    assert "RecordType.Name = 'Business'" in where


def test_build_where_record_type_multiple():
    """--record-type Business,Household → Name IN ('Business', 'Household')."""
    where = build_where_clause(persona=None, record_type="Business,Household")
    assert "RecordType.Name IN" in where
    assert "Business" in where
    assert "Household" in where


def test_build_where_combines_persona_and_record_type_with_and():
    where = build_where_clause(persona="retail", record_type="FSC Person Accounts")
    assert "External_ID__c LIKE 'HYDRATE-RTL-%'" in where
    assert "RecordType.Name" in where
    assert " AND " in where


def test_persona_prefix_map_covers_known_personas():
    """All 5 hydration personas have External_ID__c prefixes (now lists,
    so a single persona can match multiple variants — e.g., retail accepts
    both 'HYDRATE-RT-' (real org form) and 'HYDRATE-RTL-' (spec form))."""
    assert "HYDRATE-RT-" in PERSONA_PREFIX_MAP["retail"]
    assert "HYDRATE-RTL-" in PERSONA_PREFIX_MAP["retail"]
    assert "HYDRATE-WL-" in PERSONA_PREFIX_MAP["wealth"]
    assert "HYDRATE-WLT-" in PERSONA_PREFIX_MAP["wealth"]
    assert PERSONA_PREFIX_MAP["smb"] == ["HYDRATE-SMB-"]
    assert PERSONA_PREFIX_MAP["commercial"] == ["HYDRATE-COM-"]
    assert PERSONA_PREFIX_MAP["household"] == ["HYDRATE-HH-"]


def test_fetch_account_chunks_yields_lists_of_dicts():
    """fetch_account_chunks paginates via SfRunner.query and yields chunks."""
    sf_runner = MagicMock()
    # Simulate two chunks: first 2000 records, second 500 records
    sf_runner.query.side_effect = [
        [{"Id": f"001xx{i:06d}"} for i in range(2000)],
        [{"Id": f"001xx{i:06d}"} for i in range(2000, 2500)],
    ]
    chunks = list(fetch_account_chunks(
        sf_runner, owned_fields=["Tier__c"],
        persona=None, record_type=None,
        chunk_size=2000, limit=None,
    ))
    assert len(chunks) == 2
    assert len(chunks[0]) == 2000
    assert len(chunks[1]) == 500


def test_fetch_account_chunks_respects_limit():
    """If --limit 100, fetch only one chunk of 100 records max."""
    sf_runner = MagicMock()
    sf_runner.query.return_value = [{"Id": f"001xx{i:06d}"} for i in range(100)]
    chunks = list(fetch_account_chunks(
        sf_runner, owned_fields=["Tier__c"],
        persona=None, record_type=None,
        chunk_size=2000, limit=100,
    ))
    assert len(chunks) == 1
    assert len(chunks[0]) == 100
    # The SOQL passed to query must have LIMIT 100 in it
    assert "LIMIT 100" in sf_runner.query.call_args_list[0][0][0]
