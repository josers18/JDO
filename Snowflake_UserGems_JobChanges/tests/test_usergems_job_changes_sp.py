"""L1 tests for the SP-side helpers of SP_GENERATE_USERGEMS_JOB_CHANGES
(Plan 15 Task 4): the run window, the multi-week generator, the MERGE frame
and SQL, the event contract (checks a-d) and the deploy-script build.

Live behaviour (write_pandas typing, MERGE casts, RECORD_ID SQL form, the
contract SQL) is covered by L2: tests/integration/test_usergems_job_changes_sp.sql.
"""
from datetime import date, datetime, timedelta

import pytest

from tests.conftest import BORING_ANCHOR, EMPLOYERS, make_boardex, months_between
from sp_generate_usergems_job_changes import (
    EXPECTED_OUTPUT_COLUMNS,
    MERGE_COLUMNS,
    Ctx,
    _assert_event_contract,
    _boardex_coverage_violations,
    _boardex_dict_from_rows,
    _load_boardex,
    _boardex_month_span,
    _boardex_months_for_week,
    _complete_weeks,
    _csuite_gate_violations,
    _events_for,
    _merge_counts,
    _merge_frame,
    _merge_sql,
    _record_id_for,
    _rows_for_week,
    _rows_for_window,
    _run_weeks,
    _shift_months,
    _week_band_violations,
)

RUN_TS = datetime(2026, 11, 2, 9, 0)          # a Monday, task fire time
ALL_ANCHORS = EMPLOYERS + [BORING_ANCHOR]
HISTORY = months_between(date(2024, 6, 1), date(2026, 11, 1))


# -------------------------------------------------------------------
# Run window
# -------------------------------------------------------------------

def test_default_run_is_previous_complete_week_plus_current_partial():
    weeks = _run_weeks(RUN_TS.date(), 0)
    assert weeks == [date(2026, 10, 26), date(2026, 11, 2)]


def test_backfill_weeks_1_equals_default():
    assert _run_weeks(RUN_TS.date(), 1) == _run_weeks(RUN_TS.date(), 0)


def test_backfill_104_starts_2024_11_04():
    weeks = _run_weeks(RUN_TS.date(), 104)
    assert len(weeks) == 105
    assert weeks[0] == date(2024, 11, 4)
    assert weeks[-1] == date(2026, 11, 2)
    assert all((b - a).days == 7 for a, b in zip(weeks, weeks[1:]))


def test_run_weeks_midweek_anchor_on_monday():
    weeks = _run_weeks(date(2026, 11, 4), 0)       # Wednesday
    assert weeks == [date(2026, 10, 26), date(2026, 11, 2)]


@pytest.mark.parametrize("bad", [-1, None])
def test_run_weeks_rejects_negative_or_null(bad):
    with pytest.raises(ValueError):
        _run_weeks(RUN_TS.date(), bad)


def test_complete_weeks_excludes_current_partial():
    weeks = _run_weeks(RUN_TS.date(), 3)
    assert _complete_weeks(weeks, RUN_TS.date()) == weeks[:-1]
    # A Sunday run date completes its own week.
    sunday = date(2026, 11, 8)
    assert _complete_weeks([date(2026, 11, 2)], sunday) == [date(2026, 11, 2)]


def test_boardex_month_span_covers_every_week():
    weeks = _run_weeks(RUN_TS.date(), 104)
    lo, hi = _boardex_month_span(weeks)
    assert (lo, hi) == (date(2024, 7, 1), date(2026, 11, 1))
    for w in weeks:
        for m in _boardex_months_for_week(w):
            assert lo <= m <= hi


def test_boardex_month_span_default_run():
    lo, hi = _boardex_month_span(_run_weeks(RUN_TS.date(), 0))
    # week 2026-10-26 ends 11-01: candidates Aug..Nov, plus July
    assert (lo, hi) == (date(2026, 7, 1), date(2026, 11, 1))


# -------------------------------------------------------------------
# Multi-week generator == concatenation of single weeks
# -------------------------------------------------------------------

def _rises_boardex():
    true_cells = {
        (EMPLOYERS[0]["ACCOUNT_ID"], date(2025, 3, 1)),
        (EMPLOYERS[4]["ACCOUNT_ID"], date(2026, 8, 1)),
        (EMPLOYERS[9]["ACCOUNT_ID"], date(2024, 11, 1)),
        (EMPLOYERS[9]["ACCOUNT_ID"], date(2026, 10, 1)),
    }
    return make_boardex(ALL_ANCHORS, HISTORY, true_cells)


@pytest.mark.parametrize("backfill", [0, 6, 104])
def test_rows_for_window_equals_concatenated_weeks(ctx, backfill):
    boardex = _rises_boardex()
    weeks = _run_weeks(RUN_TS.date(), backfill)
    window = _rows_for_window(ALL_ANCHORS, weeks, RUN_TS, boardex, ctx)
    per_week = [r for w in weeks for r in _rows_for_week(ALL_ANCHORS, w, RUN_TS, boardex, ctx)]
    strip = lambda r: {k: v for k, v in r.items() if k != "ORG_ID"}   # noqa: E731
    key = lambda r: r["EVENT_ID"]                                       # noqa: E731
    assert sorted(map(strip, window), key=key) == sorted(per_week, key=key)


def test_rows_for_window_stamps_org_and_unique_ids(ctx):
    weeks = _run_weeks(RUN_TS.date(), 104)
    rows = _rows_for_window(ALL_ANCHORS, weeks, RUN_TS, _rises_boardex(), ctx)
    assert rows, "fixture should produce events over 104 weeks"
    assert {r["ORG_ID"] for r in rows} == {"JDO"}
    assert set(rows[0]) == EXPECTED_OUTPUT_COLUMNS | {"ORG_ID"}
    ids = [r["EVENT_ID"] for r in rows]
    assert len(ids) == len(set(ids))
    assert all(weeks[0] <= r["DETECTED_DATE"] <= RUN_TS.date() for r in rows)


def test_rows_for_window_org_from_source_anchor(ctx):
    other = [dict(a, ORG_ID="ORG2") for a in ALL_ANCHORS]
    rows = _rows_for_window(other, _run_weeks(RUN_TS.date(), 104), RUN_TS, _rises_boardex(), ctx)
    assert {r["ORG_ID"] for r in rows} == {"ORG2"}


def test_rows_for_window_error_tolerance(ctx):
    bad = {"ACCOUNT_ID": "001BAD", "ACCOUNT_TYPE_FLAG": "PERSON"}   # fails the audience check
    errors: list = []
    rows = _rows_for_window(ALL_ANCHORS + [bad], _run_weeks(RUN_TS.date(), 8), RUN_TS,
                            _rises_boardex(), ctx, errors=errors)
    assert [e[0] for e in errors] == ["001BAD"]
    assert all(r["ACCOUNT_ID"] != "001BAD" for r in rows)
    with pytest.raises(ValueError):
        _rows_for_window([bad], _run_weeks(RUN_TS.date(), 8), RUN_TS, _rises_boardex(), ctx)


def test_rows_for_window_gate_holds_over_backfill(ctx):
    boardex = _rises_boardex()
    weeks = _run_weeks(RUN_TS.date(), 104)
    rows = _rows_for_window(ALL_ANCHORS, weeks, RUN_TS, boardex, ctx)
    assert _csuite_gate_violations(rows, boardex, RUN_TS.date(), weeks[0]) == []
    csuite = {(r["ACCOUNT_ID"], date(r["EVENT_DATE"].year, r["EVENT_DATE"].month, 1))
              for r in rows if r["EVENT_TYPE"] == "Departed" and r["SENIORITY"] == "C-Suite"}
    # 2025-03 and 2026-08 are complete, in-window rises (2024-11 is too: 11-01 + 3 days = 11-04).
    assert (EMPLOYERS[0]["ACCOUNT_ID"], date(2025, 3, 1)) in csuite
    assert (EMPLOYERS[4]["ACCOUNT_ID"], date(2026, 8, 1)) in csuite


# -------------------------------------------------------------------
# Contract helpers
# -------------------------------------------------------------------

def test_week_band_violations_counts_missing_weeks_as_zero():
    weeks = [date(2026, 10, 12), date(2026, 10, 19), date(2026, 10, 26)]
    counts = {date(2026, 10, 12): 50, date(2026, 10, 26): 250}
    problems = _week_band_violations(counts, weeks, 30, 200)
    assert len(problems) == 2
    assert "2026-10-19" in problems[0] and "0 rows" in problems[0]
    assert "2026-10-26" in problems[1] and "250" in problems[1]
    assert _week_band_violations({w: 30 for w in weeks}, weeks, 30, 200) == []


def test_csuite_gate_duplicate_in_rise_month_always_flagged(ctx):
    """Two C-suite departures in one account-month violate 'exactly one'
    even when the month is not yet complete."""
    acct = EMPLOYERS[0]["ACCOUNT_ID"]
    m = date(2026, 10, 1)
    boardex = make_boardex(ALL_ANCHORS, HISTORY, {(acct, m)})
    row = {"ACCOUNT_ID": acct, "EVENT_TYPE": "Departed", "SENIORITY": "C-Suite",
           "EVENT_DATE": date(2026, 10, 5)}
    assert _csuite_gate_violations([row], boardex, RUN_TS.date(), date(2026, 10, 26)) == []
    problems = _csuite_gate_violations([row, dict(row)], boardex, RUN_TS.date(), date(2026, 10, 26))
    assert len(problems) == 1 and "2 C-suite departures" in problems[0]


class _FakeResult(list):
    pass


class FakeSession:
    """Answers the contract's SQL by keyword; records every statement."""

    def __init__(self, week_counts=None, audience_bad=0, wealth_bad=0,
                 nonrise=0, dup=0, missing=0):
        self.week_counts = week_counts or {}
        self.answers = {"(b)": audience_bad, "(c)": wealth_bad, "(d1)": nonrise,
                        "(d2)": dup, "(d3)": missing}
        self.statements: list[str] = []

    def sql(self, text, params=None):
        self.statements.append(text)
        outer = self

        class _Q:
            def collect(self_inner):
                if "GROUP BY PROFILE_WEEK" in text:
                    return [(w, n) for w, n in outer.week_counts.items()]
                for tag, n in outer.answers.items():
                    if f"-- contract {tag}" in text:
                        return [(n,)]
                raise AssertionError(f"unexpected SQL: {text[:80]}")
        return _Q()


def test_assert_event_contract_passes_and_runs_all_checks():
    weeks = _run_weeks(RUN_TS.date(), 0)
    s = FakeSession(week_counts={weeks[0]: 80, weeks[1]: 9})
    _assert_event_contract(s, weeks, RUN_TS.date())
    tags = [t for t in ("(b)", "(c)", "(d1)", "(d2)", "(d3)")
            if any(f"-- contract {t}" in q for q in s.statements)]
    assert tags == ["(b)", "(c)", "(d1)", "(d2)", "(d3)"]
    assert all("&" not in q for q in s.statements)


@pytest.mark.parametrize("kw,needle", [
    ({"week_counts": {}}, "contract (a)"),
    ({"audience_bad": 2}, "contract (b)"),
    ({"wealth_bad": 1}, "contract (c)"),
    ({"nonrise": 3}, "contract (d)"),
    ({"dup": 1}, "contract (d)"),
    ({"missing": 4}, "contract (d)"),
])
def test_assert_event_contract_raises(kw, needle):
    weeks = _run_weeks(RUN_TS.date(), 0)
    kw.setdefault("week_counts", {weeks[0]: 80})
    with pytest.raises(RuntimeError, match=needle.replace("(", r"\(").replace(")", r"\)")):
        _assert_event_contract(FakeSession(**kw), weeks, RUN_TS.date())


def test_partial_week_exempt_from_band():
    weeks = _run_weeks(RUN_TS.date(), 0)
    # Current partial week has 3 rows (< 30): fine, only complete weeks count.
    _assert_event_contract(FakeSession(week_counts={weeks[0]: 31, weeks[1]: 3}), weeks, RUN_TS.date())


def test_contract_d3_sql_uses_completeness_and_window_rules():
    weeks = _run_weeks(RUN_TS.date(), 104)
    s = FakeSession(week_counts={w: 80 for w in weeks})
    _assert_event_contract(s, weeks, RUN_TS.date())
    d3 = next(q for q in s.statements if "-- contract (d3)" in q)
    assert "DATEADD(day, 3, r.PROFILE_MONTH) >= '2024-11-04'" in d3
    assert "DATEDIFF(day, LAST_DAY(r.PROFILE_MONTH), '2026-11-02') > 52" in d3


# -------------------------------------------------------------------
# BoardEx loader: duplicates and month coverage (review fix 2026-11-02)
# -------------------------------------------------------------------

def _bx_rows(accounts, months, flag=False):
    return [(a, m, flag) for a in accounts for m in months]


def test_boardex_dict_collapses_exact_duplicate():
    rows = [("A", date(2026, 10, 1), False), ("A", datetime(2026, 10, 1), False)]
    assert _boardex_dict_from_rows(rows) == {("A", date(2026, 10, 1)): False}


def test_boardex_dict_raises_on_conflicting_duplicate():
    rows = [("A", date(2026, 10, 1), False), ("A", date(2026, 10, 1), True)]
    with pytest.raises(RuntimeError, match="conflicting duplicate"):
        _boardex_dict_from_rows(rows)


def test_boardex_coverage_flags_missing_current_month():
    """Weekly run on 2026-11-09: 2026-11 events are detectable (11-01 + 3 <= 11-09),
    so a missing 2026-11 BoardEx month must raise, not read as 'no rise'."""
    weeks = _run_weeks(date(2026, 11, 9), 0)
    lo, hi = _boardex_month_span(weeks)
    accts = [f"A{i}" for i in range(10)]
    present = months_between(lo, date(2026, 10, 1))
    bx = _boardex_dict_from_rows(_bx_rows(accts, present))
    gaps = _boardex_coverage_violations(bx, date(2024, 6, 1), lo, hi, date(2026, 11, 9))
    assert len(gaps) == 1 and gaps[0].startswith("2026-11-01: 0")
    full = _boardex_dict_from_rows(_bx_rows(accts, months_between(lo, hi)))
    assert _boardex_coverage_violations(full, date(2024, 6, 1), lo, hi, date(2026, 11, 9)) == []


def test_boardex_coverage_month_not_yet_detectable_is_not_needed():
    """Run on Monday 2026-11-02 (the TASK on the 2nd): 2026-11 events are first
    detected on 11-04, so a not-yet-generated 2026-11 month is fine."""
    weeks = _run_weeks(RUN_TS.date(), 0)
    lo, hi = _boardex_month_span(weeks)
    bx = _boardex_dict_from_rows(_bx_rows(["A", "B"], months_between(lo, date(2026, 10, 1))))
    assert _boardex_coverage_violations(bx, date(2024, 6, 1), lo, hi, RUN_TS.date()) == []


def test_boardex_coverage_prehistory_and_thin_month():
    weeks = _run_weeks(RUN_TS.date(), 104)
    lo, hi = _boardex_month_span(weeks)
    accts = [f"A{i}" for i in range(10)]
    first = date(2024, 9, 1)                       # table starts after lo: pre-history
    rows = _bx_rows(accts, months_between(first, hi))
    rows = [r for r in rows if not (r[1] == date(2025, 5, 1) and r[0] not in ("A0", "A1"))]
    gaps = _boardex_coverage_violations(_boardex_dict_from_rows(rows), first, lo, hi, RUN_TS.date())
    assert gaps == ["2025-05-01: 2 employer rows (best month 10)"]


class _BxSession:
    def __init__(self, rows, first):
        self.rows, self.first = rows, first

    def sql(self, text, params=None):
        outer = self

        class _Q:
            def collect(self_inner):
                if "MIN(PROFILE_MONTH)" in text:
                    return [(outer.first,)]
                return outer.rows
        return _Q()


def test_load_boardex_raises_on_missing_needed_month():
    weeks = _run_weeks(date(2026, 11, 9), 0)
    lo, _ = _boardex_month_span(weeks)
    s = _BxSession(_bx_rows(["A", "B"], months_between(lo, date(2026, 10, 1))), date(2024, 6, 1))
    with pytest.raises(RuntimeError, match="missing needed months"):
        _load_boardex(s, weeks, date(2026, 11, 9))
    assert _load_boardex(s, weeks)  # no run date: coverage not checked


# -------------------------------------------------------------------
# MERGE frame + SQL
# -------------------------------------------------------------------

def _sample_records(ctx):
    rows = _rows_for_window(ALL_ANCHORS, _run_weeks(RUN_TS.date(), 104), RUN_TS,
                            _rises_boardex(), ctx)
    return rows


def test_merge_columns_are_org_plus_22():
    assert MERGE_COLUMNS[0] == "ORG_ID"
    assert set(MERGE_COLUMNS) == EXPECTED_OUTPUT_COLUMNS | {"ORG_ID"}
    assert len(MERGE_COLUMNS) == 23


def test_merge_frame_types(ctx):
    pd = pytest.importorskip("pandas")
    df = _merge_frame(_sample_records(ctx))
    assert list(df.columns) == MERGE_COLUMNS
    for c in ("PROFILE_WEEK", "EVENT_DATE", "DETECTED_DATE", "GENERATED_AT"):
        assert str(df[c].dtype) == "datetime64[ns]", c
    for c in ("WAS_CHAMPION", "WAS_PRIMARY_CONTACT", "LIQUIDITY_EVENT_FLAG"):
        assert str(df[c].dtype) == "bool", c
    # nanoseconds since epoch is what the MERGE divides by 1e9
    first = df["EVENT_DATE"].iloc[0]
    assert first.value % 86_400_000_000_000 == 0
    assert pd.Timestamp(df["GENERATED_AT"].iloc[0]).dayofweek == 0


def test_merge_sql_shape():
    sql = _merge_sql()
    assert "ON tgt.ORG_ID = src.ORG_ID" in sql and "AND tgt.EVENT_ID = src.EVENT_ID" in sql
    assert "WHEN MATCHED THEN UPDATE SET" in sql and "WHEN NOT MATCHED THEN INSERT" in sql
    assert sql.count("RECORD_ID") >= 3          # src expr, UPDATE, INSERT list + values
    upd = sql.split("WHEN MATCHED THEN UPDATE SET")[1].split("WHEN NOT MATCHED")[0]
    assert "RECORD_ID" in upd and "EVENT_ID " not in upd.replace("PAIRED_EVENT_ID", "")
    for c in ("WAS_CHAMPION", "WAS_PRIMARY_CONTACT", "LIQUIDITY_EVENT_FLAG"):
        assert f"{c}::BOOLEAN AS {c}" in sql
    for c in ("PROFILE_WEEK", "EVENT_DATE", "DETECTED_DATE"):
        assert f"TO_DATE(TO_TIMESTAMP_NTZ({c}::NUMBER / 1000000000)) AS {c}" in sql
    assert "TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT" in sql
    for c in ("OLD_TITLE", "NEW_TITLE", "NEW_EMPLOYER_NAME", "NEW_ACCOUNT_ID",
              "PAIRED_EVENT_ID", "PERSON_ACCOUNT_ID"):
        assert f"{c}::VARCHAR AS {c}" in sql
    assert "CONCAT_WS('|', ORG_ID, EVENT_ID, 'record_id')" in sql
    assert "&" not in sql
    assert "NOT MATCHED BY SOURCE" not in sql


def test_merge_record_id_regex_matches_python_form():
    """The SQL RECORD_ID is LEFT(SHA2(...),32) re-hyphenated 8-4-4-4-12,
    the same as _record_id_for(org, event_id)."""
    rid = _record_id_for("JDO", "abc")
    assert [len(p) for p in rid.split("-")] == [8, 4, 4, 4, 12]
    sql = _merge_sql()
    assert "'(.{8})(.{4})(.{4})(.{4})(.{12})'" in sql
    assert r"'\\1-\\2-\\3-\\4-\\5'" in sql


def test_merge_counts_by_column_name():
    class Row(dict):
        def asDict(self):
            return dict(self)
    assert _merge_counts([Row({"number of rows inserted": 5, "number of rows updated": 7})]) == (5, 7)
    assert _merge_counts([]) == (0, 0)
    assert _merge_counts([(3, 4)]) == (3, 4)


# -------------------------------------------------------------------
# deploy_sp.py build
# -------------------------------------------------------------------

def _load_deploy():
    import importlib.util
    import pathlib
    p = pathlib.Path(__file__).resolve().parent.parent / "scripts" / "deploy_sp.py"
    spec = importlib.util.spec_from_file_location("ug_deploy_sp", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _body(sql: str, proc: str) -> str:
    start = sql.index(f"PROCEDURE {proc}(")
    body_start = sql.index("$$\n", start) + 3
    return sql[body_start: sql.index("$$;", body_start)]


def test_deploy_build_sql_is_self_contained_python():
    deploy = _load_deploy()
    sql = deploy.build_sql()
    assert "&" not in sql
    assert "SP_GENERATE_USERGEMS_JOB_CHANGES(\n    BACKFILL_WEEKS INTEGER DEFAULT 0\n)" in sql
    assert "HANDLER = 'main'" in sql
    body = _body(sql, deploy.PROCEDURE_FQN)
    assert "from cumulus_common" not in body
    assert "def seed_for(" in body
    compile(body, "sp_body", "exec")
    ns: dict = {}
    exec(compile(body, "sp_body", "exec"), ns)
    assert ns["_RUN_TS_SQL"] is None
    assert (ns["_WEEK_ROWS_MIN"], ns["_WEEK_ROWS_MAX"]) == (30, 200)
    assert ns["TABLE"] == "DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES"
    # inlined seed_for matches the shared one
    from cumulus_common import seed_for
    assert ns["seed_for"]("a", "b", RUN_TS) == seed_for("a", "b", RUN_TS)


def test_deploy_fixture_build_swaps_schema_clock_and_band():
    deploy = _load_deploy()
    sql = deploy.build_fixture_sql("DEMO_DB.CUMULUS_L2_USERGEMS", (0, 25))
    assert "DATA_JEDAIS" not in sql
    assert "CREATE SCHEMA IF NOT EXISTS DEMO_DB.CUMULUS_L2_USERGEMS;" in sql
    loose = _body(sql, "DEMO_DB.CUMULUS_L2_USERGEMS.SP_GENERATE_USERGEMS_JOB_CHANGES")
    strict = _body(sql, "DEMO_DB.CUMULUS_L2_USERGEMS.SP_GENERATE_USERGEMS_JOB_CHANGES_STRICT")
    for body, band, task in ((loose, (0, 25), "TASK_WEEKLY_USERGEMS_JOB_CHANGES_FIXTURE"),
                             (strict, (30, 200), "TASK_WEEKLY_USERGEMS_JOB_CHANGES_STRICT_FIXTURE")):
        ns: dict = {}
        exec(compile(body, "fixture_body", "exec"), ns)
        assert ns["TABLE"] == "DEMO_DB.CUMULUS_L2_USERGEMS.USERGEMS_JOB_CHANGES"
        assert ns["BOARDEX_TABLE"] == "DEMO_DB.CUMULUS_L2_USERGEMS.BOARDEX_EXEC_INTEL"
        assert "DEMO_DB.CUMULUS_L2_USERGEMS.V_ACCOUNT_ANCHORS" in ns["EMPLOYER_SQL"]
        assert ns["_RUN_TS_SQL"] == "SELECT RUN_TS FROM DEMO_DB.CUMULUS_L2_USERGEMS.L2_RUN_CLOCK"
        assert (ns["_WEEK_ROWS_MIN"], ns["_WEEK_ROWS_MAX"]) == band
        assert ns["TASK_NAME"] == task


def test_l2_sql_is_up_to_date():
    """tests/integration/test_usergems_job_changes_sp.sql is generated by
    tests/integration/build_l2.py; regenerate it after any row-factory change."""
    import importlib.util
    import pathlib
    root = pathlib.Path(__file__).resolve().parent / "integration"
    spec = importlib.util.spec_from_file_location("ug_build_l2", root / "build_l2.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (root / "test_usergems_job_changes_sp.sql").read_text() == mod.build(), (
        "stale L2 SQL: run python3 tests/integration/build_l2.py"
    )


def test_deploy_snow_cmd_is_unflagged_and_forwards_role():
    """The deploy must stay on the active default (JWT) connection: never `-c`
    unless explicitly overridden. `--role` is forwarded because the sibling
    objects in DATA_JEDAIS.FINS__PUBLIC are owned by ACCOUNTADMIN."""
    deploy = _load_deploy()
    assert deploy.build_snow_cmd("x.sql") == [deploy.SNOW, "sql", "-f", "x.sql"]
    assert deploy.build_snow_cmd("x.sql", role="ACCOUNTADMIN") == [
        deploy.SNOW, "sql", "-f", "x.sql", "--role", "ACCOUNTADMIN"]
    assert deploy.build_snow_cmd("x.sql", connection="c1")[:4] == [deploy.SNOW, "sql", "-c", "c1"]
