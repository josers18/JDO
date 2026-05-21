"""Tests for the native FinancialGoal generator (Plan 4 / Task 3)."""
from __future__ import annotations

import pytest

from customer_hydration.native.financial_goal import (
    NativeFinancialGoalBundle,
    generate_native_financial_goals,
)


def _legacy_goal(
    ext_id: str = "HYDRATE-GOAL-000001",
    *,
    name: str = "Retire by 2045",
    goal_type: str = "Retirement",
    status: str = "In Progress",
    target: float = 1_500_000.0,
    actual: float = 200_000.0,
    target_date: str = "2045-12-31",
) -> dict:
    """Build a post-fieldmap legacy goal row dict."""
    return {
        "Name": name,
        "FinServ__Type__c": goal_type,
        "FinServ__Status__c": status,
        "FinServ__TargetValue__c": target,
        "FinServ__ActualValue__c": actual,
        "FinServ__TargetDate__c": target_date,
        "External_ID__c": ext_id,
    }


@pytest.fixture
def three_legacy_goals() -> list[dict]:
    return [
        _legacy_goal("HYDRATE-GOAL-000001", goal_type="Retirement", target=1_500_000.0),
        _legacy_goal("HYDRATE-GOAL-000002", goal_type="Home Purchase", target=120_000.0),
        _legacy_goal("HYDRATE-GOAL-000003", goal_type="Education", target=200_000.0),
    ]


@pytest.fixture
def full_id_map() -> dict[str, str]:
    return {
        "HYDRATE-GOAL-000001": "a02000000000001",
        "HYDRATE-GOAL-000002": "a02000000000002",
        "HYDRATE-GOAL-000003": "a02000000000003",
    }


class TestGenerateNativeFinancialGoals:
    def test_generates_one_native_per_legacy(
        self,
        three_legacy_goals: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_goals(
            starting_seq=1,
            legacy_goal_rows=three_legacy_goals,
            legacy_id_map=full_id_map,
        )
        assert isinstance(bundle, NativeFinancialGoalBundle)
        assert len(bundle.rows) == 3

    def test_legacy_id_field_set(
        self,
        three_legacy_goals: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_goals(
            starting_seq=1,
            legacy_goal_rows=three_legacy_goals,
            legacy_id_map=full_id_map,
        )
        assert bundle.rows[0]["LegacyId__c"] == "a02000000000001"
        assert bundle.rows[2]["LegacyId__c"] == "a02000000000003"

    def test_external_id_starts_with_ngoal_prefix(
        self,
        three_legacy_goals: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_goals(
            starting_seq=1,
            legacy_goal_rows=three_legacy_goals,
            legacy_id_map=full_id_map,
        )
        for row in bundle.rows:
            assert row["External_ID__c"].startswith("HYDRATE-NGOAL-")
        assert bundle.rows[0]["External_ID__c"] == "HYDRATE-NGOAL-000001"

    def test_type_status_copied_from_legacy(
        self,
        three_legacy_goals: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_goals(
            starting_seq=1,
            legacy_goal_rows=three_legacy_goals,
            legacy_id_map=full_id_map,
        )
        assert bundle.rows[0]["Type"] == "Retirement"
        assert bundle.rows[0]["Status"] == "In Progress"
        assert bundle.rows[1]["Type"] == "Home Purchase"
        assert bundle.rows[2]["Type"] == "Education"

    def test_target_value_copied(
        self,
        three_legacy_goals: list[dict],
        full_id_map: dict[str, str],
    ) -> None:
        bundle = generate_native_financial_goals(
            starting_seq=1,
            legacy_goal_rows=three_legacy_goals,
            legacy_id_map=full_id_map,
        )
        assert bundle.rows[0]["TargetValue"] == 1_500_000.0
        assert bundle.rows[1]["TargetValue"] == 120_000.0

    def test_skips_unresolved_legacy_id(
        self,
        three_legacy_goals: list[dict],
    ) -> None:
        partial_map = {
            "HYDRATE-GOAL-000001": "a02000000000001",
            # GOAL-000002 missing
            "HYDRATE-GOAL-000003": "a02000000000003",
        }
        bundle = generate_native_financial_goals(
            starting_seq=1,
            legacy_goal_rows=three_legacy_goals,
            legacy_id_map=partial_map,
        )
        assert len(bundle.rows) == 2
        legacy_ids = {row["LegacyId__c"] for row in bundle.rows}
        assert legacy_ids == {"a02000000000001", "a02000000000003"}
