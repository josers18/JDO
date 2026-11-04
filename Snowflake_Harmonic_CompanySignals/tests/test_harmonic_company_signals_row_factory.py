"""L1 tests for the Harmonic Company Signals row factory (Plan 16).

Rowspec L1 property targets:
1. Determinism (same inputs; any run_ts in the month)
2. Timeline stability (36 monthly rows imply one lifetime round list)
3. Monotonicity (plan 4c)
4. Invariants 4a-4e (range, vocabulary, timeline monotonicity, cross-field,
   bias band)
5. Band bound (HEADCOUNT inside the band over 36 months x all anchors)
6. Boring case
plus audience scoping, the schema contract, the RECORD_ID formula, the
stateless M-3 / M-6 recomputation, and a no-self-read guard.
"""
from __future__ import annotations

import calendar
import hashlib
import random
import re
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

import sp_generate_harmonic_company_signals as sp
from sp_generate_harmonic_company_signals import (
    DATA_COLUMNS,
    EXPECTED_OUTPUT_COLUMNS,
    _BAND_BOUNDS,
    _LADDER,
    _row_for,
    _timeline,
    _funding_as_of,
    _with_ids,
)

from tests.conftest import zi_const

# 36 consecutive months: 2025-01 .. 2027-12.
MONTHS = [datetime(2025 + i // 12, i % 12 + 1, 1) for i in range(36)]

FUNDING_STATUSES = {"Bootstrapped", "Angel-Seed", "Venture-Backed", "PE-Backed"}
POSTINGS_TRENDS = {"Accelerating", "Steady", "Slowing", "Frozen"}
FUNDING_NULLABLES = ("LAST_FUNDING_STAGE", "LAST_FUNDING_DATE", "LAST_ROUND_USD",
                     "LEAD_INVESTOR", "EST_VALUATION_USD")
ALL_NULLABLES = FUNDING_NULLABLES + ("EST_RUNWAY_MONTHS",)


def _month_end(d) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def _add_months(d: date, n: int) -> date:
    idx = d.year * 12 + (d.month - 1) + n
    return date(idx // 12, idx % 12 + 1, 1)


@pytest.fixture
def history(fixture_rows):
    """{account_id: [row for each of the 36 MONTHS]}"""
    return {a["ACCOUNT_ID"]: [_row_for(a, zi, ts) for ts in MONTHS]
            for a, zi, _b, _f in fixture_rows}


@pytest.fixture
def all_rows(history):
    return [r for rows in history.values() for r in rows]


# ---------- 1. Determinism ----------

def test_determinism_same_inputs(fixture_rows):
    ts = datetime(2026, 11, 1)
    for a, zi, _b, _f in fixture_rows:
        assert _row_for(a, zi, ts) == _row_for(a, zi, ts)


def test_determinism_any_run_ts_in_month(fixture_rows):
    for a, zi, _b, _f in fixture_rows:
        base = _row_for(a, zi, datetime(2026, 11, 1))
        for ts in (datetime(2026, 11, 1, 9, 0), datetime(2026, 11, 17, 23, 59, 59),
                   datetime(2026, 11, 30, 12, 30)):
            assert _row_for(a, zi, ts) == base


def test_new_month_new_row(fixture_rows):
    a, zi, _b, _f = fixture_rows[0]
    r1 = _row_for(a, zi, datetime(2026, 11, 1))
    r2 = _row_for(a, zi, datetime(2026, 12, 1))
    assert r1["PROFILE_MONTH"] == date(2026, 11, 1)
    assert r2["PROFILE_MONTH"] == date(2026, 12, 1)
    assert r1["GENERATED_AT"] == datetime(2026, 11, 1)
    assert r2["GENERATED_AT"] == datetime(2026, 12, 1)


# ---------- Audience scoping ----------

def test_out_of_audience_anchors_raise(out_of_audience_anchors):
    zi = zi_const("1-10", 2015)
    for bad in out_of_audience_anchors:
        with pytest.raises(ValueError):
            _row_for(bad, zi, datetime(2026, 11, 1))


def test_missing_zoominfo_month_raises(fixture_rows):
    a, zi, _b, _f = fixture_rows[0]
    zi = {k: v for k, v in zi.items() if k != date(2026, 11, 1)}
    with pytest.raises(ValueError, match="ZoomInfo"):
        _row_for(a, zi, datetime(2026, 11, 1))


def test_founded_before_2010_raises(fixture_rows):
    a, _zi, b, _f = fixture_rows[1]
    with pytest.raises(ValueError):
        _row_for(a, zi_const(b, 2008), datetime(2026, 11, 1))


def test_audience_sql_matches_plan_section_2():
    sql = sp.AUDIENCE_SQL
    for frag in ("ZOOMINFO_FIRMOGRAPHICS", "MOODYS_MARKET_CONTEXT",
                 "QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY PROFILE_DATE DESC) = 1",
                 "a.ACCOUNT_TYPE_FLAG = 'BUSINESS'",
                 "COALESCE(a.CLIENT_CATEGORY, '') <> 'Household'",
                 "m.LIQUIDITY_TIER = 'Illiquid'",
                 "z.FOUNDED_YEAR >= 2010",
                 "z.PROFILE_MONTH = :month"):
        assert frag in sql, frag
    assert "COALESCE keeps NULL-category anchors" in sql


# ---------- Schema contract + RECORD_ID ----------

def test_schema_is_22_data_columns(fixture_rows):
    assert len(DATA_COLUMNS) == 22
    assert EXPECTED_OUTPUT_COLUMNS == frozenset(DATA_COLUMNS)
    a, zi, _b, _f = fixture_rows[0]
    row = _row_for(a, zi, datetime(2026, 11, 1))
    assert set(row) == set(DATA_COLUMNS)
    assert list(row) == list(DATA_COLUMNS)


def test_with_ids_matches_sql_backfill_formula(fixture_rows):
    a, zi, _b, _f = fixture_rows[4]
    row = _with_ids(_row_for(a, zi, datetime(2026, 11, 1)), a.get("ORG_ID"))
    assert list(row)[:2] == ["ORG_ID", "RECORD_ID"]
    assert row["ORG_ID"] == "JDO"
    # SQL: REGEXP_REPLACE(LEFT(SHA2(CONCAT_WS('|', ORG_ID, ACCOUNT_ID, PROFILE_MONTH, 'record_id'), 256), 32), ...)
    h = hashlib.sha256(f"JDO|{a['ACCOUNT_ID']}|2026-11-01|record_id".encode()).hexdigest()[:32]
    assert row["RECORD_ID"] == f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"
    assert _with_ids(_row_for(a, zi, datetime(2026, 11, 1)), None)["ORG_ID"] == "JDO"


# ---------- 2. Timeline stability ----------

def test_monthly_rows_imply_one_lifetime_timeline(fixture_rows, history):
    """Rebuild the round list implied by 36 months of rows (each month exposes
    only its last round plus running totals) and check it is one consistent
    lifetime list: every newly exposed round raises FUNDING_ROUNDS_COUNT by
    one and TOTAL_RAISED_USD by exactly that round's size, earlier rounds
    never reappear, and the result equals the slice of _timeline visible in
    the window."""
    for a, _zi, b, f in fixture_rows:
        rows = history[a["ACCOUNT_ID"]]
        implied = []
        for prev, cur in zip([None] + rows, rows):
            if cur["FUNDING_ROUNDS_COUNT"] == 0:
                continue
            rnd = (cur["LAST_FUNDING_DATE"], cur["LAST_FUNDING_STAGE"],
                   cur["LAST_ROUND_USD"], cur["LEAD_INVESTOR"])
            if not implied or implied[-1] != rnd:
                assert rnd not in implied, a["ACCOUNT_ID"]
                if prev is not None and prev["FUNDING_ROUNDS_COUNT"] > 0:
                    assert cur["FUNDING_ROUNDS_COUNT"] == prev["FUNDING_ROUNDS_COUNT"] + 1
                    assert cur["TOTAL_RAISED_USD"] == prev["TOTAL_RAISED_USD"] + rnd[2]
                implied.append(rnd)
            else:
                assert cur["FUNDING_ROUNDS_COUNT"] == prev["FUNDING_ROUNDS_COUNT"]
                assert cur["TOTAL_RAISED_USD"] == prev["TOTAL_RAISED_USD"]
        tl = _timeline(a, f, b)
        first_seen = rows[0]["FUNDING_ROUNDS_COUNT"]
        visible = [r for r in tl if r[0] <= _month_end(MONTHS[-1])]
        assert implied == visible[max(0, first_seen - 1):], a["ACCOUNT_ID"]


def test_as_of_view_is_a_prefix_of_the_timeline(fixture_rows, history):
    for a, _zi, b, f in fixture_rows:
        tl = _timeline(a, f, b)
        for ts, row in zip(MONTHS, history[a["ACCOUNT_ID"]]):
            seen = [r for r in tl if r[0] <= _month_end(ts)]
            assert row["FUNDING_ROUNDS_COUNT"] == len(seen)
            assert row["TOTAL_RAISED_USD"] == sum(r[2] for r in seen)
            if seen:
                d, st, usd, lead = seen[-1]
                assert (row["LAST_FUNDING_DATE"], row["LAST_FUNDING_STAGE"],
                        row["LAST_ROUND_USD"], row["LEAD_INVESTOR"]) == (d, st, usd, lead)


def test_timeline_shape(fixture_rows):
    for a, _zi, b, f in fixture_rows:
        tl = _timeline(a, f, b)
        dates = [r[0] for r in tl]
        assert dates == sorted(dates)
        idx = [_LADDER.index(r[1]) for r in tl]
        assert idx == sorted(idx) and len(set(idx)) == len(idx)
        for d in dates:
            assert date(f, 1, 1) + timedelta(days=120) <= d <= sp._TIMELINE_END
        for d0, d1 in zip(dates, dates[1:]):
            assert 300 <= (d1 - d0).days <= 760            # 10-25 months between rounds
        for d, st, usd, lead in tl:
            lo, hi = sp._ROUND_USD[st]
            assert lo - 25_000 <= usd <= hi + 25_000 and usd % 50_000 == 0
            assert lead in {x for pool in sp._INVESTORS.values() for x in pool}


def test_timeline_is_era_anchored_not_founding_anchored():
    """Rounds cluster around the funding era (pivot in 2022-01 .. 2027-12; PE
    two years earlier), whatever the founding year, so a 2010 founder can
    still raise inside the live window."""
    pivots_in_era = 0
    funded = 0
    for i in range(400):
        a = {"ACCOUNT_ID": f"001ERA{i:06d}", "INDUSTRY": "Technology",
             "ACCOUNT_TYPE_FLAG": "BUSINESS", "CLIENT_CATEGORY": "Small Business"}
        tl = _timeline(a, 2010, "51-200")
        if not tl:
            continue
        funded += 1
        lo = sp._PIVOT_START - timedelta(days=sp._PE_ERA_SHIFT_DAYS)
        pivots_in_era += any(lo <= r[0] <= sp._PIVOT_END for r in tl)
    assert funded > 200
    assert pivots_in_era == funded


def test_industry_prefix_normalisation():
    assert sp._canon_industry("Wholesale Distribution") == "Wholesale"
    assert sp._canon_industry("Professional Services Mid-Market") == "Professional Services"
    assert sp._canon_industry("Healthcare Systems") == "Healthcare"
    assert sp._canon_industry("Real Estate Holdings") == "Real Estate"
    assert sp._canon_industry("Retail") == "Retail Trade"
    assert sp._canon_industry("Hospitality") == "Restaurant"
    assert sp._canon_industry(None) == "" and sp._canon_industry("Insurance") == "Insurance"


def test_pe_rolled_first_not_crowded_out():
    """A high venture probability must not squeeze PE out of the PE bands."""
    pe = sum(sp._destiny({"INDUSTRY": "Technology"}, "201-1000", random.Random(i)) == "pe"
             for i in range(4000)) / 4000
    assert abs(pe - sp._DESTINY_P["nonmicro"]["pe"]) < 0.03, pe


def test_valuation_seed_includes_account_id():
    rounds = [(date(2025, 3, 1), "Series A", 10_000_000, "Accel")]
    vals = {_funding_as_of(rounds, date(2026, 1, 31), f"001HMVAL{i:08d}")["EST_VALUATION_USD"]
            for i in range(20)}
    assert len(vals) > 1, "valuation multiple must vary by account for a same-day same-stage round"


def test_fixture_exercises_destinies(fixture_rows, history):
    statuses = {r["FUNDING_STATUS"] for rows in history.values() for r in rows}
    assert statuses == FUNDING_STATUSES, statuses
    transitions = 0
    for rows in history.values():
        s = [r["FUNDING_STATUS"] for r in rows]
        transitions += any(x == "Bootstrapped" and y != "Bootstrapped" for x, y in zip(s, s[1:]))
    assert transitions >= 1, "fixture should show at least one Bootstrapped -> funded transition"


# ---------- 4a. Range ----------

def test_range_invariants(all_rows):
    for r in all_rows:
        for c in ("ENG_HEADCOUNT_PCT", "SALES_HEADCOUNT_PCT", "OPS_HEADCOUNT_PCT"):
            assert 0 <= r[c] <= 100, (c, r[c])
            assert round(r[c], 1) == r[c]
        assert r["ENG_HEADCOUNT_PCT"] + r["SALES_HEADCOUNT_PCT"] + r["OPS_HEADCOUNT_PCT"] <= 98.0 + 1e-6
        assert 0 <= r["TRACTION_SCORE"] <= 100 and isinstance(r["TRACTION_SCORE"], int)
        assert -60 <= r["HEADCOUNT_GROWTH_6M_PCT"] <= 300
        assert r["OPEN_JOB_POSTINGS"] >= 0 and isinstance(r["OPEN_JOB_POSTINGS"], int)
        assert r["EST_RUNWAY_MONTHS"] is None or 0 <= r["EST_RUNWAY_MONTHS"] <= 60
        pm = r["PROFILE_MONTH"]
        assert pm <= r["LAST_DATA_REFRESH_DATE"] <= pm + timedelta(days=27)
        assert r["TOTAL_RAISED_USD"] < 10**12
        assert r["EST_VALUATION_USD"] is None or r["EST_VALUATION_USD"] < 10**13
        assert r["FUNDING_ROUNDS_COUNT"] < 100


# ---------- 5. Band bound ----------

def test_headcount_within_band_36_months(fixture_rows, history):
    for a, _zi, b, _f in fixture_rows:
        lo, hi = _BAND_BOUNDS[b]
        for r in history[a["ACCOUNT_ID"]]:
            assert lo <= r["HEADCOUNT"] <= hi, (a["ACCOUNT_ID"], b, r["HEADCOUNT"])


def test_band_change_uses_same_month_band():
    """HEADCOUNT tracks the same-month band; growth uses the M-6 band."""
    a = {"ORG_ID": "JDO", "ACCOUNT_ID": "001HMBANDCHG0001", "ACCOUNT_TYPE_FLAG": "BUSINESS",
         "CLIENT_CATEGORY": "Small Business", "INDUSTRY": "Technology"}
    zi = zi_const("51-200", 2015)
    for m in range(1, 6):                       # 2026-01 .. 2026-05 smaller band
        zi[date(2026, m, 1)] = {"EMPLOYEE_BAND": "11-50", "FOUNDED_YEAR": 2015}
    may = _row_for(a, zi, datetime(2026, 5, 1))
    assert 11 <= may["HEADCOUNT"] <= 50
    jul_prev_small = _row_for(a, zi, datetime(2026, 7, 1))   # M-6 = 2026-01 (11-50)
    assert 51 <= jul_prev_small["HEADCOUNT"] <= 200
    zi_flat = zi_const("51-200", 2015)
    flat = _row_for(a, zi_flat, datetime(2026, 7, 1))
    assert flat["HEADCOUNT"] == jul_prev_small["HEADCOUNT"]
    assert jul_prev_small["HEADCOUNT_GROWTH_6M_PCT"] > flat["HEADCOUNT_GROWTH_6M_PCT"]


def test_missing_prior_zoominfo_months_fall_back_to_m_band(fixture_rows):
    a, _zi, b, f = fixture_rows[6]
    full = _row_for(a, zi_const(b, f), datetime(2026, 11, 1))
    only_m = {date(2026, 11, 1): {"EMPLOYEE_BAND": b, "FOUNDED_YEAR": f}}
    assert _row_for(a, only_m, datetime(2026, 11, 1)) == full


# ---------- Stateless recomputation ----------

def test_growth_and_trend_match_prior_rows(fixture_rows, history):
    """Recomputed M-6 headcount and M-3 postings equal what those months' rows
    store (constant band), so backfill and live runs agree."""
    for a, _zi, _b, _f in fixture_rows:
        rows = history[a["ACCOUNT_ID"]]
        for i in range(6, len(rows)):
            hc, hc6 = rows[i]["HEADCOUNT"], rows[i - 6]["HEADCOUNT"]
            exp = round(max(-60.0, min(300.0, (hc - hc6) / hc6 * 100)), 1)
            assert rows[i]["HEADCOUNT_GROWTH_6M_PCT"] == exp
        for i in range(3, len(rows)):
            assert rows[i]["POSTINGS_TREND"] == sp._postings_trend(
                rows[i]["OPEN_JOB_POSTINGS"], rows[i - 3]["OPEN_JOB_POSTINGS"])


def test_no_self_read_in_module():
    src = Path(sp.__file__).read_text()
    assert not re.search(r"FROM\s+[\w.]*HARMONIC_COMPANY_SIGNALS\b", src, re.I)
    assert not re.search(r"JOIN\s+[\w.]*HARMONIC_COMPANY_SIGNALS\b", src, re.I)


def test_no_ampersand_in_module_source():
    assert "&" not in Path(sp.__file__).read_text()


# ---------- 4b. Vocabulary ----------

def test_vocabulary(all_rows):
    for r in all_rows:
        assert r["FUNDING_STATUS"] in FUNDING_STATUSES
        assert r["LAST_FUNDING_STAGE"] is None or r["LAST_FUNDING_STAGE"] in _LADDER
        assert r["POSTINGS_TREND"] in POSTINGS_TRENDS
        assert isinstance(r["RECENTLY_FUNDED_FLAG"], bool)
    assert len(_LADDER) == 8


# ---------- 4c. Timeline monotonicity (load-bearing) ----------

def test_monotonicity_36_months(history):
    for acct, rows in history.items():
        seen_round = False
        for prev, cur in zip(rows, rows[1:]):
            assert cur["TOTAL_RAISED_USD"] >= prev["TOTAL_RAISED_USD"], acct
            assert cur["FUNDING_ROUNDS_COUNT"] >= prev["FUNDING_ROUNDS_COUNT"], acct
            pi = -1 if prev["LAST_FUNDING_STAGE"] is None else _LADDER.index(prev["LAST_FUNDING_STAGE"])
            ci = -1 if cur["LAST_FUNDING_STAGE"] is None else _LADDER.index(cur["LAST_FUNDING_STAGE"])
            assert ci >= pi, acct
        for r in rows:
            if r["LAST_FUNDING_DATE"] is not None:
                assert r["LAST_FUNDING_DATE"] <= _month_end(r["PROFILE_MONTH"])
            if r["FUNDING_ROUNDS_COUNT"] > 0:
                seen_round = True
            if seen_round:
                assert r["FUNDING_STATUS"] != "Bootstrapped", acct


# ---------- 4d. Cross-field ----------

def test_cross_field(all_rows):
    for r in all_rows:
        boot = r["FUNDING_STATUS"] == "Bootstrapped"
        assert boot == (r["FUNDING_ROUNDS_COUNT"] == 0) == (r["TOTAL_RAISED_USD"] == 0)
        if boot:
            assert all(r[c] is None for c in ALL_NULLABLES)
            assert r["RECENTLY_FUNDED_FLAG"] is False
        else:
            assert all(r[c] is not None for c in FUNDING_NULLABLES)
            assert r["LAST_ROUND_USD"] <= r["TOTAL_RAISED_USD"]
            assert r["EST_VALUATION_USD"] > 0
        if r["EST_RUNWAY_MONTHS"] is not None:
            assert r["FUNDING_STATUS"] in ("Angel-Seed", "Venture-Backed")
        else:
            assert r["FUNDING_STATUS"] not in ("Angel-Seed", "Venture-Backed")
        recent = (r["LAST_FUNDING_DATE"] is not None
                  and r["LAST_FUNDING_DATE"] >= r["PROFILE_MONTH"] - timedelta(days=90))
        assert r["RECENTLY_FUNDED_FLAG"] is recent
        if r["LAST_FUNDING_STAGE"]:
            assert r["FUNDING_STATUS"] == sp._STATUS_OF[r["LAST_FUNDING_STAGE"]]


# ---------- 4e. Bias band (1,000 synthetic anchors) ----------

_BANDS = list(_BAND_BOUNDS)


def _synthetic(n, industry, band=None, seed=16):
    rng = random.Random(f"{seed}-{industry}-{band}")
    out = []
    for i in range(n):
        a = {"ORG_ID": "JDO", "ACCOUNT_ID": f"001SYN{industry or 'NULL'}{band or 'x'}{i:06d}",
             "ACCOUNT_TYPE_FLAG": "BUSINESS", "CLIENT_CATEGORY": "Small Business",
             "INDUSTRY": industry}
        b = band or rng.choice(_BANDS)
        f = rng.randint(2010, 2022)
        out.append((a, {date(2026, 11, 1): {"EMPLOYEE_BAND": b, "FOUNDED_YEAR": f}}, b))
    return out


def _status_share(anchors, statuses, ts=datetime(2026, 11, 1)):
    rows = [_row_for(a, zi, ts) for a, zi, _b in anchors]
    return sum(r["FUNDING_STATUS"] in statuses for r in rows) / len(rows)


def test_bias_technology_mostly_venture_or_angel():
    share = _status_share(_synthetic(1000, "Technology"), {"Venture-Backed", "Angel-Seed"})
    assert share >= 0.45, share


@pytest.mark.parametrize("industry", ["Restaurant", "Construction"])
def test_bias_main_street_mostly_bootstrapped(industry):
    share = _status_share(_synthetic(1000, industry), {"Bootstrapped"})
    assert share >= 0.75, share


def test_bias_1_10_never_exceeds_seed():
    seed_idx = _LADDER.index("Seed")
    anchors = _synthetic(1000, "Technology", band="1-10")
    for a, zi, b in anchors:
        f = zi[date(2026, 11, 1)]["FOUNDED_YEAR"]
        assert all(_LADDER.index(r[1]) <= seed_idx for r in _timeline(a, f, b))
    rows = [_row_for(a, zi, datetime(2026, 11, 1)) for a, zi, _b in anchors]
    assert {r["FUNDING_STATUS"] for r in rows} <= {"Bootstrapped", "Angel-Seed"}


def test_bias_dept_mix_follows_industry():
    tech = [_row_for(a, zi, datetime(2026, 11, 1)) for a, zi, _b in _synthetic(200, "Technology")]
    rest = [_row_for(a, zi, datetime(2026, 11, 1)) for a, zi, _b in _synthetic(200, "Restaurant")]
    mean = lambda rows, c: sum(r[c] for r in rows) / len(rows)  # noqa: E731
    assert mean(tech, "ENG_HEADCOUNT_PCT") > mean(rest, "ENG_HEADCOUNT_PCT") + 30
    assert mean(rest, "OPS_HEADCOUNT_PCT") > mean(tech, "OPS_HEADCOUNT_PCT") + 50


# ---------- 6. Boring case ----------

def test_boring_case(boring):
    a, zi, b, f = boring
    assert a["INDUSTRY"] is None and b == "1-10" and f == 2010
    assert _timeline(a, f, b) == [], "boring fixture anchor must have a bootstrapped destiny"
    trends = Counter()
    traction = []
    for ts in MONTHS:
        r = _row_for(a, zi, ts)
        assert r["FUNDING_STATUS"] == "Bootstrapped"
        assert all(r[c] is None for c in ALL_NULLABLES)
        assert r["TOTAL_RAISED_USD"] == 0 and r["FUNDING_ROUNDS_COUNT"] == 0
        assert r["RECENTLY_FUNDED_FLAG"] is False
        assert 1 <= r["HEADCOUNT"] <= 10
        assert abs(r["ENG_HEADCOUNT_PCT"] - 10) <= 15
        assert abs(r["SALES_HEADCOUNT_PCT"] - 25) <= 15
        assert abs(r["OPS_HEADCOUNT_PCT"] - 50) <= 15
        assert 0 <= r["OPEN_JOB_POSTINGS"] <= 1
        trends[r["POSTINGS_TREND"]] += 1
        assert 0 <= r["TRACTION_SCORE"] <= 60
        traction.append(r["TRACTION_SCORE"])
    assert trends["Frozen"] + trends["Steady"] >= 0.75 * len(MONTHS)
    # Rowspec: ~25-35 most months (40 base, -15 Frozen, ~0 growth at a band
    # edge); a single opening (Accelerating / Steady) lifts it for a month.
    assert sum(25 <= t <= 35 for t in traction) > len(MONTHS) / 2, traction
