"""L1 tests for the Demandbase Intent Signals row factory (Plan 14).

Third 1:N Cumulus dataset (after Plan 6 / Plaid and Plan 9 / Graph) and the
first with a VARIABLE fan-out per period: ``_rows_for`` returns 1-4 topic
rows per anchor per week. The year-stable top-affinity topic always emits
(coverage = audience); up to 3 more topics emit when their score clears the
reporting threshold.

Property classes (plan section 4 Task 3 + rowspec "L1 property targets"):
  1. Determinism — same (anchor, run_ts) and any run_ts in the same week
     give an identical list.
  2. Fan-out — 1 <= len <= 4; exactly one IS_TOP_TOPIC; topics unique.
  3. Top-topic stability — constant IS_TOP_TOPIC over 50 weeks in one year.
  4. Invariants:
     4a range, 4b vocabulary, 4c trajectory coherence (LOAD-BEARING),
     4d industry bias band, 4e schema.
  5. Boring case — NULL industry/revenue/employees, no Gong row.
Plus audience scoping (PERSON / Household / empty ACCOUNT_ID raise) and the
Gong soft-dep competitor bias.
"""
from collections import Counter
from datetime import date, datetime, timedelta

import pytest

from sp_generate_demandbase_intent_signals import (  # noqa: E402
    EXPECTED_OUTPUT_COLUMNS,
    _COMPETITORS,
    _REPORT_THRESHOLD,
    _TOPICS,
    _anchor_in_audience,
    _base_affinity,
    _rows_for,
    _score_for,
    _week_start,
)


TOPIC_VOCAB = set(_TOPICS)
CATEGORY_VOCAB = {"Lending", "Payments", "Cash Management", "Cards"}
JOURNEY_VOCAB = {"Awareness", "Consideration", "Decision", "Purchase"}
SOURCE_VOCAB = {"Demandbase", "Bombora", "G2"}

# A Monday and a 26-week roll ending on it.
BASE_MONDAY = datetime(2026, 11, 2)
ROLL_WEEKS = [BASE_MONDAY - timedelta(weeks=n) for n in range(26)]


def _all_rows(anchors, weeks, gong_flags=None):
    for a in anchors:
        for w in weeks:
            for r in _rows_for(a, w, gong_flags):
                yield a, w, r


def _synthetic(industry, n, revenue=720_000, employees=6, prefix="SYN"):
    return [
        {
            "ORG_ID": "JDO",
            "ACCOUNT_ID": f"001{prefix}{industry[:3].upper()}{i:06d}",
            "ACCOUNT_TYPE_FLAG": "BUSINESS",
            "CLIENT_CATEGORY": "Small Business",
            "INDUSTRY": industry,
            "ANNUAL_REVENUE": revenue,
            "EMPLOYEE_COUNT": employees,
        }
        for i in range(n)
    ]


# ---------- Property 1: Determinism ----------

def test_determinism_same_inputs(in_audience_anchors):
    for a in in_audience_anchors:
        assert _rows_for(a, BASE_MONDAY, None) == _rows_for(a, BASE_MONDAY, None)


def test_determinism_any_run_ts_in_same_week(in_audience_anchors):
    """Mon 05:30 vs Wed 23:59 vs Sun 12:00 collapse to the same week."""
    mon = datetime(2026, 11, 2, 5, 30)
    wed = datetime(2026, 11, 4, 23, 59, 59)
    sun = datetime(2026, 11, 8, 12, 0)
    for a in in_audience_anchors:
        rows = _rows_for(a, mon, None)
        assert rows == _rows_for(a, wed, None) == _rows_for(a, sun, None)


def test_week_start_is_monday_midnight():
    ws = _week_start(datetime(2026, 11, 5, 17, 42, 9, 123))
    assert ws == datetime(2026, 11, 2)
    assert ws.weekday() == 0


def test_different_weeks_differ(in_audience_anchors):
    """Weekly noise must actually vary week to week (seed_for buckets on
    year-month only, so the week must be in the seed key)."""
    a = in_audience_anchors[0]
    top_scores = {
        w: next(r["INTENT_SCORE"] for r in _rows_for(a, w, None) if r["IS_TOP_TOPIC"])
        for w in ROLL_WEEKS[:8]
    }
    assert len(set(top_scores.values())) > 1


# ---------- Property 2: Fan-out ----------

def test_fan_out_bounds_one_top_unique_topics(in_audience_anchors):
    for a in in_audience_anchors:
        for w in ROLL_WEEKS:
            rows = _rows_for(a, w, None)
            assert 1 <= len(rows) <= 4
            assert sum(1 for r in rows if r["IS_TOP_TOPIC"]) == 1
            topics = [r["INTENT_TOPIC"] for r in rows]
            assert len(topics) == len(set(topics))


def test_non_top_rows_clear_threshold(in_audience_anchors):
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS):
        if not r["IS_TOP_TOPIC"]:
            assert r["INTENT_SCORE"] >= _REPORT_THRESHOLD


def test_rows_carry_anchor_and_week(in_audience_anchors):
    for a, w, r in _all_rows(in_audience_anchors, ROLL_WEEKS[:4]):
        assert r["ACCOUNT_ID"] == a["ACCOUNT_ID"]
        assert r["PROFILE_WEEK"] == w.date()
        assert r["PROFILE_WEEK"].weekday() == 0
        assert r["GENERATED_AT"] == datetime(w.year, w.month, w.day)


def test_fan_out_has_multi_topic_weeks(in_audience_anchors):
    """The fixture must exercise the >1 path somewhere (not only the boring case)."""
    lens = [len(_rows_for(a, w, None)) for a in in_audience_anchors for w in ROLL_WEEKS]
    assert max(lens) >= 2


# ---------- Property 3: Top-topic stability ----------

def test_top_topic_stable_within_year(in_audience_anchors):
    weeks = [datetime(2026, 1, 5) + timedelta(weeks=n) for n in range(50)]
    for a in in_audience_anchors:
        tops = {
            next(r["INTENT_TOPIC"] for r in _rows_for(a, w, None) if r["IS_TOP_TOPIC"])
            for w in weeks
        }
        assert len(tops) == 1, f"top topic flickered for {a['ACCOUNT_ID']}: {tops}"


def test_top_topic_is_max_base_affinity(in_audience_anchors):
    for a in in_audience_anchors:
        top = next(r["INTENT_TOPIC"] for r in _rows_for(a, BASE_MONDAY, None) if r["IS_TOP_TOPIC"])
        best = max(_TOPICS, key=lambda t: (_base_affinity(a, t, BASE_MONDAY.year), t))
        assert top == best


# ---------- Property 4a: Range ----------

def test_ranges(in_audience_anchors):
    for _, w, r in _all_rows(in_audience_anchors, ROLL_WEEKS):
        assert 0 <= r["INTENT_SCORE"] <= 100
        assert 0 <= r["WEEKS_SURGING"] <= 12
        assert -100 <= r["SCORE_DELTA_WOW"] <= 100
        assert 1 <= r["UNIQUE_RESEARCHERS"] <= 40
        assert isinstance(r["INTENT_SCORE"], int)
        assert isinstance(r["SURGE_FLAG"], bool)
        assert isinstance(r["IS_TOP_TOPIC"], bool)


def test_last_signal_date_in_trailing_week(in_audience_anchors):
    """LAST_SIGNAL_DATE is within the 7-day window ending on PROFILE_WEEK, so
    it is never after the run date even for the Monday-05:30 TASK run."""
    for _, w, r in _all_rows(in_audience_anchors, ROLL_WEEKS):
        d = r["LAST_SIGNAL_DATE"]
        assert isinstance(d, date) and not isinstance(d, datetime)
        assert w.date() - timedelta(days=6) <= d <= w.date()


def test_string_lengths_fit_ddl(in_audience_anchors):
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS, gong_flags="Competitor"):
        assert len(r["INTENT_TOPIC"]) <= 40
        assert len(r["TOPIC_CATEGORY"]) <= 20
        assert len(r["JOURNEY_STAGE"]) <= 15
        assert len(r["SIGNAL_SOURCE"]) <= 12
        assert len(r["KEYWORD_SAMPLE"]) <= 200
        assert r["RESEARCHING_COMPETITOR"] is None or len(r["RESEARCHING_COMPETITOR"]) <= 30
        assert r["INTENT_NOTE"] is None or len(r["INTENT_NOTE"]) <= 200


# ---------- Property 4b: Vocabulary ----------

def test_vocabularies(in_audience_anchors):
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS, gong_flags="Pricing|Competitor"):
        assert r["INTENT_TOPIC"] in TOPIC_VOCAB
        assert r["TOPIC_CATEGORY"] in CATEGORY_VOCAB
        assert r["TOPIC_CATEGORY"] == _TOPICS[r["INTENT_TOPIC"]][0]
        assert r["JOURNEY_STAGE"] in JOURNEY_VOCAB
        assert r["SIGNAL_SOURCE"] in SOURCE_VOCAB
        assert r["RESEARCHING_COMPETITOR"] is None or r["RESEARCHING_COMPETITOR"] in _COMPETITORS
        kws = r["KEYWORD_SAMPLE"].split("; ")
        assert 2 <= len(kws) <= 3
        assert len(set(kws)) == len(kws)
        assert set(kws) <= set(_TOPICS[r["INTENT_TOPIC"]][1])


def test_no_ampersand_in_vocab():
    """snow sql renders '&' as a template directive — keep it out of all strings."""
    for topic, (cat, kws) in _TOPICS.items():
        assert "&" not in topic and "&" not in cat
        assert all("&" not in k for k in kws)
    assert all("&" not in c for c in _COMPETITORS)


# ---------- Property 4c: Trajectory coherence (LOAD-BEARING) ----------

def test_trajectory_coherence_week_over_week(in_audience_anchors):
    checked_delta = 0
    checked_chain = 0
    for a in in_audience_anchors:
        for w in ROLL_WEEKS[:-1]:
            prev = w - timedelta(weeks=1)
            now_rows = {r["INTENT_TOPIC"]: r for r in _rows_for(a, w, None)}
            prev_rows = {r["INTENT_TOPIC"]: r for r in _rows_for(a, prev, None)}
            for t in now_rows.keys() & prev_rows.keys():
                n, p = now_rows[t], prev_rows[t]
                assert n["SCORE_DELTA_WOW"] == n["INTENT_SCORE"] - p["INTENT_SCORE"]
                checked_delta += 1
                if n["SURGE_FLAG"] and p["SURGE_FLAG"]:
                    assert n["WEEKS_SURGING"] == min(p["WEEKS_SURGING"] + 1, 12)
                    checked_chain += 1
    assert checked_delta > 0
    assert checked_chain > 0  # the load-bearing chain check must not pass vacuously


def test_trajectory_coherence_across_year_boundary(in_audience_anchors):
    """W in early January, W-1 in December: _base_affinity reshuffles by year
    (so the top topic may change), but SCORE_DELTA_WOW and the WEEKS_SURGING
    chain must stay coherent because _score_for is pure in (anchor, topic, week)."""
    anchors = in_audience_anchors + _synthetic("Real Estate", 40, revenue=3_000_000,
                                               employees=25, prefix="YB")
    checked_delta = 0
    checked_chain = 0
    for jan_monday in (datetime(2026, 1, 5), datetime(2027, 1, 4), datetime(2028, 1, 3)):
        for w in (jan_monday, jan_monday + timedelta(weeks=1)):
            prev = w - timedelta(weeks=1)
            for a in anchors:
                now_rows = {r["INTENT_TOPIC"]: r for r in _rows_for(a, w, None)}
                prev_rows = {r["INTENT_TOPIC"]: r for r in _rows_for(a, prev, None)}
                for t, n in now_rows.items():
                    # delta is recomputed even if t did not emit in W-1
                    assert n["SCORE_DELTA_WOW"] == n["INTENT_SCORE"] - _score_for(a, t, prev)
                    checked_delta += 1
                    p = prev_rows.get(t)
                    if p is not None and n["SURGE_FLAG"] and p["SURGE_FLAG"]:
                        assert n["WEEKS_SURGING"] == min(p["WEEKS_SURGING"] + 1, 12)
                        checked_chain += 1
    assert datetime(2026, 1, 5).year != (datetime(2026, 1, 5) - timedelta(weeks=1)).year
    assert checked_delta > 0
    assert checked_chain > 0


def test_surge_flag_semantics(in_audience_anchors):
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS):
        assert r["SURGE_FLAG"] == (r["INTENT_SCORE"] >= 70)
        if r["SURGE_FLAG"]:
            assert r["WEEKS_SURGING"] >= 1
            assert r["INTENT_NOTE"] is not None
        else:
            assert r["WEEKS_SURGING"] == 0
            assert r["INTENT_NOTE"] is None


def test_delta_wow_matches_score_function(in_audience_anchors):
    """SCORE_DELTA_WOW is recomputed from _score_for, never read from a table —
    holds even when the topic did not emit last week."""
    for a, w, r in _all_rows(in_audience_anchors, ROLL_WEEKS[:6]):
        t = r["INTENT_TOPIC"]
        assert r["INTENT_SCORE"] == _score_for(a, t, w)
        assert r["SCORE_DELTA_WOW"] == r["INTENT_SCORE"] - _score_for(a, t, w - timedelta(weeks=1))


def test_weeks_surging_equals_consecutive_count():
    """Brute-force the consecutive-surge count over a long synthetic roll."""
    anchors = _synthetic("Real Estate", 40, revenue=3_000_000, employees=25)
    weeks = [BASE_MONDAY - timedelta(weeks=n) for n in range(40)]
    surging_seen = 0
    for a in anchors:
        for w in weeks[:10]:
            for r in _rows_for(a, w, None):
                if not r["SURGE_FLAG"]:
                    continue
                surging_seen += 1
                n = 0
                while n < 12 and _score_for(a, r["INTENT_TOPIC"], w - timedelta(weeks=n)) >= 70:
                    n += 1
                assert r["WEEKS_SURGING"] == n
    assert surging_seen > 0


def test_surges_span_consecutive_weeks():
    """Episodes span consecutive weeks: multi-week surges must exist."""
    anchors = _synthetic("Real Estate", 40, revenue=3_000_000, employees=25)
    max_ws = max(r["WEEKS_SURGING"] for _, _, r in _all_rows(anchors, ROLL_WEEKS[:8]))
    assert max_ws >= 2


def test_journey_stage_coherence(in_audience_anchors):
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS):
        s, ws, j = r["INTENT_SCORE"], r["WEEKS_SURGING"], r["JOURNEY_STAGE"]
        if ws >= 4 and s >= 85:
            assert j == "Purchase"
        elif ws >= 2:
            assert j == "Decision"
        elif s >= 50:
            assert j == "Consideration"
        else:
            assert j == "Awareness"


# ---------- Property 4d: Bias band ----------

def test_restaurant_top_topic_bias_band():
    """Restaurant top-affinity topic in the main-street set >= 80% across
    200 synthetic (anchor, week) samples (50 anchors x 4 years)."""
    allowed = {"Merchant Services", "Payroll Services", "Equipment Finance", "Business Credit Cards"}
    anchors = _synthetic("Restaurant", 50)
    weeks = [datetime(y, 3, 2) for y in (2025, 2026, 2027, 2028)]
    weeks = [_week_start(w) for w in weeks]
    tops = [
        next(r["INTENT_TOPIC"] for r in _rows_for(a, w, None) if r["IS_TOP_TOPIC"])
        for a in anchors for w in weeks
    ]
    assert len(tops) == 200
    share = sum(t in allowed for t in tops) / len(tops)
    assert share >= 0.80, (share, Counter(tops))


def test_real_estate_cre_in_top_two():
    anchors = _synthetic("Real Estate", 50, revenue=800_000, employees=4)
    weeks = [_week_start(datetime(y, 6, 1)) for y in (2025, 2026, 2027, 2028)]
    hits = 0
    for a in anchors:
        for w in weeks:
            ranked = sorted(_TOPICS, key=lambda t: -_base_affinity(a, t, w.year))
            hits += "Commercial Real Estate Lending" in ranked[:2]
    assert hits / 200 >= 0.75


def test_revenue_tilt_treasury_vs_sba():
    """Mid-market (>= $10M) carries more Treasury Management rows than
    main street (< $1M); SBA Lending shows the inverse."""
    big = _synthetic("Technology", 30, revenue=40_000_000, employees=300, prefix="BIG")
    small = _synthetic("Technology", 30, revenue=500_000, employees=5, prefix="SML")

    def rate(anchors, topic):
        rows = [r for _, _, r in _all_rows(anchors, ROLL_WEEKS[:8])]
        return sum(r["INTENT_TOPIC"] == topic for r in rows) / len(rows)

    assert rate(big, "Treasury Management") >= 2 * rate(small, "Treasury Management")
    assert rate(small, "SBA Lending") > rate(big, "SBA Lending")


def test_researchers_scale_with_employees():
    big = _synthetic("Manufacturing", 20, revenue=30_000_000, employees=900, prefix="BIG")
    small = _synthetic("Manufacturing", 20, revenue=500_000, employees=4, prefix="SML")
    big_max = max(r["UNIQUE_RESEARCHERS"] for _, _, r in _all_rows(big, ROLL_WEEKS[:8]))
    small_max = max(r["UNIQUE_RESEARCHERS"] for _, _, r in _all_rows(small, ROLL_WEEKS[:8]))
    assert small_max <= 3
    assert big_max > small_max


# ---------- Gong soft-dep ----------

def test_competitor_null_below_consideration(in_audience_anchors):
    """Score < 50 => NULL competitor, except on the TOP row in a Gong
    Competitor week (first-party evidence lifts the gate there)."""
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS, gong_flags=None):
        if r["INTENT_SCORE"] < 50:
            assert r["RESEARCHING_COMPETITOR"] is None
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS, gong_flags="Competitor"):
        if r["INTENT_SCORE"] < 50 and not r["IS_TOP_TOPIC"]:
            assert r["RESEARCHING_COMPETITOR"] is None


def _top_rows(anchors, weeks, flags):
    return [r for _, _, r in _all_rows(anchors, weeks, gong_flags=flags) if r["IS_TOP_TOPIC"]]


def _nonnull_rate(rows):
    return sum(r["RESEARCHING_COMPETITOR"] is not None for r in rows) / len(rows)


def test_gong_competitor_top_row_rate_meets_l3_band():
    """Plan section 4 Task 8 metric: among TOP rows in Gong-Competitor weeks,
    RESEARCHING_COMPETITOR non-NULL >= 55 pct; elsewhere <= 30 pct. Measured
    over a mixed-industry synthetic book so most top rows score < 50."""
    anchors = []
    for ind in ("Restaurant", "Construction", "Technology", "Wholesale", "Healthcare"):
        anchors += _synthetic(ind, 30, prefix="TR")
    weeks = ROLL_WEEKS[:10]
    flagged = _nonnull_rate(_top_rows(anchors, weeks, "Pricing|Competitor"))
    plain = _nonnull_rate(_top_rows(anchors, weeks, None))
    other = _nonnull_rate(_top_rows(anchors, weeks, "Pricing|Renewal"))
    assert flagged >= 0.55, flagged
    assert plain <= 0.30, plain
    assert abs(other - plain) < 1e-9


def test_gong_competitor_l2_fixture_split(in_audience_anchors):
    """Plan section 4 Task 5 second pass: Gong flags Competitor for 6 of the
    12 fixture anchors. Expect a non-NULL competitor on >= 3 of the 6 flagged
    anchors' top rows and <= 3 of the other 6 -- asserted for the L2 run week
    and for >= 80 pct of the 26-week roll."""
    flagged_ids = {a["ACCOUNT_ID"] for a in in_audience_anchors[::2]}

    def split(w):
        hit_flagged = hit_other = 0
        for a in in_audience_anchors:
            is_flagged = a["ACCOUNT_ID"] in flagged_ids
            top = next(r for r in _rows_for(a, w, "Competitor" if is_flagged else None)
                       if r["IS_TOP_TOPIC"])
            if top["RESEARCHING_COMPETITOR"] is not None:
                if is_flagged:
                    hit_flagged += 1
                else:
                    hit_other += 1
        return hit_flagged, hit_other

    hf, ho = split(BASE_MONDAY)
    assert hf >= 3 and ho <= 3, (hf, ho)
    passing = sum(1 for w in ROLL_WEEKS if (lambda s: s[0] >= 3 and s[1] <= 3)(split(w)))
    assert passing / len(ROLL_WEEKS) >= 0.80, passing


def test_g2_forced_when_competitor(in_audience_anchors):
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS, gong_flags="Competitor"):
        if r["RESEARCHING_COMPETITOR"] is not None:
            assert r["SIGNAL_SOURCE"] == "G2"


def test_gong_competitor_flag_raises_competitor_rate():
    anchors = _synthetic("Real Estate", 40, revenue=3_000_000, employees=25)

    def rate(flags):
        rows = [r for _, _, r in _all_rows(anchors, ROLL_WEEKS[:10], gong_flags=flags)
                if r["INTENT_SCORE"] >= 50]
        return sum(r["RESEARCHING_COMPETITOR"] is not None for r in rows) / len(rows)

    with_flag = rate("Pricing|Competitor")
    without = rate(None)
    other_flags = rate("Pricing|Renewal")
    assert with_flag > 0.5
    assert without < 0.35
    assert abs(other_flags - without) < 1e-9  # non-Competitor flags are no-ops


def test_competitor_year_stable_per_account_topic():
    anchors = _synthetic("Real Estate", 40, revenue=3_000_000, employees=25)
    weeks = [_week_start(datetime(2026, 1, 5)) + timedelta(weeks=n) for n in range(30)]
    seen = {}
    for a, _, r in _all_rows(anchors, weeks, gong_flags="Competitor"):
        c = r["RESEARCHING_COMPETITOR"]
        if c is None:
            continue
        key = (a["ACCOUNT_ID"], r["INTENT_TOPIC"])
        assert seen.setdefault(key, c) == c


def test_gong_flags_only_touch_competitor_and_source(in_audience_anchors):
    vary = {"RESEARCHING_COMPETITOR", "SIGNAL_SOURCE", "INTENT_NOTE"}
    for a in in_audience_anchors:
        plain = _rows_for(a, BASE_MONDAY, None)
        flagged = _rows_for(a, BASE_MONDAY, "Competitor")
        assert [r["INTENT_TOPIC"] for r in plain] == [r["INTENT_TOPIC"] for r in flagged]
        for p, f in zip(plain, flagged):
            assert {k: v for k, v in p.items() if k not in vary} == \
                   {k: v for k, v in f.items() if k not in vary}


# ---------- Property 4e: Schema ----------

def test_schema_contract(in_audience_anchors):
    assert len(EXPECTED_OUTPUT_COLUMNS) == 17
    assert "ORG_ID" not in EXPECTED_OUTPUT_COLUMNS
    assert "RECORD_ID" not in EXPECTED_OUTPUT_COLUMNS
    for _, _, r in _all_rows(in_audience_anchors, ROLL_WEEKS[:4]):
        assert set(r.keys()) == EXPECTED_OUTPUT_COLUMNS


# ---------- Audience scoping ----------

def test_audience_predicate(in_audience_anchors, out_of_audience_anchors):
    assert all(_anchor_in_audience(a) for a in in_audience_anchors)
    assert not any(_anchor_in_audience(a) for a in out_of_audience_anchors)


def test_audience_violators_raise(out_of_audience_anchors):
    for bad in out_of_audience_anchors:
        with pytest.raises(ValueError):
            _rows_for(bad, BASE_MONDAY, None)


def test_null_client_category_is_in_audience():
    """COALESCE(CLIENT_CATEGORY, '') <> 'Household' keeps NULL-category anchors."""
    a = {"ACCOUNT_ID": "001X", "ACCOUNT_TYPE_FLAG": "BUSINESS", "CLIENT_CATEGORY": None}
    assert _anchor_in_audience(a)


def test_numeric_types_are_coerced():
    """Snowpark returns NUMBER as int or Decimal; JSON exports as str. All
    three must produce identical rows."""
    from decimal import Decimal
    base = {"ORG_ID": "JDO", "ACCOUNT_ID": "001NUM", "ACCOUNT_TYPE_FLAG": "BUSINESS",
            "CLIENT_CATEGORY": "Commercial Banking", "INDUSTRY": "Manufacturing"}
    as_int = dict(base, ANNUAL_REVENUE=26_000_000, EMPLOYEE_COUNT=210)
    as_dec = dict(base, ANNUAL_REVENUE=Decimal("26000000"), EMPLOYEE_COUNT=Decimal("210"))
    as_str = dict(base, ANNUAL_REVENUE="26000000", EMPLOYEE_COUNT="210")
    assert _rows_for(as_int, BASE_MONDAY) == _rows_for(as_dec, BASE_MONDAY) == _rows_for(as_str, BASE_MONDAY)


# ---------- Property 5: Boring case ----------

def test_boring_case_never_raises_and_always_emits(boring_anchor):
    for w in ROLL_WEEKS:
        rows = _rows_for(boring_anchor, w, None)
        assert len(rows) >= 1
        assert sum(r["IS_TOP_TOPIC"] for r in rows) == 1


def test_boring_case_shape(boring_anchor):
    """Most weeks: exactly one low-score Awareness row (its year-stable top
    topic) with SURGE_FLAG False, 1 researcher and NULL competitor / note.
    NULL revenue counts as main street, so an occasional SBA Lending episode
    can add a second row; that is allowed but must stay the minority."""
    weeks = [BASE_MONDAY - timedelta(weeks=n) for n in range(52)]
    single = 0
    for w in weeks:
        rows = _rows_for(boring_anchor, w, None)
        top = next(r for r in rows if r["IS_TOP_TOPIC"])
        if top["INTENT_SCORE"] < 50:
            assert top["JOURNEY_STAGE"] == "Awareness"
            assert top["SURGE_FLAG"] is False
            assert top["WEEKS_SURGING"] == 0
            assert top["RESEARCHING_COMPETITOR"] is None
            assert top["INTENT_NOTE"] is None
        if top["INTENT_SCORE"] <= 33:
            assert top["UNIQUE_RESEARCHERS"] == 1
        if len(rows) == 1 and top["INTENT_SCORE"] <= 35:
            single += 1
    assert single / len(weeks) >= 0.60, single
    scores = sorted(
        next(r["INTENT_SCORE"] for r in _rows_for(boring_anchor, w, None) if r["IS_TOP_TOPIC"])
        for w in weeks
    )
    median = scores[len(scores) // 2]
    assert 5 <= median <= 25, median


# ---------- Guard: trajectory is recomputed, never read ----------

def test_module_never_selects_from_own_table():
    """A self-read would make backfill order-dependent (plan section 4)."""
    import inspect
    import re
    import sp_generate_demandbase_intent_signals as mod
    src = inspect.getsource(mod)
    # SQL keywords are upper-case in this codebase; prose ("from") is not.
    assert not re.search(r"\bFROM\s+(\S*\.)?DEMANDBASE_INTENT_SIGNALS\b(?!_STAGING)", src)
    assert not re.search(r"\bFROM\s+\{TABLE\}", src)


def test_no_ampersand_in_module_source_or_ddl():
    """The SP body is inlined into a snow sql file; '&' triggers template rendering."""
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent
    for f in [root / "procedures" / "sp_generate_demandbase_intent_signals.py",
              root / "schemas" / "demandbase_intent_signals.sql"]:
        assert "&" not in f.read_text(), f
