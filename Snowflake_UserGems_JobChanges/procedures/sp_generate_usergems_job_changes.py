"""UserGems-style synthetic person-level job-change event generator.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES (Plan 15). The first
EVENT-scoped Cumulus dataset: the PK is EVENT_ID, and most (anchor, month)
pairs emit no rows at all. That is the correct output.

Model (rowspec "Event generation"):
  - Events are generated per (employer anchor, EVENT month) by the pure
    `_events_for(anchor, event_month, boardex_rise, ctx)`, then filtered by
    DETECTED_DATE into the run week by `_rows_for_week`. The same event is
    always generated with the same EVENT_ID and the same row, whichever week
    computes it.
  - Hazard path: each tracked roster slot fires with p=_HAZARD per month.
    Hazard events are never C-suite departures.
  - BoardEx gate (bidirectional, 2026-11-02): a FALSE->TRUE rise of
    BOARDEX_EXEC_INTEL.EXEC_TURNOVER_FLAG in month M emits EXACTLY ONE C-suite
    departure in M, and no C-suite departure is emitted in any non-rise month.
    rise(M) = flag(M) TRUE and flag(M-1) FALSE; a missing M or M-1 row
    (pre-history, or the month not generated yet) is NOT a rise.
  - Paired events: a Departed resolving to another employer anchor
    (Existing Client) also emits a mirrored Joined row on the destination,
    cross-linked both ways via PAIRED_EVENT_ID.
  - Wealth tie-in: ~6% of C-suite/VP departures link PERSON_ACCOUNT_ID to a
    Wealth Management PERSON anchor and set LIQUIDITY_EVENT_FLAG.

Salts:
  - "usergems"         account-month draws (hazard rolls, kind rolls, the
                       C-suite persona pick on a rise).
  - "usergems_person"  per-event attributes, keyed by EVENT_ID.
  NOTE: cumulus_common.seed_for buckets on %Y-%m of its run_ts only. The
  account-month stream is genuinely month-bucketed; the person stream is keyed
  by the (unique) EVENT_ID, so its timestamp is irrelevant.

SP entry point (Plan 15 Task 4): `main(session, backfill_weeks=0)`.
  - Run window: the previous `max(1, backfill_weeks)` complete weeks plus the
    current partial week. The TASK fires Monday 09:00 UTC, so the default run
    writes last week's Tuesday-Sunday detections and today's; the MERGE on
    (ORG_ID, EVENT_ID) makes the overlap free.
  - Reads: the employer audience, the sorted Wealth pool, and BoardEx for the
    run's candidate months plus the month before the earliest (hard
    dependency: a missing or empty table raises).
  - Writes: write_pandas -> USERGEMS_JOB_CHANGES_STAGING -> MERGE (RECORD_ID
    computed in SQL on INSERT and UPDATE; 3 DATE + GENERATED_AT casts from
    nanosecond NUMBER; 3 ::BOOLEAN casts).
  - Then `_assert_event_contract` (plan section 2 checks a-d) over the rows in
    the run window, replacing the template's assert_coverage.
  - One TASK_EXECUTION_LOG row per call (ROWS_INSERTED counts INSERTs only).

Plan:    docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md
"""
from __future__ import annotations

import hashlib
import random
import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta
from typing import Any

# Locally, cumulus_common resolves via the pytest pythonpath; in Snowflake,
# scripts/deploy_sp.py inlines seed_for.
from cumulus_common import seed_for


# -------------------------------------------------------------------
# Constants — MUST stay in sync with the rowspec attachment + DDL
# -------------------------------------------------------------------

# Every FQN derives from _DB / _SCHEMA so scripts/deploy_sp.py --fixture-schema
# can retarget the whole SP (tables, views, log) at an L2 scratch schema.
_DB = "DATA_JEDAIS"
_SCHEMA = "FINS__PUBLIC"
_FQ = f"{_DB}.{_SCHEMA}"
TABLE           = f"{_FQ}.USERGEMS_JOB_CHANGES"
STAGING_NAME    = "USERGEMS_JOB_CHANGES_STAGING"
STAGING_TABLE   = f"{_FQ}.{STAGING_NAME}"
BOARDEX_TABLE   = f"{_FQ}.BOARDEX_EXEC_INTEL"
ANCHORS_VIEW    = f"{_FQ}.V_ACCOUNT_ANCHORS"
LOG_TABLE       = f"{_FQ}.TASK_EXECUTION_LOG"
TASK_NAME       = "TASK_WEEKLY_USERGEMS_JOB_CHANGES"
DEFAULT_ORG_ID  = "JDO"

# L2 hook: the fixture build sets this to a SELECT returning the run
# timestamp, so L2 runs are pinned to a fixed clock. None in production.
_RUN_TS_SQL = None

# Contract (a): rows per COMPLETE detection week (plan section 2). The current
# partial week is exempt. The fixture build overrides the band.
_WEEK_ROWS_MIN = 30
_WEEK_ROWS_MAX = 200
DATASET_SALT  = "usergems"         # account-month event draws
PERSON_SALT   = "usergems_person"  # per-event attributes, keyed by EVENT_ID

# Household exclusion MUST use COALESCE: `NULL <> 'Household'` is NULL in SQL
# and would silently drop the NULL-category business anchors. Probed
# 2026-11-02: 6,435 employer anchors.
_EMPLOYER_PREDICATE = (
    "ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'"
)
_WEALTH_PREDICATE = "CLIENT_CATEGORY = 'Wealth Management'"   # 3,920 PERSON anchors
EMPLOYER_SQL = (
    f"SELECT DISTINCT * FROM {ANCHORS_VIEW} "
    f"WHERE {_EMPLOYER_PREDICATE}"
)
WEALTH_SQL = (
    f"SELECT DISTINCT ACCOUNT_ID FROM {ANCHORS_VIEW} "
    f"WHERE {_WEALTH_PREDICATE} AND ACCOUNT_ID IS NOT NULL ORDER BY ACCOUNT_ID"
)

# 22 data columns emitted by the row factory. ORG_ID and RECORD_ID are
# stamped by the SP (RECORD_ID = record_id_for(ORG_ID, EVENT_ID)).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "EVENT_ID", "ACCOUNT_ID", "PROFILE_WEEK", "EVENT_TYPE", "EVENT_DATE",
    "DETECTED_DATE", "CONTACT_NAME", "CONTACT_PERSONA", "SENIORITY",
    "OLD_TITLE", "NEW_TITLE", "NEW_EMPLOYER_NAME", "NEW_ACCOUNT_ID",
    "NEW_EMPLOYER_STATUS", "PAIRED_EVENT_ID", "WAS_CHAMPION",
    "WAS_PRIMARY_CONTACT", "OPPORTUNITY_SCORE", "RELATIONSHIP_RISK_SCORE",
    "PERSON_ACCOUNT_ID", "LIQUIDITY_EVENT_FLAG", "GENERATED_AT",
})

_HAZARD = 0.014                  # per tracked slot per month (~16%/yr)
_MIN_DETECTION_LAG_DAYS = 3
_MAX_DETECTION_LAG_DAYS = 45
_MAX_MIRROR_OFFSET_DAYS = 7
# A C-suite rise month is "complete" once its last possible detection
# (month_end + 45, + 7 for a mirror) has passed: > 52 days before run date.
_COMPLETE_AFTER_DAYS = _MAX_DETECTION_LAG_DAYS + _MAX_MIRROR_OFFSET_DAYS
_CANDIDATE_MONTHS_BACK = 3       # month(week_end) and the 3 prior months
# A needed BoardEx month with fewer employer rows than this share of the best
# month in the span is treated as missing (raise, don't read it as "no rise").
# Live 2026-11-02: 6,299..6,435 employer rows per month (ratio 0.979).
_BOARDEX_MIN_MONTH_COVERAGE = 0.5
_WEALTH_P = 0.06
_EXISTING_CLIENT_P = 0.12
_PROSPECT_P = 0.50

# persona -> (seniority, title bank, finance?)
_PERSONAS: dict[str, tuple[str, list[str], bool]] = {
    "CFO":                ("C-Suite",  ["Chief Financial Officer", "CFO"], True),
    "CEO-Owner":          ("C-Suite",  ["Owner", "Founder and CEO", "President", "Managing Partner"], False),
    "COO":                ("C-Suite",  ["Chief Operating Officer", "COO"], False),
    "VP Finance":         ("VP",       ["VP of Finance", "VP Finance and Accounting"], True),
    "Controller":         ("Director", ["Controller", "Corporate Controller", "Director of Accounting"], True),
    "Treasurer":          ("Director", ["Treasurer", "Director of Treasury", "Assistant Treasurer"], True),
    "AP Manager":         ("Manager",  ["Accounts Payable Manager", "AP Supervisor"], False),
    "Office Manager":     ("Manager",  ["Office Manager", "Bookkeeper and Office Manager"], False),
    "Operations Manager": ("Manager",  ["Operations Manager", "General Manager"], False),
}
_CSUITE = ("CFO", "CEO-Owner", "COO")
_SENIORITY_ORDER = ("Manager", "Director", "VP", "C-Suite")
# Promotion target bank by NEW seniority (rowspec "Promoted rows").
_PROMOTION_BANK = {
    "Director": _PERSONAS["Controller"][1],
    "VP":       _PERSONAS["VP Finance"][1],
    "C-Suite":  _PERSONAS["CFO"][1],
}
_CSUITE_TITLES = [t for p in _CSUITE for t in _PERSONAS[p][1]]
_SENIORITY_OPP = {"C-Suite": 20, "VP": 12, "Director": 6, "Manager": 0}
_SENIORITY_RISK = {"C-Suite": 25, "VP": 15, "Director": 10, "Manager": 3}

# Same name banks as Plan 10 (BoardEx KEY_DIRECTOR_NAME). Copied, not
# imported: one SP per dataset, no inter-SP imports.
_FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
    "Linda", "David", "Elizabeth", "Aisha", "Diego", "Priya", "Wei",
    "Carlos", "Fatima", "Hiroshi", "Chen",
]
_LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Patel", "Nguyen", "Kim", "Khan",
    "O'Connor", "Hassan",
]

# Prospect company names: {prefix} {noun} {suffix}. No ampersand anywhere in
# this module (the body is inlined into a snow sql file).
_CO_PREFIX = ["Summit", "Blue Harbor", "Pioneer", "Redwood", "Silverline", "Northgate",
              "Lakeshore", "Crescent", "Evergreen", "Ironbridge", "Westfield", "Brightwater"]
_CO_NOUN = ["Ridge", "Point", "Valley", "Crossing", "Peak", "Bay", "Grove", "Mills"]
_CO_SUFFIX = ["Logistics LLC", "Partners", "Group", "Holdings", "Industries", "Capital",
              "Foods Inc", "Health Systems", "Construction Co", "Technologies"]


# -------------------------------------------------------------------
# Small helpers
# -------------------------------------------------------------------

def _record_id_for(*pk_values: object) -> str:
    """Local copy of cumulus_common.record_id.record_id_for (not exported from
    cumulus_common/__init__.py; L1 asserts the two agree). SQL form:
    REGEXP_REPLACE(LEFT(SHA2(CONCAT_WS('|', ..., 'record_id'), 256), 32), ...)."""
    payload = "|".join(str(v) for v in pk_values) + "|record_id"
    h = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _event_id(source_account_id: str, event_month: date, slot: int, kind: str) -> str:
    """kind in {"hazard", "csuite", "pair"}. A paired mirror uses the SOURCE
    account and slot with kind="pair", so it is computable from the Departed
    event alone."""
    return _record_id_for(source_account_id, event_month.isoformat(), str(slot), kind)


def _num(value) -> float:
    """Coerce an anchor numeric (int / Decimal / str / None) to float; None -> 0."""
    return float(value) if value is not None and value != "" else 0.0


def _month_start(d) -> date:
    return date(d.year, d.month, 1)


def _shift_months(month: date, k: int) -> date:
    idx = month.year * 12 + (month.month - 1) + k
    return date(idx // 12, idx % 12 + 1, 1)


def _days_in_month(month: date) -> int:
    return (_shift_months(month, 1) - month).days


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _hash_index(key: str, n: int) -> int:
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % n


# -------------------------------------------------------------------
# Audience + context
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Python mirror of _EMPLOYER_PREDICATE (defense in depth)."""
    return (
        bool(anchor.get("ACCOUNT_ID"))
        and anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"
        and (anchor.get("CLIENT_CATEGORY") or "") != "Household"
    )


class Ctx:
    """Run context: the sorted employer pool (overall and by INDUSTRY) and the
    sorted Wealth Management pool. Sorting makes every pick depend only on
    pool membership, never on load order."""

    def __init__(self, employers, wealth_pool):
        self.all_employers = sorted(
            ({"ACCOUNT_ID": a["ACCOUNT_ID"], "ACCOUNT_NAME": a.get("ACCOUNT_NAME"),
              "INDUSTRY": a.get("INDUSTRY")} for a in employers if a.get("ACCOUNT_ID")),
            key=lambda a: a["ACCOUNT_ID"],
        )
        self.by_industry: dict[str, list[dict]] = {}
        for a in self.all_employers:
            if a["INDUSTRY"] is not None:
                self.by_industry.setdefault(a["INDUSTRY"], []).append(a)
        self.wealth_pool = sorted(str(x) for x in wealth_pool)


# -------------------------------------------------------------------
# Roster + per-event attribute helpers
# -------------------------------------------------------------------

def _roster_for(employee_count) -> list[str]:
    """Tracked personas, in slot order. Slot index is part of EVENT_ID, so
    order is load-bearing. Every roster starts with CEO-Owner."""
    n = _num(employee_count)
    if n <= 10:
        return ["CEO-Owner", "Office Manager"]
    if n <= 50:
        return ["CEO-Owner", "Controller", "Office Manager"]
    if n <= 200:
        return ["CEO-Owner", "CFO", "Controller", "AP Manager", "Operations Manager"]
    if n <= 1000:
        return ["CEO-Owner", "CFO", "COO", "VP Finance", "Controller", "Treasurer",
                "AP Manager", "Operations Manager"]
    return ["CEO-Owner", "CFO", "COO", "VP Finance", "Controller", "Treasurer", "AP Manager",
            "Operations Manager", "Office Manager", "VP Finance", "Controller", "AP Manager"]


def _flags(persona: str, prng: random.Random) -> tuple[bool, bool]:
    finance = _PERSONAS[persona][2]
    champion = prng.random() < (0.40 if finance else 0.10)
    primary = prng.random() < (0.30 if persona in _CSUITE else 0.08)
    return bool(champion), bool(primary)


def _clamp_score(x: float) -> int:
    return int(max(0, min(100, round(x))))


def _opportunity_score(etype, status, seniority, champion, prng) -> int:
    if etype == "Departed":
        s = {"Existing Client": 55, "Prospect": 60, "Unknown": 20}[status]
    else:
        s = {"Joined": 45, "Promoted": 25}[etype]
    s += _SENIORITY_OPP[seniority]
    s += 15 if champion else 0
    return _clamp_score(s + prng.gauss(0, 6))


def _risk_score(etype, seniority, champion, primary, prng) -> int:
    if etype == "Joined":
        return _clamp_score(5 + prng.gauss(0, 3))
    s = 30 if etype == "Departed" else 10
    s += _SENIORITY_RISK[seniority]
    s += 20 if champion else 0
    s += 15 if primary else 0
    return _clamp_score(s + prng.gauss(0, 6))


def _company_name(prng: random.Random) -> str:
    return f"{prng.choice(_CO_PREFIX)} {prng.choice(_CO_NOUN)} {prng.choice(_CO_SUFFIX)}"


def _resolve_destination(anchor: dict, event_id: str, prng: random.Random, ctx: Ctx):
    """(status, dest) for a Departed event. Exactly one prng draw.
    Existing Client needs a destination other than the anchor; with no such
    anchor in the pool it degrades to Prospect."""
    roll = prng.random()
    if roll < _EXISTING_CLIENT_P:
        pool = ctx.by_industry.get(anchor.get("INDUSTRY")) or ctx.all_employers
        if len(pool) < 2:
            pool = ctx.all_employers
        if len(pool) >= 2:
            idx = _hash_index(event_id + "_dest", len(pool))
            dest = pool[idx]
            if dest["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]:
                dest = pool[(idx + 1) % len(pool)]
            return "Existing Client", dest
        return "Prospect", None
    if roll < _EXISTING_CLIENT_P + _PROSPECT_P:
        return "Prospect", None
    return "Unknown", None


def _person_account(event_id, etype, seniority, prng, ctx):
    if etype != "Departed" or seniority not in ("C-Suite", "VP"):
        return None
    if prng.random() >= _WEALTH_P or not ctx.wealth_pool:
        return None
    return ctx.wealth_pool[_hash_index(event_id + "_wealth", len(ctx.wealth_pool))]


def _row(**kw) -> dict:
    detected = kw["DETECTED_DATE"]
    week = _monday(detected)
    kw["PROFILE_WEEK"] = week
    kw["GENERATED_AT"] = datetime.combine(week, time())
    return kw


def _build(anchor: dict, event_month: date, slot: int, kind: str, persona: str,
           etype: str, ctx: Ctx) -> list[dict]:
    """One event (plus its mirror for Departed -> Existing Client).

    Per-event prng keyed by EVENT_ID (salt usergems_person), so attributes
    never shift when an unrelated slot's hazard roll changes. Fixed draw order:
    day, lag, first, last, old title, champion, primary, then type-specific.
    """
    account_id = anchor["ACCOUNT_ID"]
    event_id = _event_id(account_id, event_month, slot, kind)
    prng = random.Random(seed_for(event_id, PERSON_SALT, datetime.combine(event_month, time())))

    event_date = event_month + timedelta(days=prng.randint(0, _days_in_month(event_month) - 1))
    detected = event_date + timedelta(days=prng.randint(_MIN_DETECTION_LAG_DAYS, _MAX_DETECTION_LAG_DAYS))
    name = f"{prng.choice(_FIRST_NAMES)} {prng.choice(_LAST_NAMES)}"
    base_seniority, bank, _finance = _PERSONAS[persona]
    old_title = prng.choice(bank)
    champion, primary = _flags(persona, prng)

    if etype == "Promoted":
        new_seniority = _SENIORITY_ORDER[min(_SENIORITY_ORDER.index(base_seniority) + 1, 3)]
        if base_seniority == "C-Suite":
            new_title = prng.choice([t for t in _CSUITE_TITLES if t != old_title])
        else:
            new_title = prng.choice(_PROMOTION_BANK[new_seniority])
        return [_row(
            EVENT_ID=event_id, ACCOUNT_ID=account_id, EVENT_TYPE="Promoted",
            EVENT_DATE=event_date, DETECTED_DATE=detected, CONTACT_NAME=name,
            CONTACT_PERSONA=persona, SENIORITY=new_seniority, OLD_TITLE=old_title,
            NEW_TITLE=new_title, NEW_EMPLOYER_NAME=None, NEW_ACCOUNT_ID=None,
            NEW_EMPLOYER_STATUS="Not Applicable", PAIRED_EVENT_ID=None,
            WAS_CHAMPION=champion, WAS_PRIMARY_CONTACT=primary,
            OPPORTUNITY_SCORE=_opportunity_score("Promoted", None, new_seniority, champion, prng),
            RELATIONSHIP_RISK_SCORE=_risk_score("Promoted", new_seniority, champion, primary, prng),
            PERSON_ACCOUNT_ID=None, LIQUIDITY_EVENT_FLAG=False,
        )]

    if etype == "Joined":
        # Inbound hire from an outside company: not our champion / primary
        # contact yet. The two flag draws above still happen (fixed order).
        unknown_prior = prng.random() < 0.5
        new_title = prng.choice(bank)
        return [_row(
            EVENT_ID=event_id, ACCOUNT_ID=account_id, EVENT_TYPE="Joined",
            EVENT_DATE=event_date, DETECTED_DATE=detected, CONTACT_NAME=name,
            CONTACT_PERSONA=persona, SENIORITY=base_seniority,
            OLD_TITLE=None if unknown_prior else old_title, NEW_TITLE=new_title,
            NEW_EMPLOYER_NAME=None, NEW_ACCOUNT_ID=None,
            NEW_EMPLOYER_STATUS="Not Applicable", PAIRED_EVENT_ID=None,
            WAS_CHAMPION=False, WAS_PRIMARY_CONTACT=False,
            OPPORTUNITY_SCORE=_opportunity_score("Joined", None, base_seniority, False, prng),
            RELATIONSHIP_RISK_SCORE=_risk_score("Joined", base_seniority, False, False, prng),
            PERSON_ACCOUNT_ID=None, LIQUIDITY_EVENT_FLAG=False,
        )]

    # Departed
    status, dest = _resolve_destination(anchor, event_id, prng, ctx)
    if status == "Existing Client":
        new_employer_name = dest["ACCOUNT_NAME"] or dest["ACCOUNT_ID"]
    elif status == "Prospect":
        new_employer_name = _company_name(prng)
    else:
        new_employer_name = None
    new_title = None if status == "Unknown" else prng.choice(bank)
    person_account = _person_account(event_id, "Departed", base_seniority, prng, ctx)
    mirror_id = _event_id(account_id, event_month, slot, "pair") if dest else None
    departed = _row(
        EVENT_ID=event_id, ACCOUNT_ID=account_id, EVENT_TYPE="Departed",
        EVENT_DATE=event_date, DETECTED_DATE=detected, CONTACT_NAME=name,
        CONTACT_PERSONA=persona, SENIORITY=base_seniority, OLD_TITLE=old_title,
        NEW_TITLE=new_title, NEW_EMPLOYER_NAME=new_employer_name,
        NEW_ACCOUNT_ID=dest["ACCOUNT_ID"] if dest else None,
        NEW_EMPLOYER_STATUS=status, PAIRED_EVENT_ID=mirror_id,
        WAS_CHAMPION=champion, WAS_PRIMARY_CONTACT=primary,
        OPPORTUNITY_SCORE=_opportunity_score("Departed", status, base_seniority, champion, prng),
        RELATIONSHIP_RISK_SCORE=_risk_score("Departed", base_seniority, champion, primary, prng),
        PERSON_ACCOUNT_ID=person_account, LIQUIDITY_EVENT_FLAG=person_account is not None,
    )
    if not dest:
        return [departed]
    mirror = _row(
        EVENT_ID=mirror_id, ACCOUNT_ID=dest["ACCOUNT_ID"], EVENT_TYPE="Joined",
        EVENT_DATE=event_date,
        DETECTED_DATE=detected + timedelta(days=prng.randint(0, _MAX_MIRROR_OFFSET_DAYS)),
        CONTACT_NAME=name, CONTACT_PERSONA=persona, SENIORITY=base_seniority,
        OLD_TITLE=old_title, NEW_TITLE=new_title, NEW_EMPLOYER_NAME=None,
        NEW_ACCOUNT_ID=None, NEW_EMPLOYER_STATUS="Not Applicable",
        PAIRED_EVENT_ID=event_id, WAS_CHAMPION=champion, WAS_PRIMARY_CONTACT=False,
        OPPORTUNITY_SCORE=_opportunity_score("Joined", None, base_seniority, champion, prng),
        RELATIONSHIP_RISK_SCORE=_risk_score("Joined", base_seniority, champion, False, prng),
        PERSON_ACCOUNT_ID=None, LIQUIDITY_EVENT_FLAG=False,
    )
    return [departed, mirror]


# -------------------------------------------------------------------
# Event generation (load-bearing)
# -------------------------------------------------------------------

def _events_for(anchor: dict, event_month, boardex_rise: bool, ctx: Ctx) -> list[dict]:
    """All events with EVENT_DATE in event_month for this anchor, including
    paired mirrors on other accounts. Pure function of its inputs.

    Draw-order discipline on the account-month rng:
      1. Hazard loop: exactly ONE rng.random() per slot when no event fires,
         exactly TWO (hazard + kind) when one does.
      2. Only then, on a BoardEx rise, ONE rng.choice() picks the C-suite
         persona. There is no probability draw: a rise always emits exactly
         one C-suite departure. Because this runs after the loop, a rise never
         shifts the hazard events.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(f"anchor failed employer audience predicate: {anchor!r}")
    month = _month_start(event_month)
    rng = random.Random(seed_for(anchor["ACCOUNT_ID"], DATASET_SALT, datetime.combine(month, time())))
    roster = _roster_for(anchor.get("EMPLOYEE_COUNT"))
    out: list[dict] = []

    # 1. Hazard events — never C-suite departures.
    for slot, persona in enumerate(roster):
        if rng.random() >= _HAZARD:
            continue
        kind_roll = rng.random()
        etype = "Departed" if kind_roll < 0.60 else ("Promoted" if kind_roll < 0.85 else "Joined")
        if persona in _CSUITE and etype == "Departed":
            etype = "Promoted" if persona != "CEO-Owner" else "Joined"   # C-suite exits go through the gate only
        out += _build(anchor, month, slot, "hazard", persona, etype, ctx)

    # 2. BoardEx rise -> exactly one C-suite departure.
    if boardex_rise:
        persona = rng.choice([p for p in roster if p in _CSUITE])        # every roster has CEO-Owner
        slot = roster.index(persona)
        out += _build(anchor, month, slot, "csuite", persona, "Departed", ctx)
    return out


# -------------------------------------------------------------------
# BoardEx gate + week filtering (SP side)
# -------------------------------------------------------------------

def _candidate_months(week_start: date) -> list[date]:
    """month(week_end) and the 3 prior months, ascending. Max lag is 52 days
    (45 + 7-day mirror offset), at most 2 calendar months back; the 4th month
    is slack for the boundary straddle."""
    last = _month_start(week_start + timedelta(days=6))
    return [_shift_months(last, -k) for k in range(_CANDIDATE_MONTHS_BACK, -1, -1)]


def _boardex_months_for_week(week_start: date) -> list[date]:
    """BoardEx months the SP must read for one week: the 4 candidate months
    plus the month before the earliest (needed to detect a rise in it)."""
    cands = _candidate_months(week_start)
    return [_shift_months(cands[0], -1)] + cands


def _boardex_rise(boardex: dict, account_id: str, month: date) -> bool:
    """rise(M) = flag(M) TRUE and flag(M-1) FALSE. A missing M or M-1 row
    (pre-history, or the month not generated yet) is NOT a rise."""
    cur = boardex.get((account_id, month))
    prev = boardex.get((account_id, _shift_months(month, -1)))
    return cur is not None and bool(cur) and prev is not None and not bool(prev)


def _rows_for_week(anchors, week_start: date, run_ts: datetime, boardex: dict, ctx: Ctx) -> list[dict]:
    """Events with DETECTED_DATE in [week_start, min(week_start + 6, run date)]."""
    week_end = week_start + timedelta(days=6)
    upper = min(week_end, run_ts.date())
    rows: list[dict] = []
    for a in anchors:
        for m in _candidate_months(week_start):
            rise = _boardex_rise(boardex, a["ACCOUNT_ID"], m)
            for ev in _events_for(a, m, rise, ctx):
                if week_start <= ev["DETECTED_DATE"] <= upper:
                    rows.append(ev)
    return rows


def _csuite_gate_violations(rows, boardex: dict, run_date: date, window_start: date) -> list[str]:
    """Python mirror of _assert_event_contract check (d), over a set of rows
    covering the detection window [window_start, run_date]:
      - every C-suite Departed is in a BoardEx rise month for its account;
      - no account-month has more than one C-suite Departed (always checked:
        "exactly one" holds even before the month is complete);
      - every rise month that is complete (month_end + 52 days < run_date) and
        whose earliest possible detection (month_start + 3 days) is inside the
        window has exactly one C-suite Departed.
    """
    problems: list[str] = []
    counts = Counter(
        (r["ACCOUNT_ID"], _month_start(r["EVENT_DATE"]))
        for r in rows
        if r["EVENT_TYPE"] == "Departed" and r["SENIORITY"] == "C-Suite"
    )
    for (acct, m), n in sorted(counts.items()):
        if not _boardex_rise(boardex, acct, m):
            problems.append(f"C-suite departure in non-rise month {acct} {m}")
        elif n > 1:
            problems.append(f"rise month {acct} {m}: {n} C-suite departures, expected 1")
    for (acct, m) in sorted(boardex):
        if not _boardex_rise(boardex, acct, m):
            continue
        month_end = _shift_months(m, 1) - timedelta(days=1)
        if m + timedelta(days=_MIN_DETECTION_LAG_DAYS) < window_start:
            continue
        if (run_date - month_end).days <= _COMPLETE_AFTER_DAYS:
            continue
        if counts.get((acct, m), 0) == 0:
            problems.append(f"rise month {acct} {m}: {counts.get((acct, m), 0)} C-suite departures, expected 1")
    return problems


# -------------------------------------------------------------------
# Run window (SP side)
# -------------------------------------------------------------------

def _run_weeks(run_date: date, backfill_weeks) -> list[date]:
    """Week starts (Mondays) the run processes, ascending: the previous
    max(1, backfill_weeks) complete weeks plus the current partial week.

    BACKFILL_WEEKS=0 (the TASK default) therefore covers last week and this
    week. The TASK fires Monday 09:00 UTC, when the current week holds only
    Monday's detections; processing only it would never write Tuesday-Sunday.
    """
    if backfill_weeks is None or int(backfill_weeks) < 0:
        raise ValueError(f"BACKFILL_WEEKS must be >= 0, got {backfill_weeks!r}")
    current = _monday(run_date)
    n = max(1, int(backfill_weeks))
    return [current - timedelta(days=7 * k) for k in range(n, -1, -1)]


def _complete_weeks(weeks, run_date: date) -> list[date]:
    """Weeks whose last day (Sunday) is on or before the run date."""
    return [w for w in weeks if w + timedelta(days=6) <= run_date]


def _boardex_month_span(weeks) -> tuple[date, date]:
    """(first, last) BoardEx PROFILE_MONTH the run needs: the union of
    _boardex_months_for_week over the run weeks."""
    return _boardex_months_for_week(weeks[0])[0], _candidate_months(weeks[-1])[-1]


def _rows_for_window(anchors, weeks, run_ts: datetime, boardex: dict, ctx: Ctx,
                     errors: list | None = None) -> list[dict]:
    """Rows for every run week at once, each (anchor, month) generated once.

    Equivalent to concatenating _rows_for_week over `weeks` (L1 asserts it):
    the candidate months of consecutive weeks overlap, so the window's months
    are the union, and the detection filter is [weeks[0], run date] (each
    week's upper bound is min(week_end, run date) and the weeks tile the
    span). Stamps ORG_ID from the SOURCE anchor (a paired mirror carries its
    source's ORG_ID).

    errors: when a list, a failing anchor is recorded as (ACCOUNT_ID, message)
    and skipped; when None the exception propagates.
    """
    lower = weeks[0]
    upper = min(weeks[-1] + timedelta(days=6), run_ts.date())
    first = _candidate_months(weeks[0])[0]
    last = _candidate_months(weeks[-1])[-1]
    months = []
    m = first
    while m <= last:
        months.append(m)
        m = _shift_months(m, 1)
    rows: list[dict] = []
    for a in anchors:
        try:
            org = a.get("ORG_ID") or DEFAULT_ORG_ID
            out = []
            for m in months:
                rise = _boardex_rise(boardex, a["ACCOUNT_ID"], m)
                for ev in _events_for(a, m, rise, ctx):
                    if lower <= ev["DETECTED_DATE"] <= upper:
                        ev["ORG_ID"] = org
                        out.append(ev)
        except Exception as exc:
            if errors is None:
                raise
            errors.append((a.get("ACCOUNT_ID"), str(exc)[:200]))
            continue
        rows.extend(out)
    return rows


# -------------------------------------------------------------------
# Event contract (replaces assert_coverage; plan section 2 checks a-d)
# -------------------------------------------------------------------

def _week_band_violations(counts: dict, complete_weeks, lo: int, hi: int) -> list[str]:
    """Contract (a): each complete week's row count in [lo, hi]. A week with no
    rows at all counts as 0 (it is not silently skipped)."""
    out = []
    for w in complete_weeks:
        n = int(counts.get(w, 0))
        if not lo <= n <= hi:
            out.append(f"week {w.isoformat()}: {n} rows outside [{lo}, {hi}]")
    return out


def _employer_exists(col: str) -> str:
    return (f"EXISTS (SELECT 1 FROM {ANCHORS_VIEW} e WHERE {_EMPLOYER_PREDICATE} "
            f"AND e.ACCOUNT_ID = {col})")


def _assert_event_contract(session: Any, weeks, run_date: date) -> None:
    """Raise RuntimeError if the rows written for this run's window break the
    event contract. Window = DETECTED_DATE in [weeks[0], run_date].

      (a) each COMPLETE run week has [_WEEK_ROWS_MIN, _WEEK_ROWS_MAX] rows;
      (b) every ACCOUNT_ID / non-NULL NEW_ACCOUNT_ID is in the employer audience;
      (c) every non-NULL PERSON_ACCOUNT_ID is in the Wealth pool;
      (d) BoardEx gate, both directions (SQL mirror of _csuite_gate_violations):
          d1 no C-suite Departed outside a rise month (flag(M) TRUE and the
             M-1 row present and FALSE);
          d2 no account-month with more than one C-suite Departed;
          d3 every rise month of an employer that is complete (more than 52
             days from month end to run date) and inside the window
             (month_start + 3 days >= window start) has a C-suite Departed.
    """
    ws, rd = weeks[0].isoformat(), run_date.isoformat()
    problems: list[str] = []

    # (a)
    counts_sql = (
        f"SELECT PROFILE_WEEK, COUNT(*) FROM {TABLE} "
        f"WHERE PROFILE_WEEK BETWEEN '{ws}' AND '{weeks[-1].isoformat()}' "
        f"AND DETECTED_DATE <= '{rd}' GROUP BY PROFILE_WEEK"
    )
    counts = {}
    for r in session.sql(counts_sql).collect():
        wk = r[0]
        counts[wk.date() if isinstance(wk, datetime) else wk] = int(r[1])
    for p in _week_band_violations(counts, _complete_weeks(weeks, run_date),
                                   _WEEK_ROWS_MIN, _WEEK_ROWS_MAX):
        problems.append(f"contract (a) {p}")

    window = f"t.DETECTED_DATE BETWEEN '{ws}' AND '{rd}'"
    # BoardEx rows of employer-audience accounts, and the rise months. DISTINCT
    # collapses exact duplicate keys (one live, Plan 10 data issue) so the rise
    # join stays one row per account-month, matching the Python dict loader.
    bx = (f"SELECT DISTINCT b.ACCOUNT_ID, b.PROFILE_MONTH, b.EXEC_TURNOVER_FLAG AS F "
          f"FROM {BOARDEX_TABLE} b WHERE {_employer_exists('b.ACCOUNT_ID')}")
    rises = (f"SELECT cur.ACCOUNT_ID, cur.PROFILE_MONTH FROM ({bx}) cur "
             f"JOIN ({bx}) prev ON prev.ACCOUNT_ID = cur.ACCOUNT_ID "
             f"AND prev.PROFILE_MONTH = DATEADD(month, -1, cur.PROFILE_MONTH) "
             f"WHERE cur.F AND NOT prev.F")
    dep = (f"SELECT t.ACCOUNT_ID, DATE_TRUNC('month', t.EVENT_DATE) AS PROFILE_MONTH, "
           f"COUNT(*) AS N FROM {TABLE} t WHERE {window} "
           f"AND t.EVENT_TYPE = 'Departed' AND t.SENIORITY = 'C-Suite' GROUP BY 1, 2")

    checks = [
        ("(b)", "rows whose ACCOUNT_ID or NEW_ACCOUNT_ID is outside the employer audience",
         f"SELECT COUNT(*) FROM {TABLE} t WHERE {window} "
         f"AND (NOT {_employer_exists('t.ACCOUNT_ID')} "
         f"OR (t.NEW_ACCOUNT_ID IS NOT NULL AND NOT {_employer_exists('t.NEW_ACCOUNT_ID')}))"),
        ("(c)", "rows whose PERSON_ACCOUNT_ID is outside the Wealth pool",
         f"SELECT COUNT(*) FROM {TABLE} t WHERE {window} "
         f"AND t.PERSON_ACCOUNT_ID IS NOT NULL AND NOT EXISTS ("
         f"SELECT 1 FROM {ANCHORS_VIEW} w WHERE {_WEALTH_PREDICATE} "
         f"AND w.ACCOUNT_ID = t.PERSON_ACCOUNT_ID)"),
        ("(d1)", "C-suite departures in a month that is not a BoardEx rise",
         f"SELECT COUNT(*) FROM ({dep}) d LEFT JOIN ({rises}) r "
         f"ON r.ACCOUNT_ID = d.ACCOUNT_ID AND r.PROFILE_MONTH = d.PROFILE_MONTH "
         f"WHERE r.ACCOUNT_ID IS NULL"),
        ("(d2)", "account-months with more than one C-suite departure",
         f"SELECT COUNT(*) FROM ({dep}) d WHERE d.N > 1"),
        ("(d3)", "complete in-window rise months with no C-suite departure",
         f"SELECT COUNT(*) FROM ({rises}) r LEFT JOIN ({dep}) d "
         f"ON d.ACCOUNT_ID = r.ACCOUNT_ID AND d.PROFILE_MONTH = r.PROFILE_MONTH "
         f"WHERE DATEADD(day, 3, r.PROFILE_MONTH) >= '{ws}' "
         f"AND DATEDIFF(day, LAST_DAY(r.PROFILE_MONTH), '{rd}') > {_COMPLETE_AFTER_DAYS} "
         f"AND d.ACCOUNT_ID IS NULL"),
    ]
    for tag, label, sql in checks:
        n = int(session.sql(f"-- contract {tag}\n{sql}").collect()[0][0] or 0)
        if n:
            letter = tag[:2] + ")"
            problems.append(f"contract {letter} {n} {label}")
    if problems:
        raise RuntimeError("event contract failed: " + "; ".join(problems))


# -------------------------------------------------------------------
# Entry point -- invoked by TASK_WEEKLY_USERGEMS_JOB_CHANGES via
# DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('...SP_GENERATE_USERGEMS_JOB_CHANGES()', 2)
# -------------------------------------------------------------------

def _run_ts(session: Any) -> datetime:
    if _RUN_TS_SQL:
        value = session.sql(_RUN_TS_SQL).collect()[0][0]
        return value.replace(tzinfo=None) if isinstance(value, datetime) else datetime.combine(value, time())
    return datetime.utcnow()


def _as_date(v) -> date:
    return v.date() if isinstance(v, datetime) else v


def _boardex_dict_from_rows(rows) -> dict:
    """{(ACCOUNT_ID, month): flag} from (ACCOUNT_ID, PROFILE_MONTH, FLAG) rows.

    An exact duplicate key with the same flag collapses (live BoardEx has one,
    001am00000qvjs6AAA 2026-10, a Plan 10 data issue). A duplicate key with
    CONFLICTING flags raises: the Python gate and the SQL contract (d) would
    disagree on whether that month is a rise.
    """
    out: dict = {}
    for r in rows:
        key = (r[0], _month_start(_as_date(r[1])))
        flag = None if r[2] is None else bool(r[2])
        if key in out and out[key] != flag:
            raise RuntimeError(
                f"BoardEx hard dependency (Plan 10): {BOARDEX_TABLE} has conflicting "
                f"duplicate rows for {key[0]} {key[1].isoformat()} (flags {out[key]} and {flag})"
            )
        out[key] = flag
    return out


def _boardex_coverage_violations(boardex: dict, first_month: date, lo: date, hi: date,
                                 run_date: date) -> list[str]:
    """BoardEx months this run depends on that are missing or thin.

    A month M is needed once any of its events can already be detected
    (M + 3 days <= run date), and M-1 is needed to tell whether M is a rise.
    Months before the table's first PROFILE_MONTH are pre-history (no rise, by
    design). Any other needed month in [lo, hi] with fewer than
    _BOARDEX_MIN_MONTH_COVERAGE x the best month's employer rows is a gap:
    reading it as "no rise" would silently drop C-suite departures in weeks
    that are never revisited (e.g. TASK_MONTHLY_BOARDEX_EXEC_INTEL failed or
    ran late). Raise instead; re-run after BoardEx catches up.
    """
    per_month = Counter(m for (_, m) in boardex)
    best = max(per_month.values(), default=0)
    floor = best * _BOARDEX_MIN_MONTH_COVERAGE
    out = []
    m = max(lo, _month_start(first_month))
    while m <= hi:
        if m + timedelta(days=_MIN_DETECTION_LAG_DAYS) > run_date:
            break
        n = per_month.get(m, 0)
        if n < floor or n == 0:
            out.append(f"{m.isoformat()}: {n} employer rows (best month {best})")
        m = _shift_months(m, 1)
    return out


def _load_boardex(session: Any, weeks, run_date: date | None = None) -> dict:
    """{(ACCOUNT_ID, PROFILE_MONTH): EXEC_TURNOVER_FLAG} for employer-audience
    accounts over the run's BoardEx month span. Hard dependency: a missing
    table, no rows at all in the span, a conflicting duplicate key, or a
    needed month that is missing or thin (_boardex_coverage_violations) raises."""
    lo, hi = _boardex_month_span(weeks)
    sql = (f"SELECT b.ACCOUNT_ID, b.PROFILE_MONTH, b.EXEC_TURNOVER_FLAG FROM {BOARDEX_TABLE} b "
           f"WHERE b.PROFILE_MONTH BETWEEN '{lo.isoformat()}' AND '{hi.isoformat()}' "
           f"AND {_employer_exists('b.ACCOUNT_ID')}")
    try:
        rows = session.sql(sql).collect()
        first = session.sql(f"SELECT MIN(PROFILE_MONTH) FROM {BOARDEX_TABLE}").collect()[0][0]
    except Exception as exc:
        raise RuntimeError(
            f"BoardEx hard dependency (Plan 10): cannot read {BOARDEX_TABLE}: {str(exc)[:300]}"
        ) from exc
    if not rows or first is None:
        raise RuntimeError(f"BoardEx hard dependency (Plan 10): {BOARDEX_TABLE} has no "
                           f"employer rows for {lo.isoformat()}..{hi.isoformat()}")
    out = _boardex_dict_from_rows(rows)
    if run_date is not None:
        gaps = _boardex_coverage_violations(out, _as_date(first), lo, hi, run_date)
        if gaps:
            raise RuntimeError(
                f"BoardEx hard dependency (Plan 10): {BOARDEX_TABLE} is missing needed "
                f"months ({'; '.join(gaps[:5])}). Re-run after the BoardEx month lands "
                f"(TASK_MONTHLY_BOARDEX_EXEC_INTEL)."
            )
    return out


def main(session: Any, backfill_weeks: int = 0) -> str:
    """Generate, MERGE and contract-check one run window.

    backfill_weeks=0 (TASK default): last week + the current partial week.
    backfill_weeks=104: the one-shot 24-month backfill (104 complete weeks
    plus the current partial week). Precondition: BoardEx history is sticky
    (plan section 2 "Backfill precondition").
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, rows_updated, accounts_processed, status, err = 0, 0, 0, "SUCCEEDED", None
    weeks: list[date] = []

    try:
        run_ts = _run_ts(session)
        weeks = _run_weeks(run_ts.date(), backfill_weeks)

        anchors = [_anchor_to_dict(r) for r in session.sql(EMPLOYER_SQL).collect()]
        anchors = [a for a in anchors if a.get("ACCOUNT_ID")]
        accounts_processed = len(anchors)
        if not anchors:
            raise RuntimeError("employer audience is empty")
        wealth = [r[0] for r in session.sql(WEALTH_SQL).collect()]
        ctx = Ctx(anchors, wealth)
        boardex = _load_boardex(session, weeks, run_ts.date())

        errors: list = []
        records = _rows_for_window(anchors, weeks, run_ts, boardex, ctx, errors=errors)
        max_tolerated = len(anchors) // 100
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(anchors)} anchors "
                f"(tolerance {max_tolerated}); first: {errors[0]}"
            )
        if errors:
            err = f"row factory failed on {len(errors)}/{len(anchors)} anchors; first: {errors[0]}"
        ids = [r["EVENT_ID"] for r in records]
        if len(ids) != len(set(ids)):
            raise RuntimeError("duplicate EVENT_IDs in one run (event identity broken)")

        rows_inserted, rows_updated = _merge(session, records)
        _assert_event_contract(session, weeks, run_ts.date())

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            f"""
            INSERT INTO {LOG_TABLE}
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    span = f"{weeks[0].isoformat()}..{weeks[-1].isoformat()}" if weeks else "-"
    return (f"{TASK_NAME}: {status} rows={rows_inserted} updated={rows_updated} "
            f"accounts={accounts_processed} weeks={len(weeks)} ({span})")


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so the row factory can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge -- idempotent MERGE ON (ORG_ID, EVENT_ID); events never delete
# -------------------------------------------------------------------

MERGE_COLUMNS = [
    "ORG_ID", "EVENT_ID", "ACCOUNT_ID", "PROFILE_WEEK", "EVENT_TYPE", "EVENT_DATE",
    "DETECTED_DATE", "CONTACT_NAME", "CONTACT_PERSONA", "SENIORITY", "OLD_TITLE",
    "NEW_TITLE", "NEW_EMPLOYER_NAME", "NEW_ACCOUNT_ID", "NEW_EMPLOYER_STATUS",
    "PAIRED_EVENT_ID", "WAS_CHAMPION", "WAS_PRIMARY_CONTACT", "OPPORTUNITY_SCORE",
    "RELATIONSHIP_RISK_SCORE", "PERSON_ACCOUNT_ID", "LIQUIDITY_EVENT_FLAG", "GENERATED_AT",
]
_DATE_COLUMNS = ("PROFILE_WEEK", "EVENT_DATE", "DETECTED_DATE")
_BOOL_COLUMNS = ("WAS_CHAMPION", "WAS_PRIMARY_CONTACT", "LIQUIDITY_EVENT_FLAG")
_NULLABLE_TEXT = ("OLD_TITLE", "NEW_TITLE", "NEW_EMPLOYER_NAME", "NEW_ACCOUNT_ID",
                  "PAIRED_EVENT_ID", "PERSON_ACCOUNT_ID")


def _merge_frame(records: list[dict]):
    """DataFrame in MERGE_COLUMNS order with deterministic dtypes.

    The 3 DATE columns and GENERATED_AT are forced to datetime64[ns], which
    write_pandas stages as NUMBER (nanoseconds since epoch) whatever the
    NULL pattern, so the MERGE's TO_TIMESTAMP_NTZ(x::NUMBER / 1e9) cast is
    always right. Booleans are forced to bool.
    """
    import pandas as pd
    df = pd.DataFrame(records, columns=MERGE_COLUMNS)
    for c in _DATE_COLUMNS + ("GENERATED_AT",):
        df[c] = pd.to_datetime(df[c]).astype("datetime64[ns]")
    for c in _BOOL_COLUMNS:
        df[c] = df[c].astype(bool)
    return df


def _src_expr(c: str) -> str:
    if c in _DATE_COLUMNS:
        return f"TO_DATE(TO_TIMESTAMP_NTZ({c}::NUMBER / 1000000000)) AS {c}"
    if c == "GENERATED_AT":
        return "TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT"
    if c in _BOOL_COLUMNS:
        return f"{c}::BOOLEAN AS {c}"
    if c in _NULLABLE_TEXT:
        return f"{c}::VARCHAR AS {c}"
    if c in ("OPPORTUNITY_SCORE", "RELATIONSHIP_RISK_SCORE"):
        return f"{c}::NUMBER(3,0) AS {c}"
    return c


def _merge_sql() -> str:
    """MERGE from STAGING_TABLE into TABLE ON (ORG_ID, EVENT_ID).

    RECORD_ID = SQL form of record_id_for(ORG_ID, EVENT_ID), written on
    INSERT and UPDATE (the column has no default). The UPDATE branch exists
    so a rowspec fix can be re-applied; events are immutable in practice.
    Snowflake MERGE has no NOT MATCHED BY SOURCE, and events never delete.
    """
    src_cols = ",\n                ".join(_src_expr(c) for c in MERGE_COLUMNS)
    non_pk = [c for c in MERGE_COLUMNS if c not in ("ORG_ID", "EVENT_ID")] + ["RECORD_ID"]
    set_list = ",\n            ".join(f"{c} = src.{c}" for c in non_pk)
    all_cols = MERGE_COLUMNS + ["RECORD_ID"]
    return f"""
        MERGE INTO {TABLE} tgt
        USING (
            SELECT
                {src_cols},
                REGEXP_REPLACE(
                    LEFT(SHA2(CONCAT_WS('|', ORG_ID, EVENT_ID, 'record_id'), 256), 32),
                    '(.{{8}})(.{{4}})(.{{4}})(.{{4}})(.{{12}})',
                    '\\\\1-\\\\2-\\\\3-\\\\4-\\\\5'
                ) AS RECORD_ID
            FROM {STAGING_TABLE}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.EVENT_ID = src.EVENT_ID
        WHEN MATCHED THEN UPDATE SET
            {set_list}
        WHEN NOT MATCHED THEN INSERT (
            {", ".join(all_cols)}
        ) VALUES (
            {", ".join("src." + c for c in all_cols)}
        )
    """


def _merge(session: Any, records: list[dict]) -> tuple[int, int]:
    """write_pandas -> staging -> MERGE. Returns (inserted, updated)."""
    if not records:
        return 0, 0
    session.write_pandas(
        _merge_frame(records), STAGING_NAME,
        auto_create_table=True, overwrite=True,
        database=_DB, schema=_SCHEMA,
    )
    return _merge_counts(session.sql(_merge_sql()).collect())


def _merge_counts(rows: list) -> tuple[int, int]:
    """(inserted, updated) from a MERGE result, read by column name."""
    if not rows:
        return 0, 0
    row = rows[0]
    if hasattr(row, "asDict"):
        d = {str(k).lower(): v for k, v in row.asDict().items()}
    elif isinstance(row, dict):
        d = {str(k).lower(): v for k, v in row.items()}
    else:
        d = {}
    if d:
        return (int(d.get("number of rows inserted") or 0),
                int(d.get("number of rows updated") or 0))
    vals = list(row)
    return int(vals[0] or 0), (int(vals[1] or 0) if len(vals) > 1 else 0)
