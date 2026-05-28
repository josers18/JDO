"""L1 tests for the MoneyGuidePro Financial Plans row factory.

First Cumulus dataset whose audience is too narrow (~19 Wealth Management
anchors out of SAMPLE_ANCHORS' 100) for distributional rate convergence,
AND first dataset whose NULL semantics are gated by a non-Boolean enum
(PLAN_STATUS in {Active, Draft, Stale}). Property tests therefore shift
to per-anchor / per-row deterministic invariants, with multi-month rolls
to surface diverse PLAN_STATUS realizations for the NULL test.

Five property classes per rowspec / per-plan §4 task 3:
  1. Same-month determinism (mid-month re-runs byte-identical, day/hour
     collapse to month_start)
  2. Audience scoping (Wealth Management filter — out-of-audience must
     raise; every in-audience anchor emits a row)
  3. Boring case — every Wealth anchor produces a non-None dict with
     required-non-null fields populated and null-conditional fields
     obeying the PLAN_STATUS rule
  4. Per-anchor / per-row invariants (load-bearing for Plan 8):
     a. Age-glide (per-anchor): age <35 -> Aggressive/Moderate Aggressive;
        age >=70 -> Moderate Conservative/Conservative
     b. Income-floor (per-anchor): MONTHLY_INCOME_TARGET_USD in
        [income*0.70/12, income*0.90/12]
     c. NULL-semantics (per-row, rolled over 12 months): Draft -> last
        review NULL; Stale -> next review NULL; Active -> both populated
     d. Date-coherence (per-row, rolled over 6 months): no future-dated
        plan-updated / last-review; next-review strictly in the future
     e. Range invariants (per-row, rolled over 3 months): all numeric
        fields within their declared bands
  5. Schema contract — output dict matches the 14 table columns

Plus bonus tests:
  - PLAN_STATUS canonical 3-value set
  - RECOMMENDED_ASSET_ALLOCATION canonical 5-value set
  - ADVISOR_NOTES_FLAG is Python bool
  - PROFILE_MONTH / GENERATED_AT match month_start
  - GOAL_COUNT mode in {2, 3} (skip if cohort < 5)
"""
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
from sp_generate_mgp_financial_plans import (
    _row_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


_VALID_STATUSES = {"Active", "Draft", "Stale"}
_VALID_ALLOCATIONS = {
    "Conservative",
    "Moderate Conservative",
    "Moderate",
    "Moderate Aggressive",
    "Aggressive",
}
_YOUNG_OK = {"Aggressive", "Moderate Aggressive"}
_OLD_OK = {"Moderate Conservative", "Conservative"}


def _age_on(birthdate_iso: str, on_date: date) -> int:
    """Local age calculator — does NOT import the SP module's private
    `_age_from_birthdate`. Uses the same yyyy-mm-dd parse as the fixture."""
    bd = date.fromisoformat(birthdate_iso)
    years = on_date.year - bd.year
    if (on_date.month, on_date.day) < (bd.month, bd.day):
        years -= 1
    return years


# ---------- Property 1: Same-month determinism ----------

def test_determinism_same_inputs_same_dict(in_audience_anchors):
    """Two back-to-back calls with the same inputs produce the same dict."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, f"non-deterministic same-inputs for {anchor['ACCOUNT_ID']}"


def test_determinism_buckets_by_month(in_audience_anchors):
    """All `run_ts` values within the same calendar month produce IDENTICAL
    rows (the SP collapses to month_start). A different month flips the dict."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    day1 = datetime(2026, 5, 1, 0, 0, 0)
    day15 = datetime(2026, 5, 15, 0, 0, 0)
    eom_late = datetime(2026, 5, 28, 23, 30, 0)
    next_month = datetime(2026, 6, 1, 0, 0, 0)
    flipped = 0
    for anchor in in_audience_anchors[:10]:
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
    """Plan 8 audience is `CLIENT_CATEGORY = 'Wealth Management'`. The SP
    must reject anchors that fail the predicate (e.g. Retail / Commercial
    Banking) — accept any of the canonical guard exceptions."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    ts = datetime(2026, 5, 1)
    for bad in out_of_audience_anchors[:5]:
        with pytest.raises((ValueError, AssertionError, KeyError)):
            _row_for(bad, ts)


def test_anchor_in_audience_predicate(in_audience_anchors, out_of_audience_anchors):
    """`_anchor_in_audience` returns True for Wealth, False for the rest."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good["ACCOUNT_ID"]
    for bad in out_of_audience_anchors:
        assert _anchor_in_audience(bad) is False, bad["ACCOUNT_ID"]


def test_every_in_audience_anchor_emits_a_row(in_audience_anchors):
    """Every Wealth fixture anchor produces a non-None dict whose
    ACCOUNT_ID matches the anchor."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    """Defense-in-depth: an in-audience anchor with empty ACCOUNT_ID must raise."""
    with pytest.raises((ValueError, AssertionError, KeyError)):
        _row_for(
            {
                "ACCOUNT_ID": "",
                "CLIENT_CATEGORY": "Wealth Management",
                "BIRTHDATE": "1970-01-01",
                "ANNUAL_INCOME": 300_000,
            },
            datetime(2026, 5, 1),
        )


# ---------- Property 3: Boring case ----------

def test_boring_case_every_wealth_anchor_full_row(in_audience_anchors):
    """Every Wealth anchor produces a non-None dict; required (non-NULL)
    fields populated; review-date NULLs obey the PLAN_STATUS rule."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    required_non_null = {
        "ACCOUNT_ID",
        "PROFILE_MONTH",
        "PLAN_STATUS",
        "PLAN_LAST_UPDATED_DATE",
        "RETIREMENT_TARGET_AGE",
        "MONTHLY_INCOME_TARGET_USD",
        "TOTAL_GOAL_AMOUNT_USD",
        "GOAL_COUNT",
        "MONTE_CARLO_SUCCESS_PCT",
        "RECOMMENDED_ASSET_ALLOCATION",
        "ADVISOR_NOTES_FLAG",
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
        # NULL-conditional fields obey the PLAN_STATUS rule
        status = row["PLAN_STATUS"]
        if status == "Draft":
            assert row["LAST_REVIEW_DATE"] is None
            assert row["NEXT_REVIEW_DATE"] is not None
        elif status == "Stale":
            assert row["LAST_REVIEW_DATE"] is not None
            assert row["NEXT_REVIEW_DATE"] is None
        else:  # Active
            assert row["LAST_REVIEW_DATE"] is not None
            assert row["NEXT_REVIEW_DATE"] is not None


# ---------- Property 4a: Age-glide invariant per anchor ----------

def test_4a_age_glide_invariant_per_anchor(in_audience_anchors):
    """For every Wealth anchor: age <35 -> Aggressive/Moderate Aggressive;
    age >=70 -> Moderate Conservative/Conservative. Skip cleanly when the
    cohort has no anchors in either band (Plan 5/6 pattern)."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    young_seen = old_seen = 0
    for anchor in in_audience_anchors:
        age = _age_on(anchor["BIRTHDATE"], ts.date())
        row = _row_for(anchor, ts)
        alloc = row["RECOMMENDED_ASSET_ALLOCATION"]
        if age < 35:
            assert alloc in _YOUNG_OK, (
                f"{anchor['ACCOUNT_ID']} age={age}: expected one of "
                f"{_YOUNG_OK}, got {alloc!r}"
            )
            young_seen += 1
        elif age >= 70:
            assert alloc in _OLD_OK, (
                f"{anchor['ACCOUNT_ID']} age={age}: expected one of "
                f"{_OLD_OK}, got {alloc!r}"
            )
            old_seen += 1
    if young_seen == 0 and old_seen == 0:
        pytest.skip(
            "Wealth cohort has no anchors with age <35 or >=70; "
            "age-glide invariant not exercised"
        )


# ---------- Property 4b: Income-floor invariant per anchor ----------

def test_4b_income_floor_invariant_per_anchor(in_audience_anchors):
    """For every Wealth anchor: MONTHLY_INCOME_TARGET_USD in
    [round(income*0.70/12), round(income*0.90/12)]. Use inclusive
    bounds — the SP rounds and integer rounding can land on either edge."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        income = float(anchor["ANNUAL_INCOME"])
        row = _row_for(anchor, ts)
        target = row["MONTHLY_INCOME_TARGET_USD"]
        lo = round(income * 0.70 / 12)
        hi = round(income * 0.90 / 12)
        assert lo <= target <= hi, (
            f"{anchor['ACCOUNT_ID']} income={income}: monthly target "
            f"{target} not in [{lo}, {hi}]"
        )


# ---------- Property 4c: NULL-semantics rolled over 12 months ----------

def test_4c_null_semantics_invariant_rolled_over_months(in_audience_anchors):
    """Roll over 12 months for every Wealth anchor (~228 rows for a 19-anchor
    cohort). Per row: Draft -> LAST_REVIEW_DATE NULL AND NEXT_REVIEW_DATE
    not None; Stale -> NEXT_REVIEW_DATE NULL AND LAST_REVIEW_DATE not None;
    Active -> both not None.

    Why 12 months: cohort is too small (19 anchors) for distributional
    convergence, but 12 different month_start seeds per anchor reliably
    surface all 3 PLAN_STATUS values across the population.
    """
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    seen_statuses = set()
    for month_offset in range(12):
        # Walk Jan..Dec 2026 — 12 distinct month_start seeds per anchor.
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            status = row["PLAN_STATUS"]
            seen_statuses.add(status)
            if status == "Draft":
                assert row["LAST_REVIEW_DATE"] is None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Draft but "
                    f"LAST_REVIEW_DATE={row['LAST_REVIEW_DATE']!r}"
                )
                assert row["NEXT_REVIEW_DATE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Draft but "
                    f"NEXT_REVIEW_DATE is None"
                )
            elif status == "Stale":
                assert row["NEXT_REVIEW_DATE"] is None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Stale but "
                    f"NEXT_REVIEW_DATE={row['NEXT_REVIEW_DATE']!r}"
                )
                assert row["LAST_REVIEW_DATE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Stale but "
                    f"LAST_REVIEW_DATE is None"
                )
            else:
                assert status == "Active", status
                assert row["LAST_REVIEW_DATE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Active but "
                    f"LAST_REVIEW_DATE is None"
                )
                assert row["NEXT_REVIEW_DATE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Active but "
                    f"NEXT_REVIEW_DATE is None"
                )
    # Allow 2 of 3 to avoid flakes on edge fixtures (12 months x 19 anchors
    # *should* surface all 3, but the 8% Stale rate could miss in adverse
    # seeding).
    assert len(seen_statuses) >= 2, (
        f"only saw PLAN_STATUS values {sorted(seen_statuses)} across "
        f"12-month roll; expected >=2 of {sorted(_VALID_STATUSES)}"
    )


# ---------- Property 4d: Date coherence rolled over 6 months ----------

def test_4d_date_coherence_invariant_rolled_over_months(in_audience_anchors):
    """For every (anchor, month) pair across 6 months:
      - PLAN_LAST_UPDATED_DATE <= run_ts.date()
      - LAST_REVIEW_DATE (if not None) <= run_ts.date()
      - NEXT_REVIEW_DATE (if not None) > run_ts.date()
    """
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    for month_offset in range(6):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        run_date = ts.date()
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["PLAN_LAST_UPDATED_DATE"] <= run_date, (
                f"{anchor['ACCOUNT_ID']} on {run_date}: future-dated "
                f"PLAN_LAST_UPDATED_DATE={row['PLAN_LAST_UPDATED_DATE']}"
            )
            if row["LAST_REVIEW_DATE"] is not None:
                assert row["LAST_REVIEW_DATE"] <= run_date, (
                    f"{anchor['ACCOUNT_ID']} on {run_date}: future-dated "
                    f"LAST_REVIEW_DATE={row['LAST_REVIEW_DATE']}"
                )
            if row["NEXT_REVIEW_DATE"] is not None:
                assert row["NEXT_REVIEW_DATE"] > run_date, (
                    f"{anchor['ACCOUNT_ID']} on {run_date}: NEXT_REVIEW_DATE "
                    f"{row['NEXT_REVIEW_DATE']} is not strictly in the future"
                )


# ---------- Property 4e: Range invariants per row ----------

def test_4e_range_invariants_per_row(in_audience_anchors):
    """For every (anchor, month) row across 3 months: declared numeric
    bands hold."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert 55 <= row["RETIREMENT_TARGET_AGE"] <= 80, row
            assert 10_000 <= row["MONTHLY_INCOME_TARGET_USD"] <= 200_000, row
            assert 500_000 <= row["TOTAL_GOAL_AMOUNT_USD"] <= 50_000_000, row
            assert 1 <= row["GOAL_COUNT"] <= 6, row
            assert 30.0 <= row["MONTE_CARLO_SUCCESS_PCT"] <= 99.0, row


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID",
    "PROFILE_MONTH",
    "PLAN_STATUS",
    "PLAN_LAST_UPDATED_DATE",
    "RETIREMENT_TARGET_AGE",
    "MONTHLY_INCOME_TARGET_USD",
    "TOTAL_GOAL_AMOUNT_USD",
    "GOAL_COUNT",
    "MONTE_CARLO_SUCCESS_PCT",
    "RECOMMENDED_ASSET_ALLOCATION",
    "LAST_REVIEW_DATE",
    "NEXT_REVIEW_DATE",
    "ADVISOR_NOTES_FLAG",
    "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 14 table columns."""
    if not in_audience_anchors:
        pytest.skip("no Wealth anchors in fixture")
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


# ---------- Bonus tests: range / canonical / type ----------

def test_plan_status_canonical(in_audience_anchors):
    """PLAN_STATUS in {Active, Draft, Stale} over a 3-month roll."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["PLAN_STATUS"] in _VALID_STATUSES, row


def test_recommended_asset_allocation_canonical(in_audience_anchors):
    """RECOMMENDED_ASSET_ALLOCATION always in the 5-value canonical set
    over a 3-month roll."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors in fixture"
        )
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["RECOMMENDED_ASSET_ALLOCATION"] in _VALID_ALLOCATIONS, row


def test_advisor_notes_flag_is_python_bool(in_audience_anchors):
    """ADVISOR_NOTES_FLAG is a Python bool (not 0/1, not numpy.bool_)."""
    if not in_audience_anchors:
        pytest.skip("no Wealth anchors in fixture")
    ts = datetime(2026, 5, 1)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert isinstance(row["ADVISOR_NOTES_FLAG"], bool), (
            f"{anchor['ACCOUNT_ID']}: ADVISOR_NOTES_FLAG is "
            f"{type(row['ADVISOR_NOTES_FLAG']).__name__}, expected bool"
        )


def test_profile_month_matches_run_ts_month(in_audience_anchors):
    """PROFILE_MONTH == month_start.date(); GENERATED_AT == month_start
    (run_ts truncated to first-of-month at 00:00:00)."""
    if not in_audience_anchors:
        pytest.skip("no Wealth anchors in fixture")
    # Cover a few different mid-month timestamps to exercise the truncation.
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


def test_goal_count_distribution_smoke(in_audience_anchors):
    """Smoke check: over a 3-month roll, GOAL_COUNT mode is in {2, 3}
    (rowspec says "1-6, mode 2-3"). Cohort < 5 makes mode noisy — skip."""
    if len(in_audience_anchors) < 5:
        pytest.skip(
            f"only {len(in_audience_anchors)} Wealth anchors; cohort too "
            f"small for stable mode (per AGENTS.md gotcha)"
        )
    import statistics

    values = []
    for month_offset in range(3):
        ts = datetime(2026, 1, 1) + timedelta(days=31 * month_offset)
        ts = ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            values.append(row["GOAL_COUNT"])
    mode = statistics.mode(values)
    assert mode in {2, 3}, (
        f"GOAL_COUNT mode={mode} (expected 2 or 3 per rowspec); "
        f"distribution {sorted(set(values))}"
    )
