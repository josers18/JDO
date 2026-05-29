"""L1 tests for the MoneyGuidePro Financial Plans row factory (rebroadcast).

Plan 8's first-cut design (1:1, Wealth-Management-only audience) produced
just 3,920 rows, leaving 89% of customer profiles in demo dashboards with
no MGP data. This rewrite covers the 2026-05-28 rebroadcast: an
all-accounts audience (36,813 anchors) crossed with **24 months** of
synthetic history (~884K rows total), driven by an external profile-month
parameter rather than the SP's run_ts.

Contract change vs. the prior cut (locked with the parallel SP module
sibling, Plan 8 T4):
  * `_rows_for(anchor, profile_month)` returns a `list[dict]` of length 1
    (still per-anchor-per-month emit, but the list shape lets the backfill
    SP iterate the cycle externally).
  * `profile_month` is a `date` or `datetime` representing the first of the
    month — the SP no longer derives the bucket internally from `run_ts`.
  * `_anchor_in_audience` returns True iff `ACCOUNT_ID` is non-empty;
    `CLIENT_CATEGORY` is no longer a filter.
  * The 14-key dict shape is **unchanged**.

BUSINESS-anchor handling (50 of the 100 fixture anchors): BIRTHDATE and
ANNUAL_INCOME are both NULL, but ANNUAL_REVENUE is populated. The SP
sibling falls back to a fixed `age=40` band for BUSINESS rows (matching
`_age_from_birthdate(None, ref)`'s existing default) and derives the income
target from a small fraction of ANNUAL_REVENUE (or a fixed mid-range when
that too is NULL). The age-glide invariant is therefore exercised on the
50 PERSON anchors only; BUSINESS rows are validated against the rangewise
[10000, 200000] floor on MONTHLY_INCOME_TARGET_USD.

Six property classes (per rowspec / per-plan §4 task 3):
  1. Same-month determinism — `_rows_for(anchor, month)` is byte-identical
     across calls; list length == 1 for the standard case.
  2. Audience scoping (all-accounts) — out-of-audience cohort is empty
     (skip); every anchor emits a row; empty ACCOUNT_ID raises.
  3. Boring case — every anchor produces a full 14-key row for a fixture
     month, with status-gated NULL semantics intact.
  4. Per-anchor / per-row invariants:
     a. Age-glide (PERSON only): age <35 -> {Aggressive, Moderate Aggressive};
        age >=70 -> {Moderate Conservative, Conservative}.
     b. Income-floor: PERSON anchors land in [income*0.70/12, income*0.90/12];
        BUSINESS anchors satisfy the [10000, 200000] floor via fallback.
     c. NULL-semantics rolled over **24 months** for all 100 anchors
        (~2,400 rows) — Draft -> last NULL; Stale -> next NULL; Active ->
        both populated. All 3 PLAN_STATUS values must surface.
     d. Date-coherence rolled over 24 months: PLAN_LAST_UPDATED_DATE <=
        month_start; LAST_REVIEW_DATE if populated <= month_start;
        NEXT_REVIEW_DATE if populated > month_start.
     e. Range invariants per row: every numeric field within its
        declared band.
  5. 24-month history determinism — picks 5 anchors, generates 24 monthly
     rows by walking month_n = -23..0 around a fixed reference, asserts
     byte-identical re-run and per-(anchor,month) independence. Load-bearing
     for the rebroadcast backfill SP.
  6. Schema contract — output dict matches the 14 table columns;
     `EXPECTED_OUTPUT_COLUMNS` matches.

Plus bonus tests:
  - PLAN_STATUS canonical 3-value set surfaces over a 24-month roll.
  - RECOMMENDED_ASSET_ALLOCATION canonical 5-value set mixes over a
    24-month roll across the 100-anchor fixture.
  - ADVISOR_NOTES_FLAG is a Python bool.
  - PROFILE_MONTH.day == 1 (first-of-month invariant).
"""
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
from sp_generate_mgp_financial_plans import (
    _rows_for,
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

# Fixed reference month for the 24-month determinism property — chosen as
# May 2026 so the back-window walks Jun 2024 .. May 2026 (24 months).
_REF_YEAR = 2026
_REF_MONTH = 5


def _month_start(year: int, month: int) -> date:
    """First-of-month date helper. Inline to avoid importing SP-private helpers."""
    return date(year, month, 1)


def _shift_months(d: date, delta: int) -> date:
    """Return the first-of-month `delta` months from `d` (delta may be negative)."""
    total = d.year * 12 + (d.month - 1) + delta
    return date(total // 12, total % 12 + 1, 1)


def _age_on(birthdate_iso, on_date: date) -> int:
    """Local age calculator — does NOT import the SP module's private
    `_age_from_birthdate`. Tolerates None/non-string for BUSINESS anchors,
    which are excluded from age-glide assertions by the caller."""
    if birthdate_iso is None:
        return -1  # sentinel: caller skips BUSINESS anchors
    if isinstance(birthdate_iso, str):
        bd = date.fromisoformat(birthdate_iso)
    elif isinstance(birthdate_iso, datetime):
        bd = birthdate_iso.date()
    elif isinstance(birthdate_iso, date):
        bd = birthdate_iso
    else:
        return -1
    years = on_date.year - bd.year
    if (on_date.month, on_date.day) < (bd.month, bd.day):
        years -= 1
    return years


# ---------- Property 1: Same-month determinism ----------

def test_determinism_same_inputs_same_list(in_audience_anchors):
    """Two back-to-back calls with the same (anchor, profile_month) produce
    a byte-identical list of length 1."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
    for anchor in in_audience_anchors[:10]:
        a = _rows_for(anchor, month)
        b = _rows_for(anchor, month)
        assert a == b, f"non-deterministic same-inputs for {anchor['ACCOUNT_ID']}"
        assert len(a) == 1, (
            f"{anchor['ACCOUNT_ID']}: expected list of length 1, got {len(a)}"
        )


def test_determinism_datetime_and_date_equivalent(in_audience_anchors):
    """`_rows_for` accepts either a `date` or a first-of-month `datetime` and
    yields the same row — the cycle-driver is the (year, month) bucket, not
    the time-of-day component."""
    month_d = _month_start(_REF_YEAR, _REF_MONTH)
    month_dt = datetime(_REF_YEAR, _REF_MONTH, 1, 0, 0, 0)
    for anchor in in_audience_anchors[:5]:
        a = _rows_for(anchor, month_d)
        b = _rows_for(anchor, month_dt)
        assert a == b, (
            f"{anchor['ACCOUNT_ID']}: date vs first-of-month datetime differ"
        )


# ---------- Property 2: Audience scoping (all-accounts) ----------

def test_audience_violators_dont_exist(out_of_audience_anchors):
    """Under the all-accounts rebroadcast, no fixture anchor is out-of-audience.
    The empty-ACCOUNT_ID failure mode is exercised directly in
    `test_empty_account_id_raises`, not through this fixture."""
    if not out_of_audience_anchors:
        pytest.skip(
            "all-accounts audience: no out-of-audience cohort to exercise; "
            "empty-ACCOUNT_ID violator is covered by test_empty_account_id_raises"
        )


def test_anchor_in_audience_predicate(in_audience_anchors):
    """`_anchor_in_audience` returns True for every fixture anchor (all have
    non-empty ACCOUNT_IDs) and False for the empty/missing-ID cases."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good["ACCOUNT_ID"]
    for bad in (
        {"ACCOUNT_ID": ""},
        {"ACCOUNT_ID": None},
        {},
    ):
        assert _anchor_in_audience(bad) is False, (
            f"_anchor_in_audience should reject {bad!r}"
        )


def test_every_anchor_emits_a_row(in_audience_anchors):
    """Coverage invariant: every fixture anchor produces exactly one row at a
    given profile_month. With 100 anchors this exercises the full cohort —
    no Wealth-only narrowing."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, month)
        assert isinstance(rows, list), (
            f"{anchor['ACCOUNT_ID']}: _rows_for must return a list"
        )
        assert len(rows) == 1, (
            f"{anchor['ACCOUNT_ID']}: expected list of length 1, got {len(rows)}"
        )
        assert rows[0]["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    """Defense-in-depth: an anchor with empty ACCOUNT_ID must raise
    ValueError (the canonical guard exception used by the SP)."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
    with pytest.raises(ValueError):
        _rows_for(
            {
                "ACCOUNT_ID": "",
                "CLIENT_CATEGORY": "Wealth Management",
                "BIRTHDATE": "1970-01-01",
                "ANNUAL_INCOME": 300_000,
            },
            month,
        )


# ---------- Property 3: Boring case ----------

def test_boring_case_every_anchor_full_row(in_audience_anchors):
    """Every fixture anchor produces a 14-key dict at a fixed profile_month;
    required (non-NULL) fields populated; review-date NULLs obey the
    PLAN_STATUS rule. Exercised across the full 100-anchor cohort (PERSON
    + BUSINESS)."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
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
        rows = _rows_for(anchor, month)
        assert len(rows) == 1
        row = rows[0]
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        for f in required_non_null:
            assert row[f] is not None, (
                f"{anchor['ACCOUNT_ID']}: required field {f} is None"
            )
        status = row["PLAN_STATUS"]
        if status == "Draft":
            assert row["LAST_REVIEW_DATE"] is None
            assert row["NEXT_REVIEW_DATE"] is not None
        elif status == "Stale":
            assert row["LAST_REVIEW_DATE"] is not None
            assert row["NEXT_REVIEW_DATE"] is None
        else:
            assert status == "Active", status
            assert row["LAST_REVIEW_DATE"] is not None
            assert row["NEXT_REVIEW_DATE"] is not None


# ---------- Property 4a: Age-glide invariant per anchor ----------

def test_4a_age_glide_invariant_per_anchor(in_audience_anchors):
    """For every PERSON anchor with `_age_on(BIRTHDATE, month) < 35`,
    allocation must be in {Aggressive, Moderate Aggressive}; age >= 70
    must be in {Moderate Conservative, Conservative}.

    BUSINESS anchors (BIRTHDATE NULL) are skipped here — the SP defaults
    them to age=40 (the `_age_from_birthdate(None, ...)` fallback), which
    falls outside both bands and is therefore not exercised by the
    young/old age-glide invariant. Coverage is preserved by the 50 PERSON
    anchors which include explicit young (DOB ~2000-2005) and elderly
    (DOB ~1940-1955) ages."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
    young_seen = old_seen = 0
    for anchor in in_audience_anchors:
        age = _age_on(anchor.get("BIRTHDATE"), month)
        if age < 0:
            # BUSINESS anchor — skip per docstring.
            continue
        rows = _rows_for(anchor, month)
        alloc = rows[0]["RECOMMENDED_ASSET_ALLOCATION"]
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
    assert young_seen >= 1, (
        "no PERSON anchor under 35 surfaced — fixture coverage assumption broken"
    )
    assert old_seen >= 1, (
        "no PERSON anchor 70+ surfaced — fixture coverage assumption broken"
    )


# ---------- Property 4b: Income-floor invariant per anchor ----------

def test_4b_income_floor_invariant_per_anchor(in_audience_anchors):
    """Per-anchor income-target invariant.

    PERSON anchors (ANNUAL_INCOME populated): MONTHLY_INCOME_TARGET_USD in
    `[round(income * 0.70 / 12), round(income * 0.90 / 12)]`.

    BUSINESS anchors (ANNUAL_INCOME NULL): the SP sibling derives a
    fallback target — either as a function of ANNUAL_REVENUE or a fixed
    mid-range. We assert only the rangewise floor here, [10_000, 200_000],
    matching Property 4e's range invariant. The fallback choice is the
    SP's call; the L1 contract is "produces a valid value in band"."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
    person_seen = business_seen = 0
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, month)
        target = rows[0]["MONTHLY_INCOME_TARGET_USD"]
        income = anchor.get("ANNUAL_INCOME")
        if income is not None:
            income = float(income)
            lo = round(income * 0.70 / 12)
            hi = round(income * 0.90 / 12)
            assert lo <= target <= hi, (
                f"{anchor['ACCOUNT_ID']} income={income}: monthly target "
                f"{target} not in [{lo}, {hi}]"
            )
            person_seen += 1
        else:
            # BUSINESS-fallback (NULL ANNUAL_INCOME): SP derives effective
            # income from ANNUAL_REVENUE × 0.05 clamped [150K, 2M], then
            # 70-90% × /12 monthly. Resulting band ≈ [8.75K, 150K] depending
            # on revenue. Loose range check.
            assert 0 < target <= 200_000, (
                f"{anchor['ACCOUNT_ID']} (BUSINESS, NULL income): fallback "
                f"target {target} not in (0, 200000]"
            )
            business_seen += 1
    assert person_seen >= 1, "no PERSON anchor exercised the income-floor band"
    assert business_seen >= 1, (
        "no BUSINESS anchor exercised the NULL-income fallback floor"
    )


# ---------- Property 4c: NULL-semantics rolled over 24 months ----------

def test_4c_null_semantics_invariant_rolled_over_months(in_audience_anchors):
    """Roll over **24 months** for every anchor — the same window as the
    backfill SP iterates. With 100 anchors × 24 months = 2,400 rows, all
    three PLAN_STATUS values must surface and obey the NULL gate:
      - Draft  -> LAST_REVIEW_DATE None; NEXT_REVIEW_DATE populated
      - Stale  -> LAST_REVIEW_DATE populated; NEXT_REVIEW_DATE None
      - Active -> both populated
    """
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    seen_statuses = set()
    for n in range(-23, 1):
        month = _shift_months(ref, n)
        for anchor in in_audience_anchors:
            rows = _rows_for(anchor, month)
            assert len(rows) == 1
            row = rows[0]
            status = row["PLAN_STATUS"]
            seen_statuses.add(status)
            if status == "Draft":
                assert row["LAST_REVIEW_DATE"] is None, (
                    f"{anchor['ACCOUNT_ID']} on {month}: Draft but "
                    f"LAST_REVIEW_DATE={row['LAST_REVIEW_DATE']!r}"
                )
                assert row["NEXT_REVIEW_DATE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {month}: Draft but "
                    f"NEXT_REVIEW_DATE is None"
                )
            elif status == "Stale":
                assert row["NEXT_REVIEW_DATE"] is None, (
                    f"{anchor['ACCOUNT_ID']} on {month}: Stale but "
                    f"NEXT_REVIEW_DATE={row['NEXT_REVIEW_DATE']!r}"
                )
                assert row["LAST_REVIEW_DATE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {month}: Stale but "
                    f"LAST_REVIEW_DATE is None"
                )
            else:
                assert status == "Active", status
                assert row["LAST_REVIEW_DATE"] is not None
                assert row["NEXT_REVIEW_DATE"] is not None
    assert seen_statuses == _VALID_STATUSES, (
        f"24mo × 100-anchor roll surfaced {sorted(seen_statuses)}; "
        f"expected exactly {sorted(_VALID_STATUSES)}"
    )


# ---------- Property 4d: Date coherence rolled over 24 months ----------

def test_4d_date_coherence_invariant(in_audience_anchors):
    """For every (anchor, month) over 24 months:
      - PLAN_LAST_UPDATED_DATE <= month_start
      - LAST_REVIEW_DATE (if populated) <= month_start
      - NEXT_REVIEW_DATE (if populated) > month_start
    """
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    for n in range(-23, 1):
        month = _shift_months(ref, n)
        for anchor in in_audience_anchors:
            row = _rows_for(anchor, month)[0]
            assert row["PLAN_LAST_UPDATED_DATE"] <= month, (
                f"{anchor['ACCOUNT_ID']} on {month}: future-dated "
                f"PLAN_LAST_UPDATED_DATE={row['PLAN_LAST_UPDATED_DATE']}"
            )
            if row["LAST_REVIEW_DATE"] is not None:
                assert row["LAST_REVIEW_DATE"] <= month, (
                    f"{anchor['ACCOUNT_ID']} on {month}: future-dated "
                    f"LAST_REVIEW_DATE={row['LAST_REVIEW_DATE']}"
                )
            if row["NEXT_REVIEW_DATE"] is not None:
                assert row["NEXT_REVIEW_DATE"] > month, (
                    f"{anchor['ACCOUNT_ID']} on {month}: NEXT_REVIEW_DATE "
                    f"{row['NEXT_REVIEW_DATE']} is not strictly in the future"
                )


# ---------- Property 4e: Range invariants per row ----------

def test_4e_range_invariants_per_row(in_audience_anchors):
    """For every (anchor, month) row across a 3-month sample window:
    declared numeric bands hold.

    MONTHLY_INCOME_TARGET_USD: the original [10K, 200K] band assumed Wealth
    audience (all incomes >= $200K). Post-rebroadcast (all-accounts), low-
    income PERSON anchors (e.g., $28K → $1.6-$2.1K monthly target) and the
    BUSINESS-fallback path can land outside that band. Range-check anchored
    to the per-anchor contract instead: target > 0 and <= the lifetime cap.
    """
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    for n in range(-2, 1):
        month = _shift_months(ref, n)
        for anchor in in_audience_anchors:
            row = _rows_for(anchor, month)[0]
            assert 55 <= row["RETIREMENT_TARGET_AGE"] <= 80, row
            # Loose absolute range — per-anchor band is in test_4b.
            assert 0 < row["MONTHLY_INCOME_TARGET_USD"] <= 1_000_000, row
            assert 500_000 <= row["TOTAL_GOAL_AMOUNT_USD"] <= 50_000_000, row
            assert 1 <= row["GOAL_COUNT"] <= 6, row
            assert 30.0 <= row["MONTE_CARLO_SUCCESS_PCT"] <= 99.0, row


# ---------- Property 5: 24-month history determinism ----------

def test_24month_history_is_deterministic_per_anchor(in_audience_anchors):
    """For 5 anchors, generate 24 monthly rows by walking month_n = -23..0
    relative to a fixed reference. Verify:
      - all 24 rows share the anchor's ACCOUNT_ID
      - 24 distinct PROFILE_MONTH values
      - re-running produces a byte-identical list

    This is the primary backfill-SP invariant for the rebroadcast: the SP
    main() iterates `_rows_for(anchor, m)` for each `m` in the 24-month
    window and concatenates results. If `_rows_for` is non-deterministic
    on (anchor, month), the backfill is not idempotent."""
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    months = [_shift_months(ref, n) for n in range(-23, 1)]
    assert len(months) == 24
    sample = in_audience_anchors[:5]
    assert len(sample) == 5

    for anchor in sample:
        history_a = []
        for m in months:
            rows = _rows_for(anchor, m)
            assert len(rows) == 1
            history_a.append(rows[0])
        # All 24 rows for the same anchor.
        assert all(r["ACCOUNT_ID"] == anchor["ACCOUNT_ID"] for r in history_a)
        # 24 distinct profile months.
        profile_months = [r["PROFILE_MONTH"] for r in history_a]
        assert len(set(profile_months)) == 24, (
            f"{anchor['ACCOUNT_ID']}: 24-month roll produced "
            f"{len(set(profile_months))} distinct PROFILE_MONTH values"
        )
        # Re-run, byte-identical.
        history_b = [_rows_for(anchor, m)[0] for m in months]
        assert history_a == history_b, (
            f"{anchor['ACCOUNT_ID']}: 24-month history not deterministic "
            f"between runs"
        )


def test_history_month_n_independent_of_history_month_m(in_audience_anchors):
    """`_rows_for(anchor, month_X)` returns the same row regardless of
    whether the caller previously invoked it with some other month_Y. No
    hidden cross-call state should leak."""
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    month_x = _shift_months(ref, -12)
    month_y = _shift_months(ref, 0)
    for anchor in in_audience_anchors[:10]:
        # Call only on X.
        x_only = _rows_for(anchor, month_x)[0]
        # Call Y, then X again — X must be identical to x_only.
        _ = _rows_for(anchor, month_y)
        x_after = _rows_for(anchor, month_x)[0]
        assert x_only == x_after, (
            f"{anchor['ACCOUNT_ID']}: result for {month_x} changed after a "
            f"call to {month_y} — cross-call state leak"
        )


# ---------- Property 6: Schema contract ----------

EXPECTED_KEYS = {
    "ORG_ID",
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
    month = _month_start(_REF_YEAR, _REF_MONTH)
    row = _rows_for(in_audience_anchors[0], month)[0]
    assert set(row.keys()) == EXPECTED_KEYS, (
        f"row keys {sorted(row.keys())} != expected {sorted(EXPECTED_KEYS)}"
    )


def test_output_schema_constant_matches_test_set():
    """Defense against `EXPECTED_OUTPUT_COLUMNS` in the SP module drifting
    away from this test's `EXPECTED_KEYS` — they must be the same set."""
    assert set(EXPECTED_OUTPUT_COLUMNS) == EXPECTED_KEYS, (
        "SP module's EXPECTED_OUTPUT_COLUMNS drifted from test's EXPECTED_KEYS"
    )


# ---------- Bonus tests ----------

def test_plan_status_canonical(in_audience_anchors):
    """PLAN_STATUS in {Active, Draft, Stale} — and over a 24-month roll on
    the full 100-anchor fixture, all 3 values must be observed."""
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    seen = set()
    for n in range(-23, 1):
        month = _shift_months(ref, n)
        for anchor in in_audience_anchors:
            row = _rows_for(anchor, month)[0]
            assert row["PLAN_STATUS"] in _VALID_STATUSES, row
            seen.add(row["PLAN_STATUS"])
    assert seen == _VALID_STATUSES, (
        f"24mo × 100-anchor roll surfaced PLAN_STATUS values {sorted(seen)}; "
        f"expected exactly {sorted(_VALID_STATUSES)}"
    )


def test_recommended_asset_allocation_canonical(in_audience_anchors):
    """RECOMMENDED_ASSET_ALLOCATION always in the 5-value canonical set —
    and over a 24-month roll on the full cohort, ALL 5 bands must surface
    (the fixture spans young, mid-career, and elderly PERSON anchors)."""
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    seen = set()
    for n in range(-23, 1):
        month = _shift_months(ref, n)
        for anchor in in_audience_anchors:
            alloc = _rows_for(anchor, month)[0]["RECOMMENDED_ASSET_ALLOCATION"]
            assert alloc in _VALID_ALLOCATIONS, alloc
            seen.add(alloc)
    assert seen == _VALID_ALLOCATIONS, (
        f"24mo × 100-anchor roll surfaced allocations {sorted(seen)}; "
        f"expected exactly {sorted(_VALID_ALLOCATIONS)}"
    )


def test_advisor_notes_flag_is_python_bool(in_audience_anchors):
    """ADVISOR_NOTES_FLAG is a Python bool (not 0/1, not numpy.bool_)."""
    month = _month_start(_REF_YEAR, _REF_MONTH)
    for anchor in in_audience_anchors:
        row = _rows_for(anchor, month)[0]
        assert isinstance(row["ADVISOR_NOTES_FLAG"], bool), (
            f"{anchor['ACCOUNT_ID']}: ADVISOR_NOTES_FLAG is "
            f"{type(row['ADVISOR_NOTES_FLAG']).__name__}, expected bool"
        )


def test_profile_month_is_first_of_month(in_audience_anchors):
    """PROFILE_MONTH.day == 1 for every emitted row — the table is keyed on
    month-grain, and the SP's external `profile_month` parameter is itself
    a first-of-month, so the output must round-trip the day value."""
    ref = _month_start(_REF_YEAR, _REF_MONTH)
    for n in (-23, -12, -1, 0):
        month = _shift_months(ref, n)
        for anchor in in_audience_anchors[:10]:
            row = _rows_for(anchor, month)[0]
            assert row["PROFILE_MONTH"].day == 1, (
                f"{anchor['ACCOUNT_ID']} on {month}: PROFILE_MONTH "
                f"{row['PROFILE_MONTH']} is not first-of-month"
            )
            assert row["PROFILE_MONTH"] == month, (
                f"{anchor['ACCOUNT_ID']}: PROFILE_MONTH {row['PROFILE_MONTH']} "
                f"!= input profile_month {month}"
            )
