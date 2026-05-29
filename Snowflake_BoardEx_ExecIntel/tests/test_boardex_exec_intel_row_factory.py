"""L1 tests for the BoardEx Exec Intel row factory.

Plan 10 is the **smallest Cumulus audience by 4.1×** (Commercial Banking,
~960 anchors) AND the first dataset where SAMPLE_ANCHORS has zero relevant
cohort members. Property tests therefore use an **inline 5-anchor synthetic
fixture** (provided by the local conftest) and lean entirely on per-anchor
deterministic invariants, with multi-month rolls to surface all 5
governance-rating tiers and every bias band.

Five property classes per rowspec / per-plan §4 task 3:
  1. Same-month determinism (mid-month re-runs byte-identical, day/hour
     collapse to month_start)
  2. Audience scoping (Commercial Banking filter — out-of-audience must
     raise; every in-audience anchor emits a row)
  3. Boring case — every Commercial Banking anchor produces a non-None dict
     with required-non-null fields populated
  4. Per-anchor / per-row invariants (load-bearing for Plan 10):
     a. BOARD_SIZE in [5, 15] for every (anchor, month) over 6-month roll
     b. BOARD_INDEPENDENCE_PCT / WOMEN_BOARD_PCT / MINORITY_BOARD_PCT all
        in [0, 100]
     c. GOVERNANCE_RATING in canonical 5-value set
     d. EXEC_TURNOVER_FLAG is a Python `bool`
     e. Date-coherence: LAST_DATA_REFRESH_DATE <= run_ts.date(); when
        populated, RECENT_GOVERNANCE_EVENT_DATE <= run_ts.date()
     f. INTERLOCK_COUNT in [0, 5]
     g. EMPLOYEE_COUNT > 5000 biases BOARD_SIZE >= 9 (rowspec: large
        enterprise band starts at EMPLOYEE_COUNT >= 10000 -> BOARD_SIZE
        9-15; we use the more conservative >5000 threshold)
  5. Schema contract — output dict matches the 15 table columns

Plus bonus tests:
  - RECENT_GOVERNANCE_EVENT_DATE NULL rate ~70% across a 6-month roll
    (band [50%, 90%] for the 5-anchor x 6-month population)
  - PROFILE_MONTH / GENERATED_AT match month_start (run_ts truncated to
    first-of-month at 00:00:00)
"""
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
from sp_generate_boardex_exec_intel import (
    _row_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


_VALID_GOVERNANCE_RATINGS = {
    "Excellent",
    "Strong",
    "Adequate",
    "Weak",
    "Concerning",
}


# ---------- Property 1: Same-month determinism ----------

def test_determinism_same_inputs_same_dict(in_audience_anchors):
    """Two back-to-back calls with the same inputs produce the same dict."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, f"non-deterministic same-inputs for {anchor['ACCOUNT_ID']}"


def test_determinism_buckets_by_month(in_audience_anchors):
    """All `run_ts` values within the same calendar month produce IDENTICAL
    rows (the SP collapses to month_start). A different month flips the dict."""
    day1 = datetime(2026, 5, 1, 0, 0, 0)
    day15 = datetime(2026, 5, 15, 12, 30, 45)
    eom_late = datetime(2026, 5, 28, 23, 30, 0)
    next_month = datetime(2026, 6, 1, 0, 0, 0)
    flipped = 0
    for anchor in in_audience_anchors:
        a = _row_for(anchor, day1)
        b = _row_for(anchor, day15)
        c = _row_for(anchor, eom_late)
        assert a == b, (
            f"{anchor['ACCOUNT_ID']}: day-1 vs day-15 differ within May 2026"
        )
        assert a == c, (
            f"{anchor['ACCOUNT_ID']}: day-1 vs eom-late differ within May 2026"
        )
        d = _row_for(anchor, next_month)
        if d != a:
            flipped += 1
    assert flipped >= 1, (
        "no anchor changed across May->June; month-bucketed seed may be "
        "missing the month component"
    )


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """Plan 10 audience is `CLIENT_CATEGORY = 'Commercial Banking'`. The SP
    must reject anchors that fail the predicate (Retail / Wealth / Small
    Business) — accept any of the canonical guard exceptions."""
    ts = datetime(2026, 5, 1)
    for bad in out_of_audience_anchors:
        with pytest.raises((ValueError, AssertionError, KeyError)):
            _row_for(bad, ts)


def test_anchor_in_audience_predicate(in_audience_anchors, out_of_audience_anchors):
    """`_anchor_in_audience` returns True for Commercial Banking, False otherwise."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good["ACCOUNT_ID"]
    for bad in out_of_audience_anchors:
        assert _anchor_in_audience(bad) is False, bad["ACCOUNT_ID"]


def test_every_in_audience_anchor_emits_a_row(in_audience_anchors):
    """Every Commercial Banking fixture anchor produces a non-None dict
    whose ACCOUNT_ID matches the anchor."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None, anchor["ACCOUNT_ID"]
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    """Defense-in-depth: an in-audience anchor with empty ACCOUNT_ID must raise."""
    with pytest.raises((ValueError, AssertionError, KeyError)):
        _row_for(
            {
                "ACCOUNT_ID": "",
                "ACCOUNT_TYPE_FLAG": "BUSINESS",
                "CLIENT_CATEGORY": "Commercial Banking",
                "INDUSTRY": "Finance",
                "ANNUAL_REVENUE": 100_000_000,
                "EMPLOYEE_COUNT": 1_000,
                "INTERLOCK_DEGREE": 1,
            },
            datetime(2026, 5, 1),
        )


# ---------- Property 3: Boring case ----------

def test_boring_case_every_commercial_banking_anchor_full_row(in_audience_anchors):
    """Every Commercial Banking anchor produces a non-None dict; every
    required (non-NULL) field is populated. Only RECENT_GOVERNANCE_EVENT_DATE
    is allowed to be None (NULLable in the DDL)."""
    ts = datetime(2026, 5, 1)
    required_non_null = {
        "ACCOUNT_ID",
        "PROFILE_MONTH",
        "BOARD_SIZE",
        "BOARD_INDEPENDENCE_PCT",
        "WOMEN_BOARD_PCT",
        "MINORITY_BOARD_PCT",
        "BOARD_AVG_TENURE_YEARS",
        "CEO_TENURE_YEARS",
        "EXEC_TURNOVER_FLAG",
        "GOVERNANCE_RATING",
        "INTERLOCK_COUNT",
        "KEY_DIRECTOR_NAME",
        "LAST_DATA_REFRESH_DATE",
        "GENERATED_AT",
    }
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None, anchor["ACCOUNT_ID"]
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        for f in required_non_null:
            assert row[f] is not None, (
                f"{anchor['ACCOUNT_ID']}: required field {f} is None"
            )
        # KEY_DIRECTOR_NAME is form "<First> <Last>" — non-empty with a space.
        director = row["KEY_DIRECTOR_NAME"]
        assert isinstance(director, str), director
        assert " " in director, (
            f"{anchor['ACCOUNT_ID']}: KEY_DIRECTOR_NAME={director!r} "
            f"missing space — expected '<First> <Last>'"
        )


# ---------- Property 4a: BOARD_SIZE range ----------

def test_4a_board_size_in_range(in_audience_anchors):
    """For every (anchor, month) over a 6-month roll: BOARD_SIZE in [5, 15]."""
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            board_size = row["BOARD_SIZE"]
            assert 5 <= board_size <= 15, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: BOARD_SIZE={board_size} "
                f"outside [5, 15]"
            )


# ---------- Property 4b: percentages in range ----------

def test_4b_percentages_in_range(in_audience_anchors):
    """For every (anchor, month) over a 6-month roll:
    BOARD_INDEPENDENCE_PCT, WOMEN_BOARD_PCT, MINORITY_BOARD_PCT all in [0, 100]."""
    pct_fields = ("BOARD_INDEPENDENCE_PCT", "WOMEN_BOARD_PCT", "MINORITY_BOARD_PCT")
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            for f in pct_fields:
                v = row[f]
                assert 0.0 <= v <= 100.0, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: {f}={v} "
                    f"outside [0.0, 100.0]"
                )


# ---------- Property 4c: GOVERNANCE_RATING canonical ----------

def test_4c_governance_rating_canonical(in_audience_anchors):
    """For every (anchor, month) over a 6-month roll: GOVERNANCE_RATING in
    {Excellent, Strong, Adequate, Weak, Concerning}."""
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            rating = row["GOVERNANCE_RATING"]
            assert rating in _VALID_GOVERNANCE_RATINGS, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: GOVERNANCE_RATING="
                f"{rating!r} not in {sorted(_VALID_GOVERNANCE_RATINGS)}"
            )


# ---------- Property 4d: EXEC_TURNOVER_FLAG is Python bool ----------

def test_4d_exec_turnover_flag_is_python_bool(in_audience_anchors):
    """EXEC_TURNOVER_FLAG is a Python `bool` — not int 0/1, not numpy.bool_,
    not a string. Plan 5 / Plan 8 finding: defaulting to Text fails the
    DC Boolean parse."""
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        flag = row["EXEC_TURNOVER_FLAG"]
        assert isinstance(flag, bool), (
            f"{anchor['ACCOUNT_ID']}: EXEC_TURNOVER_FLAG is "
            f"{type(flag).__name__}, expected bool"
        )


# ---------- Property 4e: date coherence ----------

def test_4e_date_coherence(in_audience_anchors):
    """For every (anchor, month) row:
      - LAST_DATA_REFRESH_DATE <= run_ts.date() (always, NOT NULL)
      - RECENT_GOVERNANCE_EVENT_DATE <= run_ts.date() (when not None)

    No future-dated vendor refresh; no future-dated governance events."""
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        run_date = ts.date()
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            last_refresh = row["LAST_DATA_REFRESH_DATE"]
            assert last_refresh is not None, (
                f"{anchor['ACCOUNT_ID']} on {run_date}: LAST_DATA_REFRESH_DATE "
                f"is None (must be NOT NULL)"
            )
            assert last_refresh <= run_date, (
                f"{anchor['ACCOUNT_ID']} on {run_date}: future-dated "
                f"LAST_DATA_REFRESH_DATE={last_refresh}"
            )
            recent_event = row["RECENT_GOVERNANCE_EVENT_DATE"]
            if recent_event is not None:
                assert recent_event <= run_date, (
                    f"{anchor['ACCOUNT_ID']} on {run_date}: future-dated "
                    f"RECENT_GOVERNANCE_EVENT_DATE={recent_event}"
                )


# ---------- Property 4f: INTERLOCK_COUNT range ----------

def test_4f_interlock_count_in_range(in_audience_anchors):
    """For every (anchor, month) over a 6-month roll: INTERLOCK_COUNT in [0, 5]."""
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            interlock = row["INTERLOCK_COUNT"]
            assert 0 <= interlock <= 5, (
                f"{anchor['ACCOUNT_ID']} on {ts.date()}: INTERLOCK_COUNT="
                f"{interlock} outside [0, 5]"
            )


# ---------- Property 4g: large-employer bias on BOARD_SIZE ----------

def test_4g_employee_count_biases_board_size(in_audience_anchors):
    """Rowspec: EMPLOYEE_COUNT >= 10000 -> BOARD_SIZE drawn from [9, 15].
    The SP's `_board_size` keys on three thresholds: >=10000 (band [9, 15]),
    >=1000 (band [7, 12]), >=100 (band [5, 10]). Only the >=10000 band
    guarantees BOARD_SIZE >= 9, so we test that exact threshold.

    Skip cleanly if the fixture has no anchors at the >= 10000 threshold
    (the inline fixture has 1: large_cap @ 25000)."""
    threshold_anchors = [
        a for a in in_audience_anchors if int(a.get("EMPLOYEE_COUNT") or 0) >= 10_000
    ]
    if not threshold_anchors:
        pytest.skip(
            "no fixture anchors with EMPLOYEE_COUNT >= 10000; "
            "large-employer bias band not exercised"
        )
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in threshold_anchors:
            row = _row_for(anchor, ts)
            board_size = row["BOARD_SIZE"]
            emp = anchor["EMPLOYEE_COUNT"]
            assert board_size >= 9, (
                f"{anchor['ACCOUNT_ID']} (EMPLOYEE_COUNT={emp}) on "
                f"{ts.date()}: BOARD_SIZE={board_size} < 9; large-employer "
                f"bias band violated"
            )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID",
    "PROFILE_MONTH",
    "BOARD_SIZE",
    "BOARD_INDEPENDENCE_PCT",
    "WOMEN_BOARD_PCT",
    "MINORITY_BOARD_PCT",
    "BOARD_AVG_TENURE_YEARS",
    "CEO_TENURE_YEARS",
    "EXEC_TURNOVER_FLAG",
    "GOVERNANCE_RATING",
    "INTERLOCK_COUNT",
    "KEY_DIRECTOR_NAME",
    "RECENT_GOVERNANCE_EVENT_DATE",
    "LAST_DATA_REFRESH_DATE",
    "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 15 table columns."""
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 1))
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )


def test_output_schema_constant_matches_test_set():
    """Defense against EXPECTED_OUTPUT_COLUMNS in the SP module drifting
    away from this test's EXPECTED_KEYS — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        "SP module's EXPECTED_OUTPUT_COLUMNS drifted from test's EXPECTED_KEYS"
    )


# ---------- Bonus tests ----------

def test_recent_governance_event_date_null_rate(in_audience_anchors):
    """Rowspec: ~70% of (anchor, month) rows have NULL RECENT_GOVERNANCE_EVENT_DATE
    via independent 30%/70% Bernoulli. Roll over 6 months for the 5-anchor
    cohort = 30 rows; require null rate in [50%, 90%] (±20pp band — 30 rows
    is small, the 70% target sees high variance)."""
    null_count = 0
    total = 0
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            total += 1
            if row["RECENT_GOVERNANCE_EVENT_DATE"] is None:
                null_count += 1
    assert total > 0
    rate = null_count / total
    assert 0.50 <= rate <= 0.90, (
        f"RECENT_GOVERNANCE_EVENT_DATE NULL rate {rate:.2%} "
        f"({null_count}/{total}) outside [50%, 90%] target band; "
        f"expected ~70%"
    )


def test_profile_month_matches_run_ts_month(in_audience_anchors):
    """PROFILE_MONTH == month_start.date(); GENERATED_AT == month_start
    (run_ts truncated to first-of-month at 00:00:00)."""
    for ts in (
        datetime(2026, 5, 1, 0, 0, 0),
        datetime(2026, 5, 15, 12, 30, 45),
        datetime(2026, 5, 28, 23, 59, 59),
    ):
        anchor = in_audience_anchors[0]
        row = _row_for(anchor, ts)
        expected_month_start = ts.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        assert row["PROFILE_MONTH"] == expected_month_start.date(), row
        assert row["GENERATED_AT"] == expected_month_start, row
