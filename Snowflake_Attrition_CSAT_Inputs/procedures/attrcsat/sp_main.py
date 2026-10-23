"""Stored-procedure entry point: feature SQL, cross-table gates, all-tables transactional replace."""
import uuid
from datetime import datetime, timezone

from cumulus_common.coverage import assert_coverage
from attrcsat.attrition import attrition_row
from attrcsat.checks import cross_table_problems, row_problems
from attrcsat.csat import csat_row
from attrcsat.enrollments import enrollment_problems, enrollment_row
from attrcsat.profile import build_profile
from attrcsat.vocab import ATTRITION_COLUMNS, CSAT_COLUMNS, ENROLLMENT_COLUMNS

TASK_NAME = "TASK_MONTHLY_ATTRITION_CSAT_INPUTS"

_sp_DB = "DATA_JEDAIS"
_sp_SCHEMA = "FINS__PUBLIC"
_sp_PREFIX = f"{_sp_DB}.{_sp_SCHEMA}"
_sp_ATT = f"{_sp_PREFIX}.ATTRITION_INPUTS"
_sp_CSAT = f"{_sp_PREFIX}.CSAT_ATTRITION_INPUTS"
_sp_ENR = f"{_sp_PREFIX}.ENROLLMENTS"
_sp_MODES = ("INPUTS",)

# Audience: every 001am anchor (households included), one row per ACCOUNT_ID.
_sp_AUD = f"""aud AS (
  SELECT ACCOUNT_ID, ACCOUNT_TYPE_FLAG, CLIENT_CATEGORY, BIRTHDATE, ANNUAL_INCOME, ANNUAL_REVENUE, CREDIT_SCORE
  FROM {_sp_PREFIX}.V_ACCOUNT_ANCHORS
  WHERE ACCOUNT_ID LIKE '001am%'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY SNAPSHOT_DATE DESC NULLS LAST) = 1
)"""

# Feed windows end at the run month's first day (exclusive): re-runs inside a month read the same data.
_sp_ANCHOR = "DATE_TRUNC('month', CURRENT_DATE())"

FEATURES_SQL = f"""WITH {_sp_AUD},
nps AS (
  SELECT ACCOUNTID AS ACCOUNT_ID, NPS_SCORE, NPS_DESCRIPTION,
         COUNT_IF(NPS_SCORE <= 4 AND SCORE_DATE >= DATEADD(month, -12, {_sp_ANCHOR}))
           OVER (PARTITION BY ACCOUNTID) AS DETRACTOR_12M
  FROM {_sp_PREFIX}.CSAT_NPS_DATA
  WHERE SCORE_DATE < {_sp_ANCHOR}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNTID ORDER BY SCORE_DATE DESC) = 1
),
fta_raw AS (
  SELECT * FROM {_sp_PREFIX}.FINANCIAL_TRANSACTION_ACCOUNTS WHERE COALESCE(ACTIVE, TRUE)
),
fta AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID,
         COUNT(DISTINCT FINANCIAL_ACCOUNT_TYPE) AS N_PRODUCTS,
         COUNT_IF(PRODUCT_KIND = 'deposit') AS N_DEPOSIT,
         COUNT_IF(PRODUCT_KIND = 'loan') AS N_LOAN,
         COUNT_IF(FINANCIAL_ACCOUNT_TYPE = 'Investments') AS N_INVESTMENT,
         COUNT_IF(PRODUCT_KIND = 'line') AS N_LINE,
         SUM(DIRECT_DEPOSIT_AMOUNT) AS DD_AMOUNT,
         SUM(BONUS_AMOUNT) AS BONUS_AMOUNT,
         MIN(OPEN_DATE) AS FIRST_OPEN_DATE,
         SUM(BALANCE) AS TOTAL_BALANCE
  FROM fta_raw GROUP BY 1
),
fta_map AS (
  SELECT DISTINCT ACCOUNTID, SFACCOUNTID AS ACCOUNT_ID FROM fta_raw
),
adb_day AS (
  SELECT m.ACCOUNT_ID, b.BALANCE_DATE, SUM(b.BALANCE) AS BAL, SUM(b.DAILY_CREDITS) AS CR,
         SUM(b.DAILY_DEBITS) AS DR, SUM(b.TRANSACTION_COUNT) AS TXN
  FROM {_sp_PREFIX}.ACCOUNT_DAILY_BALANCE b JOIN fta_map m ON b.ACCOUNTID = m.ACCOUNTID
  WHERE b.BALANCE_DATE >= DATEADD(month, -6, {_sp_ANCHOR}) AND b.BALANCE_DATE < {_sp_ANCHOR}
  GROUP BY 1, 2
),
adb AS (
  SELECT ACCOUNT_ID, AVG(BAL) AS AVG_BALANCE,
         AVG(IFF(BALANCE_DATE < DATEADD(month, -3, {_sp_ANCHOR}), BAL, NULL)) AS EARLY_AVG_BALANCE,
         AVG(IFF(BALANCE_DATE >= DATEADD(month, -3, {_sp_ANCHOR}), BAL, NULL)) AS LATE_AVG_BALANCE,
         SUM(CR) AS CREDITS, SUM(DR) AS DEBITS, SUM(TXN) AS ADB_TXN, COUNT(DISTINCT BALANCE_DATE) AS ADB_DAYS
  FROM adb_day GROUP BY 1
),
ft AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID, COUNT(*) AS FT_TXN
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTIONS
  WHERE POSTINGDATE >= DATEADD(day, -30, {_sp_ANCHOR}) AND POSTINGDATE < {_sp_ANCHOR}
  GROUP BY 1
),
gong AS (
  SELECT ACCOUNT_ID, SUM(CALL_COUNT_LAST_7D) AS CALLS, COUNT(*) AS GONG_WEEKS, MAX(LAST_CALL_DATE) AS LAST_CALL_DATE,
         COUNT_IF(OVERALL_SENTIMENT IN ('Negative', 'VeryNegative')) AS NEG_WEEKS,
         COUNT_IF(OVERALL_SENTIMENT = 'VeryNegative') AS VNEG_WEEKS
  FROM {_sp_PREFIX}.GONG_CALL_SENTIMENT
  WHERE PROFILE_WEEK >= DATEADD(week, -12, {_sp_ANCHOR}) AND PROFILE_WEEK < {_sp_ANCHOR}
  GROUP BY 1
),
wc AS (
  SELECT ACCOUNT_ID, OVERALL_RISK_RATING AS RISK_RATING, SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT
  FROM {_sp_PREFIX}.WORLD_CHECK_AML
  WHERE PROFILE_DATE <= {_sp_ANCHOR}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY PROFILE_DATE DESC) = 1
)
SELECT aud.*, nps.* EXCLUDE (ACCOUNT_ID), fta.* EXCLUDE (ACCOUNT_ID), adb.* EXCLUDE (ACCOUNT_ID),
       ft.* EXCLUDE (ACCOUNT_ID), gong.* EXCLUDE (ACCOUNT_ID), wc.* EXCLUDE (ACCOUNT_ID)
FROM aud LEFT JOIN nps USING (ACCOUNT_ID) LEFT JOIN fta USING (ACCOUNT_ID) LEFT JOIN adb USING (ACCOUNT_ID)
     LEFT JOIN ft USING (ACCOUNT_ID) LEFT JOIN gong USING (ACCOUNT_ID) LEFT JOIN wc USING (ACCOUNT_ID)"""


def _sp_to_dict(row) -> dict:
    """Snowpark Row -> plain dict (dicts pass through)."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    return dict(row)


def dedupe_anchors(rows: list[dict]) -> list[dict]:
    """Python backstop on ACCOUNT_ID: keep the first row per account."""
    seen: set = set()
    out = []
    for r in rows:
        k = r["ACCOUNT_ID"]
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def _sp_build_all(features: list[dict], run_ts):
    """One profile list drives all three tables, so the lists are aligned by index.
    Zero tolerance: any row-factory exception raises with the first few account ids."""
    profiles, att, csat, enr, errors = [], [], [], [], []
    for f in features:
        try:
            p = build_profile(f, run_ts)
            e = enrollment_row(p, run_ts)
            a = attrition_row(p, e)
            c = csat_row(p, e)
        except Exception as exc:  # noqa: BLE001 - collected and raised together
            errors.append((f.get("ACCOUNT_ID"), str(exc)[:200]))
            continue
        profiles.append(p)
        enr.append(e)
        att.append(a)
        csat.append(c)
    if errors:
        raise RuntimeError(f"row factory failed on {len(errors)} accounts; first 3: {errors[:3]}")
    return profiles, att, csat, enr


def gate_problems(profiles, att, csat, enr) -> list[str]:
    """Every in-memory gate; an empty list means the rows may be written."""
    out: list[str] = []
    for r in att:
        out.extend(row_problems("ATTRITION", r))
    for r in csat:
        out.extend(row_problems("CSAT", r))
    out.extend(enrollment_problems(enr, profiles))
    out.extend(cross_table_problems(att, csat, enr))
    for label, rows, key in (("ATTRITION", att, "UNIQUEID"), ("CSAT", csat, "ACCOUNTID"),
                             ("ENROLLMENTS", enr, "ACCOUNTID")):
        keys = [r.get(key) for r in rows]
        if len(set(keys)) != len(keys):
            out.append(f"{label}: {len(keys) - len(set(keys))} duplicate {key} values")
    return out


def _sp_stage(session, table: str, columns: tuple, rows: list[dict]) -> str:
    """write_pandas into <table>_STAGING (DDL: must run before BEGIN). Returns the staging name."""
    import pandas as pd

    staging = table + "_STAGING"
    session.write_pandas(
        pd.DataFrame(rows, columns=list(columns)), staging.split(".")[-1], database=_sp_DB, schema=_sp_SCHEMA,
        auto_create_table=True, overwrite=True,
    )
    return staging


def _sp_select_list(columns: tuple) -> str:
    # SNAPSHOT_DATE is staged as a string; the target column is TIMESTAMP_NTZ.
    return ", ".join("TO_TIMESTAMP_NTZ(SNAPSHOT_DATE)" if c == "SNAPSHOT_DATE" else c for c in columns)


def replace_tables(session, writes, check=None) -> int:
    """All-or-nothing replace of every target: stage all, then one BEGIN; DELETE + INSERT...SELECT
    per table; optional check(session) inside the transaction; COMMIT. ROLLBACK on any error.
    writes: [(table, columns, rows), ...]. Staging tables are dropped in finally, best-effort."""
    staged: list[str] = []
    try:
        for table, columns, rows in writes:
            staged.append(table + "_STAGING")
            _sp_stage(session, table, columns, rows)
        session.sql("BEGIN").collect()
        try:
            for table, columns, _ in writes:
                cols = ", ".join(columns)
                session.sql(f"DELETE FROM {table}").collect()
                session.sql(
                    f"INSERT INTO {table} ({cols}) SELECT {_sp_select_list(columns)} FROM {table}_STAGING"
                ).collect()
            if check is not None:
                check(session)
            session.sql("COMMIT").collect()
        except Exception:
            try:
                session.sql("ROLLBACK").collect()
            except Exception:
                pass  # never mask the original failure
            raise
    finally:
        for staging in staged:
            try:
                session.sql(f"DROP TABLE IF EXISTS {staging}").collect()
            except Exception:
                pass  # cleanup must not mask the original failure
    return sum(len(rows) for _, _, rows in writes)


def _sp_scalar(session, sql: str) -> int:
    return int(session.sql(sql).collect()[0][0] or 0)


def assert_inputs(session) -> None:
    """Per table: coverage vs the live audience, duplicate keys, key prefix, row count, NULLs."""
    expected_sql = f"WITH {_sp_AUD} SELECT COUNT(*) FROM aud"
    tables = (
        ("attrition", _sp_ATT, "UNIQUEID", ATTRITION_COLUMNS),
        ("csat", _sp_CSAT, "ACCOUNTID", CSAT_COLUMNS),
        ("enrollments", _sp_ENR, "ACCOUNTID", ENROLLMENT_COLUMNS),
    )
    for label, table, key, columns in tables:
        assert_coverage(session, expected_sql, f"SELECT COUNT(DISTINCT {key}) FROM {table}")
        dups = _sp_scalar(session, f"SELECT COUNT(*) - COUNT(DISTINCT {key}) FROM {table}")
        if dups:
            raise RuntimeError(f"coverage gap: {label} has {dups} duplicate {key} rows")
        bad = _sp_scalar(session, f"SELECT COUNT(*) FROM {table} WHERE {key} NOT LIKE '001am%'")
        if bad:
            raise RuntimeError(f"coverage gap: {label} has {bad} keys not LIKE '001am%'")
        aud_n = _sp_scalar(session, expected_sql)
        rows_n = _sp_scalar(session, f"SELECT COUNT(*) FROM {table}")
        if rows_n > aud_n:
            raise RuntimeError(f"coverage gap: {label} has {rows_n} rows, audience has {aud_n}")
        nulls = " + ".join(f"COUNT_IF({c} IS NULL)" for c in columns)
        n = _sp_scalar(session, f"SELECT {nulls} FROM {table}")
        if n:
            raise RuntimeError(f"NULL values: {label} has {n} NULL cells")


def main(session, mode: str = "INPUTS") -> str:
    mode = (mode or "").upper()
    if mode not in _sp_MODES:
        raise ValueError(f"mode must be one of {_sp_MODES}, got {mode!r}")

    started = datetime.now(timezone.utc).replace(tzinfo=None)
    run_ts = started
    log_id = str(uuid.uuid4())
    status, err = "SUCCEEDED", None
    rows_inserted = accounts_processed = 0
    try:
        features = dedupe_anchors([_sp_to_dict(r) for r in session.sql(FEATURES_SQL).collect()])
        accounts_processed = len(features)
        if not features:
            raise RuntimeError("empty audience: feature query returned no accounts")

        # Build every row and pass every gate before any staging or DML.
        profiles, att, csat, enr = _sp_build_all(features, run_ts)
        problems = gate_problems(profiles, att, csat, enr)
        if problems:
            raise RuntimeError(f"input gate failed with {len(problems)} problems; first 3: {problems[:3]}")

        writes = [(_sp_ATT, ATTRITION_COLUMNS, att), (_sp_CSAT, CSAT_COLUMNS, csat),
                  (_sp_ENR, ENROLLMENT_COLUMNS, enr)]
        rows_inserted = replace_tables(session, writes, check=assert_inputs)
    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise
    finally:
        duration_ms = int((datetime.now(timezone.utc).replace(tzinfo=None) - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?)
            """,
            # Snowpark binds a None param as the string 'None', so pass '' and let NULLIF make it NULL.
            params=[log_id, f"{TASK_NAME}[{mode}]", started, status, rows_inserted, accounts_processed,
                    err or "", duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"
