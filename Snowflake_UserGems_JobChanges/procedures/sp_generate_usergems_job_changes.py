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

The SP entry point (main / MERGE / _assert_event_contract / log) lands in
Plan 15 Task 4; this module currently holds the pure row factory that the L1
tests exercise, plus `_csuite_gate_violations`, the Python mirror of the
contract's check (d).

Plan:    docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-15-usergems-job-changes-rowspec.md
"""
from __future__ import annotations

import hashlib
import random
from collections import Counter
from datetime import date, datetime, time, timedelta

# Locally, cumulus_common resolves via the pytest pythonpath; in Snowflake,
# scripts/deploy_sp.py inlines seed_for / assert_coverage.
from cumulus_common import seed_for


# -------------------------------------------------------------------
# Constants — MUST stay in sync with the rowspec attachment + DDL
# -------------------------------------------------------------------

TABLE         = "DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES"
STAGING_TABLE = "DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES_STAGING"
BOARDEX_TABLE = "DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL"
TASK_NAME     = "TASK_WEEKLY_USERGEMS_JOB_CHANGES"
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
    "SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS "
    f"WHERE {_EMPLOYER_PREDICATE}"
)
WEALTH_SQL = (
    "SELECT DISTINCT ACCOUNT_ID FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS "
    f"WHERE {_WEALTH_PREDICATE} ORDER BY ACCOUNT_ID"
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
    for (acct, m) in sorted(boardex):
        if not _boardex_rise(boardex, acct, m):
            continue
        month_end = _shift_months(m, 1) - timedelta(days=1)
        if m + timedelta(days=_MIN_DETECTION_LAG_DAYS) < window_start:
            continue
        if (run_date - month_end).days <= _COMPLETE_AFTER_DAYS:
            continue
        if counts.get((acct, m), 0) != 1:
            problems.append(f"rise month {acct} {m}: {counts.get((acct, m), 0)} C-suite departures, expected 1")
    return problems
