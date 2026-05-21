"""Tests for the Goals generator (Plan 2 / Task 6).

The Goals generator emits FinServ__FinancialGoal__c rows. This object's
schema diverges from the spec — `FinServ__GoalType__c` →
`FinServ__Type__c`, `FinServ__TargetAmount__c` → `FinServ__TargetValue__c`,
`FinServ__CurrentAmount__c` → `FinServ__ActualValue__c`, and
`FinServ__Priority__c` is dropped entirely. The fieldmap encodes these
renames; tests verify the generator emits the right physical names AFTER
fieldmap translation.

Status picklist is restrictive: only Not Started / In Progress / Completed.
"""
from __future__ import annotations

import pytest

from customer_hydration.generators.goals import (
    GoalBundle,
    GoalRequest,
    generate_goals,
)


_VALID_STATUSES = {"Not Started", "In Progress", "Completed"}


@pytest.fixture
def sample_requests() -> list[GoalRequest]:
    return [
        GoalRequest(
            primary_owner_external_id="HYDRATE-RT-000001",
            goal_type="Retirement",
            target_amount=1_500_000.0,
            target_year=2045,
        ),
        GoalRequest(
            primary_owner_external_id="HYDRATE-RT-000002",
            goal_type="Home Purchase",
            target_amount=120_000.0,
            target_year=2028,
        ),
        GoalRequest(
            primary_owner_external_id="HYDRATE-WL-000001",
            goal_type="Education",
            target_amount=200_000.0,
            target_year=2038,
        ),
        GoalRequest(
            primary_owner_external_id="HYDRATE-WL-000002",
            goal_type="Investment",
            target_amount=500_000.0,
            target_year=2035,
        ),
        GoalRequest(
            primary_owner_external_id="HYDRATE-RT-000003",
            goal_type="Large Purchase",
            target_amount=80_000.0,
            target_year=2030,
        ),
    ]


@pytest.fixture
def gen_kwargs(fixed_seed, sample_requests):
    return {
        "seed": fixed_seed,
        "starting_seq": 1,
        "requests": sample_requests,
    }


@pytest.fixture
def big_requests() -> list[GoalRequest]:
    """Larger sample to exercise statistical assertions deterministically."""
    requests: list[GoalRequest] = []
    for i in range(40):
        requests.append(
            GoalRequest(
                primary_owner_external_id=f"HYDRATE-RT-{i:06d}",
                goal_type="Retirement" if i % 2 == 0 else "Investment",
                target_amount=100_000.0 + (i * 25_000.0),
                target_year=2030 + (i % 15),
            )
        )
    return requests


class TestGenerateGoals:
    def test_generates_one_goal_per_request(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        assert isinstance(bundle, GoalBundle)
        assert len(bundle.goals) == len(gen_kwargs["requests"])

    def test_external_ids_sequential_zero_padded(self, gen_kwargs):
        gen_kwargs["starting_seq"] = 5
        bundle = generate_goals(**gen_kwargs)
        ext_ids = [g["External_ID__c"] for g in bundle.goals]
        assert ext_ids[0] == "HYDRATE-GOAL-000005"
        for i, eid in enumerate(ext_ids):
            assert eid == f"HYDRATE-GOAL-{5 + i:06d}"
            # Tail is exactly 6 digits.
            assert len(eid.split("-")[-1]) == 6

    def test_uses_type_field_not_goal_type_field(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            assert "FinServ__Type__c" in g
            assert g["FinServ__Type__c"]
            assert "FinServ__GoalType__c" not in g

    def test_uses_target_value_field_not_target_amount(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            assert "FinServ__TargetValue__c" in g
            assert g["FinServ__TargetValue__c"] > 0
            assert "FinServ__TargetAmount__c" not in g

    def test_uses_actual_value_field_not_current_amount(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            assert "FinServ__ActualValue__c" in g
            assert g["FinServ__ActualValue__c"] >= 0
            assert "FinServ__CurrentAmount__c" not in g

    def test_priority_field_not_emitted(self, gen_kwargs):
        # FinServ__Priority__c is DROPPED by fieldmap — must never appear.
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            assert "FinServ__Priority__c" not in g

    def test_status_in_three_value_picklist(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            assert g["FinServ__Status__c"] in _VALID_STATUSES

    def test_actual_value_within_5pct_to_80pct_of_target(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            target = g["FinServ__TargetValue__c"]
            actual = g["FinServ__ActualValue__c"]
            ratio = actual / target
            assert 0.05 <= ratio <= 0.80, (
                f"actual/target ratio out of range: actual={actual} "
                f"target={target} ratio={ratio}"
            )

    def test_target_date_is_dec_31_of_target_year(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g, req in zip(bundle.goals, gen_kwargs["requests"]):
            target_date = g["FinServ__TargetDate__c"]
            assert isinstance(target_date, str)
            assert target_date.endswith("-12-31")
            assert target_date == f"{req.target_year}-12-31"

    def test_completion_date_only_set_when_completed(self, big_requests, fixed_seed):
        # Use a larger sample so we hit at least one Completed (10% prob).
        bundle = generate_goals(
            seed=fixed_seed, starting_seq=1, requests=big_requests
        )
        for g in bundle.goals:
            if g["FinServ__Status__c"] == "Completed":
                assert "FinServ__CompletionDate__c" in g
                assert g["FinServ__CompletionDate__c"]
            else:
                assert "FinServ__CompletionDate__c" not in g

    def test_initial_value_is_zero(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g in bundle.goals:
            assert g["FinServ__InitialValue__c"] == 0

    def test_links_to_primary_owner(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g, req in zip(bundle.goals, gen_kwargs["requests"]):
            assert g["FinServ__PrimaryOwner__c"] == req.primary_owner_external_id

    def test_name_includes_goal_type_or_persona_flavored(self, gen_kwargs):
        bundle = generate_goals(**gen_kwargs)
        for g, req in zip(bundle.goals, gen_kwargs["requests"]):
            name = g["Name"]
            assert isinstance(name, str)
            assert name  # non-empty
            # Type-specific persona-flavored expectations.
            if req.goal_type == "Retirement":
                assert str(req.target_year) in name
                assert "Retire" in name
            elif req.goal_type == "Home Purchase":
                assert "home" in name.lower()
            elif req.goal_type == "Education":
                assert "College fund" in name
            else:
                # Falls through to "{goal_type} - {target_year}" template.
                assert req.goal_type in name
                assert str(req.target_year) in name

    def test_same_seed_produces_identical_output(self, gen_kwargs):
        bundle1 = generate_goals(**gen_kwargs)
        bundle2 = generate_goals(**gen_kwargs)
        assert bundle1.goals == bundle2.goals
