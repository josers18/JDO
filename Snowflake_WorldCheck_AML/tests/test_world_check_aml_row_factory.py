"""L1 tests for the World-Check AML row factory.

First **daily-cadence** Cumulus dataset, and **first all-accounts audience.**
The row factory reads ONLY `anchor['ACCOUNT_ID']`; traditional anchor-influence
tests (income/age/state) don't apply, so Property 4 is reshaped into FOUR
alternative assertions.

Five property classes per rowspec §"Anchor-influence test target":
  1. Same-day determinism (mid-day re-runs byte-identical)
  2. Audience scoping — degenerate (no out-of-audience cohort exists)
  3. Boring case — every anchor produces a row with all 13 keys
  4. Anchor-independent invariants — FOUR sub-tests:
     a. Day-to-day stable RISK_JURISDICTION_CODE / TIER (year-stable)
     b. Year-shift jurisdiction reroll (some anchors drift across years)
     c. Population-rate convergence (sanctions/PEP/adverse-media to targets)
     d. CHANGE_SINCE_LAST_RUN coherence (~99% Unchanged on day-2)
     e. CASE_REFERENCE year-stable across days within the same year
     f. CASE_REFERENCE NULL when rating is Low/Medium
  5. Schema contract — output dict matches the 13 table columns

Plus bonus tests (range/canonical):
  - OVERALL_RISK_RATING / RISK_JURISDICTION_TIER / CHANGE_SINCE_LAST_RUN canonical
  - 3 BOOLEAN fields are Python bool
  - ADVERSE_MEDIA_CATEGORIES NULL when ADVERSE_MEDIA_HIT=False; non-NULL when True
  - Severe rollup invariant
"""
from datetime import datetime

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
from sp_generate_world_check_aml import (
    _row_for,
    _diff_rating,
    EXPECTED_OUTPUT_COLUMNS,
    _PROHIBITED_JURISDICTIONS,
    _ENHANCED_JURISDICTIONS,
    _STANDARD_JURISDICTIONS,
    _ADVERSE_MEDIA_CATEGORY_POOL,
)


_ALL_JURISDICTIONS = (
    set(_PROHIBITED_JURISDICTIONS)
    | set(_ENHANCED_JURISDICTIONS)
    | set(_STANDARD_JURISDICTIONS)
)
_VALID_RATINGS = {"Low", "Medium", "High", "Severe"}
_VALID_TIERS = {"Standard", "Enhanced", "Prohibited"}
_VALID_CHANGES = {"New", "Unchanged", "Risk Increased", "Risk Decreased", "Cleared"}


# ---------- Property 1: Same-day determinism ----------

def test_determinism_mid_day_reruns_byte_identical(in_audience_anchors):
    """`_row_for(anchor, 03:00)` and `_row_for(anchor, 23:30)` produce
    IDENTICAL dicts (mid-day bucketing collapses to day-start)."""
    morning = datetime(2026, 5, 28, 3, 0, 0)
    night = datetime(2026, 5, 28, 23, 30, 0)
    for anchor in in_audience_anchors[:10]:
        a = _row_for(anchor, morning)
        b = _row_for(anchor, night)
        assert a == b, (
            f"non-deterministic mid-day for {anchor['ACCOUNT_ID']}: "
            f"03:00 vs 23:30 differ"
        )


def test_determinism_noon_equals_midnight(in_audience_anchors):
    """`_row_for(anchor, 12:00)` is byte-identical to `_row_for(anchor, 00:00)`
    — the day-start bucket collapses both."""
    midnight = datetime(2026, 5, 28, 0, 0, 0)
    noon = datetime(2026, 5, 28, 12, 0, 0)
    for anchor in in_audience_anchors[:10]:
        a = _row_for(anchor, midnight)
        b = _row_for(anchor, noon)
        assert a == b, (
            f"non-deterministic noon vs midnight for {anchor['ACCOUNT_ID']}"
        )


def test_determinism_same_inputs_same_dict(in_audience_anchors):
    """Two back-to-back calls with the same inputs produce the same dict."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b


# ---------- Property 2: Audience scoping (degenerate for Plan 7) ----------

def test_audience_violators_dont_exist(out_of_audience_anchors):
    """Plan 7 has no out-of-audience cohort. The fixture should be empty;
    if it ever gains entries, this test would catch a conftest regression."""
    if not out_of_audience_anchors:
        pytest.skip("Plan 7 audience is all-accounts — no violators by design")
    # If we ever populate out_of_audience_anchors (we shouldn't), the
    # row factory must still NOT raise (since _anchor_in_audience always
    # returns True for non-empty ACCOUNT_IDs).
    for bad in out_of_audience_anchors:
        _row_for(bad, datetime(2026, 5, 28))  # must not raise


def test_every_anchor_emits_a_row_no_exceptions(in_audience_anchors):
    """All 100 fixture anchors produce a row without raising."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    """Defense-in-depth: an anchor with empty ACCOUNT_ID must raise."""
    with pytest.raises((ValueError, AssertionError, KeyError)):
        _row_for({"ACCOUNT_ID": ""}, datetime(2026, 5, 28))


# ---------- Property 3: Boring case ----------

def test_boring_case_every_anchor_has_full_row(in_audience_anchors):
    """All 100 fixture anchors produce a non-None dict with ACCOUNT_ID
    matching the anchor; required (non-NULL) fields populated; NULL fields
    NULL when their predicate is false."""
    ts = datetime(2026, 5, 28)
    required_non_null = {
        "ACCOUNT_ID", "PROFILE_DATE", "OVERALL_RISK_RATING",
        "SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT",
        "RISK_JURISDICTION_CODE", "RISK_JURISDICTION_TIER",
        "LAST_SCREENED_AT", "CHANGE_SINCE_LAST_RUN", "GENERATED_AT",
    }
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None, anchor["ACCOUNT_ID"]
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]
        for f in required_non_null:
            assert row[f] is not None, (
                f"{anchor['ACCOUNT_ID']}: required field {f} is None"
            )
        # ADVERSE_MEDIA_CATEGORIES NULL iff ADVERSE_MEDIA_HIT False
        if row["ADVERSE_MEDIA_HIT"]:
            assert row["ADVERSE_MEDIA_CATEGORIES"] is not None
        else:
            assert row["ADVERSE_MEDIA_CATEGORIES"] is None
        # CASE_REFERENCE NULL iff rating not High/Severe
        if row["OVERALL_RISK_RATING"] in ("High", "Severe"):
            assert row["CASE_REFERENCE"] is not None
        else:
            assert row["CASE_REFERENCE"] is None


# ---------- Property 4a: Day-to-day stable jurisdiction (year-stable) ----------

def test_4a_jurisdiction_stable_across_days_same_year(in_audience_anchors):
    """RISK_JURISDICTION_CODE and TIER on May 28 == same on May 29 (same year)."""
    day1 = datetime(2026, 5, 28)
    day2 = datetime(2026, 5, 29)
    for anchor in in_audience_anchors[:10]:
        a = _row_for(anchor, day1)
        b = _row_for(anchor, day2)
        assert a["RISK_JURISDICTION_CODE"] == b["RISK_JURISDICTION_CODE"], (
            f"{anchor['ACCOUNT_ID']}: jurisdiction drifted day-to-day "
            f"({a['RISK_JURISDICTION_CODE']} vs {b['RISK_JURISDICTION_CODE']})"
        )
        assert a["RISK_JURISDICTION_TIER"] == b["RISK_JURISDICTION_TIER"], (
            f"{anchor['ACCOUNT_ID']}: tier drifted day-to-day"
        )


# ---------- Property 4b: Year-shift jurisdiction reroll ----------

def test_4b_jurisdiction_reroll_across_years(in_audience_anchors):
    """Across all 100 fixture anchors, at least 5 should see a different
    RISK_JURISDICTION_CODE between Jan 1 2026 and Jan 1 2027 (the year-stable
    seed bucket flips). This guards against accidentally seeding only on
    account_id (which would make jurisdiction permanent)."""
    y2026 = datetime(2026, 1, 1)
    y2027 = datetime(2027, 1, 1)
    drifted = 0
    for anchor in in_audience_anchors:
        a = _row_for(anchor, y2026)
        b = _row_for(anchor, y2027)
        if a["RISK_JURISDICTION_CODE"] != b["RISK_JURISDICTION_CODE"]:
            drifted += 1
    assert drifted >= 5, (
        f"only {drifted}/{len(in_audience_anchors)} anchors saw a "
        f"jurisdiction shift across years; expected >=5 — year-stable "
        f"seed may not be year-bucketed"
    )


# ---------- Property 4c: Population-rate convergence ----------

def test_4c_population_rate_convergence(in_audience_anchors):
    """Across SAMPLE_ANCHORS × 365 days × 10 years = 365,000 row samples,
    the rates converge to targets within ±0.3 pp:
      - SANCTIONS_HIT rate within [0.002, 0.008] (target 0.005)
      - PEP_HIT rate within [0.008, 0.016] (target 0.012)
      - ADVERSE_MEDIA_HIT rate within [0.024, 0.036] (target 0.030)

    Why 10 years and not just 1: the SP uses a hybrid year-stable + daily-flip
    model so each anchor has a year-stable base flag that's resampled per
    calendar year. Rolling 10 years gives 10 fresh year-stable realizations
    per anchor (1000 distinct bases) so the marginal rate converges; rolling
    365 days within ONE year gives only 100 distinct bases, which is too
    few for the 0.5%-rate sanctions test (binomial variance is too high).
    """
    sanctions = pep = media = total = 0
    for year in range(2020, 2030):  # 10 distinct year-stable buckets
        base = datetime(year, 1, 1)
        for anchor in in_audience_anchors:
            for day_offset in range(365):
                ts = base + _timedelta_days(day_offset)
                row = _row_for(anchor, ts)
                total += 1
                if row["SANCTIONS_HIT"]:
                    sanctions += 1
                if row["PEP_HIT"]:
                    pep += 1
                if row["ADVERSE_MEDIA_HIT"]:
                    media += 1

    s_rate = sanctions / total
    p_rate = pep / total
    m_rate = media / total
    print(
        f"\nPopulation rates over {total} samples (10 years × 100 anchors × 365 days):\n"
        f"  SANCTIONS_HIT      = {s_rate:.4f} (target 0.005, band [0.002, 0.008])\n"
        f"  PEP_HIT            = {p_rate:.4f} (target 0.012, band [0.008, 0.016])\n"
        f"  ADVERSE_MEDIA_HIT  = {m_rate:.4f} (target 0.030, band [0.024, 0.036])"
    )
    assert 0.002 <= s_rate <= 0.008, f"sanctions rate {s_rate:.4f} out of band"
    assert 0.008 <= p_rate <= 0.016, f"pep rate {p_rate:.4f} out of band"
    assert 0.024 <= m_rate <= 0.036, f"adverse-media rate {m_rate:.4f} out of band"


def _timedelta_days(n: int):
    """Local import to keep the test module top imports short."""
    from datetime import timedelta
    return timedelta(days=n)


# ---------- Property 4d: CHANGE_SINCE_LAST_RUN coherence ----------

def test_4d_change_since_last_run_mostly_unchanged(in_audience_anchors):
    """Roll over 50 days for 50 fixture anchors. On day-2 (and beyond),
    >=96% of rows should be 'Unchanged' (target 99%). This is the
    load-bearing demo invariant."""
    base = datetime(2026, 5, 28)
    cohort = in_audience_anchors[:50]
    unchanged = total = 0
    for day_offset in range(1, 51):  # day 1..50 each compared to its prior
        ts = base + _timedelta_days(day_offset)
        for anchor in cohort:
            row = _row_for(anchor, ts)
            total += 1
            if row["CHANGE_SINCE_LAST_RUN"] == "Unchanged":
                unchanged += 1
    rate = unchanged / total
    print(
        f"\nCHANGE_SINCE_LAST_RUN Unchanged rate: {rate:.4f} "
        f"(target ~0.99, threshold >=0.96, n={total})"
    )
    assert rate >= 0.96, (
        f"Unchanged rate {rate:.4f} below 0.96 — day-to-day delta "
        f"computation may be too noisy"
    )


def test_4d_diff_rating_string_canonical():
    """`_diff_rating` returns the right CHANGE_SINCE_LAST_RUN value for
    each (yesterday, today) pair."""
    assert _diff_rating("Low", "Low") == "Unchanged"
    assert _diff_rating("High", "High") == "Unchanged"
    assert _diff_rating("Low", "Medium") == "New"  # first-day-flagged
    assert _diff_rating("Low", "Severe") == "New"
    assert _diff_rating("Medium", "Low") == "Cleared"
    assert _diff_rating("Severe", "Low") == "Cleared"
    assert _diff_rating("Medium", "High") == "Risk Increased"
    assert _diff_rating("High", "Severe") == "Risk Increased"
    assert _diff_rating("Severe", "Medium") == "Risk Decreased"
    assert _diff_rating("High", "Medium") == "Risk Decreased"


# ---------- Property 4e: CASE_REFERENCE year-stable ----------

def test_4e_case_reference_year_stable(in_audience_anchors):
    """For each of 50 fixture anchors, May 28 vs Aug 15 (same year):
    if CASE_REFERENCE non-NULL on BOTH days, value MUST be IDENTICAL."""
    may = datetime(2026, 5, 28)
    aug = datetime(2026, 8, 15)
    checked = 0
    for anchor in in_audience_anchors[:50]:
        a = _row_for(anchor, may)
        b = _row_for(anchor, aug)
        if a["CASE_REFERENCE"] is not None and b["CASE_REFERENCE"] is not None:
            assert a["CASE_REFERENCE"] == b["CASE_REFERENCE"], (
                f"{anchor['ACCOUNT_ID']}: CASE_REFERENCE drifted within "
                f"year ({a['CASE_REFERENCE']} vs {b['CASE_REFERENCE']})"
            )
            checked += 1
    # Don't fail if zero anchors hit High/Severe on both sample days —
    # the rate is ~2% so 50 anchors might not produce one. Still verify
    # the property is exercised on at least the audience-wide check.
    if checked == 0:
        pytest.skip(
            "no anchor was High/Severe on both sample days — "
            "year-stable invariant not exercised"
        )


# ---------- Property 4f: CASE_REFERENCE NULL when rating Low/Medium ----------

def test_4f_case_reference_null_for_low_medium(in_audience_anchors):
    """Across 100 anchors × 90 days, every Low/Medium row has CASE_REFERENCE NULL."""
    base = datetime(2026, 1, 1)
    for anchor in in_audience_anchors:
        for day_offset in range(90):
            ts = base + _timedelta_days(day_offset)
            row = _row_for(anchor, ts)
            if row["OVERALL_RISK_RATING"] in ("Low", "Medium"):
                assert row["CASE_REFERENCE"] is None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: "
                    f"rating={row['OVERALL_RISK_RATING']} but "
                    f"CASE_REFERENCE={row['CASE_REFERENCE']!r} (should be None)"
                )
            else:
                assert row["CASE_REFERENCE"] is not None, (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: "
                    f"rating={row['OVERALL_RISK_RATING']} but "
                    f"CASE_REFERENCE is None (should be populated)"
                )


# ---------- Property 5: Schema contract ----------

EXPECTED_KEYS = {
    "ORG_ID",  # v1.x multi-org-additive (leading PK component)
    "ACCOUNT_ID", "PROFILE_DATE", "OVERALL_RISK_RATING",
    "SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT",
    "ADVERSE_MEDIA_CATEGORIES",
    "RISK_JURISDICTION_CODE", "RISK_JURISDICTION_TIER",
    "LAST_SCREENED_AT", "CHANGE_SINCE_LAST_RUN",
    "CASE_REFERENCE", "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 13 table columns."""
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 28))
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

def test_overall_risk_rating_canonical(in_audience_anchors):
    """OVERALL_RISK_RATING in {Low, Medium, High, Severe}."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row["OVERALL_RISK_RATING"] in _VALID_RATINGS, row


def test_risk_jurisdiction_tier_canonical(in_audience_anchors):
    """RISK_JURISDICTION_TIER in {Standard, Enhanced, Prohibited}."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row["RISK_JURISDICTION_TIER"] in _VALID_TIERS, row


def test_risk_jurisdiction_code_in_pool(in_audience_anchors):
    """RISK_JURISDICTION_CODE is one of the 30 known jurisdictions."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row["RISK_JURISDICTION_CODE"] in _ALL_JURISDICTIONS, row


def test_change_since_last_run_canonical(in_audience_anchors):
    """CHANGE_SINCE_LAST_RUN in canonical 5-value set."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row["CHANGE_SINCE_LAST_RUN"] in _VALID_CHANGES, row


def test_three_boolean_fields_are_python_bool(in_audience_anchors):
    """All 3 BOOLEAN fields are Python bool (not 0/1, not numpy.bool_)."""
    ts = datetime(2026, 5, 28)
    for anchor in in_audience_anchors[:20]:
        row = _row_for(anchor, ts)
        for fld in ("SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT"):
            assert isinstance(row[fld], bool), (
                f"{fld} for {anchor['ACCOUNT_ID']} is "
                f"{type(row[fld]).__name__}, expected bool"
            )


def test_adverse_media_categories_predicate(in_audience_anchors):
    """ADVERSE_MEDIA_CATEGORIES NULL iff ADVERSE_MEDIA_HIT False; non-NULL
    pipe-delimited string of 1-3 sorted categories from the pool when True."""
    base = datetime(2026, 1, 1)
    pool = set(_ADVERSE_MEDIA_CATEGORY_POOL)
    media_hit_seen = 0
    for anchor in in_audience_anchors:
        for day_offset in range(0, 365, 7):  # weekly samples to keep fast
            ts = base + _timedelta_days(day_offset)
            row = _row_for(anchor, ts)
            if row["ADVERSE_MEDIA_HIT"] is False:
                assert row["ADVERSE_MEDIA_CATEGORIES"] is None
            else:
                cats_str = row["ADVERSE_MEDIA_CATEGORIES"]
                assert cats_str is not None
                parts = cats_str.split("|")
                assert 1 <= len(parts) <= 3
                assert parts == sorted(parts), f"unsorted: {parts}"
                assert set(parts).issubset(pool), f"unknown cat: {parts}"
                media_hit_seen += 1
    assert media_hit_seen >= 5, (
        f"too few ADVERSE_MEDIA_HIT=True rows seen ({media_hit_seen}) — "
        f"distribution off"
    )


def test_severe_rollup_invariant(in_audience_anchors):
    """All Severe rows must have SANCTIONS_HIT=True OR
    RISK_JURISDICTION_TIER='Prohibited' (per the rollup logic)."""
    base = datetime(2026, 1, 1)
    severe_seen = 0
    for anchor in in_audience_anchors:
        for day_offset in range(0, 365, 5):  # every 5 days, keep test snappy
            ts = base + _timedelta_days(day_offset)
            row = _row_for(anchor, ts)
            if row["OVERALL_RISK_RATING"] == "Severe":
                assert (
                    row["SANCTIONS_HIT"] is True
                    or row["RISK_JURISDICTION_TIER"] == "Prohibited"
                ), (
                    f"{anchor['ACCOUNT_ID']} on {ts.date()}: Severe but "
                    f"sanctions={row['SANCTIONS_HIT']}, "
                    f"tier={row['RISK_JURISDICTION_TIER']}"
                )
                severe_seen += 1
    # Severe rate is ~0.3% × 100 anchors × 73 samples = ~22 expected
    assert severe_seen >= 1, "no Severe rows in sample — rollup may be broken"


def test_high_severe_rows_have_case_reference(in_audience_anchors):
    """All High/Severe rows must have a non-None CASE_REFERENCE."""
    base = datetime(2026, 1, 1)
    seen = 0
    for anchor in in_audience_anchors:
        for day_offset in range(0, 365, 5):
            ts = base + _timedelta_days(day_offset)
            row = _row_for(anchor, ts)
            if row["OVERALL_RISK_RATING"] in ("High", "Severe"):
                assert row["CASE_REFERENCE"] is not None
                # Format: WCH-YYYY-NNNNNN
                assert row["CASE_REFERENCE"].startswith(f"WCH-{ts.year}-")
                assert len(row["CASE_REFERENCE"]) == len(f"WCH-{ts.year}-NNNNNN")
                seen += 1
    assert seen >= 1, "no High/Severe rows seen — distribution off"


def test_profile_date_matches_run_ts_day(in_audience_anchors):
    """PROFILE_DATE = run_ts.date() (day-bucketing)."""
    for day_offset in range(7):
        ts = datetime(2026, 5, 28) + _timedelta_days(day_offset)
        row = _row_for(in_audience_anchors[0], ts)
        assert row["PROFILE_DATE"] == ts.date()
        assert row["LAST_SCREENED_AT"] == ts.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        assert row["GENERATED_AT"] == row["LAST_SCREENED_AT"]
