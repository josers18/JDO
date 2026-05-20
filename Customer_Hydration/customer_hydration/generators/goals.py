"""Goals generator (Plan 2 / Task 6).

Emits FinServ__FinancialGoal__c rows from a list of GoalRequests — one
row per financial goal a customer is pursuing (Retirement, Home Purchase,
Education, Investment, Large Purchase, etc.). Goals attach to a Person
Account or business via FinServ__PrimaryOwner__c.

This object's schema diverges from the spec — the fieldmap encodes:

  Spec / logical                      Physical (org)                Notes
  ---------------------------------   ---------------------------   --------
  FinServ__GoalType__c                FinServ__Type__c              renamed
  FinServ__TargetAmount__c            FinServ__TargetValue__c       renamed
  FinServ__CurrentAmount__c           FinServ__ActualValue__c       renamed
  FinServ__Priority__c                (dropped)                     not used

Status picklist is restrictive — only three values are accepted:
Not Started / In Progress / Completed (no "On Track", "At Risk", or
"Achieved"). Distribution targets a healthy mid-funnel population: 70%
In Progress, 20% Not Started, 10% Completed.

Per-goal economics:
  initial_value = 0
  target_value  = request.target_amount (rounded 2dp)
  actual_value  = target_value × U(0.05, 0.80)        (5%–80% complete)
  target_date   = Dec 31 of request.target_year
  completion_date = only set when Status==Completed (random past 12 mo)

Idempotency: External_ID__c = f"HYDRATE-GOAL-{starting_seq + i:06d}";
FinServ__SourceSystemId__c mirrors it for consistency with other
FinServ__* objects.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, timedelta

from faker import Faker

from customer_hydration.fieldmap import JDO_FIELDMAP


# Restrictive picklist on this org — verified via describe.
_VALID_GOAL_TYPES = {
    "Retirement",
    "Home Purchase",
    "Education",
    "New Business Acquisition",
    "New Customer Acquisition",
    "New Services",
    "Large Purchase",
    "Investment",
    "Other",
}

# Status picklist — only 3 values; no "On Track"/"At Risk"/"Achieved".
_VALID_STATUSES = ("Not Started", "In Progress", "Completed")
# 70% In Progress, 20% Not Started, 10% Completed — healthy mid-funnel mix.
_STATUS_WEIGHTS = (20, 70, 10)

# Anchor "today" for completion-date back-dating; matches the spec's
# anchor date so generators are deterministic across calendar drift.
_TODAY = date(2026, 5, 20)


@dataclass
class GoalRequest:
    """Per-goal spec — one request → one FinServ__FinancialGoal__c row.

    primary_owner_external_id is the External_ID__c of the Account (or
    Person Account) the goal attaches to. goal_type should be one of the
    9 picklist values; the generator passes the value through to the
    org's FinServ__Type__c (renamed from FinServ__GoalType__c).
    """

    primary_owner_external_id: str
    goal_type: str
    target_amount: float
    target_year: int


@dataclass
class GoalBundle:
    """All FinServ__FinancialGoal__c rows produced for a batch."""

    goals: list[dict] = field(default_factory=list)


def generate_goals(
    *,
    seed: int,
    starting_seq: int,
    requests: list[GoalRequest],
) -> GoalBundle:
    """Generate FinServ__FinancialGoal__c rows from goal requests.

    Determinism: a single Random(seed) drives status weighting,
    actual-value pct, and completion-date back-dating; a Faker seeded
    with the same seed drives the child-name flavor for Education
    goals. Same seed + requests → identical output.
    """
    rng = random.Random(seed)
    faker = Faker("en_US")
    faker.seed_instance(seed)
    bundle = GoalBundle()

    for i, req in enumerate(requests):
        ext_id = f"HYDRATE-GOAL-{starting_seq + i:06d}"
        status = rng.choices(_VALID_STATUSES, weights=_STATUS_WEIGHTS, k=1)[0]
        actual_pct = rng.uniform(0.05, 0.80)
        target_value = round(req.target_amount, 2)
        actual_value = round(target_value * actual_pct, 2)
        target_date = date(req.target_year, 12, 31)

        # Completion date only meaningful when status == Completed.
        # Random day in the past 12 months keeps the dashboard plausible.
        completion_date: date | None = None
        if status == "Completed":
            completion_date = _TODAY - timedelta(days=rng.randint(1, 365))

        # Persona-flavored name + description — gives demos a human-readable
        # surface instead of "Goal #14". Education uses Faker for child name
        # so distinct customers get distinct college funds.
        if req.goal_type == "Retirement":
            name = f"Retire by {req.target_year}"
            description = (
                f"Build retirement funds toward target by {req.target_year}."
            )
        elif req.goal_type == "Home Purchase":
            name = "Down payment - first home"
            description = "Save for the down payment on a first home."
        elif req.goal_type == "Education":
            child = faker.first_name()
            name = f"College fund - {child}"
            description = f"529 savings for {child}'s college education."
        else:
            name = f"{req.goal_type} - {req.target_year}"
            description = f"{req.goal_type} goal for {req.target_year}."

        # Build logical row using spec field names where renames apply
        # (FinServ__GoalType__c, FinServ__TargetAmount__c,
        # FinServ__CurrentAmount__c, FinServ__Priority__c) and physical
        # names where no rename applies. The fieldmap then translates
        # the renamed fields and DROPS FinServ__Priority__c.
        logical = {
            "Name": name,
            # Renamed → FinServ__Type__c.
            "FinServ__GoalType__c": req.goal_type,
            "FinServ__Status__c": status,
            # Renamed → FinServ__TargetValue__c.
            "FinServ__TargetAmount__c": target_value,
            # Renamed → FinServ__ActualValue__c.
            "FinServ__CurrentAmount__c": actual_value,
            "FinServ__InitialValue__c": 0,
            "FinServ__TargetDate__c": target_date.isoformat(),
            "FinServ__Description__c": description,
            "FinServ__PrimaryOwner__c": req.primary_owner_external_id,
            # Dropped by fieldmap — emitted only so the rename surface
            # stays in one place (fieldmap.py).
            "FinServ__Priority__c": "Medium",
            "External_ID__c": ext_id,
            # Mirror External_ID__c into SourceSystemId for symmetry with
            # other FinServ__* objects (some downstream consumers prefer
            # SourceSystemId for cross-system joins).
            "FinServ__SourceSystemId__c": ext_id,
        }
        if completion_date is not None:
            logical["FinServ__CompletionDate__c"] = completion_date.isoformat()

        bundle.goals.append(
            JDO_FIELDMAP.apply("FinServ__FinancialGoal__c", logical)
        )

    return bundle
