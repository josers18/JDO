"""L1 tests for the Gong Call Sentiment row factory.

Plan 12 (rebroadcast scope): all-accounts audience (~36,813 anchors)
generating ~884K rows over a 24-week history. The original Wealth+Commercial
design produced 4,880 rows = 87% empty profiles; rebroadcast widens the
audience to the full anchor set with a tiered per-CLIENT_CATEGORY call rate.

Per-CLIENT_CATEGORY call-rate tier (sibling SP T4 contract):
  - Commercial Banking : 0-5 calls/wk (mode 0-1, ~50% zero-call)
  - Wealth Management  : 0-3 calls/wk (mode 0,    ~65% zero-call)
  - Small Business     : 0-2 calls/wk (mode 0,    ~75% zero-call)
  - Retail / Household : 0-1 calls/wk (mode 0,    ~90% zero-call)
  - Default (unknown)  : 0   calls/wk (~100% zero-call)
With the Retail/Household majority, the global zero-call rate climbs to
~80%, so the cascade-NULL boring case is the dominant row shape — every L1
test below operates with that distribution.

Cascade-NULL boring case (LOAD-BEARING — six fields collapse on
``CALL_COUNT_LAST_7D == 0``):
  TOTAL_TALK_TIME_MINUTES = 0
  CUSTOMER_TALK_RATIO_PCT = 0 (or 0.0)
  OVERALL_SENTIMENT       = 'Neutral'
  LAST_CALL_DATE          = None
  KEY_TOPICS_FLAGS        = None
  ACTION_ITEMS_COUNT      = 0
The row STILL emits — coverage is 1:1 audience-vs-actual.

Six property classes per task spec:
  1. Same-week determinism (Mon vs Wed vs Sun within the same calendar
     week collapse to ``week_start = run_ts - timedelta(days=run_ts.weekday())``)
  2. Audience scoping — degenerate (all-accounts):
     - ``test_audience_violators_dont_exist`` -> pytest.skip
     - ``test_every_anchor_emits_a_row`` -> len 1 per anchor
     - ``test_empty_account_id_raises``
  3. Boring case — every fixture anchor produces a 15-key dict including
     the cascade-NULL fields.
  4. Cascade-NULL invariants over a 24-week roll (LOAD-BEARING):
     a. zero-call cascade (six fields collapse)
     b. CALL_COUNT_LAST_7D in [0, 15]
     c. CUSTOMER_TALK_RATIO_PCT and DEAL_RISK_SCORE in [0, 100]
     d. ACTION_ITEMS_COUNT in [0, 10]
     e. LAST_CALL_DATE <= week_start when populated; NEXT_SCHEDULED_CALL_DATE
        > week_start when populated
     f. OVERALL_SENTIMENT in 5-value vocab
     g. SENTIMENT_TREND in 3-value vocab
     h. Per-CLIENT_CATEGORY call-rate calibration — Commercial mean call
        count > Retail mean across the 24-week roll.
  5. 24-week history determinism — 5 anchors x 24 weeks = 120 rows, distinct
     PROFILE_WEEK values, re-run byte-identical.
  6. Schema contract — output matches the 15 table columns AND the SP
     module's ``EXPECTED_OUTPUT_COLUMNS``.

Plus bonus tests:
  - Year-stable RM_NAME (same anchor, two weeks within same year)
  - PROFILE_WEEK is a Monday for every emitted row
"""
import statistics
from datetime import date, datetime, timedelta

import pytest

# Imports from the SP module (Task 4 in the same diff as this file).
# Sibling SP exports `_rows_for` (list-of-1), `_anchor_in_audience`
# (True iff ACCOUNT_ID non-empty), and `EXPECTED_OUTPUT_COLUMNS` (15 names).
from sp_generate_gong_call_sentiment import (  # noqa: E402
    _rows_for,
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


def _profile_week(run_ts: datetime) -> date:
    """Mirror the SP's profile_week rule: Monday-of-week DATE for run_ts."""
    return _monday_of(run_ts.date())


def _only(rows: list) -> dict:
    """Assert list-of-1 contract and return the single row."""
    assert isinstance(rows, list), f"_rows_for must return a list, got {type(rows)}"
    assert len(rows) == 1, f"_rows_for must return list-of-1, got len={len(rows)}"
    return rows[0]


# ---------- Property 1: Same-week determinism ----------

def test_determinism_same_inputs_same_dict(in_audience_anchors):
    """Two back-to-back calls with the same (anchor, profile_week) produce
    the same list-of-1."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    pw = date(2026, 5, 4)  # Monday
    for anchor in in_audience_anchors[:5]:
        a = _rows_for(anchor, pw)
        b = _rows_for(anchor, pw)
        assert a == b, (
            f"non-deterministic same-inputs for {anchor['ACCOUNT_ID']}"
        )
        _only(a)  # also asserts list-of-1 shape


def test_determinism_buckets_by_profile_week(in_audience_anchors):
    """Calls with the same Monday-of-week ``profile_week`` produce IDENTICAL
    list-of-1 rows; a different week flips the dict for at least one anchor."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture; "
            f"need >=3 for cohort-specific assertions"
        )
    week_a = date(2026, 5, 4)   # Monday
    week_b = date(2026, 5, 11)  # next Monday
    flipped = 0
    for anchor in in_audience_anchors[:10]:
        a = _rows_for(anchor, week_a)
        b = _rows_for(anchor, week_a)
        c = _rows_for(anchor, week_b)
        assert a == b, (
            f"{anchor['ACCOUNT_ID']}: same-week re-runs differ for {week_a}"
        )
        if a != c:
            flipped += 1
    assert flipped >= 1, (
        "no anchor changed across week boundaries (May 4 -> May 11); "
        "week-bucketed seed may be missing the week component"
    )


# ---------- Property 2: Audience scoping (degenerate / all-accounts) ----------

def test_audience_violators_dont_exist(out_of_audience_anchors):
    """All-accounts audience — by construction the out-of-audience pool is
    empty. Skip cleanly so the suite documents the degenerate audience."""
    if not out_of_audience_anchors:
        pytest.skip(
            "all-accounts audience: out_of_audience_anchors is empty by design"
        )
    # If the fixture ever changes to surface non-empty out-of-audience
    # anchors, the contract still holds: _anchor_in_audience must be False.
    for bad in out_of_audience_anchors:
        assert _anchor_in_audience(bad) is False, bad.get("ACCOUNT_ID")


def test_every_anchor_emits_a_row(in_audience_anchors):
    """Every fixture anchor produces exactly one row whose ACCOUNT_ID
    matches the anchor (1:1 coverage even on no-call weeks)."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    pw = date(2026, 5, 4)
    for anchor in in_audience_anchors:
        rows = _rows_for(anchor, pw)
        row = _only(rows)
        assert row is not None
        assert row["ACCOUNT_ID"] == anchor["ACCOUNT_ID"]


def test_anchor_in_audience_predicate(in_audience_anchors):
    """``_anchor_in_audience`` returns True iff ACCOUNT_ID is non-empty.
    No CLIENT_CATEGORY filter."""
    for good in in_audience_anchors:
        assert _anchor_in_audience(good) is True, good.get("ACCOUNT_ID")
    # Defense: rejects empty / missing ACCOUNT_ID regardless of CLIENT_CATEGORY.
    for bad in (
        {"ACCOUNT_ID": ""},
        {"ACCOUNT_ID": None},
        {},
        {"ACCOUNT_ID": "", "CLIENT_CATEGORY": "Wealth Management"},
    ):
        assert _anchor_in_audience(bad) is False, bad


def test_empty_account_id_raises():
    """Defense-in-depth: an anchor with empty ACCOUNT_ID must raise rather
    than silently emit a blank-anchor row."""
    with pytest.raises((ValueError, AssertionError, KeyError)):
        _rows_for(
            {
                "ACCOUNT_ID": "",
                "CLIENT_CATEGORY": "Wealth Management",
            },
            date(2026, 5, 4),
        )


# ---------- Property 3: Boring case — every anchor emits a 15-key dict ----------

def test_boring_case_every_anchor_15_keys(in_audience_anchors):
    """Every fixture anchor produces a 15-key dict that includes the
    cascade-NULL fields. Anchors with no calls still emit; the cascade
    fields are present (None / 0 / 'Neutral'), not missing keys."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    pw = date(2026, 5, 4)
    for anchor in in_audience_anchors:
        row = _only(_rows_for(anchor, pw))
        assert set(row.keys()) == set(EXPECTED_OUTPUT_COLUMNS), (
            f"{anchor['ACCOUNT_ID']}: row keys {sorted(row.keys())} != "
            f"expected {sorted(EXPECTED_OUTPUT_COLUMNS)}"
        )
        # Cascade-NULL keys must be present (value may be None / 0 / 'Neutral').
        for k in (
            "TOTAL_TALK_TIME_MINUTES",
            "CUSTOMER_TALK_RATIO_PCT",
            "OVERALL_SENTIMENT",
            "LAST_CALL_DATE",
            "KEY_TOPICS_FLAGS",
            "ACTION_ITEMS_COUNT",
            "CALL_COUNT_LAST_7D",
        ):
            assert k in row, f"{anchor['ACCOUNT_ID']}: missing cascade key {k}"


# ---------- Property 4: Cascade-NULL invariants over 24-week roll ----------
#
# Across 100 fixture anchors x 24 weeks = 2,400 rows. Under the all-accounts
# audience the per-category call-rate tier yields ~80% zero-call rows
# globally — plenty of cascade-gate exercise.

_BASE_MONDAY_24W = date(2026, 1, 5)  # first Monday of 2026


def _iter_24w_rows(anchors):
    """Yield (anchor, profile_week, row) over a 24-week roll for `anchors`."""
    for week_offset in range(24):
        pw = _BASE_MONDAY_24W + timedelta(weeks=week_offset)
        for anchor in anchors:
            row = _only(_rows_for(anchor, pw))
            yield anchor, pw, row


def test_4a_zero_call_cascade(in_audience_anchors):
    """For every (anchor, week) where CALL_COUNT_LAST_7D == 0, the six
    cascade fields collapse to no-call defaults. LOAD-BEARING."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    no_call_rows = 0
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        if row["CALL_COUNT_LAST_7D"] != 0:
            continue
        no_call_rows += 1
        assert row["TOTAL_TALK_TIME_MINUTES"] == 0, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D=0 "
            f"but TOTAL_TALK_TIME_MINUTES={row['TOTAL_TALK_TIME_MINUTES']}"
        )
        # Accept either int 0 or float 0.0 for the percentage.
        assert row["CUSTOMER_TALK_RATIO_PCT"] == 0, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D=0 "
            f"but CUSTOMER_TALK_RATIO_PCT={row['CUSTOMER_TALK_RATIO_PCT']}"
        )
        assert row["OVERALL_SENTIMENT"] == "Neutral", (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D=0 "
            f"but OVERALL_SENTIMENT={row['OVERALL_SENTIMENT']!r}"
        )
        assert row["LAST_CALL_DATE"] is None, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D=0 "
            f"but LAST_CALL_DATE={row['LAST_CALL_DATE']!r}"
        )
        assert row["KEY_TOPICS_FLAGS"] is None, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D=0 "
            f"but KEY_TOPICS_FLAGS={row['KEY_TOPICS_FLAGS']!r}"
        )
        assert row["ACTION_ITEMS_COUNT"] == 0, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D=0 "
            f"but ACTION_ITEMS_COUNT={row['ACTION_ITEMS_COUNT']}"
        )
    if no_call_rows == 0:
        pytest.skip(
            "no CALL_COUNT_LAST_7D==0 row surfaced across the 24-week roll; "
            "cascade-gate invariant could not be exercised (very low "
            "probability under the all-accounts audience — Retail/Household "
            "zero-call rate is ~90%)"
        )


def test_4b_call_count_in_range(in_audience_anchors):
    """CALL_COUNT_LAST_7D in [0, 15] for every (anchor, week) row."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        cc = row["CALL_COUNT_LAST_7D"]
        assert 0 <= cc <= 15, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CALL_COUNT_LAST_7D={cc} "
            f"out of [0, 15]"
        )


def test_4c_percentages_in_range(in_audience_anchors):
    """CUSTOMER_TALK_RATIO_PCT and DEAL_RISK_SCORE in [0, 100]."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        ratio = row["CUSTOMER_TALK_RATIO_PCT"]
        risk = row["DEAL_RISK_SCORE"]
        assert 0 <= ratio <= 100, (
            f"{anchor['ACCOUNT_ID']} on {pw}: CUSTOMER_TALK_RATIO_PCT="
            f"{ratio} out of [0, 100]"
        )
        assert 0 <= risk <= 100, (
            f"{anchor['ACCOUNT_ID']} on {pw}: DEAL_RISK_SCORE={risk} "
            f"out of [0, 100]"
        )


def test_4d_action_items_in_range(in_audience_anchors):
    """ACTION_ITEMS_COUNT in [0, 10] for every (anchor, week) row."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        ai = row["ACTION_ITEMS_COUNT"]
        assert 0 <= ai <= 10, (
            f"{anchor['ACCOUNT_ID']} on {pw}: ACTION_ITEMS_COUNT={ai} "
            f"out of [0, 10]"
        )


def test_4e_date_coherence(in_audience_anchors):
    """LAST_CALL_DATE <= week_start when populated; NEXT_SCHEDULED_CALL_DATE
    > week_start when populated."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        if row["LAST_CALL_DATE"] is not None:
            assert row["LAST_CALL_DATE"] <= pw, (
                f"{anchor['ACCOUNT_ID']} on {pw}: future-dated "
                f"LAST_CALL_DATE={row['LAST_CALL_DATE']}"
            )
        if row["NEXT_SCHEDULED_CALL_DATE"] is not None:
            assert row["NEXT_SCHEDULED_CALL_DATE"] > pw, (
                f"{anchor['ACCOUNT_ID']} on {pw}: "
                f"NEXT_SCHEDULED_CALL_DATE="
                f"{row['NEXT_SCHEDULED_CALL_DATE']} not strictly future"
            )


def test_4f_overall_sentiment_canonical(in_audience_anchors):
    """OVERALL_SENTIMENT in the canonical 5-value vocab over 24 weeks."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        assert row["OVERALL_SENTIMENT"] in _SENTIMENT_VOCAB, (
            f"{anchor['ACCOUNT_ID']} on {pw}: OVERALL_SENTIMENT="
            f"{row['OVERALL_SENTIMENT']!r} not in {_SENTIMENT_VOCAB}"
        )


def test_4g_sentiment_trend_canonical(in_audience_anchors):
    """SENTIMENT_TREND in the canonical 3-value vocab over 24 weeks."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    for anchor, pw, row in _iter_24w_rows(in_audience_anchors):
        assert row["SENTIMENT_TREND"] in _TREND_VOCAB, (
            f"{anchor['ACCOUNT_ID']} on {pw}: SENTIMENT_TREND="
            f"{row['SENTIMENT_TREND']!r} not in {_TREND_VOCAB}"
        )


def test_4h_per_category_call_rate_calibration(in_audience_anchors):
    """Across the 24-week roll, Commercial Banking anchors average more
    calls/week than Retail anchors. Loose check on
    ``statistics.mean(call_count)`` per cohort — strict ratios are L2/L3."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    commercial_anchors = [
        a for a in in_audience_anchors
        if a.get("CLIENT_CATEGORY") == "Commercial Banking"
    ]
    retail_anchors = [
        a for a in in_audience_anchors
        if a.get("CLIENT_CATEGORY") in ("Retail", "Household")
    ]
    if len(commercial_anchors) < 3 or len(retail_anchors) < 3:
        pytest.skip(
            f"need >=3 Commercial AND >=3 Retail/Household anchors; got "
            f"{len(commercial_anchors)} commercial / {len(retail_anchors)} retail"
        )

    def _mean_calls(anchors):
        counts = []
        for week_offset in range(24):
            pw = _BASE_MONDAY_24W + timedelta(weeks=week_offset)
            for anchor in anchors:
                row = _only(_rows_for(anchor, pw))
                counts.append(row["CALL_COUNT_LAST_7D"])
        return statistics.mean(counts)

    commercial_mean = _mean_calls(commercial_anchors)
    retail_mean = _mean_calls(retail_anchors)
    assert commercial_mean > retail_mean, (
        f"per-category call-rate tier inverted: Commercial mean="
        f"{commercial_mean:.3f} vs Retail/Household mean={retail_mean:.3f}; "
        f"Commercial should be the higher-touch cohort"
    )


# ---------- Property 5: 24-week history determinism ----------

def test_24week_history_per_anchor(in_audience_anchors):
    """5 anchors x 24 weeks = 120 rows. Distinct PROFILE_WEEK values per
    anchor; back-to-back generation is byte-identical."""
    if len(in_audience_anchors) < 5:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture; "
            f"need >=5 for 24-week history sample"
        )
    sample = in_audience_anchors[:5]
    weeks = [_BASE_MONDAY_24W + timedelta(weeks=i) for i in range(24)]

    # Build the 120-row matrix twice; assert byte-identical.
    def _build():
        out = []
        for anchor in sample:
            for pw in weeks:
                row = _only(_rows_for(anchor, pw))
                out.append((anchor["ACCOUNT_ID"], pw, row))
        return out

    pass1 = _build()
    pass2 = _build()
    assert pass1 == pass2, "24-week history is non-deterministic on re-run"

    # Distinct PROFILE_WEEK per anchor.
    by_anchor: dict = {}
    for acct_id, pw, row in pass1:
        by_anchor.setdefault(acct_id, []).append(row["PROFILE_WEEK"])
    for acct_id, pws in by_anchor.items():
        assert len(pws) == 24, f"{acct_id}: expected 24 rows, got {len(pws)}"
        assert len(set(pws)) == 24, (
            f"{acct_id}: PROFILE_WEEK values not distinct across 24 weeks: "
            f"{sorted(pws)}"
        )

    assert len(pass1) == 120, f"expected 120 rows, got {len(pass1)}"


# ---------- Property 6: Schema contract ----------

# v1.x multi-org-additive: ORG_ID is the first key in every emitted row.
EXPECTED_KEYS = frozenset({
    "ORG_ID",
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
})


def test_output_schema_matches_table(in_audience_anchors):
    """Output dict keys EXACTLY match the 15 table columns."""
    if not in_audience_anchors:
        pytest.skip("no audience anchors in fixture")
    row = _only(_rows_for(in_audience_anchors[0], date(2026, 5, 4)))
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

def test_year_stable_rm_name(in_audience_anchors):
    """RM_NAME identical across 24 weeks within the same calendar year for
    each anchor. RMs don't reassign weekly. Cross-year drift is expected
    and not asserted."""
    if len(in_audience_anchors) < 3:
        pytest.skip(
            f"only {len(in_audience_anchors)} audience anchors in fixture"
        )
    weeks = [_BASE_MONDAY_24W + timedelta(weeks=i) for i in range(24)]
    for anchor in in_audience_anchors:
        rm_names = {_only(_rows_for(anchor, pw))["RM_NAME"] for pw in weeks}
        assert len(rm_names) == 1, (
            f"{anchor['ACCOUNT_ID']}: RM_NAME drifted across 24 weeks of "
            f"2026: {rm_names!r}"
        )


def test_profile_week_is_monday(in_audience_anchors):
    """PROFILE_WEEK.weekday() == 0 (Monday) for every emitted row across
    a 3-week roll. The contract is `profile_week` is a Monday `date`; the
    SP must echo it back as the row's PROFILE_WEEK."""
    if not in_audience_anchors:
        pytest.skip("no audience anchors in fixture")
    sample_profile_weeks = [
        date(2026, 5, 4),
        date(2026, 5, 11),
        date(2026, 5, 18),
    ]
    for pw in sample_profile_weeks:
        assert pw.weekday() == 0, f"test fixture bug: {pw} is not a Monday"
        for anchor in in_audience_anchors:
            row = _only(_rows_for(anchor, pw))
            assert row["PROFILE_WEEK"].weekday() == 0, (
                f"{anchor['ACCOUNT_ID']} on {pw}: PROFILE_WEEK="
                f"{row['PROFILE_WEEK']} is weekday "
                f"{row['PROFILE_WEEK'].weekday()}, expected Monday (0)"
            )
            assert row["PROFILE_WEEK"] == pw, (
                f"{anchor['ACCOUNT_ID']}: PROFILE_WEEK={row['PROFILE_WEEK']} "
                f"!= input profile_week={pw}"
            )
