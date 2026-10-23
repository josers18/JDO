"""Stored-procedure entry point: feature SQL, all-tables transactional replace, input asserts."""
import uuid
from datetime import datetime, timezone

from cumulus_common.coverage import assert_coverage
from prodrec.business import business_input_row, business_profile
from prodrec.personal import personal_input_row, personal_profile
from prodrec.training import build_training_set, mix_problems
from prodrec.vocab import (
    BUSINESS_SUBSET_COLUMNS, BUSINESS_TRAINING_COLUMNS,
    PERSONAL_SUBSET_COLUMNS, PERSONAL_TRAINING_COLUMNS,
)

TASK_NAME = "TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS"

_sp_DB = "DATA_JEDAIS"
_sp_SCHEMA = "FINS__PUBLIC"
_sp_PREFIX = f"{_sp_DB}.{_sp_SCHEMA}"
_sp_BIZ_SUBSET = f"{_sp_PREFIX}.BUSINESS_PRODUCT_RECOMMENDATION_SUBSET"
_sp_PER_SUBSET = f"{_sp_PREFIX}.PERSONAL_PRODUCT_RECOMMENDATION_SUBSET"
_sp_BIZ_TRAINING = f"{_sp_PREFIX}.BUSINESS_PRODUCT_RECOMMENDATION_SET"
_sp_PER_TRAINING = f"{_sp_PREFIX}.PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET"
_sp_BIZ_TRAINING_SIZE = 3500
_sp_PER_TRAINING_SIZE = 7500
_sp_MODES = ("INPUTS", "TRAINING", "ALL")

# Audience CTEs, written once per side; the feature SQL and the live recount share them.
_sp_BIZ_AUD = f"""aud AS (
  SELECT * FROM {_sp_PREFIX}.V_ACCOUNT_ANCHORS
  WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household' AND ACCOUNT_ID LIKE '001am%'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY ANNUAL_REVENUE DESC NULLS LAST, EMPLOYEE_COUNT DESC NULLS LAST) = 1
)"""
_sp_PER_AUD = f"""aud AS (
  SELECT * FROM {_sp_PREFIX}.V_ACCOUNT_ANCHORS
  WHERE ACCOUNT_TYPE_FLAG = 'PERSON'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY ANNUAL_INCOME DESC NULLS LAST) = 1
)"""

# Feed windows end at the run month's first day (exclusive), so every re-run inside a month
# reads the same 90 days and in-month / future-dated transactions never enter.
_sp_FEED_ANCHOR = "DATE_TRUNC('month', CURRENT_DATE())"
_sp_FEED_WINDOW = (
    f"TRANSACTIONDATE >= DATEADD(day, -90, {_sp_FEED_ANCHOR}) AND TRANSACTIONDATE < {_sp_FEED_ANCHOR}"
)

BUSINESS_FEATURES_SQL = f"""WITH {_sp_BIZ_AUD},
fta AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID,
         SUM(IFF(PRODUCT_KIND = 'deposit', BALANCE, NULL)) AS DEPOSIT_BALANCE,
         COUNT(DISTINCT FINANCIAL_ACCOUNT_TYPE) AS PRODUCT_COUNT, MIN(OPEN_DATE) AS FIRST_OPEN_DATE,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Loans' AND PRODUCT_KIND = 'loan', 1, 0)) AS HAS_LOAN,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Loans' AND PRODUCT_KIND = 'line', 1, 0)) AS HAS_LINE,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Credit Cards', 1, 0)) AS HAS_CARD,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Treasury Management', 1, 0)) AS HAS_TREASURY,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Investments', 1, 0)) AS HAS_INVESTMENT
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTION_ACCOUNTS
  WHERE COALESCE(ACTIVE, TRUE) GROUP BY 1
),
ftm AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID, FLOOR(DATEDIFF(day, TRANSACTIONDATE, {_sp_FEED_ANCHOR}) / 30) AS b,
         SUM(IFF(TRANSACTION_TYPE = 'Credit', AMOUNT, 0)) AS cr, SUM(IFF(TRANSACTION_TYPE = 'Debit', AMOUNT, 0)) AS dr
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTIONS
  WHERE {_sp_FEED_WINDOW} GROUP BY 1, 2
),
ft AS (
  SELECT ACCOUNT_ID, AVG(cr) AS MONTHLY_CREDITS, AVG(cr - dr) AS MONTHLY_NET,
         STDDEV_POP(cr - dr) AS MONTHLY_NET_SD, COUNT(*) AS FEED_MONTHS
  FROM ftm WHERE b < 3 GROUP BY 1
),
zi AS (
  SELECT ACCOUNT_ID, MAX(FOUNDED_YEAR) AS FOUNDED_YEAR FROM {_sp_PREFIX}.ZOOMINFO_FIRMOGRAPHICS
  WHERE PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM {_sp_PREFIX}.ZOOMINFO_FIRMOGRAPHICS) GROUP BY 1
)
SELECT aud.*, fta.* EXCLUDE (ACCOUNT_ID), ft.* EXCLUDE (ACCOUNT_ID), zi.FOUNDED_YEAR
FROM aud LEFT JOIN fta USING (ACCOUNT_ID) LEFT JOIN ft USING (ACCOUNT_ID) LEFT JOIN zi USING (ACCOUNT_ID)"""

PERSONAL_FEATURES_SQL = f"""WITH {_sp_PER_AUD},
fta AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID,
         SUM(IFF(PRODUCT_KIND = 'deposit', BALANCE, NULL)) AS DEPOSIT_BALANCE,
         SUM(IFF(PRODUCT_KIND = 'deposit', DIRECT_DEPOSIT_AMOUNT, NULL)) AS DIRECT_DEPOSIT,
         COUNT(DISTINCT FINANCIAL_ACCOUNT_TYPE) AS PRODUCT_COUNT, MIN(OPEN_DATE) AS FIRST_OPEN_DATE,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Loans' AND PRODUCT_KIND = 'loan', 1, 0)) AS HAS_LOAN,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Loans' AND PRODUCT_KIND = 'line', 1, 0)) AS HAS_LINE,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Credit Cards', 1, 0)) AS HAS_CARD,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Treasury Management', 1, 0)) AS HAS_TREASURY,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Investments', 1, 0)) AS HAS_INVESTMENT
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTION_ACCOUNTS
  WHERE COALESCE(ACTIVE, TRUE) GROUP BY 1
),
ftm AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID, FLOOR(DATEDIFF(day, TRANSACTIONDATE, {_sp_FEED_ANCHOR}) / 30) AS b,
         SUM(IFF(TRANSACTION_TYPE = 'Credit', AMOUNT, 0)) AS cr
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTIONS
  WHERE {_sp_FEED_WINDOW} GROUP BY 1, 2
),
ft AS (
  SELECT ACCOUNT_ID, AVG(cr) AS MONTHLY_CREDITS FROM ftm WHERE b < 3 GROUP BY 1
),
cl AS (
  SELECT ACCOUNT_ID, MAX(IS_OWNER) AS IS_OWNER, MAX(OUTSTANDING_MORTGAGE_BALANCE) AS MORTGAGE_BALANCE,
         MAX(ESTIMATED_PROPERTY_VALUE) AS PROPERTY_VALUE
  FROM {_sp_PREFIX}.CORELOGIC_PROPERTY
  WHERE PROFILE_QUARTER = (SELECT MAX(PROFILE_QUARTER) FROM {_sp_PREFIX}.CORELOGIC_PROPERTY) GROUP BY 1
),
cd AS (
  SELECT ACCOUNT_ID, MAX(LIFE_STAGE) AS LIFE_STAGE, MAX(INVESTMENT_PROPENSITY_SCORE) AS INVESTMENT_PROPENSITY,
         MAX(FINANCIAL_STRESS_INDICATOR) AS FINANCIAL_STRESS
  FROM {_sp_PREFIX}.CLARITAS_DEMOGRAPHICS
  WHERE PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM {_sp_PREFIX}.CLARITAS_DEMOGRAPHICS) GROUP BY 1
)
SELECT aud.*, fta.* EXCLUDE (ACCOUNT_ID), ft.* EXCLUDE (ACCOUNT_ID),
       cl.* EXCLUDE (ACCOUNT_ID), cd.* EXCLUDE (ACCOUNT_ID)
FROM aud LEFT JOIN fta USING (ACCOUNT_ID) LEFT JOIN ft USING (ACCOUNT_ID)
     LEFT JOIN cl USING (ACCOUNT_ID) LEFT JOIN cd USING (ACCOUNT_ID)"""


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


def _sp_stage(session, table: str, columns: tuple[str, ...], rows: list[dict]) -> str:
    """write_pandas into <table>_STAGING (DDL: must run before BEGIN). Returns the staging name."""
    import pandas as pd

    staging = table + "_STAGING"
    session.write_pandas(
        pd.DataFrame(rows, columns=list(columns)), staging.split(".")[-1], database=_sp_DB, schema=_sp_SCHEMA,
        auto_create_table=True, overwrite=True,
    )
    return staging


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
                session.sql(f"INSERT INTO {table} ({cols}) SELECT {cols} FROM {table}_STAGING").collect()
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
    """Coverage, uniqueness, disjointness, key-prefix and audience-size checks on both subsets."""
    sides = (
        ("business", _sp_BIZ_AUD, _sp_BIZ_SUBSET),
        ("personal", _sp_PER_AUD, _sp_PER_SUBSET),
    )
    for side, aud, subset in sides:
        expected_sql = f"WITH {aud} SELECT COUNT(*) FROM aud"
        assert_coverage(session, expected_sql, f"SELECT COUNT(DISTINCT ACCOUNTID) FROM {subset}")
        dups = _sp_scalar(session, f"SELECT COUNT(*) - COUNT(DISTINCT ACCOUNTID) FROM {subset}")
        if dups:
            raise RuntimeError(f"coverage gap: {side} subset has {dups} duplicate ACCOUNTID rows")
        bad = _sp_scalar(session, f"SELECT COUNT(*) FROM {subset} WHERE ACCOUNTID NOT LIKE '001am%'")
        if bad:
            raise RuntimeError(f"coverage gap: {side} subset has {bad} keys not LIKE '001am%'")
        aud_n = _sp_scalar(session, expected_sql)
        rows_n = _sp_scalar(session, f"SELECT COUNT(*) FROM {subset}")
        if rows_n > aud_n:
            raise RuntimeError(
                f"coverage gap: {side} subset has {rows_n} rows, audience has {aud_n}"
            )
    overlap = _sp_scalar(
        session,
        f"SELECT COUNT(*) FROM {_sp_BIZ_SUBSET} b JOIN {_sp_PER_SUBSET} p ON b.ACCOUNTID = p.ACCOUNTID",
    )
    if overlap:
        raise RuntimeError(f"coverage gap: {overlap} accounts appear in both subsets")


def _sp_build_inputs(rows, profile_fn, input_fn, run_ts):
    """Zero tolerance: returns (input_rows, errors); the caller raises if errors is non-empty."""
    out, errors = [], []
    for r in rows:
        try:
            out.append(input_fn(profile_fn(r, r, run_ts)))
        except Exception as exc:  # noqa: BLE001 - collected and raised by main
            errors.append((r.get("ACCOUNT_ID"), str(exc)[:200]))
    return out, errors


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
        biz = dedupe_anchors([_sp_to_dict(r) for r in session.sql(BUSINESS_FEATURES_SQL).collect()])
        per = dedupe_anchors([_sp_to_dict(r) for r in session.sql(PERSONAL_FEATURES_SQL).collect()])
        accounts_processed = len(biz) + len(per)
        if not biz or not per:
            empty = "business" if not biz else "personal"
            raise RuntimeError(f"empty audience: {empty} feature query returned no accounts")

        # Build every DataFrame and pass every gate before any staging or DML.
        writes = []
        if mode in ("INPUTS", "ALL"):
            biz_in, biz_err = _sp_build_inputs(biz, business_profile, business_input_row, run_ts)
            per_in, per_err = _sp_build_inputs(per, personal_profile, personal_input_row, run_ts)
            errors = [("business",) + e for e in biz_err] + [("personal",) + e for e in per_err]
            if errors:
                raise RuntimeError(
                    f"input row factory failed on {len(errors)} accounts; first 3: {errors[:3]}"
                )
            writes += [(_sp_BIZ_SUBSET, BUSINESS_SUBSET_COLUMNS, biz_in),
                       (_sp_PER_SUBSET, PERSONAL_SUBSET_COLUMNS, per_in)]

        if mode in ("TRAINING", "ALL"):
            biz_tr = build_training_set([(r, r) for r in biz], "business", run_ts, _sp_BIZ_TRAINING_SIZE)
            per_tr = build_training_set([(r, r) for r in per], "personal", run_ts, _sp_PER_TRAINING_SIZE)
            for side, tr in (("business", biz_tr), ("personal", per_tr)):
                problems = mix_problems([r["RECOMMENDED_PRODUCT"] for r in tr], floor=100)
                if problems:
                    raise RuntimeError(f"label mix gate: {side}: " + "; ".join(problems))
            writes += [(_sp_BIZ_TRAINING, BUSINESS_TRAINING_COLUMNS, biz_tr),
                       (_sp_PER_TRAINING, PERSONAL_TRAINING_COLUMNS, per_tr)]

        check = assert_inputs if mode in ("INPUTS", "ALL") else None
        rows_inserted = replace_tables(session, writes, check=check)
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, f"{TASK_NAME}[{mode}]", started, status, rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"
