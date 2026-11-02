"""L1 tests for the Plan 16 SP entry point (Task 4): main / hard-dependency
probes / backfill month list / audience binding / staging frame / MERGE SQL /
coverage, driven by an in-memory fake Snowpark session.

The fake session routes each SQL string by a distinctive substring and
records every statement, so the tests can assert both the result and the
order of side effects (no write before the dependency probes pass; the
TASK_EXECUTION_LOG row is written on success and on failure).
"""
from __future__ import annotations

import re
from datetime import date, datetime

import pandas as pd
import pytest

import sp_generate_harmonic_company_signals as sp
from tests.conftest import HARMONIC_FIXTURE, zi_const


# ---------------------------------------------------------------------------
# Fake Snowpark session
# ---------------------------------------------------------------------------

class _Result:
    def __init__(self, rows):
        self._rows = rows

    def collect(self):
        return self._rows


class FakeSession:
    """Routes SQL by substring. `anchors_by_month` maps a first-of-month date
    to the audience anchor dicts for that month; `zi_by_account` maps an
    ACCOUNT_ID to its {month: {EMPLOYEE_BAND, FOUNDED_YEAR}} dict."""

    def __init__(self, anchors_by_month, zi_by_account, *, tables=None,
                 moodys_rows=100, zi_months=None, merged=None):
        self.anchors_by_month = anchors_by_month
        self.zi_by_account = zi_by_account
        self.tables = set(tables if tables is not None
                          else ("ZOOMINFO_FIRMOGRAPHICS", "MOODYS_MARKET_CONTEXT"))
        self.moodys_rows = moodys_rows
        self.zi_months = set(zi_months if zi_months is not None else anchors_by_month)
        self.statements: list[tuple[str, object]] = []
        self.writes: list[dict] = []
        self.merged = merged          # rows "in the target" after MERGE, per month

    # -- Snowpark surface -------------------------------------------------
    def sql(self, query, params=None):
        self.statements.append((query, params))
        q = " ".join(query.split())
        if "INFORMATION_SCHEMA.TABLES" in q:
            return _Result([(t,) for t in sorted(self.tables)])
        if q.startswith("SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT"):
            return _Result([(self.moodys_rows,)])
        if "GROUP BY PROFILE_MONTH" in q and "ZOOMINFO_FIRMOGRAPHICS" in q:
            asked = [date.fromisoformat(d) for d in re.findall(r"TO_DATE\('(\d{4}-\d{2}-\d{2})'\)", q)]
            return _Result([(m, 1) for m in asked if m in self.zi_months])
        if q.startswith("SELECT anc.ORG_ID"):
            m = self._month_of(q)
            return _Result([dict(a) for a in self.anchors_by_month.get(m, [])])
        if q.startswith("SELECT z.ACCOUNT_ID, z.PROFILE_MONTH"):
            lo, hi = [date.fromisoformat(d) for d in
                      re.findall(r"BETWEEN TO_DATE\('(\d{4}-\d{2}-\d{2})'\) AND TO_DATE\('(\d{4}-\d{2}-\d{2})'\)", q)[0]]
            out = []
            for acct, zi in self.zi_by_account.items():
                for m, row in zi.items():
                    if lo <= m <= hi:
                        out.append({"ACCOUNT_ID": acct, "PROFILE_MONTH": m, **row})
            return _Result(out)
        if q.startswith("MERGE INTO"):
            n = len(self.writes[-1]["df"]) if self.writes else 0
            return _Result([(n, 0)])
        if q.startswith("SELECT COUNT(DISTINCT ACCOUNT_ID) FROM (") :
            m = self._month_of(q)
            return _Result([(len(self.anchors_by_month.get(m, [])),)])
        if q.startswith("SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS"):
            m = self._month_of(q)
            if self.merged is not None:
                return _Result([(self.merged.get(m, 0),)])
            df = self.writes[-1]["df"] if self.writes else pd.DataFrame()
            if df.empty:
                return _Result([(0,)])
            pm = pd.to_datetime(df["PROFILE_MONTH"]).dt.date
            return _Result([(df.loc[pm == m, "ACCOUNT_ID"].nunique(),)])
        if q.startswith("INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG"):
            return _Result([])
        raise AssertionError(f"unrouted SQL: {q[:160]}")

    def write_pandas(self, df, table_name, **kw):
        self.writes.append({"df": df.copy(), "table": table_name, **kw})

    # -- helpers ----------------------------------------------------------
    @staticmethod
    def _month_of(q):
        found = re.findall(r"TO_DATE\('(\d{4}-\d{2}-\d{2})'\)", q)
        assert found, q[:200]
        return date.fromisoformat(found[0])

    def log_rows(self):
        return [p for s, p in self.statements if "TASK_EXECUTION_LOG" in s]


def _months(end: date, n: int) -> list[date]:
    out = []
    for i in range(n, -1, -1):
        idx = end.year * 12 + end.month - 1 - i
        out.append(date(idx // 12, idx % 12 + 1, 1))
    return out


@pytest.fixture
def world():
    """Every fixture anchor in the audience for 2026-05 .. 2026-11, ZoomInfo
    history 2026-05 .. 2026-11 only (older months fall back to M's band)."""
    months = _months(date(2026, 11, 1), 6)
    anchors = [a for a, _b, _f in HARMONIC_FIXTURE]
    zi = {a["ACCOUNT_ID"]: zi_const(b, f, start=months[0], end=months[-1])
          for a, b, f in HARMONIC_FIXTURE}
    return months, {m: anchors for m in months}, zi


RUN_TS = datetime(2026, 11, 2, 9, 0, 5)


# ---------------------------------------------------------------------------
# Month list (BACKFILL_MONTHS)
# ---------------------------------------------------------------------------

def test_target_months_default_is_current_month_only():
    assert sp._target_months(RUN_TS, 0) == [date(2026, 11, 1)]
    assert sp._target_months(RUN_TS, None) == [date(2026, 11, 1)]


def test_target_months_backfill_ascending():
    assert sp._target_months(RUN_TS, 6) == _months(date(2026, 11, 1), 6)


def test_target_months_crosses_year_boundary():
    assert sp._target_months(datetime(2027, 2, 1), 3) == [
        date(2026, 11, 1), date(2026, 12, 1), date(2027, 1, 1), date(2027, 2, 1)]


@pytest.mark.parametrize("bad", [-1, sp._MAX_BACKFILL_MONTHS + 1])
def test_target_months_rejects_out_of_range(bad):
    with pytest.raises(ValueError, match="BACKFILL_MONTHS"):
        sp._target_months(RUN_TS, bad)


# ---------------------------------------------------------------------------
# Audience binding + coverage SQL
# ---------------------------------------------------------------------------

def test_audience_sql_for_binds_month_literal_and_keeps_section_2_text():
    sql = sp._audience_sql_for(date(2026, 11, 1))
    assert ":month" not in sql
    assert "z.PROFILE_MONTH = TO_DATE('2026-11-01')" in sql
    assert sql == sp.AUDIENCE_SQL.replace(":month", "TO_DATE('2026-11-01')")


def test_coverage_sql_is_section_2_audience_vs_same_month_rows():
    expected, actual = sp._coverage_sql(date(2026, 11, 1))
    assert expected.startswith("SELECT COUNT(DISTINCT ACCOUNT_ID) FROM (")
    assert sp._audience_sql_for(date(2026, 11, 1)) in expected
    assert actual == (f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {sp.TABLE} "
                      "WHERE PROFILE_MONTH = TO_DATE('2026-11-01')")


def test_only_coverage_reads_the_target_table():
    """The row factory never reads HARMONIC_COMPANY_SIGNALS (stateless
    recomputation). The single post-MERGE COUNT in _coverage_sql is the only
    statement that names the table after FROM."""
    import inspect
    src = inspect.getsource(sp)
    hits = [m.start() for m in re.finditer(r"FROM \{TABLE\}", src)]
    cov = inspect.getsource(sp._coverage_sql)
    assert len(hits) == 1 and "FROM {TABLE}" in cov


# ---------------------------------------------------------------------------
# Hard-dependency probes (fail fast)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("missing", ["ZOOMINFO_FIRMOGRAPHICS", "MOODYS_MARKET_CONTEXT"])
def test_missing_dependency_table_raises(world, missing):
    months, anchors, zi = world
    s = FakeSession(anchors, zi, tables={"ZOOMINFO_FIRMOGRAPHICS", "MOODYS_MARKET_CONTEXT"} - {missing})
    with pytest.raises(RuntimeError, match=f"hard dependency missing: .*{missing}"):
        sp._check_dependencies(s, months)


def test_empty_moodys_raises(world):
    months, anchors, zi = world
    s = FakeSession(anchors, zi, moodys_rows=0)
    with pytest.raises(RuntimeError, match="MOODYS_MARKET_CONTEXT has no rows"):
        sp._check_dependencies(s, months)


def test_missing_zoominfo_run_month_raises(world):
    months, anchors, zi = world
    s = FakeSession(anchors, zi, zi_months=months[:-1])
    with pytest.raises(RuntimeError, match=r"ZOOMINFO_FIRMOGRAPHICS has no rows for PROFILE_MONTH 2026-11-01"):
        sp._check_dependencies(s, months)


def test_missing_zoominfo_backfill_month_raises(world):
    months, anchors, zi = world
    s = FakeSession(anchors, zi, zi_months=months[1:])
    with pytest.raises(RuntimeError, match="2026-05-01"):
        sp._check_dependencies(s, months)


def test_dependencies_ok(world):
    months, anchors, zi = world
    sp._check_dependencies(FakeSession(anchors, zi), months)


# ---------------------------------------------------------------------------
# main(): end to end on the fake session
# ---------------------------------------------------------------------------

def test_main_current_month(world, monkeypatch):
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s = FakeSession(anchors, zi)
    out = sp.main(s)
    assert "SUCCEEDED" in out
    assert len(s.writes) == 1
    df = s.writes[0]["df"]
    assert len(df) == len(HARMONIC_FIXTURE)
    assert set(pd.to_datetime(df["PROFILE_MONTH"]).dt.date) == {date(2026, 11, 1)}
    assert list(df.columns) == ["ORG_ID", "RECORD_ID", *sp.DATA_COLUMNS]
    w = s.writes[0]
    assert w["table"] == "HARMONIC_COMPANY_SIGNALS_STAGING"
    assert (w["database"], w["schema"]) == ("DATA_JEDAIS", "FINS__PUBLIC")
    (log,) = s.log_rows()
    assert log[1] == sp.TASK_NAME and log[3] == "SUCCEEDED"
    assert log[4] == len(HARMONIC_FIXTURE) and log[5] == len(HARMONIC_FIXTURE)


def test_main_backfill_matches_row_factory(world, monkeypatch):
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s = FakeSession(anchors, zi)
    sp.main(s, 6)
    df = s.writes[0]["df"]
    assert len(df) == 7 * len(HARMONIC_FIXTURE)
    assert sorted(set(pd.to_datetime(df["PROFILE_MONTH"]).dt.date)) == months
    # Each staged row equals _with_ids(_row_for(...)) for its month.
    first = df.iloc[0]
    a = next(x for x, _b, _f in HARMONIC_FIXTURE if x["ACCOUNT_ID"] == first["ACCOUNT_ID"])
    m = pd.Timestamp(first["PROFILE_MONTH"]).date()
    exp = sp._with_ids(sp._row_for(a, zi[a["ACCOUNT_ID"]], datetime(m.year, m.month, 1)), a["ORG_ID"])
    assert first["RECORD_ID"] == exp["RECORD_ID"]
    assert first["TOTAL_RAISED_USD"] == exp["TOTAL_RAISED_USD"]
    assert first["HEADCOUNT"] == exp["HEADCOUNT"]
    # Coverage is asserted once per month.
    cov = [q for q, _p in s.statements if q.startswith("SELECT COUNT(DISTINCT ACCOUNT_ID) FROM (")]
    assert len(cov) == 7


def test_main_backfill_row_equals_standalone_row(world, monkeypatch):
    """A month built inside a backfill is identical to that month built alone."""
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s6 = FakeSession(anchors, zi)
    sp.main(s6, 6)
    s0 = FakeSession(anchors, zi)
    sp.main(s0, 0)
    d6 = s6.writes[0]["df"]
    d6 = d6[pd.to_datetime(d6["PROFILE_MONTH"]).dt.date == date(2026, 11, 1)].reset_index(drop=True)
    d0 = s0.writes[0]["df"].reset_index(drop=True)
    pd.testing.assert_frame_equal(d6.sort_values("ACCOUNT_ID").reset_index(drop=True),
                                  d0.sort_values("ACCOUNT_ID").reset_index(drop=True))


def test_main_fails_fast_before_any_write(world, monkeypatch):
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s = FakeSession(anchors, zi, zi_months=[])
    with pytest.raises(RuntimeError, match="ZOOMINFO_FIRMOGRAPHICS has no rows"):
        sp.main(s)
    assert s.writes == []
    assert not any(q.startswith("MERGE") for q, _p in s.statements)
    (log,) = s.log_rows()
    assert log[3] == "FAILED" and "ZOOMINFO_FIRMOGRAPHICS has no rows" in log[6]


def test_main_empty_audience_month_raises(world, monkeypatch):
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s = FakeSession({m: [] for m in months}, zi)
    with pytest.raises(RuntimeError, match="empty audience"):
        sp.main(s)
    assert s.writes == []


def test_main_row_failure_fails_the_run(world, monkeypatch):
    """No silent per-row tolerance: one failing row would be a coverage gap."""
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    zi = dict(zi)
    victim = HARMONIC_FIXTURE[0][0]["ACCOUNT_ID"]
    zi[victim] = {}
    s = FakeSession(anchors, zi)
    with pytest.raises(RuntimeError, match="row factory failed"):
        sp.main(s)
    assert s.writes == []


def test_main_coverage_gap_raises(world, monkeypatch):
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s = FakeSession(anchors, zi, merged={date(2026, 11, 1): len(HARMONIC_FIXTURE) - 1})
    with pytest.raises(RuntimeError, match="coverage gap: 1 missing rows"):
        sp.main(s)
    assert s.log_rows()[0][3] == "FAILED"


def test_zoominfo_history_window_covers_m_minus_9(world, monkeypatch):
    months, anchors, zi = world
    monkeypatch.setattr(sp, "_utcnow", lambda: RUN_TS)
    s = FakeSession(anchors, zi)
    sp.main(s, 6)
    (q,) = [q for q, _p in s.statements if q.lstrip().startswith("SELECT z.ACCOUNT_ID, z.PROFILE_MONTH")]
    assert "BETWEEN TO_DATE('2025-08-01') AND TO_DATE('2026-11-01')" in " ".join(q.split())


# ---------------------------------------------------------------------------
# Staging frame + MERGE SQL (write-path gotchas)
# ---------------------------------------------------------------------------

def _records(world, n_months=6):
    months, anchors, zi = world
    out = []
    for m in months[-(n_months + 1):]:
        for a, _b, _f in HARMONIC_FIXTURE:
            out.append(sp._with_ids(sp._row_for(a, zi[a["ACCOUNT_ID"]], datetime(m.year, m.month, 1)),
                                    a["ORG_ID"]))
    return out


def test_staging_frame_dtypes(world):
    df = sp._staging_frame(_records(world))
    for col in ("PROFILE_MONTH", "LAST_FUNDING_DATE", "LAST_DATA_REFRESH_DATE", "GENERATED_AT"):
        assert str(df[col].dtype) == "datetime64[ns]", col
    for col in ("LAST_ROUND_USD", "EST_VALUATION_USD", "EST_RUNWAY_MONTHS"):
        assert str(df[col].dtype) == "Int64", col
    assert df["RECENTLY_FUNDED_FLAG"].dtype == bool
    assert list(df.columns) == ["ORG_ID", "RECORD_ID", *sp.DATA_COLUMNS]


def test_staging_frame_all_null_batch(world):
    """A batch with no funded account (all funding NULLables None) still gets
    typed columns: this is the write_pandas all-NULL mistype case."""
    recs = [r for r in _records(world) if r["FUNDING_STATUS"] == "Bootstrapped"]
    assert recs
    df = sp._staging_frame(recs)
    assert df["LAST_FUNDING_DATE"].isna().all()
    assert str(df["LAST_FUNDING_DATE"].dtype) == "datetime64[ns]"
    assert str(df["LAST_ROUND_USD"].dtype) == "Int64"
    assert str(df["LEAD_INVESTOR"].dtype) in ("string", "str")


def test_staging_frame_ns_epoch_roundtrip(world):
    """The MERGE divides the staged NUMBER by 1e9: values must be ns since epoch."""
    df = sp._staging_frame(_records(world, 0))
    ns = df["PROFILE_MONTH"].astype("int64").iloc[0]
    assert datetime.utcfromtimestamp(ns / 1_000_000_000).date() == date(2026, 11, 1)


def test_merge_sql_casts_and_keys():
    q = " ".join(sp._merge_sql("HARMONIC_COMPANY_SIGNALS_STAGING").split())
    assert q.startswith(f"MERGE INTO {sp.TABLE} tgt")
    assert "RECENTLY_FUNDED_FLAG::BOOLEAN AS RECENTLY_FUNDED_FLAG" in q
    assert "TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT" in q
    for col in ("PROFILE_MONTH", "LAST_FUNDING_DATE", "LAST_DATA_REFRESH_DATE"):
        assert f"TO_DATE(TO_TIMESTAMP_NTZ({col}::NUMBER / 1000000000)) AS {col}" in q
    assert ("ON tgt.ORG_ID = src.ORG_ID AND tgt.ACCOUNT_ID = src.ACCOUNT_ID "
            "AND tgt.PROFILE_MONTH = src.PROFILE_MONTH") in q
    assert "FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_STAGING" in q
    assert "NOT MATCHED BY SOURCE" not in q
    upd = q.split("WHEN MATCHED THEN UPDATE SET")[1].split("WHEN NOT MATCHED")[0]
    ins = q.split("WHEN NOT MATCHED THEN INSERT")[1]
    assert "RECORD_ID = src.RECORD_ID" in upd
    for col in sp.DATA_COLUMNS:
        if col not in ("ACCOUNT_ID", "PROFILE_MONTH"):
            assert f"{col} = src.{col}" in upd, col
    for col in ("ORG_ID", "RECORD_ID", *sp.DATA_COLUMNS):
        assert f"src.{col}" in ins, col
