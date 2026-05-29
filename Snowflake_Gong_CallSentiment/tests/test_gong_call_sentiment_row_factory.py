"""L1 tests for the Gong Call Sentiment row factory.

Plan 12 = second weekly-cadence Cumulus dataset. Audience is
``CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')`` —
~4,880 anchors live, ~19+ in SAMPLE_ANCHORS (audience-narrow but adequate
for per-anchor invariants).

First Cumulus dataset whose NULL semantics cascade-collapse from a single
zero-activity Boolean predicate (``CALL_COUNT_LAST_7D == 0``) — when an
anchor has no calls that week, six fields collapse together to no-call
defaults but the row STILL emits. The cascade-gate test rolled over 12
weeks is the load-bearing demo behavior; on a Wealth no-call rate ~65%,
nearly every anchor surfaces at least one no-call week in 12 weeks.

Five property classes per rowspec / per-plan §4 task 3:
  1. Same-week determinism (Mon vs Wed vs Sun within the same calendar
     week collapse to ``week_start = run_ts - timedelta(days=run_ts.weekday())``)
  2. Audience scoping (Retail / Household / Small Business raise;
     ``_anchor_in_audience`` predicate)
  3. Boring case (the cascade gate) — every Wealth+Commercial anchor over
     a 12-week roll: every row with ``CALL_COUNT_LAST_7D == 0`` collapses
     all six cascade fields to no-call defaults
  4. Per-anchor / per-row invariants (load-bearing for Plan 12):
     a. Range invariants (per-row, rolled over 4 weeks): percentages in
        [0, 100]; CALL_COUNT_LAST_7D in [0, 15]; ACTION_ITEMS_COUNT in
        [0, 10]; TOTAL_TALK_TIME_MINUTES in [0, 600]; LAST_CALL_DATE if
        populated <= run_ts.date(); NEXT_SCHEDULED_CALL_DATE if populated
        > run_ts.date()
     b. Vocabulary invariants (per-row, rolled over 4 weeks):
        OVERALL_SENTIMENT in 5-value vocab; SENTIMENT_TREND in 3-value
        vocab; KEY_TOPICS_FLAGS (when not NULL/empty) is a pipe-delimited
        subset of {Pricing, Renewal, Competitor, FeatureRequest}
  5. Year-stable RM_NAME — same anchor produces identical RM_NAME for
     two weeks within the same calendar year. Cross-year drift expected,
     not asserted.
  6. Schema contract — output dict matches the 15 table columns AND
     ``EXPECTED_OUTPUT_COLUMNS`` from the SP module.

Plus bonus tests:
  - OVERALL_SENTIMENT canonical 5-value set (3-week roll)
  - SENTIMENT_TREND canonical 3-value set (3-week roll)
  - PROFILE_WEEK is a Monday for every emitted row
  - GENERATED_AT == week_start datetime (00:00:00 of the run-week's Monday)
"""
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
from sp_generate_gong_call_sentiment import (  # noqa: E402
    _row_for,
    _anchor_in_audience,
    EXPECTED_OUTPUT_COLUMNS,
)


_SENTIMENT_VOCAB = {
    "Very Positive",
    "Positive",
    "Neutral",
    "Negative",
    "Very Negative",
}
_TREND_VOCAB = {"Improving", "Stable", "Declining"}
_TOPIC_POOL = {"Pricing", "Renewal", "Competitor", "FeatureRequest"}


def _monday_of(d: date) -> date:
    """Return the Monday-of-week DATE for any date (matches the SP's
    ``week_start = run_ts - timedelta(days=run_ts.weekday())`` rule)."""
    return d - timedelta(days=d.weekday())


def _week_n_of_year_monday(year: int, week_n: int) -> datetime:
    """Return a datetime anchored on the Monday of week N of ``year``,
    using a simple ISO-week-ish definition (week 1 starts on the first
    Monday on/after Jan 1). Good enough for "two distinct weeks within
    the same calendar year" — we only need the rows to land in different
    week-buckets, not exact ISO-week semantics.
    """
    jan1 = date(year, 1, 1)
    first_monday = jan1 + timedelta(days=(7 - jan1.weekday()) % 7)
    target = first_monday + timedelta(weeks=week_n - 1)
    return datetime(target.year, target.month, target.day)


# ---------- Property 1: Same-week determinism ----------

def test_determinism_same_inputs_same_dict(in_audience_anchors):
    """Two back-to-back calls with the same inputs produce the same dict."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    ts = datetime(2026, 5, 4)  # Monday
    for anchor in in_audience_anchors[:5]:
        a = _row_for(anchor, ts)
        b = _row_for(anchor, ts)
        assert a == b, (
            f"non-deterministic same-inputs for {anchor['ACCOUNT_ID']}"
        )


def test_determinism_buckets_by_week(in_audience_anchors):
    """All `run_ts` values within the same calendar week (Mon-Sun) produce
    IDENTICAL rows (the SP collapses to ``week_start``). A different week
    flips the dict for at least one anchor (proves the week component is
    in the seed)."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    # 2026-05-04 is a Monday. The week runs Mon May 4 -> Sun May 10.
    mon = datetime(2026, 5, 4, 6, 0, 0)
    wed = datetime(2026, 5, 6, 23, 30, 0)
    sun = datetime(2026, 5, 10, 12, 0, 0)
    next_mon = datetime(2026, 5, 11, 0, 0, 0)
    flipped = 0
    for anchor in in_audience_anchors[:10]:
        a = _row_for(anchor, mon)
        b = _row_for(anchor, wed)
        c = _row_for(anchor, sun)
        assert a == b, (
            f"{anchor['ACCOUNT_ID']}: Mon vs Wed differ within week "
            f"of {_monday_of(mon.date())}"
        )
        assert a == c, (
            f"{anchor['ACCOUNT_ID']}: Mon vs Sun differ within week "
            f"of {_monday_of(mon.date())}"
        )
        d = _row_for(anchor, next_mon)
        if d != a:
            flipped += 1
    assert flipped >= 1, (
        "no anchor changed across week boundaries (May 4 -> May 11); "
        "week-bucketed seed may be missing the week component"
    )


# ---------- Property 2: Audience scoping ----------

def test_audience_violators_raise(out_of_audience_anchors):
    """Plan 12 audience is ``CLIENT_CATEGORY IN ('Wealth Management',
    'Commercial Banking')``. Out-of-audience anchors (Retail, Household,
    Small Business) must raise — accept any of the canonical guards."""
    if not out_of_audience_anchors:
        pytest.skip("no out-of-audience anchors in fixture")
    ts = datetime(2026, 5, 4)
    for bad in out_of_audience_anchors[:5]:
        with pytest.raises((ValueError, AssertionError, KeyError)):
            _row_for(bad, ts)


def test_anchor_in_audience_predicate(in_audience_anchors, out_of_audience_anchors):
    """``_anchor_in_audience`` returns True for Wealth+Commercial,
    False for the rest."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good["ACCOUNT_ID"]
    for bad in out_of_audience_anchors:
        assert _anchor_in_audience(bad) is False, bad["ACCOUNT_ID"]


def test_every_in_audience_anchor_emits_a_row(in_audience_anchors):
    """Every Wealth+Commercial fixture anchor produces a non-None dict
    whose ACCOUNT_ID matches the anchor (boring-case coverage — every
    anchor emits even on no-call weeks)."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    ts = datetime(2026, 5, 4)
    for anchor in in_audience_anchors:
        row = _row_for(anchor, ts)
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_empty_account_id_raises():
    """Defense-in-depth: an in-audience anchor with empty ACCOUNT_ID
    must raise."""
    with pytest.raises((ValueError, AssertionError, KeyError)):
        _row_for(
            {
                "ACCOUNT_ID": "",
                "CLIENT_CATEGORY": "Wealth Management",
            },
            datetime(2026, 5, 4),
        )


# ---------- Property 3: Boring case (the cascade gate) ----------

def test_cascade_gate_invariants_rolled_over_weeks(in_audience_anchors):
    """The load-bearing demo behavior: for every (anchor, week) row across
    a 12-week roll where ``CALL_COUNT_LAST_7D == 0``, ALL SIX cascade
    fields collapse to their no-call defaults:

      * TOTAL_TALK_TIME_MINUTES == 0
      * CUSTOMER_TALK_RATIO_PCT == 0 (or 0.0)
      * OVERALL_SENTIMENT == 'Neutral'
      * LAST_CALL_DATE is None
      * KEY_TOPICS_FLAGS is None
      * ACTION_ITEMS_COUNT == 0

    Why 12 weeks: cohort is too small (~19+ anchors) for a single-week
    distributional sample, but Wealth no-call rate ~65% means a 12-week
    roll over the cohort surfaces ~150+ no-call rows on average. Skip
    cleanly if no zero-call week is found across the roll (very low
    probability but not impossible).
    """
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    base_monday = date(2026, 1, 5)  # first Monday of 2026
    no_call_rows_seen = 0
    for week_offset in range(12):
        ts_date = base_monday + timedelta(weeks=week_offset)
        ts = datetime(ts_date.year, ts_date.month, ts_date.day)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            if row["CALL_COUNT_LAST_7D"] != 0:
                continue
            no_call_rows_seen += 1
            # Cascade-gate: all six fields collapse together.
            assert row["TOTAL_TALK_TIME_MINUTES"] == 0, (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: CALL_COUNT_LAST_7D=0 "
                f"but TOTAL_TALK_TIME_MINUTES={row['TOTAL_TALK_TIME_MINUTES']}"
            )
            # Accept either int 0 or float 0.0 for the percentage.
            assert row["CUSTOMER_TALK_RATIO_PCT"] == 0, (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: CALL_COUNT_LAST_7D=0 "
                f"but CUSTOMER_TALK_RATIO_PCT={row['CUSTOMER_TALK_RATIO_PCT']}"
            )
            assert row["OVERALL_SENTIMENT"] == "Neutral", (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: CALL_COUNT_LAST_7D=0 "
                f"but OVERALL_SENTIMENT={row['OVERALL_SENTIMENT']!r}"
            )
            assert row["LAST_CALL_DATE"] is None, (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: CALL_COUNT_LAST_7D=0 "
                f"but LAST_CALL_DATE={row['LAST_CALL_DATE']!r}"
            )
            assert row["KEY_TOPICS_FLAGS"] is None, (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: CALL_COUNT_LAST_7D=0 "
                f"but KEY_TOPICS_FLAGS={row['KEY_TOPICS_FLAGS']!r}"
            )
            assert row["ACTION_ITEMS_COUNT"] == 0, (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: CALL_COUNT_LAST_7D=0 "
                f"but ACTION_ITEMS_COUNT={row['ACTION_ITEMS_COUNT']}"
            )
    if no_call_rows_seen == 0:
        pytest.skip(
            "no CALL_COUNT_LAST_7D==0 row surfaced across the 12-week roll; "
            "cascade-gate invariant could not be exercised (very low "
            "probability — Wealth no-call rate is ~65%)"
        )


# ---------- Property 4a: Range invariants per row ----------

def test_4a_range_invariants_per_row(in_audience_anchors):
    """For every (anchor, week) row across 4 weeks: declared numeric and
    date bands hold."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    base_monday = date(2026, 5, 4)
    for week_offset in range(4):
        ts_date = base_monday + timedelta(weeks=week_offset)
        ts = datetime(ts_date.year, ts_date.month, ts_date.day)
        run_date = ts.date()
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            # Numeric ranges.
            assert 0 <= row["CUSTOMER_TALK_RATIO_PCT"] <= 100, row
            assert 0 <= row["DEAL_RISK_SCORE"] <= 100, row
            assert 0 <= row["CALL_COUNT_LAST_7D"] <= 15, row
            assert 0 <= row["TOTAL_TALK_TIME_MINUTES"] <= 600, row
            assert 0 <= row["ACTION_ITEMS_COUNT"] <= 10, row
            # Date coherence.
            if row["LAST_CALL_DATE"] is not None:
                assert row["LAST_CALL_DATE"] <= run_date, (
                    f"{anchor['ACCOUNT_ID']} on {run_date}: future-dated "
                    f"LAST_CALL_DATE={row['LAST_CALL_DATE']}"
                )
            if row["NEXT_SCHEDULED_CALL_DATE"] is not None:
                assert row["NEXT_SCHEDULED_CALL_DATE"] > run_date, (
                    f"{anchor['ACCOUNT_ID']} on {run_date}: "
                    f"NEXT_SCHEDULED_CALL_DATE="
                    f"{row['NEXT_SCHEDULED_CALL_DATE']} not strictly future"
                )


# ---------- Property 4b: Vocabulary invariants per row ----------

def test_4b_vocabulary_invariants_per_row(in_audience_anchors):
    """For every (anchor, week) row across 4 weeks:
      * OVERALL_SENTIMENT in _SENTIMENT_VOCAB
      * SENTIMENT_TREND in _TREND_VOCAB
      * KEY_TOPICS_FLAGS, when not NULL/empty, is a pipe-delimited subset
        of _TOPIC_POOL
    """
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    base_monday = date(2026, 5, 4)
    for week_offset in range(4):
        ts_date = base_monday + timedelta(weeks=week_offset)
        ts = datetime(ts_date.year, ts_date.month, ts_date.day)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["OVERALL_SENTIMENT"] in _SENTIMENT_VOCAB, row
            assert row["SENTIMENT_TREND"] in _TREND_VOCAB, row
            topics = row["KEY_TOPICS_FLAGS"]
            if topics is None or topics == "":
                continue
            parts = topics.split("|")
            assert all(p in _TOPIC_POOL for p in parts), (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: KEY_TOPICS_FLAGS="
                f"{topics!r} contains non-vocab tokens (pool={_TOPIC_POOL})"
            )
            # Sanity: no duplicates within a single row.
            assert len(parts) == len(set(parts)), (
                f"{anchor['ACCOUNT_ID']} on {ts_date}: KEY_TOPICS_FLAGS="
                f"{topics!r} has duplicate topics"
            )


# ---------- Property 5: Year-stable RM_NAME ----------

def test_5_year_stable_rm_name_intra_year(in_audience_anchors):
    """For each in-audience anchor, RM_NAME is identical for two distinct
    weeks within the same calendar year (week 5 of 2026 vs week 30 of
    2026). Cross-year drift (week 1 of 2026 vs week 1 of 2027) is
    *expected* and NOT asserted — RMs may rotate annually.

    Salt: 'gong_rm', bucketed at datetime(run_ts.year, 1, 1) per rowspec.
    Pattern lifted from Plan 7's year-stable jurisdiction.
    """
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    week5 = _week_n_of_year_monday(2026, 5)
    week30 = _week_n_of_year_monday(2026, 30)
    for anchor in in_audience_anchors:
        a = _row_for(anchor, week5)
        b = _row_for(anchor, week30)
        assert a["RM_NAME"] == b["RM_NAME"], (
            f"{anchor['ACCOUNT_ID']}: RM_NAME drifted intra-year — "
            f"{a['RM_NAME']!r} (week 5) vs {b['RM_NAME']!r} (week 30)"
        )


# ---------- Property 6: Schema contract ----------

EXPECTED_KEYS = {
    "ACCOUNT_ID",
    "PROFILE_WEEK",
    "CALL_COUNT_LAST_7D",
    "TOTAL_TALK_TIME_MINUTES",
    "CUSTOMER_TALK_RATIO_PCT",
    "OVERALL_SENTIMENT",
    "SENTIMENT_TREND",
    "KEY_TOPICS_FLAGS",
    "ACTION_ITEMS_COUNT",
    "DEAL_RISK_SCORE",
    "LAST_CALL_DATE",
    "NEXT_SCHEDULED_CALL_DATE",
    "RM_NAME",
    "RM_LAST_LOGGED_NOTE_DATE",
    "GENERATED_AT",
}


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 15 table columns."""
    if not in_audience_anchors:
        pytest.skip("no audience anchors in fixture")
    row = _row_for(in_audience_anchors[0], datetime(2026, 5, 4))
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

def test_overall_sentiment_canonical_5_values(in_audience_anchors):
    """OVERALL_SENTIMENT in {Very Positive, Positive, Neutral, Negative,
    Very Negative} over a 3-week roll."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    base_monday = date(2026, 5, 4)
    for week_offset in range(3):
        ts_date = base_monday + timedelta(weeks=week_offset)
        ts = datetime(ts_date.year, ts_date.month, ts_date.day)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["OVERALL_SENTIMENT"] in _SENTIMENT_VOCAB, row


def test_sentiment_trend_canonical_3_values(in_audience_anchors):
    """SENTIMENT_TREND in {Improving, Stable, Declining} over a 3-week
    roll."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    base_monday = date(2026, 5, 4)
    for week_offset in range(3):
        ts_date = base_monday + timedelta(weeks=week_offset)
        ts = datetime(ts_date.year, ts_date.month, ts_date.day)
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            assert row["SENTIMENT_TREND"] in _TREND_VOCAB, row


def test_profile_week_is_monday(in_audience_anchors):
    """PROFILE_WEEK.weekday() == 0 (Monday) for every emitted row across
    a 3-week roll, regardless of the day-of-week the run_ts lands on."""
    if not in_audience_anchors:
        pytest.skip("no audience anchors in fixture")
    # Use varied weekdays for run_ts to prove the SP's truncation works.
    sample_run_timestamps = [
        datetime(2026, 5, 4, 5, 0, 0),    # Monday 05:00 UTC (real cron)
        datetime(2026, 5, 6, 23, 30, 0),  # Wednesday late
        datetime(2026, 5, 10, 12, 0, 0),  # Sunday noon
    ]
    for ts in sample_run_timestamps:
        for anchor in in_audience_anchors:
            row = _row_for(anchor, ts)
            pw = row["PROFILE_WEEK"]
            assert pw.weekday() == 0, (
                f"{anchor['ACCOUNT_ID']} on {ts}: PROFILE_WEEK={pw} "
                f"is weekday {pw.weekday()}, expected Monday (0)"
            )


def test_generated_at_is_week_start_datetime(in_audience_anchors):
    """GENERATED_AT == week_start (00:00:00 of the run-week's Monday).
    Exercises the truncation across mid-week and end-of-week timestamps.
    """
    if not in_audience_anchors:
        pytest.skip("no audience anchors in fixture")
    for ts in (
        datetime(2026, 5, 4, 5, 0, 0),
        datetime(2026, 5, 6, 12, 30, 45),
        datetime(2026, 5, 10, 23, 59, 59),
    ):
        anchor = in_audience_anchors[0]
        row = _row_for(anchor, ts)
        # week_start = the Monday of run_ts's week, at 00:00:00.
        run_date = ts.date()
        monday = run_date - timedelta(days=run_date.weekday())
        expected_week_start = datetime(monday.year, monday.month, monday.day)
        assert row["GENERATED_AT"] == expected_week_start, (
            f"GENERATED_AT={row['GENERATED_AT']} != "
            f"expected week_start={expected_week_start} for run_ts={ts}"
        )
        assert row["PROFILE_WEEK"] == expected_week_start.date(), (
            f"PROFILE_WEEK={row['PROFILE_WEEK']} != "
            f"expected={expected_week_start.date()} for run_ts={ts}"
        )
