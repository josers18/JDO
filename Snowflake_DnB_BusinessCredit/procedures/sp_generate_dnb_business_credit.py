"""D&B-style synthetic business credit generator.

Snowpark Python stored procedure registered as FINS.PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT.
Mirrors the canonical 5-step pattern from the Cumulus umbrella spec §5.1, with
the same BUSINESS-cardinality warning Plan 2 introduced (spec §3 v1.2 #3).

Audience: ACCOUNT_TYPE_FLAG = 'BUSINESS'  (~12K rows; over-count vs CRM ~5K
          is expected — the SP warns at >10K but does not fail; long-term fix
          is upstream PersonBirthdate__c backfill)
Cadence:  MONTHLY
Salt:     "dnb"        (per-row randomness, month-bucketed)
          "duns_id"    (DUNS derivation, year-bucketed for cross-month stability)
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-3-dnb-business-credit.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-3-dnb-business-credit-rowspec.md
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE        = "FINS.PUBLIC.DNB_BUSINESS_CREDIT"
TASK_NAME    = "TASK_MONTHLY_DNB_BUSINESS_CREDIT"
DATASET_SALT = "dnb"

# Audience predicate — single source of truth for AUDIENCE_SQL + COVERAGE_SQL.
_AUDIENCE_PREDICATE = "ACCOUNT_TYPE_FLAG = 'BUSINESS'"
AUDIENCE_SQL = f"SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

# Per spec §3 v1.2 #3: warn (do NOT fail) when BUSINESS over-count is detected.
_BUSINESS_OVERCOUNT_THRESHOLD = 10000

# 16-column output contract (kept in sync with table DDL by the L1 schema test)
# v1.5 (multi-org): ORG_ID first per umbrella ROLLOUT.md Phase A.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_MONTH",
    "DUNS_NUMBER", "DNB_RATING",
    "FINANCIAL_STRENGTH_TIER", "COMPOSITE_RISK_SCORE",
    "PAYDEX_SCORE", "AVERAGE_DAYS_BEYOND_TERMS",
    "FAILURE_RISK_SCORE", "DELINQUENCY_PREDICTOR_SCORE",
    "SUPPLIER_RISK_LEVEL", "CORPORATE_FAMILY_SIZE",
    "ULTIMATE_PARENT_DUNS", "VERIFICATION_STATUS",
    "GENERATED_AT",
})


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY → SP_GENERATE_DNB_BUSINESS_CREDIT
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """5-step canonical pattern + BUSINESS-cardinality warning between 1 and 2.

    1. Read audience.
    1.5. Warn if accounts_processed > 10K — do NOT fail (Plan 2 precedent).
    2. Build deterministic rows (tolerate up to 1% per-row failures).
    3. Idempotent MERGE on PK (ACCOUNT_ID, PROFILE_MONTH).
    4. Coverage assertion vs V_ACCOUNT_ANCHORS.
    5. Always log to TASK_EXECUTION_LOG (success or failure).
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None
    warning_msg: str | None = None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        # 1.5. BUSINESS over-count warning (per spec §3 v1.2 finding #3).
        if accounts_processed > _BUSINESS_OVERCOUNT_THRESHOLD:
            warning_msg = (
                f"BUSINESS audience over-count: {accounts_processed} accounts "
                f"(expected ~5K — see spec §3 v1.2 finding #3). Continuing."
            )

        # 2. Build deterministic rows; tolerate up to 1% per-row failures.
        records, errors = [], []
        for row in audience:
            try:
                records.append(_row_for(_anchor_to_dict(row), started))
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

        # Stack the warning onto err so both surface in TASK_EXECUTION_LOG.
        if warning_msg:
            err = f"{warning_msg} | {err}" if err else warning_msg

        # 3. Idempotent MERGE on PK (ACCOUNT_ID, PROFILE_MONTH).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion — canonical message format from spec §6.2.
        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log — success or failure.
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


def _anchor_to_dict(row: Any) -> dict:
    """Snowpark Row → plain dict so _row_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _anchor_in_audience — defense-in-depth for the audience predicate
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate the AUDIENCE_PREDICATE into a Python predicate."""
    return anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"


# -------------------------------------------------------------------
# DUNS derivation — year-stable across calendar months
# -------------------------------------------------------------------

def _duns_from_bytes(seed_bytes: bytes) -> str:
    """First 4 bytes of a seed → integer mod 10^9 → zero-padded 9-digit string."""
    n = int.from_bytes(seed_bytes[:4], "big") % 1_000_000_000
    return f"{n:09d}"


def _duns_for(account_id: str, run_ts: datetime) -> str:
    """9-digit deterministic DUNS, stable across calendar months for the
    same (account_id, year). Year-rollover allowed to roll a new DUNS —
    intentional rowspec simplification (real DUNS are permanent for life).
    """
    year_anchor = datetime(run_ts.year, 1, 1)  # year-stable
    seed = seed_for(account_id, "duns_id", year_anchor)
    return _duns_from_bytes(seed)


def _parent_duns_for(account_id: str, run_ts: datetime) -> str:
    """Deterministic 9-digit parent DUNS, distinct from the account's own DUNS
    (different seed input via the '_parent' suffix on account_id)."""
    year_anchor = datetime(run_ts.year, 1, 1)
    seed = seed_for(account_id + "_parent", "duns_id", year_anchor)
    return _duns_from_bytes(seed)


# -------------------------------------------------------------------
# Bias logic — rowspec translations
# -------------------------------------------------------------------

# Tier ladder + revenue thresholds (per rowspec §"Financial Strength Tier ladder")
# Order: highest tier first → lowest. Each entry is (tier, revenue_floor).
_TIER_LADDER = [
    ("5A", 500_000_000),
    ("4A", 100_000_000),
    ("3A",  25_000_000),
    ("2A",  10_000_000),
    ("1A",   5_000_000),
    ("BA",   2_500_000),
    ("BB",   1_000_000),
    ("CB",     500_000),
    ("CC",     250_000),
    ("DC",     100_000),
    ("DD",           0),
]


def _tier_index_from_revenue(revenue: float) -> int:
    """Return the index into _TIER_LADDER for the deterministic revenue band."""
    for idx, (_tier, floor) in enumerate(_TIER_LADDER):
        if revenue >= floor:
            return idx
    return len(_TIER_LADDER) - 1  # DD floor is 0; should always match above


def _tier_from_revenue(revenue: float, rng: random.Random) -> str:
    """Pick a tier from the revenue band with ±1 tier jitter (clamped to 0..10)."""
    base_idx = _tier_index_from_revenue(revenue)
    jitter = rng.choices([-1, 0, 1], weights=[0.15, 0.7, 0.15])[0]
    idx = max(0, min(len(_TIER_LADDER) - 1, base_idx + jitter))
    return _TIER_LADDER[idx][0]


# Composite-risk weights per tier (per rowspec §"Composite Risk Score").
# Each entry: list of (composite_value, weight) pairs.
_TOP_TIERS    = {"5A", "4A"}
_UPPER_TIERS  = {"3A", "2A", "1A"}
_MID_TIERS    = {"BA", "BB", "CB"}
_LOWER_TIERS  = {"CC", "DC", "DD"}


def _composite_from_tier(tier: str, rng: random.Random) -> int:
    """Return composite risk 1-4 weighted per the rowspec table."""
    if tier in _TOP_TIERS:
        return rng.choices([1, 2, 3], weights=[0.60, 0.35, 0.05])[0]
    if tier in _UPPER_TIERS:
        return rng.choices([1, 2, 3, 4], weights=[0.25, 0.50, 0.20, 0.05])[0]
    if tier in _MID_TIERS:
        return rng.choices([2, 3, 4], weights=[0.30, 0.45, 0.25])[0]
    if tier in _LOWER_TIERS:
        return rng.choices([2, 3, 4], weights=[0.10, 0.35, 0.55])[0]
    # Fallback (shouldn't trip — every canonical tier is bucketed above).
    return rng.choices([1, 2, 3, 4], weights=[0.2, 0.3, 0.3, 0.2])[0]


# Industry → PAYDEX base (per rowspec §"PAYDEX bias by industry").
# Substring match against INDUSTRY (so e.g. "Information Technology" → "Tech" base).
_PAYDEX_BASES: list[tuple[str, int]] = [
    ("Finance",         88),
    ("Banking",         88),
    ("Healthcare",      84),
    ("Tech",            82),
    ("Software",        82),
    ("Real Estate",     75),
    ("Manufacturing",   75),
    ("Industrial",      75),
    ("Construction",    65),
    ("Retail",          70),
    ("Consumer",        70),
    ("Food & Beverage", 70),
    ("Energy",          78),
    ("Mining",          78),
    ("Oil & Gas",       78),
]
_PAYDEX_DEFAULT_BASE = 78  # "Personal Services" + anything else


def _paydex_base(industry: str) -> int:
    if not industry:
        return _PAYDEX_DEFAULT_BASE
    low = industry.lower()
    for key, base in _PAYDEX_BASES:
        if key.lower() in low:
            return base
    return _PAYDEX_DEFAULT_BASE


def _paydex(industry: str, revenue: float, rng: random.Random) -> int:
    """PAYDEX = clamp(0, 100, base + size_bonus + ±10 jitter)."""
    base = _paydex_base(industry)
    if revenue >= 100_000_000:
        size_bonus = 5
    elif revenue >= 10_000_000:
        size_bonus = 2
    else:
        size_bonus = 0
    jitter = (rng.random() - 0.5) * 20  # ±10
    return int(max(0, min(100, round(base + size_bonus + jitter))))


# Failure-risk industry adjustments (per rowspec §"Failure Risk Score").
_FAILURE_INDUSTRY_ADJ: list[tuple[str, int]] = [
    ("Construction",    -15),
    ("Real Estate",      -8),
    ("Retail",           -8),
    ("Food & Beverage",  -8),
    ("Manufacturing",    -3),
    ("Industrial",       -3),
    ("Healthcare",        5),
    ("Finance",           5),
    ("Banking",           5),
    ("Tech",              5),
    ("Software",          5),
]


def _failure_industry_adjustment(industry: str) -> int:
    if not industry:
        return 0
    low = industry.lower()
    for key, adj in _FAILURE_INDUSTRY_ADJ:
        if key.lower() in low:
            return adj
    return 0


def _failure_risk(tier: str, industry: str, rng: random.Random) -> int:
    """1-100 with tier base + industry adjustment + ±10 jitter, clamp 1-100."""
    if tier in {"5A", "4A", "3A"}:
        base = 85
    elif tier in {"2A", "1A", "BA"}:
        base = 75
    elif tier in {"BB", "CB", "CC"}:
        base = 60
    elif tier in {"DC", "DD"}:
        base = 40
    else:
        base = 50
    base += _failure_industry_adjustment(industry)
    jitter = (rng.random() - 0.5) * 20  # ±10
    return int(max(1, min(100, round(base + jitter))))


def _supplier_risk_band(failure_risk: int) -> str:
    """Bands per rowspec §"Supplier Risk Level"."""
    if failure_risk >= 80:
        return "Low"
    if failure_risk >= 60:
        return "Moderate"
    if failure_risk >= 30:
        return "High"
    return "Severe"


def _family_size(revenue: float, rng: random.Random) -> int:
    """Distribution per rowspec §"Corporate Family Size"."""
    if revenue < 5_000_000:
        # 1 (95%) / 2 (4%) / 3 (1%)
        return rng.choices([1, 2, 3], weights=[0.95, 0.04, 0.01])[0]
    if revenue < 50_000_000:
        # 1 (75%) / 2 (15%) / 3-5 (10%)
        bucket = rng.choices(["1", "2", "3-5"], weights=[0.75, 0.15, 0.10])[0]
        if bucket == "1":
            return 1
        if bucket == "2":
            return 2
        return rng.randint(3, 5)
    if revenue < 200_000_000:
        # 1 (35%) / 2-5 (45%) / 6-15 (15%) / 16-50 (5%)
        bucket = rng.choices(
            ["1", "2-5", "6-15", "16-50"],
            weights=[0.35, 0.45, 0.15, 0.05],
        )[0]
        if bucket == "1":
            return 1
        if bucket == "2-5":
            return rng.randint(2, 5)
        if bucket == "6-15":
            return rng.randint(6, 15)
        return rng.randint(16, 50)
    # revenue >= $200M
    # 1 (10%) / 2-5 (25%) / 6-20 (35%) / 21-100 (25%) / 100+ (5%)
    bucket = rng.choices(
        ["1", "2-5", "6-20", "21-100", "100+"],
        weights=[0.10, 0.25, 0.35, 0.25, 0.05],
    )[0]
    if bucket == "1":
        return 1
    if bucket == "2-5":
        return rng.randint(2, 5)
    if bucket == "6-20":
        return rng.randint(6, 20)
    if bucket == "21-100":
        return rng.randint(21, 100)
    return rng.randint(101, 500)


def _verification_status(revenue: float, tier: str, rng: random.Random) -> str:
    """Distribution per rowspec §"Verification Status"."""
    strong_tiers = {"5A", "4A", "3A", "2A", "1A", "BA", "BB"}
    if revenue >= 1_000_000 and tier in strong_tiers:
        # 95% Verified, 5% Probable
        return rng.choices(["Verified", "Probable"], weights=[0.95, 0.05])[0]
    # 70% Verified, 25% Probable, 5% Unverified
    return rng.choices(
        ["Verified", "Probable", "Unverified"],
        weights=[0.70, 0.25, 0.05],
    )[0]


# -------------------------------------------------------------------
# _row_for — translate the rowspec faithfully
# -------------------------------------------------------------------

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: BUSINESS anchor → D&B Business Credit row. Deterministic.

    Per rowspec: per-row seed = SHA-256(account_id || "dnb" || YYYY-MM).
    DUNS uses a separate "duns_id" salt with year-bucketed run_ts so the
    identifier is stable across calendar months.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')} fails audience predicate "
            f"({_AUDIENCE_PREDICATE})"
        )

    account_id = anchor["ACCOUNT_ID"]
    industry   = (anchor.get("INDUSTRY") or "").strip()
    revenue    = float(anchor.get("ANNUAL_REVENUE") or 0)

    seed = seed_for(account_id, DATASET_SALT, run_ts)
    rng  = random.Random(seed)

    # 1. DUNS (year-stable, not month-stable).
    duns_number = _duns_for(account_id, run_ts)

    # 2. Financial-strength tier from revenue (with ±1 jitter).
    tier = _tier_from_revenue(revenue, rng)

    # 3. Composite risk + composed DNB rating.
    composite = _composite_from_tier(tier, rng)
    dnb_rating = f"{tier}{composite}"

    # 4. PAYDEX (industry- and size-biased).
    paydex = _paydex(industry, revenue, rng)

    # 5. Average days beyond terms (inverse PAYDEX).
    avg_dbt = max(0, round((80 - paydex) * 1.5 + (rng.random() - 0.5) * 10))

    # 6. Failure risk (tier base + industry adjustment + jitter).
    failure_risk = _failure_risk(tier, industry, rng)

    # 7. Supplier-risk band derived from failure risk.
    supplier_risk = _supplier_risk_band(failure_risk)

    # 8. Delinquency predictor — correlated with PAYDEX, biased slightly worse.
    delinquency = max(1, min(100, round(paydex + (rng.random() - 0.5) * 20 - 5)))

    # 9. Corporate family size — most rows are 1 (standalone).
    family_size = _family_size(revenue, rng)

    # 10. Ultimate parent DUNS — None when standalone.
    parent_duns = _parent_duns_for(account_id, run_ts) if family_size > 1 else None

    # 11. Verification status (revenue + tier biased).
    verification = _verification_status(revenue, tier, rng)

    return {
        "ORG_ID":                      anchor["ORG_ID"],
        "ACCOUNT_ID":                  account_id,
        "PROFILE_MONTH":               run_ts.replace(day=1).date(),
        "DUNS_NUMBER":                 duns_number,
        "DNB_RATING":                  dnb_rating,
        "FINANCIAL_STRENGTH_TIER":     tier,
        "COMPOSITE_RISK_SCORE":        composite,
        "PAYDEX_SCORE":                paydex,
        "AVERAGE_DAYS_BEYOND_TERMS":   avg_dbt,
        "FAILURE_RISK_SCORE":          failure_risk,
        "DELINQUENCY_PREDICTOR_SCORE": delinquency,
        "SUPPLIER_RISK_LEVEL":         supplier_risk,
        "CORPORATE_FAMILY_SIZE":       family_size,
        "ULTIMATE_PARENT_DUNS":        parent_duns,
        "VERIFICATION_STATUS":         verification,
        # Bucket GENERATED_AT to month-start so same-month re-runs produce
        # byte-identical rows. Wall-clock execution time is captured in
        # TASK_EXECUTION_LOG separately.
        "GENERATED_AT":                datetime(run_ts.year, run_ts.month, 1),
    }


# -------------------------------------------------------------------
# _merge — idempotent MERGE on PK with v1.4 datetime cast
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    v1.4: write_pandas auto_create_table=True mis-types datetime64[ns] as
    NUMBER(38,0) (nanoseconds-since-epoch) — cast back to TIMESTAMP_NTZ in
    the source SELECT so the target TIMESTAMP_NTZ(9) column is satisfied.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "DNB_BUSINESS_CREDIT_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.DNB_BUSINESS_CREDIT tgt
        USING (
            SELECT
                ORG_ID,
                ACCOUNT_ID, PROFILE_MONTH, DUNS_NUMBER, DNB_RATING,
                FINANCIAL_STRENGTH_TIER, COMPOSITE_RISK_SCORE,
                PAYDEX_SCORE, AVERAGE_DAYS_BEYOND_TERMS,
                FAILURE_RISK_SCORE, DELINQUENCY_PREDICTOR_SCORE,
                SUPPLIER_RISK_LEVEL, CORPORATE_FAMILY_SIZE,
                ULTIMATE_PARENT_DUNS, VERIFICATION_STATUS,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            DUNS_NUMBER                  = src.DUNS_NUMBER,
            DNB_RATING                   = src.DNB_RATING,
            FINANCIAL_STRENGTH_TIER      = src.FINANCIAL_STRENGTH_TIER,
            COMPOSITE_RISK_SCORE         = src.COMPOSITE_RISK_SCORE,
            PAYDEX_SCORE                 = src.PAYDEX_SCORE,
            AVERAGE_DAYS_BEYOND_TERMS    = src.AVERAGE_DAYS_BEYOND_TERMS,
            FAILURE_RISK_SCORE           = src.FAILURE_RISK_SCORE,
            DELINQUENCY_PREDICTOR_SCORE  = src.DELINQUENCY_PREDICTOR_SCORE,
            SUPPLIER_RISK_LEVEL          = src.SUPPLIER_RISK_LEVEL,
            CORPORATE_FAMILY_SIZE        = src.CORPORATE_FAMILY_SIZE,
            ULTIMATE_PARENT_DUNS         = src.ULTIMATE_PARENT_DUNS,
            VERIFICATION_STATUS          = src.VERIFICATION_STATUS,
            GENERATED_AT                 = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID,
            ACCOUNT_ID, PROFILE_MONTH, DUNS_NUMBER, DNB_RATING,
            FINANCIAL_STRENGTH_TIER, COMPOSITE_RISK_SCORE,
            PAYDEX_SCORE, AVERAGE_DAYS_BEYOND_TERMS,
            FAILURE_RISK_SCORE, DELINQUENCY_PREDICTOR_SCORE,
            SUPPLIER_RISK_LEVEL, CORPORATE_FAMILY_SIZE,
            ULTIMATE_PARENT_DUNS, VERIFICATION_STATUS, GENERATED_AT
        ) VALUES (
            src.ORG_ID,
            src.ACCOUNT_ID, src.PROFILE_MONTH, src.DUNS_NUMBER, src.DNB_RATING,
            src.FINANCIAL_STRENGTH_TIER, src.COMPOSITE_RISK_SCORE,
            src.PAYDEX_SCORE, src.AVERAGE_DAYS_BEYOND_TERMS,
            src.FAILURE_RISK_SCORE, src.DELINQUENCY_PREDICTOR_SCORE,
            src.SUPPLIER_RISK_LEVEL, src.CORPORATE_FAMILY_SIZE,
            src.ULTIMATE_PARENT_DUNS, src.VERIFICATION_STATUS, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
