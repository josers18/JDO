"""LSEG World-Check / Dow Jones / ComplyAdvantage-style synthetic AML generator.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML. **First daily-cadence Cumulus
dataset** AND **first all-accounts-audience dataset.** Emits exactly one
row per distinct anchor per screening day (1:1, ~36,813 rows/day).

Audience: all accounts — no WHERE predicate beyond `SELECT DISTINCT *`.
Cadence:  DAILY (06:00 UTC daily, after LSEG's overnight feed publishes
          at ~02:00 GMT).
Salts:
  - "worldcheck"               (day-bucketed; main rng for component flags)
  - "worldcheck_jurisdiction"  (year-stable; RISK_JURISDICTION_CODE+TIER)
  - "worldcheck_case"          (year-stable; CASE_REFERENCE)
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-7-worldcheck-aml.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-7-worldcheck-aml-rowspec.md

NOTE on day-bucketing: cumulus_common.seed_for buckets on Y-M, so to obtain
distinct seeds across days within the same month we encode the day in the
account_id parameter (which IS folded into the SHA-256 hash). This is the
same folding pattern Plan 6 uses for slot indices, just with a date suffix.
"""
from __future__ import annotations

import hashlib
import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants -- these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE                       = "DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML"
TASK_NAME                   = "TASK_DAILY_WORLD_CHECK_AML"
DATASET_SALT                = "worldcheck"
DATASET_SALT_JURISDICTION   = "worldcheck_jurisdiction"
DATASET_SALT_CASE           = "worldcheck_case"

# Plan 7 has no audience predicate -- every distinct account is screened daily.
_AUDIENCE_PREDICATE = ""  # all-accounts; kept as empty string for symmetry
AUDIENCE_SQL = "SELECT DISTINCT ORG_ID, ACCOUNT_ID, ACCOUNT_NAME, CLIENT_CATEGORY, ACCOUNT_TYPE_FLAG, BIRTHDATE, ANNUAL_INCOME, CREDIT_SCORE, INDUSTRY, ANNUAL_REVENUE, EMPLOYEE_COUNT, POSTAL_CODE, STATE_CODE, COUNTRY_CODE, EXTERNAL_ID FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS QUALIFY ROW_NUMBER() OVER (PARTITION BY ORG_ID, ACCOUNT_ID ORDER BY SNAPSHOT_DATE DESC) = 1"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"

# 14-column output contract (kept in sync with the table DDL by the L1 schema test).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID", "ACCOUNT_ID", "PROFILE_DATE", "OVERALL_RISK_RATING",
    "SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT",
    "ADVERSE_MEDIA_CATEGORIES",
    "RISK_JURISDICTION_CODE", "RISK_JURISDICTION_TIER",
    "LAST_SCREENED_AT", "CHANGE_SINCE_LAST_RUN",
    "CASE_REFERENCE", "GENERATED_AT",
})


# ===================================================================
# Deterministic helpers  (pure functions -- side-effect free)
# ===================================================================

# Risk-jurisdiction lookup -- 13 buckets from real-world AML risk tiers.
_JURISDICTIONS: list[tuple[str, str]] = [
    ("US", "Low"),   ("GB", "Low"),   ("DE", "Low"),   ("FR", "Low"),
    ("JP", "Low"),   ("SG", "Medium"),("HK", "Medium"),("AE", "Medium"),
    ("KE", "Medium"),("NG", "High"),  ("PK", "High"),  ("IR", "Prohibited"),
    ("KP", "Prohibited"),
]

# Year-stable base probabilities -- calibrated against the rowspec marginal targets.
# Daily-flip events perturb these so that ~0.3% of accounts change on any given day.
_DAILY_FLIP_PROB = 0.003


def _day_start(run_ts: datetime) -> datetime:
    """Midnight UTC of run_ts date -- canonical for per-day determinism."""
    return datetime(run_ts.year, run_ts.month, run_ts.day)


def _daily_seed(account_id: str, day_start: datetime) -> bytes:
    """32-byte deterministic seed: stable for (account_id, calendar-day)."""
    key = f"{account_id}|{DATASET_SALT}|{day_start:%Y-%m-%d}"
    return hashlib.sha256(key.encode("utf-8")).digest()


# -- risk jurisdiction (year-stable per account) --------------------

def _risk_jurisdiction_stable(account_id: str, run_ts: datetime) -> tuple[str, str]:
    """Return (code, tier) that is stable for the entire year."""
    seed = seed_for(account_id, DATASET_SALT_JURISDICTION, run_ts)
    rng = random.Random(seed)
    code, tier = rng.choice(_JURISDICTIONS)
    return code, tier


# -- flag helpers (year-stable base XOR daily flip) -----------------

def _year_stable_flag(account_id: str, run_ts: datetime, flag_name: str,
                      base_prob: float) -> int:
    """0 or 1, stable for the whole year for a given (account, flag)."""
    seed = seed_for(account_id, f"{DATASET_SALT}_{flag_name}", run_ts)
    rng = random.Random(seed)
    return 1 if rng.random() < base_prob else 0


def _flag_with_daily_flip(account_id: str, run_ts: datetime, flag_name: str,
                          base_prob: float, daily_rng: random.Random) -> int:
    """Base flag XOR a rare daily-flip event (~0.3% of accounts per day)."""
    base = _year_stable_flag(account_id, run_ts, flag_name, base_prob)
    flip = 1 if daily_rng.random() < _DAILY_FLIP_PROB else 0
    return base ^ flip


# -- adverse-media categories (conditioned on media flag) -----------

_MEDIA_CATS: list[str | None] = [
    "Financial Crime", "Terrorism", "Fraud", "Corruption",
    "Tax Evasion", "Sanctions Evasion", None,
]


def _adverse_media_categories(media_flag: int, rng: random.Random) -> str | None:
    if not media_flag:
        return None
    return rng.choice(_MEDIA_CATS)


# -- overall risk rating -------------------------------------------

_NOISE_BUMP_PROB = 0.005  # ~0.5% year-stable tail bump

def _noise_tail_bump(account_id: str, run_ts: datetime) -> bool:
    """True ~0.5% of accounts; year-stable."""
    seed = seed_for(account_id, f"{DATASET_SALT}_noise", run_ts)
    rng = random.Random(seed)
    return rng.random() < _NOISE_BUMP_PROB


def _overall_risk_rating(sanctions: int, pep: int, media: int,
                         tier: str, noise_bump: bool) -> str:
    if tier == "Prohibited":
        return "Severe"
    hits = sanctions + pep + media
    if hits >= 2 or sanctions:
        return "High"
    if hits == 1 or tier == "High" or noise_bump:
        return "Medium"
    return "Low"


# -- change since last run (re-derives yesterday to compare) --------

def _change_since_last_run(account_id: str, run_ts: datetime,
                           today_rating: str) -> str:
    """Compare today vs yesterday overall rating. 3 values: New, Changed, Unchanged."""
    yesterday = run_ts - timedelta(days=1)
    day0 = _day_start(yesterday)
    seed_y = _daily_seed(account_id, day0)
    rng_y = random.Random(seed_y)
    jc_y, jt_y = _risk_jurisdiction_stable(account_id, yesterday)
    s_y = _flag_with_daily_flip(account_id, yesterday, "sanctions", 0.002, rng_y)
    p_y = _flag_with_daily_flip(account_id, yesterday, "pep", 0.009, rng_y)
    m_y = _flag_with_daily_flip(account_id, yesterday, "media", 0.027, rng_y)
    nb_y = _noise_tail_bump(account_id, yesterday)
    yesterday_rating = _overall_risk_rating(s_y, p_y, m_y, jt_y, nb_y)
    if today_rating != yesterday_rating:
        return "Changed"
    return "Unchanged"


# -- case reference (year-stable for High/Severe) -------------------

def _case_reference(account_id: str, run_ts: datetime, overall: str) -> str | None:
    if overall not in ("High", "Severe"):
        return None
    seed = seed_for(account_id, DATASET_SALT_CASE, run_ts)
    rng = random.Random(seed)
    case_num = rng.randint(10000, 99999)
    return f"WC-{run_ts.year}-{case_num}"


# -------------------------------------------------------------------
# Audience filter (Plan 7: all-accounts, no predicate)
# -------------------------------------------------------------------
def _anchor_in_audience(anchor: dict) -> bool:
    """Return True if the anchor passes the audience filter. Plan 7: always True
    as long as ACCOUNT_ID is non-empty."""
    return bool(anchor.get("ACCOUNT_ID"))


# -------------------------------------------------------------------
# _row_for -- deterministic row builder (one anchor -> one output dict)
# -------------------------------------------------------------------
def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Build one output row from an anchor dict and run timestamp.

    Deterministic: same (anchor, run_ts day) always produces the same row.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed all-accounts audience predicate "
            f"(ACCOUNT_ID empty/missing): {anchor!r}"
        )

    account_id = anchor["ACCOUNT_ID"]

    # Daily-bucketed seed (most fields). Mid-day re-runs replay exactly.
    day_start = _day_start(run_ts)
    seed = _daily_seed(account_id, day_start)
    rng = random.Random(seed)

    # 1. Year-stable jurisdiction (rowspec invariant: does not drift day-to-day).
    jurisdiction_code, jurisdiction_tier = _risk_jurisdiction_stable(
        account_id, run_ts
    )

    # 2. Today's component flags.
    sanctions = _flag_with_daily_flip(
        account_id, run_ts, "sanctions", 0.002, rng
    )
    pep = _flag_with_daily_flip(
        account_id, run_ts, "pep", 0.009, rng
    )
    media = _flag_with_daily_flip(
        account_id, run_ts, "media", 0.027, rng
    )
    media_categories = _adverse_media_categories(media, rng)

    # 3. Roll up overall rating.
    noise_bump = _noise_tail_bump(account_id, run_ts)
    overall = _overall_risk_rating(
        sanctions, pep, media, jurisdiction_tier, noise_bump
    )

    # 4. Compare to yesterday.
    change = _change_since_last_run(account_id, run_ts, overall)

    # 5. Case reference (year-stable; populated only when High/Severe).
    case_ref = _case_reference(account_id, run_ts, overall)

    return {
        "ORG_ID":                   anchor.get("ORG_ID") or "JDO",  # v1.x multi-org: stamped from the anchor
        "ACCOUNT_ID":               account_id,
        "PROFILE_DATE":             day_start.date(),
        "OVERALL_RISK_RATING":      overall,
        "SANCTIONS_HIT":            sanctions,
        "PEP_HIT":                  pep,
        "ADVERSE_MEDIA_HIT":        media,
        "ADVERSE_MEDIA_CATEGORIES": media_categories,
        "RISK_JURISDICTION_CODE":   jurisdiction_code,
        "RISK_JURISDICTION_TIER":   jurisdiction_tier,
        "LAST_SCREENED_AT":         day_start,
        "CHANGE_SINCE_LAST_RUN":    change,
        "CASE_REFERENCE":           case_ref,
        "GENERATED_AT":             day_start,
    }


# -------------------------------------------------------------------
# Entry point
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log."""
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)  # 1:1 -- also matches row count.

        # 2. Build deterministic rows; tolerate up to 1% per-row failures.
        records, errors = [], []
        seen_account_ids = set()
        for row in audience:
            try:
                anchor = _anchor_to_dict(row)
                aid = anchor["ACCOUNT_ID"]
                if aid in seen_account_ids:
                    continue
                seen_account_ids.add(aid)
                records.append(_row_for(anchor, started))
            except Exception as exc:
                errors.append((row.ACCOUNT_ID, str(exc)[:200]))
        max_tolerated = max(10, len(audience) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience)} accounts "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience)} accounts; "
                f"first: {errors[0]}"
            )

        # 3. Idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_DATE).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion
        actual_sql = f"""SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}
                         WHERE PROFILE_DATE = CURRENT_DATE()"""
        actual = session.sql(actual_sql).collect()[0][0]
        if actual < accounts_processed:
            missing = accounts_processed - actual
            raise RuntimeError(
                f"coverage gap: {missing} missing rows (expected {accounts_processed}, got {actual})"
            )

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log -- success or failure.
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row -> plain dict so _row_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge -- idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_DATE)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "WORLD_CHECK_AML_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="DATA_JEDAIS", schema="FINS__PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML tgt
        USING (
            SELECT
                ORG_ID,
                ACCOUNT_ID,
                PROFILE_DATE,
                OVERALL_RISK_RATING,
                SANCTIONS_HIT::BOOLEAN AS SANCTIONS_HIT,
                PEP_HIT::BOOLEAN AS PEP_HIT,
                ADVERSE_MEDIA_HIT::BOOLEAN AS ADVERSE_MEDIA_HIT,
                ADVERSE_MEDIA_CATEGORIES,
                RISK_JURISDICTION_CODE,
                RISK_JURISDICTION_TIER,
                TO_TIMESTAMP_NTZ(LAST_SCREENED_AT::NUMBER / 1000000000) AS LAST_SCREENED_AT,
                CHANGE_SINCE_LAST_RUN,
                CASE_REFERENCE,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM DATA_JEDAIS.FINS__PUBLIC.{staging}
            QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID, PROFILE_DATE ORDER BY GENERATED_AT DESC) = 1
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_DATE = src.PROFILE_DATE
        WHEN MATCHED THEN UPDATE SET
            OVERALL_RISK_RATING      = src.OVERALL_RISK_RATING,
            SANCTIONS_HIT            = src.SANCTIONS_HIT,
            PEP_HIT                  = src.PEP_HIT,
            ADVERSE_MEDIA_HIT        = src.ADVERSE_MEDIA_HIT,
            ADVERSE_MEDIA_CATEGORIES = src.ADVERSE_MEDIA_CATEGORIES,
            RISK_JURISDICTION_CODE   = src.RISK_JURISDICTION_CODE,
            RISK_JURISDICTION_TIER   = src.RISK_JURISDICTION_TIER,
            LAST_SCREENED_AT         = src.LAST_SCREENED_AT,
            CHANGE_SINCE_LAST_RUN    = src.CHANGE_SINCE_LAST_RUN,
            CASE_REFERENCE           = src.CASE_REFERENCE,
            GENERATED_AT             = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID, ACCOUNT_ID, PROFILE_DATE, OVERALL_RISK_RATING,
            SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT,
            ADVERSE_MEDIA_CATEGORIES,
            RISK_JURISDICTION_CODE, RISK_JURISDICTION_TIER,
            LAST_SCREENED_AT, CHANGE_SINCE_LAST_RUN,
            CASE_REFERENCE, GENERATED_AT
        ) VALUES (
            src.ORG_ID, src.ACCOUNT_ID, src.PROFILE_DATE, src.OVERALL_RISK_RATING,
            src.SANCTIONS_HIT, src.PEP_HIT, src.ADVERSE_MEDIA_HIT,
            src.ADVERSE_MEDIA_CATEGORIES,
            src.RISK_JURISDICTION_CODE, src.RISK_JURISDICTION_TIER,
            src.LAST_SCREENED_AT, src.CHANGE_SINCE_LAST_RUN,
            src.CASE_REFERENCE, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
