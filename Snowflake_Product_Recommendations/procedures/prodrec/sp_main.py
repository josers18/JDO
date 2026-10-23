"""Stored-procedure entry point: feature SQL, transactional replace, input asserts."""
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
  SELECT SFACCOUNTID AS ACCOUNT_ID, FLOOR(DATEDIFF(day, TRANSACTIONDATE, CURRENT_DATE()) / 30) AS b,
         SUM(IFF(TRANSACTION_TYPE = 'Credit', AMOUNT, 0)) AS cr, SUM(IFF(TRANSACTION_TYPE = 'Debit', AMOUNT, 0)) AS dr
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTIONS
  WHERE TRANSACTIONDATE >= DATEADD(day, -90, CURRENT_DATE()) GROUP BY 1, 2
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
  SELECT SFACCOUNTID AS ACCOUNT_ID, FLOOR(DATEDIFF(day, TRANSACTIONDATE, CURRENT_DATE()) / 30) AS b,
         SUM(IFF(TRANSACTION_TYPE = 'Credit', AMOUNT, 0)) AS cr
  FROM {_sp_PREFIX}.FINANCIAL_TRANSACTIONS
  WHERE TRANSACTIONDATE >= DATEADD(day, -90, CURRENT_DATE()) GROUP BY 1, 2
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


def replace_table(session, table: str, columns: tuple[str, ...], rows: list[dict]) -> int:
    """Stage via write_pandas, then DELETE + INSERT...SELECT in one transaction."""
    import pandas as pd

    df = pd.DataFrame(rows, columns=list(columns))
    staging = table + "_STAGING"
    cols = ", ".join(columns)
    try:
        session.write_pandas(
            df, staging.split(".")[-1], database=_sp_DB, schema=_sp_SCHEMA,
            auto_create_table=True, overwrite=True,
        )
        session.sql("BEGIN").collect()
        try:
            session.sql(f"DELETE FROM {table}").collect()
            session.sql(f"INSERT INTO {table} ({cols}) SELECT {cols} FROM {staging}").collect()
            session.sql("COMMIT").collect()
        except Exception:
            try:
                session.sql("ROLLBACK").collect()
            except Exception:
                pass  # never mask the original failure
            raise
    finally:
        session.sql(f"DROP TABLE IF EXISTS {staging}").collect()
    return len(rows)


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


def _sp_build_inputs(rows, profile_fn, input_fn, run_ts, side):
    out, errors = [], []
    for r in rows:
        try:
            out.append(input_fn(profile_fn(r, r, run_ts)))
        except Exception as exc:  # noqa: BLE001 - tolerance counted below
            errors.append((r.get("ACCOUNT_ID"), str(exc)[:200]))
    tolerated = max(10, len(rows) // 100)
    if len(errors) > tolerated:
        raise RuntimeError(
            f"{side} row factory failed on {len(errors)}/{len(rows)} accounts "
            f"(tolerance {tolerated}); first: {errors[0]}"
        )
    return out


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

        if mode in ("INPUTS", "ALL"):
            biz_in = _sp_build_inputs(biz, business_profile, business_input_row, run_ts, "business")
            per_in = _sp_build_inputs(per, personal_profile, personal_input_row, run_ts, "personal")
            rows_inserted += replace_table(session, _sp_BIZ_SUBSET, BUSINESS_SUBSET_COLUMNS, biz_in)
            rows_inserted += replace_table(session, _sp_PER_SUBSET, PERSONAL_SUBSET_COLUMNS, per_in)
            assert_inputs(session)

        if mode in ("TRAINING", "ALL"):
            biz_tr = build_training_set([(r, r) for r in biz], "business", run_ts, _sp_BIZ_TRAINING_SIZE)
            per_tr = build_training_set([(r, r) for r in per], "personal", run_ts, _sp_PER_TRAINING_SIZE)
            for side, tr in (("business", biz_tr), ("personal", per_tr)):
                problems = mix_problems([r["RECOMMENDED_PRODUCT"] for r in tr], floor=100)
                if problems:
                    raise RuntimeError(f"label mix gate: {side}: " + "; ".join(problems))
            rows_inserted += replace_table(session, _sp_BIZ_TRAINING, BUSINESS_TRAINING_COLUMNS, biz_tr)
            rows_inserted += replace_table(session, _sp_PER_TRAINING, PERSONAL_TRAINING_COLUMNS, per_tr)
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
            params=[log_id, TASK_NAME, started, status, rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"
