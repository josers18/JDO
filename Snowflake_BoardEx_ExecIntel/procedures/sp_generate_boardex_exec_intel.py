"""BoardEx / Equilar / ISS-style synthetic board-and-exec intelligence generator.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL. **Rebroadcast — all-accounts
audience** (~36,813 anchors) with a 24-month history backfill companion
SP. The original Plan 10 design narrowed to Commercial Banking only; the
rebroadcast widens to every distinct anchor and emits one row per anchor
per calendar month. Current-cycle SP emits ~36,813 rows per run; the
backfill SP (sp_backfill_boardex_exec_intel.py) iterates audience x 24
months for ~883K rows.

Audience: all accounts (1=1 predicate; SELECT DISTINCT to dedupe MASTER_ACCOUNTS).
Cadence:  MONTHLY (03:00 America/New_York on the 1st — live task schedule).
Salt:     "boardex" (month-bucketed) for every field EXCEPT the exec-turnover
          pair, which reads an account-lifetime C-suite timeline seeded on
          seed_for(account_id + "_csuite", "boardex", 2000-01).
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-10-boardex-exec-intel-rowspec.md

EXEC_TURNOVER_FLAG / CEO_TENURE_YEARS (fixed 2026-11-02):
  The rowspec defines the flag as "any C-suite change in the trailing 12
  months", so it must be sticky. Each BUSINESS anchor gets one lifetime
  timeline of CEO + other-C-suite change events (2000-2030, exponential
  gaps, rate = 1 / per-firm mean CEO tenure drawn from EMPLOYEE_COUNT
  bands). EXEC_TURNOVER_FLAG(M) = any event in (month_end(M-12),
  month_end(M)]; CEO_TENURE_YEARS(M) = years since the last CEO change.
  Previously both were re-drawn iid every month from the monthly rng.

PERSON-anchor personal-governance fallback (rebroadcast deviation):
  PERSON anchors have NULL EMPLOYEE_COUNT and no real board. Rather than
  reject them or fold into the BUSINESS bias bands, the rebroadcast emits
  a "personal household" governance row:
    - BOARD_SIZE = 1 (self only)
    - BOARD_INDEPENDENCE_PCT = 100.0 (self is fully independent of self)
    - WOMEN_BOARD_PCT in {0.0, 100.0} (deterministic from ACCOUNT_ID hash)
    - MINORITY_BOARD_PCT in {0.0, 100.0} (deterministic from ACCOUNT_ID hash)
    - BOARD_AVG_TENURE_YEARS = 5.0 default
    - CEO_TENURE_YEARS = same as BOARD_AVG_TENURE_YEARS
    - EXEC_TURNOVER_FLAG = False (no exec to turn over)
    - GOVERNANCE_RATING = 'Adequate' (neutral)
    - INTERLOCK_COUNT = 0
    - KEY_DIRECTOR_NAME = 'Self'
    - RECENT_GOVERNANCE_EVENT_DATE = None
    - LAST_DATA_REFRESH_DATE = month_start.date() - small random offset
  This keeps the schema invariant (16 row-dict columns; the live table
  has 17 — RECORD_ID is computed in the MERGE) and makes coverage hold
  trivially (every anchor produces exactly one row).

Contract for the L1 sibling tests (Plan 10 T3):
    from sp_generate_boardex_exec_intel import (
        _rows_for,                # (anchor, profile_month) -> [dict] (len 1)
        _anchor_in_audience,      # (anchor) -> bool — True iff ACCOUNT_ID non-empty
        EXPECTED_OUTPUT_COLUMNS,  # frozenset of the 16 row-dict column names
    )
"""
from __future__ import annotations

import functools
import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment + DDL
# -------------------------------------------------------------------

TABLE        = "DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL"
TASK_NAME    = "TASK_MONTHLY_BOARDEX_EXEC_INTEL"
DATASET_SALT = "boardex"

# Rebroadcast: no audience predicate. Every distinct anchor contributes.
_AUDIENCE_PREDICATE = ""  # all-accounts
AUDIENCE_SQL = "SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"

# 16-column output contract — v1.x multi-org-additive (ORG_ID prepended).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_MONTH",
    "BOARD_SIZE", "BOARD_INDEPENDENCE_PCT",
    "WOMEN_BOARD_PCT", "MINORITY_BOARD_PCT",
    "BOARD_AVG_TENURE_YEARS", "CEO_TENURE_YEARS",
    "EXEC_TURNOVER_FLAG", "GOVERNANCE_RATING",
    "INTERLOCK_COUNT", "KEY_DIRECTOR_NAME",
    "RECENT_GOVERNANCE_EVENT_DATE", "LAST_DATA_REFRESH_DATE",
    "GENERATED_AT",
})


_GOVERNANCE_TIERS = ["Excellent", "Strong", "Adequate", "Weak", "Concerning"]

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


# -------------------------------------------------------------------
# Audience predicate — defense-in-depth in Python.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Rebroadcast audience predicate: every anchor with a non-empty ACCOUNT_ID.

    The L1 audience-violator test depends on this returning False for a
    missing or empty ACCOUNT_ID. There is no CLIENT_CATEGORY gate in the
    rebroadcast — both BUSINESS and PERSON anchors are in audience and
    routed via _is_person_anchor to the appropriate row-builder.
    """
    return bool(anchor.get("ACCOUNT_ID"))


def _is_person_anchor(anchor: dict) -> bool:
    """PERSON-vs-BUSINESS classifier for the rebroadcast row-builder routing.

    Two equivalent triggers — either is sufficient:
      1. ACCOUNT_TYPE_FLAG explicitly says PERSON (the canonical V_ACCOUNT_ANCHORS
         signal); or
      2. EMPLOYEE_COUNT is NULL / 0 / falsy (defensive: handles PERSON rows
         that lack the flag and BUSINESS rows that lack employee data).
    """
    return anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON" or not anchor.get("EMPLOYEE_COUNT")


# -------------------------------------------------------------------
# Per-field synthesis helpers (BUSINESS path) — implemented verbatim
# from the rowspec.
# -------------------------------------------------------------------

def _board_size(employee_count: int, rng: random.Random) -> int:
    """Larger firms have larger boards. BoardEx median ~9 across public companies.
    Range [5, 15]. Bias bands keyed on EMPLOYEE_COUNT (rowspec)."""
    if employee_count >= 10000:
        return rng.choices(
            [9, 10, 11, 12, 13, 14, 15],
            weights=[0.10, 0.20, 0.25, 0.20, 0.15, 0.07, 0.03],
        )[0]
    if employee_count >= 1000:
        return rng.choices(
            [7, 8, 9, 10, 11, 12],
            weights=[0.10, 0.20, 0.30, 0.25, 0.10, 0.05],
        )[0]
    if employee_count >= 100:
        return rng.choices(
            [5, 6, 7, 8, 9, 10],
            weights=[0.10, 0.20, 0.25, 0.25, 0.15, 0.05],
        )[0]
    return rng.choices([5, 6, 7, 8], weights=[0.30, 0.35, 0.25, 0.10])[0]


def _board_independence_pct(rng: random.Random) -> float:
    """Skewed 70-90 for established commercial-banking clients (NYSE/NASDAQ
    governance norms). Range [50.00, 100.00]."""
    return round(rng.uniform(50.0, 100.0) * 0.4 + rng.uniform(70.0, 90.0) * 0.6, 2)


def _women_board_pct(rng: random.Random) -> float:
    """Real BoardEx 2026 mean ~32% women across the S+P 500; skews 20-45.
    Range [0.00, 100.00]."""
    return round(rng.uniform(0.0, 50.0) * 0.3 + rng.uniform(20.0, 45.0) * 0.7, 2)


def _minority_board_pct(rng: random.Random) -> float:
    """Real BoardEx 2026 mean ~22% minorities; skews 10-35. Range [0.00, 100.00]."""
    return round(rng.uniform(0.0, 50.0) * 0.3 + rng.uniform(10.0, 35.0) * 0.7, 2)


def _board_avg_tenure(rng: random.Random) -> float:
    """Established commercial banks: avg board tenure 6-10 years. Range [1.0, 20.0]."""
    return round(rng.uniform(3.0, 14.0), 1)


# -------------------------------------------------------------------
# C-suite change timeline — account-lifetime, run_ts-independent.
#
# EXEC_TURNOVER_FLAG is "True if any C-suite change in the trailing 12
# months" (rowspec), so it must be sticky: once a change happens the flag
# stays True for that month and the following 11. The old model drew an
# iid monthly Bernoulli, which flickered (live: ~1 rise per ~1 stay).
#
# Instead every BUSINESS anchor gets ONE lifetime timeline of C-suite
# change events (CEO and other C-suite roles) from its own rng stream —
# seeded on (account_id + "_csuite", salt, 2000-01) so it never depends on
# the profile month or the run timestamp. Each month's row is a pure
# window read over that timeline:
#   EXEC_TURNOVER_FLAG(M) = any event in (month_end(M-12), month_end(M)]
#   CEO_TENURE_YEARS(M)   = years since the last CEO change <= month_end(M)
# -------------------------------------------------------------------

_TIMELINE_START = date(2000, 1, 1)
_TIMELINE_END   = date(2031, 1, 1)
_DAYS_PER_YEAR  = 365.25

# Expected CEO tenure (years) per EMPLOYEE_COUNT band — larger firms keep
# CEOs longer (succession planning). Same ordering as the retired
# _ceo_tenure() bands (>=10k: 2-18, >=1k: 1-12, else 0-10), shifted up to
# realistic means so the trailing-12-month TRUE rate lands near ~20%.
_CEO_TENURE_MEAN_BANDS = (
    (10000, (8.0, 16.0)),
    (1000,  (6.0, 13.0)),
    (0,     (4.5, 13.0)),
)
# Non-CEO C-suite departures arrive at this multiple of the CEO change rate.
_OTHER_CSUITE_RATE_MULT = 0.8
# Clamp on any single CEO tenure gap (years) — keeps CEO_TENURE_YEARS
# inside the column's [0.0, 25.0] range.
_CEO_GAP_MIN_YEARS = 0.25
_CEO_GAP_MAX_YEARS = 22.0
_OTHER_CSUITE_ROLES = ("CFO", "COO", "CRO", "CTO", "CIO", "General Counsel")


def _employee_band_floor(employee_count: int) -> int:
    for floor, _ in _CEO_TENURE_MEAN_BANDS:
        if employee_count >= floor:
            return floor
    return 0


def _add_years(d: date, years: float) -> date:
    return d + timedelta(days=int(round(years * _DAYS_PER_YEAR)))


@functools.lru_cache(maxsize=65536)
def _csuite_timeline(account_id: str, band_floor: int) -> tuple:
    """Lifetime C-suite change events for one BUSINESS anchor.

    Returns a sorted tuple of (event_date, role) where role is "CEO" or a
    non-CEO C-suite title. The first element is always the incumbent CEO's
    start date (role "CEO_START", dated before 2000-01-01 so it never
    counts as a change inside the 2000-2030 window).

    Pure + deterministic on (account_id, band_floor): uses its own rng
    stream so the monthly rng in _business_governance_row is untouched.
    """
    rng = random.Random(seed_for(account_id + "_csuite", DATASET_SALT, datetime(2000, 1, 1)))
    lo, hi = dict(_CEO_TENURE_MEAN_BANDS)[band_floor]
    mean_tenure = rng.uniform(lo, hi)          # firm-level stability
    ceo_rate = 1.0 / mean_tenure
    other_rate = ceo_rate * _OTHER_CSUITE_RATE_MULT

    events: list = []
    # Incumbent CEO started 0-15 years before the window opens.
    ceo_start = _add_years(_TIMELINE_START, -rng.uniform(0.0, 15.0))
    events.append((ceo_start, "CEO_START"))
    cur = ceo_start
    while True:
        gap = min(max(rng.expovariate(ceo_rate), _CEO_GAP_MIN_YEARS), _CEO_GAP_MAX_YEARS)
        cur = _add_years(cur, gap)
        if cur >= _TIMELINE_END:
            break
        events.append((cur, "CEO"))

    cur = _TIMELINE_START
    while True:
        cur = _add_years(cur, rng.expovariate(other_rate))
        if cur >= _TIMELINE_END:
            break
        events.append((cur, rng.choice(_OTHER_CSUITE_ROLES)))

    events.sort()
    return tuple(events)


def _month_end(month_start: date) -> date:
    """Last calendar day of month_start's month."""
    if month_start.month == 12:
        nxt = date(month_start.year + 1, 1, 1)
    else:
        nxt = date(month_start.year, month_start.month + 1, 1)
    return nxt - timedelta(days=1)


def _shift_months(month_start: date, months: int) -> date:
    idx = month_start.year * 12 + (month_start.month - 1) + months
    return date(idx // 12, idx % 12 + 1, 1)


def _exec_state_for_month(timeline: tuple, month_start: date) -> tuple[float, bool]:
    """(CEO_TENURE_YEARS, EXEC_TURNOVER_FLAG) at the end of month_start's month.

    EXEC_TURNOVER_FLAG = any C-suite change (CEO or other role) dated in
    (month_end(M-12), month_end(M)] — i.e. inside months M-11..M — so a
    change in month M keeps the flag True for M..M+11.
    CEO_TENURE_YEARS = years from the latest CEO start/change <= month_end(M),
    rounded to 0.1 and clamped to the column range [0.0, 25.0].
    Explicit bool(...) so write_pandas never stages a numpy.bool_.
    """
    end = _month_end(month_start)
    window_open = _month_end(_shift_months(month_start, -12))
    last_ceo = None
    flag = False
    for ev_date, role in timeline:
        if ev_date > end:
            break
        if role in ("CEO", "CEO_START"):
            last_ceo = ev_date
        if role != "CEO_START" and ev_date > window_open:
            flag = True
    tenure = (end - last_ceo).days / _DAYS_PER_YEAR
    return round(min(max(tenure, 0.0), 25.0), 1), bool(flag)


def _governance_rating(independence_pct: float, avg_tenure: float,
                        exec_turnover: bool, rng: random.Random) -> str:
    """Composite of independence + avg tenure + exec turnover. High independence
    is better; very-low or very-high avg tenure is worse (board churn or
    stagnation). EXEC_TURNOVER nudges toward lower tiers. Returns one of
    _GOVERNANCE_TIERS."""
    score = 0.0
    score += 2.0 if independence_pct >= 85.0 else (1.0 if independence_pct >= 70.0 else 0.0)
    if 5.0 <= avg_tenure <= 10.0:
        score += 1.0
    elif avg_tenure < 3.0 or avg_tenure > 14.0:
        score -= 1.0
    if exec_turnover:
        score -= 0.5
    score += rng.uniform(-1.0, 1.0)
    if score >= 2.0:
        return "Excellent"
    if score >= 1.0:
        return "Strong"
    if score >= -0.5:
        return "Adequate"
    if score >= -1.5:
        return "Weak"
    return "Concerning"


def _interlock_count(interlock_degree: int, rng: random.Random) -> int:
    """Anchor INTERLOCK_DEGREE drives this; default to a small distribution at 1-2.
    Range [0, 5]."""
    base = int(interlock_degree or 0)
    if base >= 4:
        return rng.choices([2, 3, 4, 5], weights=[0.20, 0.35, 0.30, 0.15])[0]
    if base >= 2:
        return rng.choices([0, 1, 2, 3, 4], weights=[0.10, 0.25, 0.35, 0.20, 0.10])[0]
    return rng.choices([0, 1, 2, 3], weights=[0.40, 0.30, 0.20, 0.10])[0]


def _key_director_name(rng: random.Random) -> str:
    """Single-row exemplar director used for narrative generation downstream.
    Synthesized from a small name pool — clearly fake; not real-person PII."""
    return f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}"


def _recent_governance_event_date(month_start: datetime, rng: random.Random) -> date | None:
    """Independent 30%/70% Bernoulli; when populated, drawn 1-365 days before
    month_start.date(). NULL in ~70% of rows. The MERGE source SELECT preserves
    None -> NULL via straight pandas serialisation (no enum gating)."""
    if rng.random() >= 0.30:
        return None
    return month_start.date() - timedelta(days=rng.randint(1, 365))


def _last_data_refresh(month_start: datetime, rng: random.Random) -> date:
    """Vendor refresh cadence: 1-30 days before month_start.date(). Always <= run_ts.date()."""
    return month_start.date() - timedelta(days=rng.randint(1, 30))


# -------------------------------------------------------------------
# _business_governance_row — substantive synthesis logic for BUSINESS
# anchors (existing Plan 10 path, modulo date-helper anchoring).
# -------------------------------------------------------------------

def _business_governance_row(anchor: dict, month_start: datetime) -> dict:
    """BUSINESS anchor row-builder. Pure function: deterministic on
    (account_id, month_start). All date helpers anchor on month_start.date()
    so mid-month re-runs are byte-identical."""
    account_id     = anchor["ACCOUNT_ID"]
    employee_count = int(anchor.get("EMPLOYEE_COUNT") or 0)
    interlock_deg  = int(anchor.get("INTERLOCK_DEGREE") or 0)

    seed = seed_for(account_id, DATASET_SALT, month_start)
    rng = random.Random(seed)

    # 1. Independent board-structure scalars (size + independence + diversity + tenure).
    board_size       = _board_size(employee_count, rng)
    independence_pct = _board_independence_pct(rng)
    women_pct        = _women_board_pct(rng)
    minority_pct     = _minority_board_pct(rng)
    avg_tenure       = _board_avg_tenure(rng)

    # 2. CEO tenure + exec turnover come from the account-lifetime C-suite
    #    timeline (own rng stream; no draws from the monthly rng), so the
    #    flag is trailing-12-month sticky and tenure grows month over month.
    #    _governance_rating still reads exec_turnover.
    timeline = _csuite_timeline(account_id, _employee_band_floor(employee_count))
    ceo_tenure_years, exec_turnover = _exec_state_for_month(timeline, month_start.date())
    governance_rating = _governance_rating(
        independence_pct, avg_tenure, exec_turnover, rng,
    )

    # 3. Network exemplar + dates. All dates anchored on month_start.date()
    #    (not run_ts.date()) so mid-month re-runs are byte-identical.
    interlock_count   = _interlock_count(interlock_deg, rng)
    director_name     = _key_director_name(rng)
    recent_event_date = _recent_governance_event_date(month_start, rng)
    last_refresh_date = _last_data_refresh(month_start, rng)

    return {
        "ORG_ID":                        anchor.get("ORG_ID") or "JDO",
        "ACCOUNT_ID":                    account_id,
        "PROFILE_MONTH":                 month_start.date(),
        "BOARD_SIZE":                    board_size,
        "BOARD_INDEPENDENCE_PCT":        independence_pct,
        "WOMEN_BOARD_PCT":               women_pct,
        "MINORITY_BOARD_PCT":            minority_pct,
        "BOARD_AVG_TENURE_YEARS":        avg_tenure,
        "CEO_TENURE_YEARS":              ceo_tenure_years,
        "EXEC_TURNOVER_FLAG":            exec_turnover,
        "GOVERNANCE_RATING":             governance_rating,
        "INTERLOCK_COUNT":               interlock_count,
        "KEY_DIRECTOR_NAME":             director_name,
        "RECENT_GOVERNANCE_EVENT_DATE":  recent_event_date,
        "LAST_DATA_REFRESH_DATE":        last_refresh_date,
        "GENERATED_AT":                  month_start,
    }


# -------------------------------------------------------------------
# _personal_governance_row — PERSON anchor fallback ("personal household"
# governance shape). Most fields are constants; the only stochastic
# pieces are the deterministic gender / minority hash and the small
# random LAST_DATA_REFRESH_DATE offset.
# -------------------------------------------------------------------

# PERSON personal-governance constants — load-bearing for tests.
_PERSON_BOARD_SIZE             = 1
_PERSON_BOARD_INDEPENDENCE_PCT = 100.0
_PERSON_BOARD_AVG_TENURE_YEARS = 5.0
_PERSON_INTERLOCK_COUNT        = 0
_PERSON_GOVERNANCE_RATING      = "Adequate"
_PERSON_KEY_DIRECTOR_NAME      = "Self"


def _personal_governance_row(anchor: dict, month_start: datetime) -> dict:
    """PERSON anchor "personal household" governance row-builder.

    Pure function: deterministic on (account_id, month_start). The
    seed is derived the same way as the BUSINESS path so cross-routing
    bugs are caught quickly (any anchor that flips PERSON-vs-BUSINESS
    between runs would emit a different but still byte-identical row
    on each side).

    Field shape (rebroadcast contract):
      - BOARD_SIZE = 1, INDEPENDENCE = 100.0, INTERLOCK = 0
      - WOMEN_BOARD_PCT in {0.0, 100.0} via deterministic ACCOUNT_ID hash
      - MINORITY_BOARD_PCT in {0.0, 100.0} via deterministic ACCOUNT_ID hash
      - tenure 5.0 default; CEO_TENURE_YEARS = BOARD_AVG_TENURE_YEARS
      - EXEC_TURNOVER_FLAG = False
      - GOVERNANCE_RATING = 'Adequate'
      - KEY_DIRECTOR_NAME = 'Self'
      - RECENT_GOVERNANCE_EVENT_DATE = None
      - LAST_DATA_REFRESH_DATE = month_start.date() - small random offset
    """
    account_id = anchor["ACCOUNT_ID"]
    seed = seed_for(account_id, DATASET_SALT, month_start)
    rng = random.Random(seed)

    # Two independent deterministic Bernoulli draws — gender and minority.
    # rng is consumed in a stable order: women -> minority -> last_refresh
    # offset. Re-runs in the same calendar month are byte-identical.
    women_pct    = 100.0 if rng.random() < 0.5 else 0.0
    minority_pct = 100.0 if rng.random() < 0.5 else 0.0
    last_refresh = month_start.date() - timedelta(days=rng.randint(1, 30))

    return {
        "ORG_ID":                        anchor.get("ORG_ID") or "JDO",
        "ACCOUNT_ID":                    account_id,
        "PROFILE_MONTH":                 month_start.date(),
        "BOARD_SIZE":                    _PERSON_BOARD_SIZE,
        "BOARD_INDEPENDENCE_PCT":        _PERSON_BOARD_INDEPENDENCE_PCT,
        "WOMEN_BOARD_PCT":               women_pct,
        "MINORITY_BOARD_PCT":            minority_pct,
        "BOARD_AVG_TENURE_YEARS":        _PERSON_BOARD_AVG_TENURE_YEARS,
        "CEO_TENURE_YEARS":              _PERSON_BOARD_AVG_TENURE_YEARS,
        "EXEC_TURNOVER_FLAG":            False,
        "GOVERNANCE_RATING":             _PERSON_GOVERNANCE_RATING,
        "INTERLOCK_COUNT":               _PERSON_INTERLOCK_COUNT,
        "KEY_DIRECTOR_NAME":             _PERSON_KEY_DIRECTOR_NAME,
        "RECENT_GOVERNANCE_EVENT_DATE":  None,
        "LAST_DATA_REFRESH_DATE":        last_refresh,
        "GENERATED_AT":                  month_start,
    }


# -------------------------------------------------------------------
# _rows_for — list-of-1 row factory dispatching on PERSON-vs-BUSINESS.
#
# Contract for the L1 sibling tests: (anchor, profile_month) -> [dict]
# of length 1. profile_month is a datetime; first-of-month/00:00:00 is
# enforced inside the function (defensive — callers may pass either a
# raw datetime or an already-floored month_start).
# -------------------------------------------------------------------

def _rows_for(anchor: dict, profile_month: datetime) -> list[dict]:
    """Pure function: anchor row -> [fact row] of length 1.

    Deterministic on (account_id, month_start) where month_start is the
    first-of-month floor of profile_month. PERSON anchors are routed to
    _personal_governance_row; BUSINESS anchors (and any anchor with a
    non-zero EMPLOYEE_COUNT) go to _business_governance_row.

    Args:
        anchor: distinct V_ACCOUNT_ANCHORS row as a dict.
        profile_month: a datetime; defensively floored to first-of-month
            00:00:00 UTC inside the function so mid-month re-runs are
            byte-identical regardless of caller carelessness.

    Returns:
        Single-row list (length 1). Wrapped to mirror the 1:N row-factory
        signature of the Plan 9 sibling — Plan 10 is 1:1 but the wrapper
        keeps both call sites uniform across plans.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed audience predicate "
            f"(ACCOUNT_ID empty/missing): {anchor!r}"
        )

    # profile_month may be `date` or `datetime`; the L1 contract accepts both.
    # Normalize to `datetime` at first-of-month 00:00:00 UTC. Downstream
    # helpers consistently call `month_start.date()` — they all expect a
    # datetime, not a date.
    if isinstance(profile_month, datetime):
        month_start = profile_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0,
        )
    else:
        month_start = datetime(profile_month.year, profile_month.month, 1)

    if _is_person_anchor(anchor):
        return [_personal_governance_row(anchor, month_start)]
    return [_business_governance_row(anchor, month_start)]


# -------------------------------------------------------------------
# Entry point — invoked by TASK_MONTHLY_BOARDEX_EXEC_INTEL via
# DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('...SP_GENERATE_BOARDEX_EXEC_INTEL()', 2)
# -------------------------------------------------------------------

def main(session: Any, num_months: int = 1, history_update_only: bool = False) -> str:
    """5-step pattern with optional history backfill.

    `num_months=1` (default): cron-driven, current month only.
    `num_months=24`: one-shot historical backfill (INSERT + UPDATE).
    `history_update_only=True`: regenerate history IN PLACE — months before
        the current one only UPDATE existing rows (no INSERT), so a logic
        change can be re-applied without back-filling rows for anchors that
        joined the audience later. The current month always runs the full
        MERGE (INSERT + UPDATE) so coverage still holds.

    Rows are generated and MERGEd one month at a time to bound SP memory
    (~37K rows per batch instead of ~1.1M dicts for a 30-month re-run).
    Consequence: a row-factory tolerance breach (or any exception) part-way
    through a multi-month run leaves the earlier months already rewritten
    and the later ones untouched. The run is idempotent, so re-running the
    same CALL repairs it.

    TASK_EXECUTION_LOG.ROWS_INSERTED counts only INSERTs; UPDATE counts are
    reported in the return string (`updated=`) since the log has no column
    for them.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, rows_updated, accounts_processed, status, err = 0, 0, 0, "SUCCEEDED", None

    try:
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)
        anchors = [_anchor_to_dict(row) for row in audience]

        current_month_start = started.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        month_starts = []
        y, m = current_month_start.year, current_month_start.month
        for _ in range(max(1, num_months)):
            month_starts.append(datetime(y, m, 1))
            m -= 1
            if m == 0:
                m = 12
                y -= 1

        total_pairs = len(anchors) * len(month_starts)
        max_tolerated = max(10, total_pairs // 100)
        errors = []
        for ms in month_starts:
            records = []
            for anchor in anchors:
                try:
                    records.extend(_rows_for(anchor, ms))
                except Exception as exc:
                    errors.append((anchor.get("ACCOUNT_ID"), str(exc)[:200]))
            if len(errors) > max_tolerated:
                raise RuntimeError(
                    f"row factory failed on {len(errors)}/{total_pairs} pairs "
                    f"(tolerance {max_tolerated}); first: {errors[0]}"
                )
            update_only = bool(history_update_only) and ms != current_month_start
            ins, upd = _merge(session, records, update_only=update_only)
            rows_inserted += ins
            rows_updated += upd
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{total_pairs} pairs; "
                f"first: {errors[0]}"
            )

        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return (f"{TASK_NAME}: {status} rows={rows_inserted} updated={rows_updated} "
            f"accounts={accounts_processed}")


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so _rows_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
# -------------------------------------------------------------------

def _assert_unique_keys(records: list[dict]) -> None:
    """Raise if any (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) appears more than once
    in a MERGE batch (e.g. an anchor duplicated upstream)."""
    seen = set()
    for r in records:
        key = (r["ORG_ID"], r["ACCOUNT_ID"], r["PROFILE_MONTH"])
        if key in seen:
            raise RuntimeError(
                f"duplicate MERGE source key (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)={key}"
            )
        seen.add(key)


def _merge(session: Any, records: list[dict], update_only: bool = False) -> tuple[int, int]:
    """MERGE records into TABLE. Returns (rows_inserted, rows_updated);
    update_only=True drops the WHEN NOT MATCHED clause, so inserted is 0.

    RECORD_ID is computed in the source SELECT with the SQL form of
    cumulus_common.record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_MONTH) and is
    written on both INSERT and UPDATE (the live column's DEFAULT is a
    random UUID_STRING(), which would break determinism).

    Casts in the source SELECT (defensive against write_pandas auto-typing
    on an empty target):
      - GENERATED_AT — datetime64[ns] mis-types as NUMBER(38,0) (nanoseconds-
        since-epoch); cast back via TO_TIMESTAMP_NTZ. Same pattern as Plan 1.
      - EXEC_TURNOVER_FLAG — explicit ::BOOLEAN cast because write_pandas
        can infer int8 on an empty stage; the DC DLO Boolean parse fails
        on Text-typed inputs (Plan 5 finding).
      - 3 DATE columns (PROFILE_MONTH, RECENT_GOVERNANCE_EVENT_DATE,
        LAST_DATA_REFRESH_DATE) pass through — pandas serialises datetime.date
        as DATE-compatible, so write_pandas creates the staging columns with
        DATE-friendly types and Snowflake auto-coerces on MERGE. The single
        NULLable date column serialises Python None -> SQL NULL.
    """
    if not records:
        return 0, 0

    _assert_unique_keys(records)

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "BOARDEX_EXEC_INTEL_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="DATA_JEDAIS", schema="FINS__PUBLIC",
    )

    # Belt-and-braces: the staged MERGE source must be unique on the PK, or a
    # MERGE could hit one target row twice (nondeterministic) or insert a
    # duplicate key. Raise before touching the target.
    n_rows, n_keys = session.sql(
        f"SELECT COUNT(*), COUNT(DISTINCT ORG_ID, ACCOUNT_ID, PROFILE_MONTH) "
        f"FROM DATA_JEDAIS.FINS__PUBLIC.{staging}"
    ).collect()[0]
    if n_rows != n_keys:
        raise RuntimeError(
            f"{staging} not unique on (ORG_ID, ACCOUNT_ID, PROFILE_MONTH): "
            f"{n_rows} rows / {n_keys} distinct keys"
        )

    merge_sql = f"""
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL tgt
        USING (
            SELECT
                ORG_ID,
                ACCOUNT_ID,
                PROFILE_MONTH,
                BOARD_SIZE,
                BOARD_INDEPENDENCE_PCT,
                WOMEN_BOARD_PCT,
                MINORITY_BOARD_PCT,
                BOARD_AVG_TENURE_YEARS,
                CEO_TENURE_YEARS,
                EXEC_TURNOVER_FLAG::BOOLEAN AS EXEC_TURNOVER_FLAG,
                GOVERNANCE_RATING,
                INTERLOCK_COUNT,
                KEY_DIRECTOR_NAME,
                RECENT_GOVERNANCE_EVENT_DATE,
                LAST_DATA_REFRESH_DATE,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT,
                REGEXP_REPLACE(
                    LEFT(SHA2(CONCAT_WS('|', ORG_ID, ACCOUNT_ID,
                                        TO_VARCHAR(PROFILE_MONTH::DATE, 'YYYY-MM-DD'),
                                        'record_id'), 256), 32),
                    '(.{{8}})(.{{4}})(.{{4}})(.{{4}})(.{{12}})',
                    '\\\\1-\\\\2-\\\\3-\\\\4-\\\\5'
                ) AS RECORD_ID
            FROM DATA_JEDAIS.FINS__PUBLIC.{staging}
        ) src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
           AND tgt.ORG_ID = src.ORG_ID
        WHEN MATCHED THEN UPDATE SET
            BOARD_SIZE                   = src.BOARD_SIZE,
            BOARD_INDEPENDENCE_PCT       = src.BOARD_INDEPENDENCE_PCT,
            WOMEN_BOARD_PCT              = src.WOMEN_BOARD_PCT,
            MINORITY_BOARD_PCT           = src.MINORITY_BOARD_PCT,
            BOARD_AVG_TENURE_YEARS       = src.BOARD_AVG_TENURE_YEARS,
            CEO_TENURE_YEARS             = src.CEO_TENURE_YEARS,
            EXEC_TURNOVER_FLAG           = src.EXEC_TURNOVER_FLAG,
            GOVERNANCE_RATING            = src.GOVERNANCE_RATING,
            INTERLOCK_COUNT              = src.INTERLOCK_COUNT,
            KEY_DIRECTOR_NAME            = src.KEY_DIRECTOR_NAME,
            RECENT_GOVERNANCE_EVENT_DATE = src.RECENT_GOVERNANCE_EVENT_DATE,
            LAST_DATA_REFRESH_DATE       = src.LAST_DATA_REFRESH_DATE,
            GENERATED_AT                 = src.GENERATED_AT,
            RECORD_ID                    = src.RECORD_ID
    """
    insert_sql = """
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID, ACCOUNT_ID, PROFILE_MONTH, BOARD_SIZE, BOARD_INDEPENDENCE_PCT,
            WOMEN_BOARD_PCT, MINORITY_BOARD_PCT, BOARD_AVG_TENURE_YEARS,
            CEO_TENURE_YEARS, EXEC_TURNOVER_FLAG, GOVERNANCE_RATING,
            INTERLOCK_COUNT, KEY_DIRECTOR_NAME, RECENT_GOVERNANCE_EVENT_DATE,
            LAST_DATA_REFRESH_DATE, GENERATED_AT, RECORD_ID
        ) VALUES (
            src.ORG_ID, src.ACCOUNT_ID, src.PROFILE_MONTH, src.BOARD_SIZE, src.BOARD_INDEPENDENCE_PCT,
            src.WOMEN_BOARD_PCT, src.MINORITY_BOARD_PCT, src.BOARD_AVG_TENURE_YEARS,
            src.CEO_TENURE_YEARS, src.EXEC_TURNOVER_FLAG, src.GOVERNANCE_RATING,
            src.INTERLOCK_COUNT, src.KEY_DIRECTOR_NAME, src.RECENT_GOVERNANCE_EVENT_DATE,
            src.LAST_DATA_REFRESH_DATE, src.GENERATED_AT, src.RECORD_ID
        )
    """
    if not update_only:
        merge_sql += insert_sql
    rows = session.sql(merge_sql).collect()
    return _merge_counts(rows, update_only)


def _merge_counts(rows: list, update_only: bool) -> tuple[int, int]:
    """(inserted, updated) from a MERGE result, read by column name.

    Snowflake's MERGE result has one column per clause present:
    "number of rows inserted" and/or "number of rows updated". With
    update_only=True there is no WHEN NOT MATCHED clause, so the only
    column is the UPDATE count — reading rows[0][0] positionally would
    misreport updates as inserts.
    """
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
    # Positional fallback (no column names): INSERT column precedes UPDATE.
    vals = list(row)
    if update_only:
        return 0, int(vals[0] or 0)
    return int(vals[0] or 0), int(vals[1] or 0) if len(vals) > 1 else 0
