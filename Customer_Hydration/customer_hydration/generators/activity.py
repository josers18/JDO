"""Activity generator (Plan 2 / Task 9).

A single module that emits four kinds of activity records — Cases, Tasks,
Events, Opportunities — from a unified request API. They share calendar-
aware date logic (anchor 2026-05-20), RM ownership, and persona-flavored
content templates, which is why bundling them in one module avoids
duplication.

Picklist values were verified against jdo-fw51xz:

  Case.Type      4 values  (Product Support, Account Support, General, Technical Issue)
  Case.Status    6 values  (New, Working, Waiting on Customer, Reply Received, Escalated, Closed)
  Case.Priority  4 values  (Critical, High, Medium, Low)
  Case.Origin    13 values (Chat, Community, Email, Facebook, Google, Instagram, LinkedIn,
                            Mobile Device, Phone, Slack, SMS, Twitter, Website)

  Opportunity.StageName subset (5):
                 Prospecting, Qualification, Proposal Issued, Closed Won, Closed Lost
  Opportunity.Type subset (2):
                 New Business, Renewal
  Opportunity.Probability is derived from StageName:
                 Prospecting=10, Qualification=25, Proposal Issued=60, Closed Won=100, Closed Lost=0

Calendar-aware shape:
  Tasks: ~30% future (next 14d), ~10% overdue, ~60% historical (Completed)
  Cases: same shape applies via Status weighting (most resolved/closed,
         some open, a few escalated)
  Opportunity CloseDate spread evenly across Q-1 / Q0 / Q+1 / Q+2.

Idempotency: each record carries an HYDRATE-* External_ID__c with a
prefix per object — HYDRATE-CASE-, HYDRATE-TASK-, HYDRATE-EVT-,
HYDRATE-OPP-. All four sObjects have External_ID__c on this org.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta


_VALID_PERSONAS = frozenset({"retail", "wealth", "smb", "commercial"})

# Anchor date for calendar-aware scheduling — matches Plan 2 spec.
_ANCHOR = date(2026, 5, 20)


# ---------- Picklist surfaces ---------------------------------------------

_CASE_TYPES = (
    "Product Support",
    "Account Support",
    "General",
    "Technical Issue",
)

_CASE_STATUSES = (
    "New",
    "Working",
    "Waiting on Customer",
    "Reply Received",
    "Escalated",
    "Closed",
)
# Distribution: most cases resolved/closed, some open, a few escalated.
_CASE_STATUS_WEIGHTS = (10, 15, 10, 10, 5, 50)

_CASE_PRIORITIES = ("Critical", "High", "Medium", "Low")
_CASE_PRIORITY_WEIGHTS = (5, 20, 50, 25)

_CASE_ORIGINS = (
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
)

_CASE_REASONS = (
    "Problem Resolved",
    "Documentation Issue",
    "Existing problem",
    "Mail delivery issue",
    "New problem",
    "Hardware Issue",
    "Software Issue",
    "Feature Request",
    "Fraud Concern",
    "Mobile Issue",
    "Password Reset",
    "General Inquiry",
    "Mortgage Inquiry",
    "Check Reorder",
    "Card Reorder",
)

_TASK_STATUSES = (
    "Not Started",
    "In Progress",
    "Completed",
    "Deferred",
    "Waiting on someone else",
)

_TASK_PRIORITIES = ("High", "Normal", "Low")

_TASK_TYPES = ("Call", "Email", "Meeting", "Other")

_EVENT_TYPES = ("Meeting", "Call", "Other")

# 5-stage working subset of Opportunity.StageName.
_OPP_STAGES = (
    "Prospecting",
    "Qualification",
    "Proposal Issued",
    "Closed Won",
    "Closed Lost",
)
_OPP_STAGE_WEIGHTS = (15, 25, 25, 25, 10)

_OPP_TYPES = ("New Business", "Renewal")

_OPP_PROBABILITIES: dict[str, int] = {
    "Prospecting": 10,
    "Qualification": 25,
    "Proposal Issued": 60,
    "Closed Won": 100,
    "Closed Lost": 0,
}

_OPP_LEAD_SOURCES = (
    "Web",
    "Phone Inquiry",
    "Partner Referral",
    "Existing Customer",
    "Other",
)


# ---------- Persona-flavored templates ------------------------------------

_TASK_SUBJECT_TEMPLATES: dict[str, tuple[str, ...]] = {
    "retail": (
        "Follow up on overdraft program enrollment",
        "Review denied Zelle limit increase",
        "Complete address change request",
        "Confirm direct deposit setup",
        "Reissue debit card after fraud alert",
    ),
    "wealth": (
        "Annual portfolio review",
        "Rebalance to target allocation",
        "Discuss estate plan after marriage",
        "Tax-loss harvesting check-in",
        "Review beneficiary designations",
    ),
    "smb": (
        "Quarterly relationship review",
        "LOC renewal package preparation",
        "Treasury services demo",
        "ACH origination training",
        "Business credit card application follow-up",
    ),
    "commercial": (
        "Annual credit review",
        "Renew swap covenants",
        "Treasury optimization meeting",
        "Discuss working capital facility",
        "Review covenant compliance package",
    ),
}

_CASE_SUBJECT_TEMPLATES: dict[str, tuple[str, ...]] = {
    "retail": (
        "Unable to log in to mobile app",
        "Disputed transaction on debit card",
        "Need to reorder checks",
        "Question about overdraft fee",
        "Card declined at point of sale",
    ),
    "wealth": (
        "Wire transfer not received by counterparty",
        "Question about quarterly statement",
        "Trade execution clarification",
        "529 distribution timing question",
        "Beneficiary update request",
    ),
    "smb": (
        "ACH origination reject investigation",
        "Need higher mobile deposit limit",
        "Lockbox setup question",
        "Positive pay exception review",
        "Merchant settlement timing question",
    ),
    "commercial": (
        "Treasury workstation outage",
        "Wire cutoff missed — escalation",
        "Sweep account configuration change",
        "Covenant reporting portal access",
        "FX rate locked vs booked discrepancy",
    ),
}

_CASE_DESCRIPTION_TEMPLATES: dict[str, str] = {
    "retail": (
        "Customer reached out via {channel}. Working through standard "
        "retail support workflow."
    ),
    "wealth": (
        "Wealth client request opened via {channel}. Routing to advisor "
        "team for follow-up."
    ),
    "smb": (
        "Small-business client opened via {channel}. Treasury / lending "
        "follow-up scheduled."
    ),
    "commercial": (
        "Commercial relationship contact opened via {channel}. RM coordinating "
        "across treasury, lending, and ops."
    ),
}

# Opportunity name prefixes per persona — interpolated with product_keyword.
_OPP_NAME_TEMPLATES: dict[str, str] = {
    "retail": "{persona_label} - {product}",
    "wealth": "{persona_label} - {product}",
    "smb": "{persona_label} - {product}",
    "commercial": "{persona_label} - {product}",
}

_PERSONA_LABEL: dict[str, str] = {
    "retail": "Retail",
    "wealth": "Wealth",
    "smb": "SMB",
    "commercial": "Commercial",
}

# Per-persona Opp amount bands ($). Driven by realistic deal sizes.
_OPP_AMOUNT_BANDS: dict[str, tuple[int, int]] = {
    "retail": (5_000, 75_000),
    "wealth": (50_000, 1_500_000),
    "smb": (25_000, 500_000),
    "commercial": (250_000, 10_000_000),
}


# ---------- Request / bundle dataclasses ----------------------------------


@dataclass
class CaseRequest:
    """Per-case spec.

    contact_id_marker is reserved for business cases — typically an
    "ACCT_RESOLVE:{account_ext_id}" placeholder the orchestrator can
    later resolve to a Contact Id. None for retail person accounts.
    """

    account_external_id: str
    contact_id_marker: str | None
    persona: str
    rm_user_id: str


@dataclass
class TaskRequest:
    account_external_id: str
    rm_user_id: str
    persona: str


@dataclass
class EventRequest:
    account_external_id: str
    rm_user_id: str
    persona: str


@dataclass
class OpportunityRequest:
    account_external_id: str
    rm_user_id: str
    persona: str
    product_keyword: str


@dataclass
class ActivityBundle:
    """Bundle that holds output rows for any of the 4 activity sObjects.

    Each generator function fills only its own slot — the others stay
    empty so callers can merge bundles cleanly downstream.
    """

    cases: list[dict] = field(default_factory=list)
    tasks: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    opportunities: list[dict] = field(default_factory=list)


# ---------- Helpers --------------------------------------------------------


def _validate_persona(persona: str) -> None:
    if persona not in _VALID_PERSONAS:
        raise ValueError(
            f"Unknown persona {persona!r}; expected one of {sorted(_VALID_PERSONAS)}"
        )


def _calendar_aware_activity_date(rng: random.Random) -> tuple[date, str]:
    """Return (date, bucket) per the spec's task shape.

    bucket ∈ {"future","overdue","historical"}; the caller uses the
    bucket to decide Status (historical → Completed, future/overdue
    → not-Completed).
    """
    bucket = rng.choices(
        ["future", "overdue", "historical"],
        weights=[30, 10, 60],
        k=1,
    )[0]
    if bucket == "future":
        return _ANCHOR + timedelta(days=rng.randint(1, 14)), bucket
    if bucket == "overdue":
        return _ANCHOR - timedelta(days=rng.randint(1, 30)), bucket
    # historical: 1–18 months back
    return _ANCHOR - timedelta(days=rng.randint(31, 540)), bucket


def _business_hours_event(rng: random.Random) -> tuple[datetime, datetime]:
    """Return (start, end) for an Event during business hours on a weekday."""
    delta = rng.randint(-60, 60)
    d = _ANCHOR + timedelta(days=delta)
    while d.weekday() >= 5:  # 5=Sat, 6=Sun
        d += timedelta(days=1)
    start_hour = rng.randint(8, 16)  # 8..16 inclusive — end stays in business hours
    start_minute = rng.choice([0, 30])
    start = datetime.combine(d, time(start_hour, start_minute))
    duration_minutes = rng.choice([30, 60, 90])
    end = start + timedelta(minutes=duration_minutes)
    return start, end


def _quarter_bounds(quarter_offset: int) -> tuple[date, date]:
    """Return (first_day, last_day) for the calendar quarter that is
    ``quarter_offset`` quarters away from the anchor's quarter.

    quarter_offset=-1 → quarter before anchor (Q-1).
    quarter_offset=0  → anchor quarter (Q0).
    quarter_offset=+1 → next quarter (Q+1).
    quarter_offset=+2 → two quarters out (Q+2).
    """
    anchor_q_start_month = ((_ANCHOR.month - 1) // 3) * 3 + 1
    anchor_q_start = date(_ANCHOR.year, anchor_q_start_month, 1)
    # Shift by quarter_offset quarters. Use month arithmetic that handles
    # year wrap correctly.
    total_months = (anchor_q_start.year * 12 + (anchor_q_start.month - 1)) + (
        quarter_offset * 3
    )
    q_year, q_month0 = divmod(total_months, 12)
    q_start = date(q_year, q_month0 + 1, 1)
    # End of quarter = day before the *next* quarter starts.
    next_total = total_months + 3
    n_year, n_month0 = divmod(next_total, 12)
    next_q_start = date(n_year, n_month0 + 1, 1)
    q_end = next_q_start - timedelta(days=1)
    return q_start, q_end


def _quarter_close_date(rng: random.Random) -> date:
    """Pick a CloseDate uniformly across the four target calendar quarters
    (Q-1 / Q0 / Q+1 / Q+2) relative to the anchor's quarter.

    Each draw first picks a quarter bucket, then a uniform date within
    that quarter — keeping the distribution faithful to actual quarterly
    pipeline shape rather than a ±N-days window.
    """
    bucket = rng.choice([-1, 0, 1, 2])
    q_start, q_end = _quarter_bounds(bucket)
    span_days = (q_end - q_start).days
    return q_start + timedelta(days=rng.randint(0, span_days))


# ---------- Generators ----------------------------------------------------


def generate_cases(
    *,
    seed: int,
    starting_seq: int,
    requests: list[CaseRequest],
) -> ActivityBundle:
    """Generate Case rows from CaseRequests.

    External_ID__c = HYDRATE-CASE-{seq:06d}.
    AccountId carries the External_ID__c of the linked account — the
    loader rewrites the column header to AccountId.External_ID__c
    reference syntax for Bulk API 2.0.
    """
    rng = random.Random(seed)
    bundle = ActivityBundle()

    for i, req in enumerate(requests):
        _validate_persona(req.persona)
        seq = starting_seq + i
        ext_id = f"HYDRATE-CASE-{seq:06d}"

        case_type = rng.choice(_CASE_TYPES)
        status = rng.choices(_CASE_STATUSES, weights=_CASE_STATUS_WEIGHTS, k=1)[0]
        priority = rng.choices(
            _CASE_PRIORITIES, weights=_CASE_PRIORITY_WEIGHTS, k=1
        )[0]
        origin = rng.choice(_CASE_ORIGINS)
        reason = rng.choice(_CASE_REASONS)

        subject = rng.choice(_CASE_SUBJECT_TEMPLATES[req.persona])
        description = _CASE_DESCRIPTION_TEMPLATES[req.persona].format(
            channel=origin
        )

        row: dict = {
            "Subject": subject,
            "Description": description,
            "Type": case_type,
            "Status": status,
            "Priority": priority,
            "Origin": origin,
            "Reason": reason,
            "AccountId": req.account_external_id,
            "OwnerId": req.rm_user_id,
            "External_ID__c": ext_id,
        }
        if req.contact_id_marker is not None:
            row["ContactId"] = req.contact_id_marker
        bundle.cases.append(row)

    return bundle


def generate_tasks(
    *,
    seed: int,
    starting_seq: int,
    requests: list[TaskRequest],
) -> ActivityBundle:
    """Generate Task rows from TaskRequests.

    External_ID__c = HYDRATE-TASK-{seq:06d}. ActivityDate is calendar-
    aware: ~30% in the next 14 days, ~10% overdue, ~60% historical.
    Historical tasks are always Status="Completed"; future/overdue tasks
    pick from the not-Completed Status values.

    WhatId is emitted as a "RESOLVE:{HYDRATE-…}" marker because Task.WhatId
    is a polymorphic FK and Bulk API 2.0 cannot resolve polymorphic FKs via
    External-Id reference syntax. The runner's IdResolver fills in the real
    Account Id post-Wave-A before bulk-upsert.
    """
    rng = random.Random(seed)
    bundle = ActivityBundle()

    not_completed_statuses = tuple(s for s in _TASK_STATUSES if s != "Completed")

    for i, req in enumerate(requests):
        _validate_persona(req.persona)
        seq = starting_seq + i
        ext_id = f"HYDRATE-TASK-{seq:06d}"

        activity_date, bucket = _calendar_aware_activity_date(rng)
        if bucket == "historical":
            status = "Completed"
        else:
            status = rng.choice(not_completed_statuses)

        subject = rng.choice(_TASK_SUBJECT_TEMPLATES[req.persona])
        priority = rng.choices(_TASK_PRIORITIES, weights=[15, 70, 15], k=1)[0]
        task_type = rng.choice(_TASK_TYPES)
        description = (
            f"{_PERSONA_LABEL[req.persona]} relationship — "
            f"{subject.lower()}. Auto-generated for hydration."
        )

        row = {
            "Subject": subject,
            "Description": description,
            "Status": status,
            "Priority": priority,
            "Type": task_type,
            "ActivityDate": activity_date.isoformat(),
            # WhatId resolved post-Wave-A by runner_p3.IdResolver
            "WhatId": f"RESOLVE:{req.account_external_id}",
            "OwnerId": req.rm_user_id,
            "External_ID__c": ext_id,
        }
        bundle.tasks.append(row)

    return bundle


def generate_events(
    *,
    seed: int,
    starting_seq: int,
    requests: list[EventRequest],
) -> ActivityBundle:
    """Generate Event rows from EventRequests.

    External_ID__c = HYDRATE-EVT-{seq:06d}. Start/End fall during
    business hours (08:00–17:00) on weekdays.

    WhatId is emitted as a "RESOLVE:{HYDRATE-…}" marker because Event.WhatId
    is a polymorphic FK and Bulk API 2.0 cannot resolve polymorphic FKs via
    External-Id reference syntax. The runner's IdResolver fills in the real
    Account Id post-Wave-A before bulk-upsert.
    """
    rng = random.Random(seed)
    bundle = ActivityBundle()

    for i, req in enumerate(requests):
        _validate_persona(req.persona)
        seq = starting_seq + i
        ext_id = f"HYDRATE-EVT-{seq:06d}"

        start, end = _business_hours_event(rng)
        # Reuse Task subject pool — banker meeting topics align well.
        subject = rng.choice(_TASK_SUBJECT_TEMPLATES[req.persona])
        description = (
            f"{_PERSONA_LABEL[req.persona]} client meeting — {subject.lower()}."
        )
        event_type = rng.choice(_EVENT_TYPES)

        row = {
            "Subject": subject,
            "Description": description,
            "Type": event_type,
            "StartDateTime": start.isoformat(),
            "EndDateTime": end.isoformat(),
            "ActivityDate": start.date().isoformat(),
            "DurationInMinutes": int((end - start).total_seconds() // 60),
            # WhatId resolved post-Wave-A by runner_p3.IdResolver
            "WhatId": f"RESOLVE:{req.account_external_id}",
            "OwnerId": req.rm_user_id,
            "External_ID__c": ext_id,
        }
        bundle.events.append(row)

    return bundle


def generate_opportunities(
    *,
    seed: int,
    starting_seq: int,
    requests: list[OpportunityRequest],
) -> ActivityBundle:
    """Generate Opportunity rows from OpportunityRequests.

    External_ID__c = HYDRATE-OPP-{seq:06d}. StageName picks from a 5-value
    working subset; Probability is derived (Prospecting=10, Qualification=25,
    Proposal Issued=60, Closed Won=100, Closed Lost=0). CloseDate spreads
    across Q-1 / Q0 / Q+1 / Q+2. IsClosed/IsWon are platform-derived from
    StageName and are NOT emitted.
    """
    rng = random.Random(seed)
    bundle = ActivityBundle()

    for i, req in enumerate(requests):
        _validate_persona(req.persona)
        seq = starting_seq + i
        ext_id = f"HYDRATE-OPP-{seq:06d}"

        stage = rng.choices(_OPP_STAGES, weights=_OPP_STAGE_WEIGHTS, k=1)[0]
        if stage not in _OPP_PROBABILITIES:
            raise ValueError(
                f"Unknown stage {stage!r}; expected one of {sorted(_OPP_PROBABILITIES)}"
            )
        probability = _OPP_PROBABILITIES[stage]
        opp_type = rng.choice(_OPP_TYPES)
        close_date = _quarter_close_date(rng)

        low, high = _OPP_AMOUNT_BANDS[req.persona]
        amount = round(rng.uniform(low, high), 2)

        name = _OPP_NAME_TEMPLATES[req.persona].format(
            persona_label=_PERSONA_LABEL[req.persona],
            product=req.product_keyword,
        )
        description = (
            f"{_PERSONA_LABEL[req.persona]} opportunity for "
            f"{req.product_keyword}. Auto-generated for hydration."
        )
        lead_source = rng.choice(_OPP_LEAD_SOURCES)

        row = {
            "Name": name,
            "StageName": stage,
            "Type": opp_type,
            "Probability": probability,
            "Amount": amount,
            "CloseDate": close_date.isoformat(),
            "Description": description,
            "LeadSource": lead_source,
            "AccountId": req.account_external_id,
            "OwnerId": req.rm_user_id,
            "External_ID__c": ext_id,
        }
        bundle.opportunities.append(row)

    return bundle
