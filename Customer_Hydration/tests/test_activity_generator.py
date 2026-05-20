"""Tests for the Activity generator (Plan 2 / Task 9).

The Activity generator emits four kinds of records — Cases, Tasks,
Events, Opportunities — from a unified request API. They share calendar-
aware date logic, RM ownership, and persona-flavored content templates,
which is why one module produces all four.

Picklist values were verified against jdo-fw51xz:

  Case.Type      4 values  (Product Support, Account Support, General, Technical Issue)
  Case.Status    6 values  (New, Working, Waiting on Customer, Reply Received, Escalated, Closed)
  Case.Priority  4 values  (Critical, High, Medium, Low)
  Case.Origin    13 values (Chat, Community, Email, Facebook, Google, Instagram,
                            LinkedIn, Mobile Device, Phone, Slack, SMS, Twitter, Website)
  Opportunity.StageName subset (5):
                 Prospecting, Qualification, Proposal Issued, Closed Won, Closed Lost
  Opportunity.Type subset (2):
                 New Business, Renewal

Calendar-aware shape (anchor = 2026-05-20):
  Tasks: ~30% future (next 14d), ~10% overdue, ~60% historical (Completed)
  Opp CloseDate spread across Q-1 / Q0 / Q+1 / Q+2.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from customer_hydration.generators.activity import (
    ActivityBundle,
    CaseRequest,
    EventRequest,
    OpportunityRequest,
    TaskRequest,
    generate_cases,
    generate_events,
    generate_opportunities,
    generate_tasks,
)


_ANCHOR = date(2026, 5, 20)

_CASE_TYPES = {"Product Support", "Account Support", "General", "Technical Issue"}
_CASE_STATUSES = {
    "New",
    "Working",
    "Waiting on Customer",
    "Reply Received",
    "Escalated",
    "Closed",
}
_CASE_PRIORITIES = {"Critical", "High", "Medium", "Low"}
_CASE_ORIGINS = {
    "Chat",
    "Community",
    "Email",
    "Facebook",
    "Google",
    "Instagram",
    "LinkedIn",
    "Mobile Device",
    "Phone",
    "Slack",
    "SMS",
    "Twitter",
    "Website",
}

_OPP_STAGES = {
    "Prospecting",
    "Qualification",
    "Proposal Issued",
    "Closed Won",
    "Closed Lost",
}
_OPP_TYPES = {"New Business", "Renewal"}
_OPP_PROBABILITIES = {
    "Prospecting": 10,
    "Qualification": 25,
    "Proposal Issued": 60,
    "Closed Won": 100,
    "Closed Lost": 0,
}

_TASK_STATUSES = {
    "Not Started",
    "In Progress",
    "Completed",
    "Deferred",
    "Waiting on someone else",
}

_PERSONAS = ("retail", "wealth", "smb", "commercial")


# ---------- Cases ----------------------------------------------------------


def _case_req(seq: int, persona: str = "retail") -> CaseRequest:
    return CaseRequest(
        account_external_id=f"HYDRATE-RT-{seq:06d}",
        contact_id_marker=None,
        persona=persona,
        rm_user_id="005000000000RT1",
    )


@pytest.fixture
def case_requests() -> list[CaseRequest]:
    reqs: list[CaseRequest] = []
    for i in range(1, 6):
        persona = _PERSONAS[(i - 1) % len(_PERSONAS)]
        reqs.append(_case_req(i, persona=persona))
    return reqs


@pytest.fixture
def case_kwargs(fixed_seed, case_requests):
    return {"seed": fixed_seed, "starting_seq": 1, "requests": case_requests}


class TestGenerateCases:
    def test_generates_one_case_per_request(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        assert isinstance(bundle, ActivityBundle)
        assert len(bundle.cases) == len(case_kwargs["requests"])

    def test_external_ids_sequential_with_case_prefix(self, case_kwargs):
        case_kwargs["starting_seq"] = 11
        bundle = generate_cases(**case_kwargs)
        ids = [c["External_ID__c"] for c in bundle.cases]
        assert ids[0] == "HYDRATE-CASE-000011"
        for i, eid in enumerate(ids):
            assert eid == f"HYDRATE-CASE-{11 + i:06d}"
            assert len(eid.split("-")[-1]) == 6

    def test_case_type_is_in_4_value_picklist(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        for c in bundle.cases:
            assert c["Type"] in _CASE_TYPES

    def test_case_status_is_in_6_value_picklist(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        for c in bundle.cases:
            assert c["Status"] in _CASE_STATUSES

    def test_case_priority_is_in_4_value_picklist(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        for c in bundle.cases:
            assert c["Priority"] in _CASE_PRIORITIES

    def test_case_origin_is_in_13_value_picklist(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        for c in bundle.cases:
            assert c["Origin"] in _CASE_ORIGINS

    def test_case_links_to_account(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        for case_row, req in zip(bundle.cases, case_kwargs["requests"]):
            assert case_row["AccountId"] == req.account_external_id

    def test_case_owner_set_from_rm(self, case_kwargs):
        bundle = generate_cases(**case_kwargs)
        for case_row, req in zip(bundle.cases, case_kwargs["requests"]):
            assert case_row["OwnerId"] == req.rm_user_id


# ---------- Tasks ----------------------------------------------------------


def _task_req(seq: int, persona: str = "retail") -> TaskRequest:
    return TaskRequest(
        account_external_id=f"HYDRATE-RT-{seq:06d}",
        rm_user_id="005000000000RT1",
        persona=persona,
    )


@pytest.fixture
def task_requests() -> list[TaskRequest]:
    reqs: list[TaskRequest] = []
    for i in range(1, 6):
        persona = _PERSONAS[(i - 1) % len(_PERSONAS)]
        reqs.append(_task_req(i, persona=persona))
    return reqs


@pytest.fixture
def task_kwargs(fixed_seed, task_requests):
    return {"seed": fixed_seed, "starting_seq": 1, "requests": task_requests}


class TestGenerateTasks:
    def test_generates_one_task_per_request(self, task_kwargs):
        bundle = generate_tasks(**task_kwargs)
        assert isinstance(bundle, ActivityBundle)
        assert len(bundle.tasks) == len(task_kwargs["requests"])

    def test_external_ids_sequential_with_task_prefix(self, task_kwargs):
        task_kwargs["starting_seq"] = 4
        bundle = generate_tasks(**task_kwargs)
        ids = [t["External_ID__c"] for t in bundle.tasks]
        assert ids[0] == "HYDRATE-TASK-000004"
        for i, eid in enumerate(ids):
            assert eid == f"HYDRATE-TASK-{4 + i:06d}"
            assert len(eid.split("-")[-1]) == 6

    def test_task_calendar_aware_shape(self, fixed_seed):
        # 200 requests give us enough samples to assert ±10pp tolerance per
        # bucket (target: 30% future / 10% overdue / 60% historical).
        reqs = [
            _task_req(i, persona=_PERSONAS[i % len(_PERSONAS)])
            for i in range(1, 201)
        ]
        bundle = generate_tasks(seed=fixed_seed, starting_seq=1, requests=reqs)
        future = overdue = historical = 0
        for t in bundle.tasks:
            d = date.fromisoformat(t["ActivityDate"])
            if d > _ANCHOR and (d - _ANCHOR).days <= 14:
                future += 1
            elif d < _ANCHOR and t["Status"] != "Completed":
                overdue += 1
            elif d < _ANCHOR and t["Status"] == "Completed":
                historical += 1
        n = len(bundle.tasks)
        # Allow ±10pp tolerance per bucket.
        assert 0.20 <= future / n <= 0.40, f"future ratio {future / n}"
        assert 0.00 <= overdue / n <= 0.20, f"overdue ratio {overdue / n}"
        assert 0.50 <= historical / n <= 0.70, f"historical ratio {historical / n}"

    def test_task_links_to_account_via_what_id(self, task_kwargs):
        bundle = generate_tasks(**task_kwargs)
        for t, req in zip(bundle.tasks, task_kwargs["requests"]):
            assert t["WhatId"] == req.account_external_id

    def test_task_owner_set_from_rm(self, task_kwargs):
        bundle = generate_tasks(**task_kwargs)
        for t, req in zip(bundle.tasks, task_kwargs["requests"]):
            assert t["OwnerId"] == req.rm_user_id

    def test_task_subject_persona_flavored(self, fixed_seed):
        # Same seed + same starting_seq, but different personas produce
        # different subject populations.
        retail_reqs = [_task_req(i, persona="retail") for i in range(1, 21)]
        wealth_reqs = [_task_req(i, persona="wealth") for i in range(1, 21)]
        retail_bundle = generate_tasks(
            seed=fixed_seed, starting_seq=1, requests=retail_reqs
        )
        wealth_bundle = generate_tasks(
            seed=fixed_seed, starting_seq=1, requests=wealth_reqs
        )
        retail_subjects = {t["Subject"] for t in retail_bundle.tasks}
        wealth_subjects = {t["Subject"] for t in wealth_bundle.tasks}
        # Subjects should not overlap — each persona has its own template set.
        assert retail_subjects.isdisjoint(wealth_subjects)

    def test_task_status_in_valid_values(self, task_kwargs):
        bundle = generate_tasks(**task_kwargs)
        for t in bundle.tasks:
            assert t["Status"] in _TASK_STATUSES

    def test_task_external_id_present(self, task_kwargs):
        bundle = generate_tasks(**task_kwargs)
        for t in bundle.tasks:
            assert t.get("External_ID__c", "").startswith("HYDRATE-TASK-")


# ---------- Events ---------------------------------------------------------


def _event_req(seq: int, persona: str = "retail") -> EventRequest:
    return EventRequest(
        account_external_id=f"HYDRATE-RT-{seq:06d}",
        rm_user_id="005000000000RT1",
        persona=persona,
    )


@pytest.fixture
def event_requests() -> list[EventRequest]:
    return [
        _event_req(i, persona=_PERSONAS[(i - 1) % len(_PERSONAS)])
        for i in range(1, 6)
    ]


@pytest.fixture
def event_kwargs(fixed_seed, event_requests):
    return {"seed": fixed_seed, "starting_seq": 1, "requests": event_requests}


class TestGenerateEvents:
    def test_generates_one_event_per_request(self, event_kwargs):
        bundle = generate_events(**event_kwargs)
        assert isinstance(bundle, ActivityBundle)
        assert len(bundle.events) == len(event_kwargs["requests"])

    def test_event_external_ids_use_evt_prefix(self, event_kwargs):
        event_kwargs["starting_seq"] = 2
        bundle = generate_events(**event_kwargs)
        ids = [e["External_ID__c"] for e in bundle.events]
        assert ids[0] == "HYDRATE-EVT-000002"
        for i, eid in enumerate(ids):
            assert eid == f"HYDRATE-EVT-{2 + i:06d}"
            assert len(eid.split("-")[-1]) == 6

    def test_event_start_before_end(self, event_kwargs):
        bundle = generate_events(**event_kwargs)
        for e in bundle.events:
            start = datetime.fromisoformat(e["StartDateTime"])
            end = datetime.fromisoformat(e["EndDateTime"])
            assert start < end

    def test_event_during_business_hours_weekdays(self, fixed_seed):
        # Larger sample to cover the random window robustly.
        reqs = [
            _event_req(i, persona=_PERSONAS[i % len(_PERSONAS)])
            for i in range(1, 51)
        ]
        bundle = generate_events(seed=fixed_seed, starting_seq=1, requests=reqs)
        for e in bundle.events:
            start = datetime.fromisoformat(e["StartDateTime"])
            assert start.weekday() < 5, (
                f"event start {start} is on a weekend (weekday={start.weekday()})"
            )
            assert 8 <= start.hour <= 17, (
                f"event start hour {start.hour} not in business hours"
            )

    def test_event_links_to_account(self, event_kwargs):
        bundle = generate_events(**event_kwargs)
        for e, req in zip(bundle.events, event_kwargs["requests"]):
            assert e["WhatId"] == req.account_external_id


# ---------- Opportunities --------------------------------------------------


def _opp_req(
    seq: int, persona: str = "retail", product_keyword: str = "HELOC"
) -> OpportunityRequest:
    return OpportunityRequest(
        account_external_id=f"HYDRATE-RT-{seq:06d}",
        rm_user_id="005000000000RT1",
        persona=persona,
        product_keyword=product_keyword,
    )


@pytest.fixture
def opp_requests() -> list[OpportunityRequest]:
    return [
        _opp_req(1, persona="retail", product_keyword="HELOC"),
        _opp_req(2, persona="wealth", product_keyword="Trust establishment"),
        _opp_req(3, persona="smb", product_keyword="LOC renewal"),
        _opp_req(4, persona="commercial", product_keyword="Treasury"),
        _opp_req(5, persona="retail", product_keyword="Mortgage"),
    ]


@pytest.fixture
def opp_kwargs(fixed_seed, opp_requests):
    return {"seed": fixed_seed, "starting_seq": 1, "requests": opp_requests}


class TestGenerateOpportunities:
    def test_generates_one_opp_per_request(self, opp_kwargs):
        bundle = generate_opportunities(**opp_kwargs)
        assert isinstance(bundle, ActivityBundle)
        assert len(bundle.opportunities) == len(opp_kwargs["requests"])

    def test_opp_external_ids_use_opp_prefix(self, opp_kwargs):
        opp_kwargs["starting_seq"] = 3
        bundle = generate_opportunities(**opp_kwargs)
        ids = [o["External_ID__c"] for o in bundle.opportunities]
        assert ids[0] == "HYDRATE-OPP-000003"
        for i, eid in enumerate(ids):
            assert eid == f"HYDRATE-OPP-{3 + i:06d}"
            assert len(eid.split("-")[-1]) == 6

    def test_opp_stage_in_5_value_subset(self, opp_kwargs):
        bundle = generate_opportunities(**opp_kwargs)
        for o in bundle.opportunities:
            assert o["StageName"] in _OPP_STAGES

    def test_opp_type_in_2_value_subset(self, opp_kwargs):
        bundle = generate_opportunities(**opp_kwargs)
        for o in bundle.opportunities:
            assert o["Type"] in _OPP_TYPES

    def test_opp_probability_matches_stage(self, opp_kwargs):
        bundle = generate_opportunities(**opp_kwargs)
        for o in bundle.opportunities:
            assert o["Probability"] == _OPP_PROBABILITIES[o["StageName"]]

    def test_opp_close_date_quarter_distribution(self, fixed_seed):
        # 200 requests — distribution should hit each of Q-1/Q0/Q+1/Q+2.
        reqs = [
            _opp_req(
                i,
                persona=_PERSONAS[i % len(_PERSONAS)],
                product_keyword="HELOC",
            )
            for i in range(1, 201)
        ]
        bundle = generate_opportunities(seed=fixed_seed, starting_seq=1, requests=reqs)

        def _quarter_offset(close_date: date) -> int:
            anchor_q_start = date(_ANCHOR.year, ((_ANCHOR.month - 1) // 3) * 3 + 1, 1)
            offset_months = (close_date.year - anchor_q_start.year) * 12 + (
                close_date.month - anchor_q_start.month
            )
            return offset_months // 3

        buckets: dict[int, int] = {-1: 0, 0: 0, 1: 0, 2: 0}
        for o in bundle.opportunities:
            d = date.fromisoformat(o["CloseDate"])
            qo = _quarter_offset(d)
            assert qo in buckets, f"close date {d} fell outside Q-1..Q+2"
            buckets[qo] += 1
        # All four quarters should have been hit.
        for q, count in buckets.items():
            assert count > 0, f"no opps landed in Q{q}"

    def test_opp_amount_positive(self, opp_kwargs):
        bundle = generate_opportunities(**opp_kwargs)
        for o in bundle.opportunities:
            assert o["Amount"] > 0

    def test_opp_links_to_account_and_owner(self, opp_kwargs):
        bundle = generate_opportunities(**opp_kwargs)
        for o, req in zip(bundle.opportunities, opp_kwargs["requests"]):
            assert o["AccountId"] == req.account_external_id
            assert o["OwnerId"] == req.rm_user_id


# ---------- Validation ----------------------------------------------------


class TestValidation:
    def test_invalid_persona_raises(self, fixed_seed):
        bad = TaskRequest(
            account_external_id="HYDRATE-RT-000001",
            rm_user_id="005000000000RT1",
            persona="nope",
        )
        with pytest.raises(ValueError):
            generate_tasks(seed=fixed_seed, starting_seq=1, requests=[bad])
