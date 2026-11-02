#!/usr/bin/env python3
"""Generate tests/integration/test_usergems_job_changes_sp.sql (Plan 15 Task 5).

The L2 test runs the REAL SP body (built by `scripts/deploy_sp.py
--fixture-schema`) against fixture tables in a scratch schema, and compares
what it wrote to the rows this script computes in Python with the same
row factory (`_rows_for_window`). Parity is checked on all 24 columns, so
the write path (write_pandas staging types, the MERGE casts, the SQL
RECORD_ID form) is proved against the Python reference.

Run:
    python3 tests/integration/build_l2.py          # rewrite the .sql
    python3 tests/integration/build_l2.py --check  # exit 1 if stale

L1 (`test_l2_sql_is_up_to_date`) fails if the committed .sql is stale.
"""
from __future__ import annotations

import importlib.util
import pathlib
import sys
from datetime import date, datetime

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
for p in (ROOT / "procedures", ROOT.parent / "Snowflake_Cumulus_Common"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import sp_generate_usergems_job_changes as sp  # noqa: E402

SQL_OUT = HERE / "test_usergems_job_changes_sp.sql"
SCHEMA = "DEMO_DB.CUMULUS_L2_USERGEMS"
PROC = f"{SCHEMA}.SP_GENERATE_USERGEMS_JOB_CHANGES"
STRICT = f"{PROC}_STRICT"
LOOSE_BAND = (0, 25)
RUN_TS = datetime(2026, 11, 2, 9, 0)
BACKFILL = 104
OVERLAP_CLOCKS = (datetime(2026, 10, 19, 9, 0), datetime(2026, 10, 26, 9, 0))


def _conftest():
    spec = importlib.util.spec_from_file_location("ug_conftest", ROOT / "tests" / "conftest.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_cf = _conftest()
EMPLOYERS = _cf.EMPLOYERS
BORING = _cf.BORING_ANCHOR
WEALTH = [{"ORG_ID": "JDO", "ACCOUNT_ID": a, "ACCOUNT_NAME": f"Wealth Client {i}",
           "ACCOUNT_TYPE_FLAG": "PERSON", "CLIENT_CATEGORY": "Wealth Management",
           "INDUSTRY": None, "EMPLOYEE_COUNT": None}
          for i, a in enumerate(sorted(_cf.WEALTH_POOL), 1)]
HOUSEHOLD = {"ORG_ID": "JDO", "ACCOUNT_ID": "001UG0000000901AAA", "ACCOUNT_NAME": "Household Co",
             "ACCOUNT_TYPE_FLAG": "BUSINESS", "CLIENT_CATEGORY": "Household",
             "INDUSTRY": "Restaurant", "EMPLOYEE_COUNT": 40}
AUDIENCE = EMPLOYERS + [BORING]
VIEW_ROWS = AUDIENCE + WEALTH + [HOUSEHOLD]

M = lambda y, m: date(y, m, 1)  # noqa: E731
FIRST, LAST = M(2024, 7), M(2026, 11)


def _months(a: date, b: date) -> list[date]:
    out, m = [], a
    while m <= b:
        out.append(m)
        m = sp._shift_months(m, 1)
    return out


ALL = _months(FIRST, LAST)


def _true(*ranges):
    s = set()
    for a, b in ranges:
        s.update(_months(a, b))
    return s


E = [e["ACCOUNT_ID"] for e in EMPLOYERS]
# Designed BoardEx histories: {account: (months present, months TRUE)}.
DESIGN = {
    E[0]: (ALL, _true((M(2025, 3), M(2025, 8)))),                      # rise 2025-03, sticky, then fall
    E[1]: (ALL, set()),                                                # never
    E[2]: (ALL, _true((M(2024, 11), M(2025, 4)))),                     # rise 2024-11 (window edge)
    E[3]: (ALL, _true((M(2026, 10), M(2026, 11)))),                    # rise 2026-10 (incomplete)
    E[4]: (ALL, _true((M(2024, 7), M(2025, 1)))),                      # TRUE in first month: no M-1
    E[5]: (_months(M(2025, 6), LAST),                                  # rows start TRUE: no M-1
           _true((M(2025, 6), M(2025, 9)), (M(2026, 7), LAST))),       # ...then rise 2026-07
    E[6]: (ALL, _true((M(2025, 1), M(2025, 3)), (M(2026, 4), M(2026, 6)))),  # two rises
    E[7]: (ALL, _true((M(2025, 9), M(2025, 12)))),                     # rise 2025-09
    E[8]: (ALL, _true((M(2026, 8), LAST))),                            # rise 2026-08 (complete)
    E[9]: (ALL, _true((M(2026, 9), LAST))),                            # rise 2026-09 (incomplete)
    BORING["ACCOUNT_ID"]: (ALL, set()),
    HOUSEHOLD["ACCOUNT_ID"]: (ALL, _true((M(2025, 5), M(2025, 7)))),   # out of audience
}
COMPLETE_RISES = {(E[0], M(2025, 3)), (E[2], M(2024, 11)), (E[5], M(2026, 7)),
                  (E[6], M(2025, 1)), (E[6], M(2026, 4)), (E[7], M(2025, 9)),
                  (E[8], M(2026, 8))}
INCOMPLETE_RISES = {(E[3], M(2026, 10)), (E[9], M(2026, 9))}
# Negative test: flip E1's 2025-03 rise to FALSE (the rise moves to 2025-04,
# so the existing 2025-03 C-suite row becomes a non-rise departure).
FLIP = (E[0], M(2025, 3))


def boardex_rows():
    for acct, (present, true) in DESIGN.items():
        for m in present:
            yield acct, m, m in true


def boardex_dict(audience_only=True):
    ids = {a["ACCOUNT_ID"] for a in AUDIENCE}
    return {(a, m): f for a, m, f in boardex_rows() if not audience_only or a in ids}


def expected(run_ts: datetime, backfill: int) -> list[dict]:
    ctx = sp.Ctx(AUDIENCE, [w["ACCOUNT_ID"] for w in WEALTH])
    weeks = sp._run_weeks(run_ts.date(), backfill)
    rows = sp._rows_for_window(AUDIENCE, weeks, run_ts, boardex_dict(), ctx)
    for r in rows:
        r["RECORD_ID"] = sp._record_id_for(r["ORG_ID"], r["EVENT_ID"])
    return sorted(rows, key=lambda r: r["EVENT_ID"])


def _self_check(rows: list[dict]) -> None:
    """Fail the build (not the L2 run) if the fixture stops exercising a case."""
    weeks = sp._run_weeks(RUN_TS.date(), BACKFILL)
    bx = boardex_dict()
    gate = sp._csuite_gate_violations(rows, bx, RUN_TS.date(), weeks[0])
    assert gate == [], gate
    rises = {(a, m) for (a, m) in bx if sp._boardex_rise(bx, a, m)}
    assert rises == COMPLETE_RISES | INCOMPLETE_RISES, sorted(rises ^ (COMPLETE_RISES | INCOMPLETE_RISES))
    cs = [(r["ACCOUNT_ID"], sp._month_start(r["EVENT_DATE"])) for r in rows
          if r["EVENT_TYPE"] == "Departed" and r["SENIORITY"] == "C-Suite"]
    assert set(cs) >= COMPLETE_RISES and set(cs) <= COMPLETE_RISES | INCOMPLETE_RISES, cs
    assert any(r["PAIRED_EVENT_ID"] for r in rows), "fixture has no paired events"
    assert any(r["LIQUIDITY_EVENT_FLAG"] for r in rows), "fixture has no liquidity rows"
    assert any(r["EVENT_TYPE"] == "Promoted" for r in rows), "fixture has no promotions"
    counts: dict = {}
    for r in rows:
        counts[r["PROFILE_WEEK"]] = counts.get(r["PROFILE_WEEK"], 0) + 1
    assert max(counts.values()) <= LOOSE_BAND[1], max(counts.values())
    for clock in OVERLAP_CLOCKS:
        assert expected(clock, 0), f"no rows for overlap clock {clock}"


# -------------------------------------------------------------------
# SQL rendering
# -------------------------------------------------------------------

COLS = sp.MERGE_COLUMNS + ["RECORD_ID"]


def lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, datetime):
        return f"'{v:%Y-%m-%d %H:%M:%S}'"
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


def _values(rows, cols) -> str:
    return ",\n".join("    (" + ", ".join(lit(r[c]) for c in cols) + ")" for r in rows)


def _ddl() -> str:
    src = (ROOT / "schemas" / "usergems_job_changes.sql").read_text()
    body = src[src.index("\nCREATE TABLE IF NOT EXISTS") + 1:]
    return body.replace("DATA_JEDAIS.FINS__PUBLIC", SCHEMA).strip() + "\n"


def _check(name: str, cond: str, detail: str = "NULL") -> str:
    return (f"INSERT INTO L2_RESULTS (NAME, OK, DETAIL) SELECT '{name}', ({cond}), {detail};\n")


def _neg_block(call: str) -> str:
    return ("EXECUTE IMMEDIATE $$\nBEGIN\n"
            f"    CALL {call};\n    RETURN 'NO_RAISE';\n"
            "EXCEPTION\n    WHEN OTHER THEN RETURN SQLERRM;\nEND;\n$$;\n")


def _neg_check(name: str, needle: str) -> str:
    return (f"INSERT INTO L2_RESULTS (NAME, OK, DETAIL) SELECT '{name}', "
            f"CONTAINS($1, '{needle}'), SUBSTR($1, POSITION('event contract' IN $1), 200) FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));\n")


T = f"{SCHEMA}.USERGEMS_JOB_CHANGES"
CSUITE = "EVENT_TYPE = 'Departed' AND SENIORITY = 'C-Suite'"


def _pairs_values(pairs) -> str:
    return ",\n".join(f"    ('{a}', '{m.isoformat()}')" for a, m in sorted(pairs))


def build() -> str:
    rows = expected(RUN_TS, BACKFILL)
    _self_check(rows)
    s1 = expected(OVERLAP_CLOCKS[0], 0)
    s2 = expected(OVERLAP_CLOCKS[1], 0)
    overlap = {r["EVENT_ID"] for r in s1} & {r["EVENT_ID"] for r in s2}
    weeks = sp._run_weeks(RUN_TS.date(), BACKFILL)
    ws = weeks[0].isoformat()

    view_cols = ["ORG_ID", "ACCOUNT_ID", "ACCOUNT_NAME", "CLIENT_CATEGORY",
                 "ACCOUNT_TYPE_FLAG", "INDUSTRY", "EMPLOYEE_COUNT"]
    view_values = _values(VIEW_ROWS, view_cols)
    bx_values = ",\n".join(f"    ('JDO', '{a}', '{m.isoformat()}', {lit(f)})" for a, m, f in boardex_rows())
    o = OVERLAP_CLOCKS

    sql = f"""\
-- =============================================================================
-- L2 integration test for SP_GENERATE_USERGEMS_JOB_CHANGES (Plan 15 Task 5)
-- GENERATED by tests/integration/build_l2.py; do NOT edit by hand.
-- =============================================================================
-- Run (from Snowflake_UserGems_JobChanges/, unflagged snow = active connection):
--   python3 scripts/deploy_sp.py --fixture-schema {SCHEMA}
--   /opt/homebrew/bin/snow sql -f tests/integration/test_usergems_job_changes_sp.sql
-- Pass: the final L2_ALL_PASS row is TRUE (each L2_RESULTS row lists one check).
--
-- Where: scratch schema {SCHEMA}. The deploy role (SYSADMIN) cannot
--   CREATE TABLE in the production schema, so the fixture view, BoardEx
--   table, target table and log live in the scratch schema, and the deploy
--   script builds the real SP body retargeted at it (no production reference).
--   The last statement DROPs the schema.
-- Clock: L2_RUN_CLOCK pins the run timestamp (_RUN_TS_SQL hook).
-- Fixture: {len(EMPLOYERS)} employers + 1 NULL-attribute employer + {len(WEALTH)} Wealth PERSON
--   anchors + 1 Household BUSINESS (out of audience). BoardEx {FIRST:%Y-%m}..{LAST:%Y-%m}
--   with designed rises: complete {len(COMPLETE_RISES)}, incomplete {len(INCOMPLETE_RISES)},
--   plus no-M-1 and out-of-audience cases (see build_l2.py DESIGN).
-- Expected: {len(rows)} rows from CALL({BACKFILL}) at {RUN_TS:%Y-%m-%d %H:%M}
--   (window {ws}..{RUN_TS.date().isoformat()}), computed by _rows_for_window.
-- Checks: 24-column parity both ways (types, casts, RECORD_ID), BoardEx gate
--   both directions, pair cross-links, audience, idempotent re-run, contract
--   (a) and (d) raise, weekly overlap re-derives identical rows with no gap.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS {SCHEMA};
USE SCHEMA {SCHEMA};

CREATE OR REPLACE TABLE L2_RESULTS (
    SEQ    NUMBER AUTOINCREMENT ORDER,
    NAME   VARCHAR,
    OK     BOOLEAN,
    DETAIL VARCHAR
);

CREATE OR REPLACE TABLE L2_RUN_CLOCK (RUN_TS TIMESTAMP_NTZ);
INSERT INTO L2_RUN_CLOCK VALUES ('{RUN_TS:%Y-%m-%d %H:%M:%S}');

CREATE OR REPLACE TABLE TASK_EXECUTION_LOG (
    LOG_ID             VARCHAR NOT NULL,
    TASK_NAME          VARCHAR NOT NULL,
    EXECUTION_TIME     TIMESTAMP_NTZ(9),
    STATUS             VARCHAR NOT NULL,
    ROWS_INSERTED      NUMBER(38,0),
    ACCOUNTS_PROCESSED NUMBER(38,0),
    ERROR_MESSAGE      VARCHAR,
    DURATION_MS        NUMBER(38,0)
);

CREATE OR REPLACE TABLE L2_ANCHORS (
    ORG_ID VARCHAR(18), ACCOUNT_ID VARCHAR, ACCOUNT_NAME VARCHAR, CLIENT_CATEGORY VARCHAR,
    ACCOUNT_TYPE_FLAG VARCHAR(8), INDUSTRY VARCHAR, EMPLOYEE_COUNT NUMBER(38,18)
);
INSERT INTO L2_ANCHORS ({", ".join(view_cols)}) VALUES
{view_values};
CREATE OR REPLACE VIEW V_ACCOUNT_ANCHORS AS SELECT * FROM L2_ANCHORS;

CREATE OR REPLACE TABLE BOARDEX_EXEC_INTEL (
    ORG_ID VARCHAR(18), ACCOUNT_ID VARCHAR NOT NULL, PROFILE_MONTH DATE NOT NULL,
    EXEC_TURNOVER_FLAG BOOLEAN NOT NULL
);
INSERT INTO BOARDEX_EXEC_INTEL (ORG_ID, ACCOUNT_ID, PROFILE_MONTH, EXEC_TURNOVER_FLAG) VALUES
{bx_values};

DROP TABLE IF EXISTS {T};
DROP TABLE IF EXISTS {SCHEMA}.USERGEMS_JOB_CHANGES_STAGING;
{_ddl()}
CREATE OR REPLACE TABLE L2_EXPECTED LIKE {T};
INSERT INTO L2_EXPECTED ({", ".join(COLS)}) VALUES
{_values(rows, COLS)};

CREATE OR REPLACE TABLE L2_COMPLETE_RISES (ACCOUNT_ID VARCHAR, PROFILE_MONTH DATE);
INSERT INTO L2_COMPLETE_RISES VALUES
{_pairs_values(COMPLETE_RISES)};
CREATE OR REPLACE TABLE L2_INCOMPLETE_RISES (ACCOUNT_ID VARCHAR, PROFILE_MONTH DATE);
INSERT INTO L2_INCOMPLETE_RISES VALUES
{_pairs_values(INCOMPLETE_RISES)};

-- -----------------------------------------------------------------------------
-- 1. Backfill run
-- -----------------------------------------------------------------------------
CALL {PROC}({BACKFILL});

{_check("backfill_row_count", f"(SELECT COUNT(*) FROM {T}) = {len(rows)}",
        f"(SELECT COUNT(*)::VARCHAR FROM {T})")}\
{_check("parity_target_minus_expected",
        f"(SELECT COUNT(*) FROM (SELECT {', '.join(COLS)} FROM {T} MINUS SELECT {', '.join(COLS)} FROM L2_EXPECTED)) = 0")}\
{_check("parity_expected_minus_target",
        f"(SELECT COUNT(*) FROM (SELECT {', '.join(COLS)} FROM L2_EXPECTED MINUS SELECT {', '.join(COLS)} FROM {T})) = 0")}\
{_check("record_id_sql_matches_python_form",
        f"(SELECT COUNT(*) FROM {T} t JOIN L2_EXPECTED e ON e.EVENT_ID = t.EVENT_ID WHERE t.RECORD_ID <> e.RECORD_ID) = 0")}\
{_check("generated_at_is_profile_week_midnight",
        f"(SELECT COUNT(*) FROM {T} WHERE GENERATED_AT <> PROFILE_WEEK::TIMESTAMP_NTZ OR DAYOFWEEKISO(PROFILE_WEEK) <> 1 OR PROFILE_WEEK <> DATEADD(day, 1 - DAYOFWEEKISO(DETECTED_DATE), DETECTED_DATE)) = 0")}\
{_check("detected_in_window",
        f"(SELECT COUNT(*) FROM {T} WHERE DETECTED_DATE < '{ws}' OR DETECTED_DATE > '{RUN_TS.date().isoformat()}') = 0")}\
{_check("csuite_exactly_one_per_complete_rise",
        f"(SELECT COUNT(*) FROM L2_COMPLETE_RISES r WHERE (SELECT COUNT(*) FROM {T} t WHERE t.ACCOUNT_ID = r.ACCOUNT_ID AND DATE_TRUNC('month', t.EVENT_DATE) = r.PROFILE_MONTH AND t.{CSUITE}) <> 1) = 0")}\
{_check("csuite_never_outside_a_rise",
        f"(SELECT COUNT(*) FROM {T} t WHERE t.{CSUITE} AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM L2_COMPLETE_RISES UNION ALL SELECT * FROM L2_INCOMPLETE_RISES) r WHERE r.ACCOUNT_ID = t.ACCOUNT_ID AND r.PROFILE_MONTH = DATE_TRUNC('month', t.EVENT_DATE))) = 0")}\
{_check("csuite_at_most_one_per_account_month",
        f"(SELECT COUNT(*) FROM (SELECT ACCOUNT_ID, DATE_TRUNC('month', EVENT_DATE) m FROM {T} WHERE {CSUITE} GROUP BY 1, 2 HAVING COUNT(*) > 1)) = 0")}\
{_check("pairs_present",
        f"(SELECT COUNT(*) FROM {T} WHERE PAIRED_EVENT_ID IS NOT NULL) > 0",
        f"(SELECT COUNT(*)::VARCHAR FROM {T} WHERE PAIRED_EVENT_ID IS NOT NULL)")}\
{_check("pairs_cross_linked",
        f"(SELECT COUNT(*) FROM {T} a JOIN {T} b ON b.EVENT_ID = a.PAIRED_EVENT_ID WHERE b.PAIRED_EVENT_ID <> a.EVENT_ID OR a.EVENT_ID = a.PAIRED_EVENT_ID OR a.EVENT_TYPE = b.EVENT_TYPE) = 0")}\
{_check("pair_mirror_on_new_account",
        f"(SELECT COUNT(*) FROM {T} d JOIN {T} j ON j.EVENT_ID = d.PAIRED_EVENT_ID WHERE d.EVENT_TYPE = 'Departed' AND (d.NEW_ACCOUNT_ID IS NULL OR j.ACCOUNT_ID <> d.NEW_ACCOUNT_ID OR d.NEW_ACCOUNT_ID = d.ACCOUNT_ID)) = 0")}\
{_check("unmatched_pairs_only_at_window_edges",
        f"(SELECT COUNT(*) FROM {T} a WHERE a.PAIRED_EVENT_ID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM {T} b WHERE b.EVENT_ID = a.PAIRED_EVENT_ID) AND NOT ((a.EVENT_TYPE = 'Departed' AND a.DETECTED_DATE > DATEADD(day, -7, '{RUN_TS.date().isoformat()}')) OR (a.EVENT_TYPE = 'Joined' AND a.DETECTED_DATE < DATEADD(day, 7, '{ws}')))) = 0")}\
{_check("no_household_or_out_of_audience_rows",
        f"(SELECT COUNT(*) FROM {T} WHERE ACCOUNT_ID = '{HOUSEHOLD['ACCOUNT_ID']}' OR NEW_ACCOUNT_ID = '{HOUSEHOLD['ACCOUNT_ID']}' OR ACCOUNT_ID NOT IN (SELECT ACCOUNT_ID FROM L2_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household')) = 0")}\
{_check("liquidity_rows_tie_to_wealth_pool",
        f"(SELECT COUNT(*) FROM {T} WHERE LIQUIDITY_EVENT_FLAG) > 0 AND (SELECT COUNT(*) FROM {T} WHERE LIQUIDITY_EVENT_FLAG <> (PERSON_ACCOUNT_ID IS NOT NULL) OR (PERSON_ACCOUNT_ID IS NOT NULL AND PERSON_ACCOUNT_ID NOT IN (SELECT ACCOUNT_ID FROM L2_ANCHORS WHERE CLIENT_CATEGORY = 'Wealth Management'))) = 0")}\
{_check("staging_dates_land_as_number",
        f"(SELECT DATA_TYPE FROM {SCHEMA.split('.')[0]}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '{SCHEMA.split('.')[1]}' AND TABLE_NAME = 'USERGEMS_JOB_CHANGES_STAGING' AND COLUMN_NAME = 'EVENT_DATE') = 'NUMBER'",
        f"(SELECT DATA_TYPE FROM {SCHEMA.split('.')[0]}.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '{SCHEMA.split('.')[1]}' AND TABLE_NAME = 'USERGEMS_JOB_CHANGES_STAGING' AND COLUMN_NAME = 'EVENT_DATE')")}\
{_check("log_succeeded_backfill",
        f"(SELECT COUNT(*) FROM TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_WEEKLY_USERGEMS_JOB_CHANGES_FIXTURE' AND STATUS = 'SUCCEEDED' AND ROWS_INSERTED = {len(rows)} AND ACCOUNTS_PROCESSED = {len(AUDIENCE)}) = 1")}\

-- -----------------------------------------------------------------------------
-- 2. Idempotent re-run: same rows, nothing inserted
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE L2_HASH AS SELECT COUNT(*) N, HASH_AGG(*) H FROM {T};
CALL {PROC}({BACKFILL});
{_check("rerun_identical",
        f"(SELECT N FROM L2_HASH) = (SELECT COUNT(*) FROM {T}) AND (SELECT H FROM L2_HASH) = (SELECT HASH_AGG(*) FROM {T})")}\
{_check("rerun_inserted_zero",
        "(SELECT ROWS_INSERTED FROM TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_WEEKLY_USERGEMS_JOB_CHANGES_FIXTURE' ORDER BY EXECUTION_TIME DESC LIMIT 1) = 0")}\
CREATE OR REPLACE TABLE L2_S0 AS SELECT * FROM {T};

-- -----------------------------------------------------------------------------
-- 3. Contract raises
-- -----------------------------------------------------------------------------
-- (a) production band [30, 200] against a fixture of a few rows per week.
{_neg_block(f"{STRICT}({BACKFILL})")}\
{_neg_check("contract_a_raises_on_strict_band", "contract (a)")}\
{_check("strict_failure_logged",
        "(SELECT COUNT(*) FROM TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_WEEKLY_USERGEMS_JOB_CHANGES_STRICT_FIXTURE' AND STATUS = 'FAILED') = 1")}\
-- (d) non-rise: flip a rise month to FALSE; its stored C-suite row is now outside a rise.
UPDATE BOARDEX_EXEC_INTEL SET EXEC_TURNOVER_FLAG = FALSE WHERE ACCOUNT_ID = '{FLIP[0]}' AND PROFILE_MONTH = '{FLIP[1].isoformat()}';
{_neg_block(f"{PROC}({BACKFILL})")}\
{_neg_check("contract_d_raises_on_non_rise_departure", "contract (d)")}\
UPDATE BOARDEX_EXEC_INTEL SET EXEC_TURNOVER_FLAG = TRUE WHERE ACCOUNT_ID = '{FLIP[0]}' AND PROFILE_MONTH = '{FLIP[1].isoformat()}';
DELETE FROM {T};
INSERT INTO {T} SELECT * FROM L2_S0;
-- (d) duplicate: a second C-suite departure in a rise month.
INSERT INTO {T} SELECT ORG_ID, UUID_STRING(), UUID_STRING(), ACCOUNT_ID, PROFILE_WEEK, EVENT_TYPE, EVENT_DATE, DETECTED_DATE, CONTACT_NAME, CONTACT_PERSONA, SENIORITY, OLD_TITLE, NEW_TITLE, NEW_EMPLOYER_NAME, NEW_ACCOUNT_ID, NEW_EMPLOYER_STATUS, NULL, WAS_CHAMPION, WAS_PRIMARY_CONTACT, OPPORTUNITY_SCORE, RELATIONSHIP_RISK_SCORE, NULL, FALSE, GENERATED_AT FROM L2_S0 WHERE {CSUITE} AND ACCOUNT_ID = '{E[7]}' AND DATE_TRUNC('month', EVENT_DATE) = '2025-09-01';
{_neg_block(f"{PROC}({BACKFILL})")}\
{_neg_check("contract_d_raises_on_duplicate_departure", "contract (d)")}\
DELETE FROM {T};
INSERT INTO {T} SELECT * FROM L2_S0;
{_check("restored_after_negative_tests",
        f"(SELECT HASH_AGG(*) FROM {T}) = (SELECT H FROM L2_HASH)")}\

-- -----------------------------------------------------------------------------
-- 4. Weekly overlap: two consecutive default runs re-derive identical rows
-- -----------------------------------------------------------------------------
DELETE FROM {T};
UPDATE L2_RUN_CLOCK SET RUN_TS = '{o[0]:%Y-%m-%d %H:%M:%S}';
CALL {PROC}();
CREATE OR REPLACE TABLE L2_S1 AS SELECT * FROM {T};
DELETE FROM {T};
UPDATE L2_RUN_CLOCK SET RUN_TS = '{o[1]:%Y-%m-%d %H:%M:%S}';
CALL {PROC}();
CREATE OR REPLACE TABLE L2_S2 AS SELECT * FROM {T};
{_check("overlap_run1_rows", f"(SELECT COUNT(*) FROM L2_S1) = {len(s1)}", "(SELECT COUNT(*)::VARCHAR FROM L2_S1)")}\
{_check("overlap_run2_rows", f"(SELECT COUNT(*) FROM L2_S2) = {len(s2)}", "(SELECT COUNT(*)::VARCHAR FROM L2_S2)")}\
{_check("overlap_ids_detected_on_shared_monday",
        f"(SELECT COUNT(*) FROM L2_S1 a JOIN L2_S2 b ON b.EVENT_ID = a.EVENT_ID) = {len(overlap)} AND (SELECT COUNT(*) FROM L2_S1 a JOIN L2_S2 b ON b.EVENT_ID = a.EVENT_ID WHERE a.DETECTED_DATE <> '{o[0].date().isoformat()}') = 0",
        f"'{len(overlap)} overlapping ids'")}\
{_check("overlap_rows_identical",
        "(SELECT COUNT(*) FROM (SELECT * FROM L2_S1 WHERE EVENT_ID IN (SELECT EVENT_ID FROM L2_S2) MINUS SELECT * FROM L2_S2)) = 0")}\
{_check("overlap_union_equals_backfill_no_gap",
        f"(SELECT COUNT(*) FROM ((SELECT * FROM L2_S1 UNION SELECT * FROM L2_S2) MINUS SELECT * FROM L2_S0 WHERE DETECTED_DATE BETWEEN '{sp._run_weeks(o[0].date(), 0)[0].isoformat()}' AND '{o[1].date().isoformat()}')) = 0 AND (SELECT COUNT(*) FROM (SELECT * FROM L2_S0 WHERE DETECTED_DATE BETWEEN '{sp._run_weeks(o[0].date(), 0)[0].isoformat()}' AND '{o[1].date().isoformat()}' MINUS (SELECT * FROM L2_S1 UNION SELECT * FROM L2_S2))) = 0")}\

-- -----------------------------------------------------------------------------
-- 5. Results, then cleanup
-- -----------------------------------------------------------------------------
SELECT SEQ, NAME, OK, DETAIL FROM L2_RESULTS ORDER BY SEQ;
SELECT COUNT(*) AS L2_CHECKS, COUNT_IF(OK) AS L2_PASSED, COUNT_IF(NOT OK OR OK IS NULL) = 0 AS L2_ALL_PASS FROM L2_RESULTS;

DROP SCHEMA IF EXISTS {SCHEMA} CASCADE;
"""
    if "&" in sql:
        raise RuntimeError("bare '&' in generated L2 SQL")
    if "DATA_JEDAIS" in sql:
        raise RuntimeError("L2 SQL must not reference DATA_JEDAIS")
    return sql


def main(argv: list[str]) -> int:
    sql = build()
    if "--check" in argv:
        if SQL_OUT.read_text() != sql:
            print("stale: run python3 tests/integration/build_l2.py", file=sys.stderr)
            return 1
        return 0
    SQL_OUT.write_text(sql)
    print(f"wrote {SQL_OUT} ({len(sql)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
