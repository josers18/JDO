"""L1 tests for the Plan 14 SP write path (Task 4), against an in-memory
fake Snowpark session. No Snowflake connection needed.

Covers: BACKFILL_WEEKS week list (ascending, Monday, bounds), per-week
DELETE + INSERT inside one transaction (write_pandas before BEGIN), casts,
RECORD_ID stamping (pinned to a live Snowflake SHA2 result), Gong soft-dep
(absent / probe error / duplicate rows), PK guard, coverage, run log, and
the backfill == standalone trajectory proof plus a timing budget.
"""
import re
import time
from datetime import date, datetime, timedelta

import pytest

import sp_generate_demandbase_intent_signals as mod
from sp_generate_demandbase_intent_signals import (
    COVERAGE_SQL,
    GONG_PROBE_SQL,
    INSERT_FROM_STAGING_SQL,
    MAX_BACKFILL_WEEKS,
    STAGE_COLUMNS,
    _base_affinity,
    _build_week_rows,
    _epoch_ns,
    _rows_for,
    _score_for,
    _target_weeks,
    gong_flags_sql,
    record_id_for,
)

_WEEK_RE = re.compile(r"PROFILE_WEEK = '(\d{4}-\d{2}-\d{2})'")
_UNIX = datetime(1970, 1, 1)


class FakeSession:
    """Just enough of snowpark.Session for main(): sql().collect(),
    write_pandas, and an in-memory target table keyed by PROFILE_WEEK."""

    def __init__(self, anchors, gong_present=True, gong_rows=None,
                 probe_raises=False, fail_insert=False):
        self.anchors = anchors
        self.gong_present = gong_present
        self.gong_rows = gong_rows or {}      # {date: [(acct, flags), ...]}
        self.probe_raises = probe_raises
        self.fail_insert = fail_insert
        self.events = []                      # ordered statement log
        self.staging = []
        self.table = []
        self.logs = []
        self._txn = None

    # snowpark API --------------------------------------------------
    def write_pandas(self, df, table_name, **kw):
        assert self._txn is None, "write_pandas (DDL) must not run inside a transaction"
        self.events.append(("write_pandas", table_name))
        # pandas may surface None as NaN in string columns; write_pandas
        # sends both as NULL, so normalize back to None here.
        self.staging = [{k: (None if isinstance(v, float) and v != v else v)
                         for k, v in r.items()} for r in df.to_dict("records")]
        return None

    def sql(self, query, params=None):
        return _Result(self, query, params)

    # dispatch ------------------------------------------------------
    def run(self, q, params):
        s = " ".join(q.split())
        self.events.append(("sql", s[:60]))
        if s == "BEGIN":
            self._txn = list(self.table)
            return []
        if s == "COMMIT":
            self._txn = None
            return []
        if s == "ROLLBACK":
            self.table, self._txn = self._txn, None
            return []
        if q == GONG_PROBE_SQL:
            if self.probe_raises:
                raise RuntimeError("probe boom")
            return [(1 if self.gong_present else 0,)]
        if "FROM DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT" in s:
            wk = date.fromisoformat(_WEEK_RE.search(s).group(1))
            return list(self.gong_rows.get(wk, []))
        if q == mod.AUDIENCE_SQL:
            return [dict(a) for a in self.anchors]
        if q == COVERAGE_SQL:
            return [(len({a["ACCOUNT_ID"] for a in self.anchors}),)]
        if s.startswith("DELETE FROM"):
            assert self._txn is not None, "DELETE outside transaction"
            wk = date.fromisoformat(_WEEK_RE.search(s).group(1))
            self.table = [r for r in self.table if r["PROFILE_WEEK"] != wk]
            return [(0,)]
        if s.startswith("INSERT INTO DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS"):
            assert self._txn is not None, "INSERT outside transaction"
            if self.fail_insert:
                raise RuntimeError("insert boom")
            for r in self.staging:
                row = dict(r)
                row["PROFILE_WEEK"] = (_UNIX + timedelta(microseconds=r["PROFILE_WEEK"] // 1000)).date()
                row["LAST_SIGNAL_DATE"] = (_UNIX + timedelta(microseconds=r["LAST_SIGNAL_DATE"] // 1000)).date()
                row["GENERATED_AT"] = _UNIX + timedelta(microseconds=r["GENERATED_AT"] // 1000)
                self.table.append(row)
            return [(len(self.staging),)]
        if s.startswith("SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS"):
            wk = date.fromisoformat(_WEEK_RE.search(s).group(1))
            return [(len({r["ACCOUNT_ID"] for r in self.table if r["PROFILE_WEEK"] == wk}),)]
        if s.startswith("INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG"):
            self.logs.append(params)
            return []
        raise AssertionError(f"unexpected SQL: {s[:120]}")


class _Result:
    def __init__(self, session, q, params):
        self.session, self.q, self.params = session, q, params

    def collect(self):
        return self.session.run(self.q, self.params)


def _current_monday():
    return mod._week_start(datetime.utcnow()).date()


# ---------- week list ----------

def test_target_weeks_zero_is_current_week_only():
    started = datetime(2026, 11, 4, 8, 15)
    assert _target_weeks(started, 0) == [datetime(2026, 11, 2)]
    assert _target_weeks(started, None) == [datetime(2026, 11, 2)]


def test_target_weeks_backfill_ascending_mondays():
    weeks = _target_weeks(datetime(2026, 11, 2, 3, 15), 25)
    assert len(weeks) == 26
    assert weeks == sorted(weeks)
    assert weeks[-1] == datetime(2026, 11, 2)
    assert weeks[0] == datetime(2026, 11, 2) - timedelta(weeks=25)
    assert all(w.weekday() == 0 and w.hour == 0 for w in weeks)


@pytest.mark.parametrize("bad", [-1, MAX_BACKFILL_WEEKS + 1])
def test_target_weeks_rejects_out_of_range(bad):
    with pytest.raises(ValueError):
        _target_weeks(datetime(2026, 11, 2), bad)


# ---------- encoding / ids / casts ----------

def test_epoch_ns_matches_snowflake_cast():
    # Live check 2026-11-02: TO_TIMESTAMP_NTZ(1793577600000000000::NUMBER / 1e9)
    # = 2026-11-02T00:00:00, TO_DATE(...) = 2026-11-02.
    assert _epoch_ns(date(2026, 11, 2)) == 1793577600000000000
    assert _epoch_ns(datetime(2026, 11, 2)) == 1793577600000000000
    assert _epoch_ns(datetime(1970, 1, 1, 0, 0, 1, 5)) == 1_000_005_000


def test_record_id_matches_snowflake_sql_form():
    # Live: REGEXP_REPLACE(LEFT(SHA2(CONCAT_WS('|','JDO','001am00000qvjs6AAA',
    #   '2026-11-02'::DATE,'International Payments and FX','record_id'),256),32), ...)
    assert record_id_for("JDO", "001am00000qvjs6AAA", date(2026, 11, 2),
                         "International Payments and FX") == "0e4d3586-78cf-4d35-2237-40541ec0473b"


def test_insert_sql_column_list_and_casts():
    cols = re.search(r"INSERT INTO \S+ \((.*?)\)", " ".join(INSERT_FROM_STAGING_SQL.split())).group(1)
    assert tuple(c.strip() for c in cols.split(",")) == STAGE_COLUMNS
    assert len(STAGE_COLUMNS) == 19
    assert "IS_TOP_TOPIC::BOOLEAN" in INSERT_FROM_STAGING_SQL
    assert "SURGE_FLAG::BOOLEAN" in INSERT_FROM_STAGING_SQL
    for c in ("PROFILE_WEEK", "LAST_SIGNAL_DATE"):
        assert f"TO_DATE(TO_TIMESTAMP_NTZ({c}::NUMBER / 1000000000))" in INSERT_FROM_STAGING_SQL
    assert "TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)" in INSERT_FROM_STAGING_SQL
    assert "&" not in INSERT_FROM_STAGING_SQL


def test_stage_columns_are_data_columns_plus_ids():
    assert set(STAGE_COLUMNS) == set(mod.EXPECTED_OUTPUT_COLUMNS) | {"ORG_ID", "RECORD_ID"}


# ---------- main(): happy path ----------

def test_main_current_week(in_audience_anchors):
    s = FakeSession(in_audience_anchors, gong_present=False)
    out = mod.main(s, 0)
    wk = _current_monday()
    assert "SUCCEEDED" in out and "weeks=1" in out
    assert {r["PROFILE_WEEK"] for r in s.table} == {wk}
    assert len({r["ACCOUNT_ID"] for r in s.table}) == 12
    assert sum(r["IS_TOP_TOPIC"] for r in s.table) == 12
    assert len({r["RECORD_ID"] for r in s.table}) == len(s.table)
    assert all(r["ORG_ID"] == "JDO" for r in s.table)
    for r in s.table:
        assert r["RECORD_ID"] == record_id_for("JDO", r["ACCOUNT_ID"], r["PROFILE_WEEK"], r["INTENT_TOPIC"])
    (log,) = s.logs
    assert log[1] == "TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS" and log[3] == "SUCCEEDED"
    assert log[4] == len(s.table) and log[5] == 12
    assert "gong=absent(skipped)" in log[6]


def test_main_transaction_order_per_week(in_audience_anchors):
    s = FakeSession(in_audience_anchors, gong_present=False)
    mod.main(s, 4)
    kinds = [e[1] if e[0] == "write_pandas" else e[1].split(" ")[0] for e in s.events
             if e[0] == "write_pandas" or e[1].split(" ")[0] in ("BEGIN", "DELETE", "INSERT", "COMMIT")]
    # 5 weeks x (stage, BEGIN, DELETE, INSERT, COMMIT) + final log INSERT
    assert kinds[:-1] == ["DEMANDBASE_INTENT_SIGNALS_STAGING", "BEGIN", "DELETE", "INSERT", "COMMIT"] * 5
    deleted = [_WEEK_RE.search(e[1] + "'") for e in s.events if e[1].startswith("DELETE")]
    assert len(deleted) == 5
    assert len({r["PROFILE_WEEK"] for r in s.table}) == 5


def test_main_rerun_is_idempotent(in_audience_anchors):
    s = FakeSession(in_audience_anchors, gong_present=False)
    mod.main(s, 2)
    first = sorted((r["RECORD_ID"], tuple(sorted(r.items()))) for r in s.table)
    mod.main(s, 2)
    assert sorted((r["RECORD_ID"], tuple(sorted(r.items()))) for r in s.table) == first


def test_week_rewrite_drops_stale_topics(in_audience_anchors):
    """A topic present from an earlier run but absent now is deleted for that week only."""
    s = FakeSession(in_audience_anchors, gong_present=False)
    mod.main(s, 1)
    wk = _current_monday()
    stale = dict(s.table[0], INTENT_TOPIC="Stale Topic", RECORD_ID="stale")
    other_week = dict(s.table[0], PROFILE_WEEK=wk - timedelta(weeks=30), RECORD_ID="keep")
    s.table += [dict(stale, PROFILE_WEEK=wk), other_week]
    mod.main(s, 0)
    ids = {r["RECORD_ID"] for r in s.table}
    assert "stale" not in ids and "keep" in ids


def test_insert_failure_rolls_back_and_logs_failed(in_audience_anchors):
    s = FakeSession(in_audience_anchors, gong_present=False)
    mod.main(s, 0)
    before = list(s.table)
    s.fail_insert = True
    with pytest.raises(RuntimeError, match="insert boom"):
        mod.main(s, 0)
    assert s.table == before            # DELETE rolled back
    assert s.logs[-1][3] == "FAILED"


# ---------- Gong soft-dep ----------

def test_gong_absent_and_probe_error_skip_bias(in_audience_anchors):
    for kw in ({"gong_present": False}, {"probe_raises": True}):
        s = FakeSession(in_audience_anchors, **kw)
        mod.main(s, 0)
        assert "gong=absent(skipped)" in s.logs[-1][6]
        assert not any("GONG_CALL_SENTIMENT WHERE" in e[1] for e in s.events)


def test_gong_duplicate_rows_do_not_duplicate_pk(in_audience_anchors):
    wk = _current_monday()
    acct = in_audience_anchors[0]["ACCOUNT_ID"]
    rows = [(acct, "Competitor"), (acct, "Pricing|Renewal"),
            (in_audience_anchors[1]["ACCOUNT_ID"], "Pricing"), ("001NOTINAUDIENCE", "Competitor")]
    s = FakeSession(in_audience_anchors, gong_rows={wk: rows})
    mod.main(s, 0)
    keys = [(r["ORG_ID"], r["ACCOUNT_ID"], r["PROFILE_WEEK"], r["INTENT_TOPIC"]) for r in s.table]
    assert len(keys) == len(set(keys))
    summary = s.logs[-1][6]
    assert f"{wk.isoformat()}:rows={len(s.table)},gong_rows_joined=2,gong_competitor_accounts=1" in summary
    assert "WARN" not in summary


def test_gong_present_but_empty_week_warns(in_audience_anchors):
    s = FakeSession(in_audience_anchors, gong_rows={})
    mod.main(s, 0)
    assert "WARN gong present but gong_rows_joined=0" in s.logs[-1][6]


def test_gong_flags_reach_row_factory(in_audience_anchors):
    """The flags a week reads are exactly what _rows_for receives."""
    wk = _current_monday()
    flagged = {a["ACCOUNT_ID"] for a in in_audience_anchors[:6]}
    s = FakeSession(in_audience_anchors, gong_rows={wk: [(a, "Competitor") for a in flagged]})
    mod.main(s, 0)
    run = datetime.combine(wk, datetime.min.time())
    expected = []
    for a in in_audience_anchors:
        expected += _rows_for(a, run, "Competitor" if a["ACCOUNT_ID"] in flagged else None)
    got = {(r["ACCOUNT_ID"], r["INTENT_TOPIC"]): r["RESEARCHING_COMPETITOR"] for r in s.table}
    assert got == {(r["ACCOUNT_ID"], r["INTENT_TOPIC"]): r["RESEARCHING_COMPETITOR"] for r in expected}


def test_gong_sql_targets_the_requested_week():
    assert "PROFILE_WEEK = '2026-09-28'" in gong_flags_sql(date(2026, 9, 28))


# ---------- guards ----------

def test_duplicate_audience_rows_fail_pk_guard(in_audience_anchors):
    s = FakeSession(in_audience_anchors + [dict(in_audience_anchors[0])], gong_present=False)
    with pytest.raises(ValueError, match="duplicate"):
        mod.main(s, 0)
    assert s.logs[-1][3] == "FAILED"
    assert not s.table   # nothing written


def test_coverage_gap_raises(in_audience_anchors):
    """An anchor whose row factory fails leaves a coverage gap -> FAILED."""
    bad = dict(in_audience_anchors[0], ACCOUNT_TYPE_FLAG="PERSON", ACCOUNT_ID="001BADBAD")
    s = FakeSession(in_audience_anchors + [bad], gong_present=False)
    with pytest.raises(RuntimeError, match="coverage gap"):
        mod.main(s, 0)


# ---------- trajectory proof + timing ----------

def test_backfill_week_equals_standalone_week(in_audience_anchors):
    """Plan 14 Task 5 core proof, at L1: week-W rows from a 5-week backfill are
    identical to a standalone week-W run (same GENERATED_AT too: week-bucketed)."""
    weeks = _target_weeks(datetime(2026, 11, 2, 3, 15), 4)
    back, _, _ = _build_week_rows(in_audience_anchors, weeks, None)
    for w in weeks:
        solo, _, _ = _build_week_rows(in_audience_anchors, [w], None)
        assert back[w] == solo[w]


def test_memo_cache_keys_on_anchor_attributes():
    """Same ACCOUNT_ID with a different INDUSTRY must not hit a stale cache entry."""
    a = {"ACCOUNT_ID": "001MEMO000001", "ACCOUNT_TYPE_FLAG": "BUSINESS",
         "CLIENT_CATEGORY": "Small Business", "INDUSTRY": "Restaurant",
         "ANNUAL_REVENUE": 700_000, "EMPLOYEE_COUNT": 5}
    b = dict(a, INDUSTRY="Real Estate")
    t = "Merchant Services"
    ra, rb = _base_affinity(a, t, 2026), _base_affinity(b, t, 2026)
    assert ra == pytest.approx(rb * 3.0)     # Restaurant x3.0, Real Estate x1.0
    wk = datetime(2026, 11, 2)
    mod._score_k.cache_clear()
    s1 = [_score_for(b, t, wk - timedelta(weeks=n)) for n in range(13)]
    mod._score_k.cache_clear()
    _ = [_score_for(a, t, wk - timedelta(weeks=n)) for n in range(13)]
    s2 = [_score_for(b, t, wk - timedelta(weeks=n)) for n in range(13)]
    assert s1 == s2


def test_backfill_timing_budget():
    """26-week backfill timing check (rowspec: ~22M seeds). 100 synthetic
    anchors x 26 weeks must build well inside budget; locally ~0.2 ms per
    anchor-week with the _score_k memo (~0.5 ms without), i.e. ~34 s for the
    6,435-anchor x 26-week backfill."""
    inds = list(mod._INDUSTRY_AFFINITY) + [None]
    anchors = [{"ACCOUNT_ID": f"001TIMING{i:06d}", "ACCOUNT_TYPE_FLAG": "BUSINESS",
                "CLIENT_CATEGORY": "Small Business", "INDUSTRY": inds[i % len(inds)],
                "ANNUAL_REVENUE": [500_000, 25_000_000, None][i % 3],
                "EMPLOYEE_COUNT": [5, 60, 800][i % 3]} for i in range(100)]
    weeks = _target_weeks(datetime(2026, 11, 2), 25)
    mod._score_k.cache_clear()
    t0 = time.perf_counter()
    by_week, errors, _ = _build_week_rows(anchors, weeks, None)
    elapsed = time.perf_counter() - t0
    assert not errors
    assert all(len({r["ACCOUNT_ID"] for r in by_week[w]}) == 100 for w in weeks)
    # Most of the saving is the year-stable affinity kernel: the top-topic
    # pick and every score of the week re-read the same 10 (account, topic,
    # year) affinities. Score hits come from W-1 deltas and surge lookbacks.
    aff = mod._base_affinity_k.cache_info()
    assert aff.hits > 10 * aff.misses, aff
    assert mod._score_k.cache_info().hits > 0
    assert elapsed / (100 * 26) < 0.005, f"{elapsed:.2f}s for 2,600 anchor-weeks"
