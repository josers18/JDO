"""MSCI-style synthetic ESG ratings generator.

Snowpark Python stored procedure registered as FINS.PUBLIC.SP_GENERATE_MSCI_ESG_SCORES.
Mirrors the canonical 5-step pattern from the Cumulus umbrella spec §5.1.

Audience: ACCOUNT_TYPE_FLAG = 'BUSINESS'  (~12K rows; over-count vs CRM ~5K
          is expected per spec §3 v1.2 finding #3 — the SP warns at >10K but
          does not fail; long-term fix is upstream PersonBirthdate__c backfill)
Cadence:  MONTHLY
Salt:     "msci"
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-2-msci-esg.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-2-msci-esg-rowspec.md
"""
from __future__ import annotations

import random
import uuid
from datetime import date, datetime
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE        = "FINS.PUBLIC.MSCI_ESG_SCORES"
TASK_NAME    = "TASK_MONTHLY_MSCI_ESG_SCORES"
DATASET_SALT = "msci"

# Audience predicate — the same string in 2 places (AUDIENCE_SQL + COVERAGE_SQL).
# A drift between the two would silently produce a coverage gap; we keep them
# both anchored on this single string.
_AUDIENCE_PREDICATE = "ACCOUNT_TYPE_FLAG = 'BUSINESS'"
AUDIENCE_SQL = f"SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

# Per spec §3 v1.2 #3: warn (do NOT fail) when BUSINESS over-count is detected.
# Long-term fix: backfill PersonBirthdate__c upstream so the Person Account
# population stops leaking into ACCOUNT_TYPE_FLAG = 'BUSINESS'.
_BUSINESS_OVERCOUNT_THRESHOLD = 10000

# 15-column output contract (kept in sync with table DDL by the L1 schema test).
# v1.x multi-org-additive: ORG_ID stamped from anchor (V_ACCOUNT_ANCHORS).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_MONTH",
    "MSCI_ESG_RATING", "INDUSTRY_CLASSIFICATION",
    "ESG_SCORE_OVERALL", "ENVIRONMENTAL_SCORE", "SOCIAL_SCORE", "GOVERNANCE_SCORE",
    "CARBON_INTENSITY_TONS_PER_M_REVENUE",
    "CONTROVERSY_FLAG_COUNT", "TOP_CONTROVERSY_CATEGORY",
    "MATERIALITY_TAGS", "LAST_RATING_CHANGE_DIRECTION",
    "GENERATED_AT",
})


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY → SP_GENERATE_MSCI_ESG_SCORES
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """5-step canonical pattern + BUSINESS-cardinality warning between 1 and 2.

    1. Read audience.
    1.5. (Plan 2 only) Warn if accounts_processed > 10K — do NOT fail.
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
        # We warn but do not fail — the SP must keep running so downstream
        # Data Cloud streams stay fresh while the upstream backfill is in
        # flight. The warning surfaces via TASK_EXECUTION_LOG.ERROR_MESSAGE.
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
# _row_for — translate the rowspec bias logic block faithfully
# -------------------------------------------------------------------

# (industry → (e_base, s_base, g_base, c_low, c_high)) per rowspec
_INDUSTRY_BASES = {
    "Energy":                 (3.5, 5.5, 6.0, 800, 2000),
    "Mining":                 (3.5, 5.5, 6.0, 800, 2000),
    "Oil & Gas":              (3.5, 5.5, 6.0, 800, 2000),
    "Manufacturing":          (4.5, 6.0, 6.5, 300, 900),
    "Industrial":             (4.5, 6.0, 6.5, 300, 900),
    "Real Estate":            (5.0, 5.5, 6.5, 200, 600),
    "Construction":           (5.0, 5.5, 6.5, 200, 600),
    "Retail":                 (5.5, 6.0, 6.0, 80,  300),
    "Consumer":               (5.5, 6.0, 6.0, 80,  300),
    "Food & Beverage":        (5.5, 6.0, 6.0, 80,  300),
    "Healthcare":             (6.5, 7.0, 7.0, 50,  200),
    "Finance":                (7.0, 6.5, 7.5, 20,  100),
    "Banking":                (7.0, 6.5, 7.5, 20,  100),
    "Tech":                   (7.5, 7.0, 7.5, 10,  80),
    "Software":               (7.5, 7.0, 7.5, 10,  80),
    "Information Technology": (7.5, 7.0, 7.5, 10,  80),
}
_DEFAULT_BASE = (6.0, 6.5, 6.5, 50, 200)

_RATINGS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"]
_RATING_ADJ = {
    "AAA":  1.5, "AA":  1.0, "A":  0.5,
    "BBB":  0.0,
    "BB":  -0.7, "B":  -1.3, "CCC": -2.0,
}

_CONTROVERSY_CATEGORIES = [
    "Environmental Impact", "Labor Practices", "Customer", "Governance",
    "Human Rights", "Product Safety", "Supply Chain",
]

_INDUSTRY_TAG_POOLS = {
    "Energy":        ["Climate Risk", "Resource Use", "Pollution & Waste", "Health & Safety", "Business Ethics"],
    "Manufacturing": ["Resource Use", "Pollution & Waste", "Health & Safety", "Supply Chain", "Labor Practices"],
    "Real Estate":   ["Climate Risk", "Resource Use", "Health & Safety", "Business Ethics"],
    "Retail":        ["Supply Chain", "Labor Practices", "Product Safety", "Data Privacy", "Human Capital"],
    "Healthcare":    ["Product Safety", "Data Privacy", "Health & Safety", "Human Capital", "Business Ethics"],
    "Finance":       ["Data Privacy", "Business Ethics", "Tax Transparency", "Board Diversity", "Human Capital"],
    "Tech":          ["Data Privacy", "Human Capital", "Product Safety", "Business Ethics", "Board Diversity"],
}
_DEFAULT_TAG_POOL = ["Business Ethics", "Human Capital", "Labor Practices", "Health & Safety"]


def _industry_base(industry: str) -> tuple:
    """Substring-match the industry against the bias table.

    Industry values from the share are not normalized; substring match
    keeps `Oil & Gas Exploration` mapping to `Oil & Gas`, etc.
    """
    if not industry:
        return _DEFAULT_BASE
    low = industry.lower()
    for key, base in _INDUSTRY_BASES.items():
        if key.lower() in low:
            return base
    return _DEFAULT_BASE


def _tag_pool(industry: str) -> list:
    if not industry:
        return _DEFAULT_TAG_POOL
    low = industry.lower()
    for key, pool in _INDUSTRY_TAG_POOLS.items():
        if key.lower() in low:
            return pool
    return _DEFAULT_TAG_POOL


def _rating_weights(revenue: float) -> list:
    """Revenue-biased weights over [AAA, AA, A, BBB, BB, B, CCC].

    Larger firms tilt toward A/AA; SMBs tilt toward BBB/BB. Weights are
    clamped to >=1 so rng.choices doesn't see a zero-sum population.
    """
    base = [5, 10, 18, 25, 22, 13, 7]  # AAA..CCC default
    if revenue >= 100_000_000:
        weights = [w + d for w, d in zip(base, [3, 5, 4, 0, -3, -4, -5])]
    elif revenue >= 10_000_000:
        weights = [w + d for w, d in zip(base, [1, 2, 2, 0, -1, -2, -2])]
    elif revenue < 1_000_000:
        weights = [w + d for w, d in zip(base, [-3, -5, -3, 5, 5, 3, -2])]
    else:
        weights = base
    return [max(1, w) for w in weights]


def _industry_class(rating: str, rng: random.Random) -> str:
    """Leader/Average/Laggard skew per rowspec table."""
    if rating in ("AAA", "AA"):
        return rng.choices(["Leader", "Average"], weights=[0.75, 0.25])[0]
    if rating in ("A", "BBB"):
        return rng.choices(["Leader", "Average", "Laggard"], weights=[0.15, 0.7, 0.15])[0]
    if rating == "BB":
        return rng.choices(["Average", "Laggard"], weights=[0.55, 0.45])[0]
    return rng.choices(["Average", "Laggard"], weights=[0.2, 0.8])[0]


def _controversy_count(industry_class: str, rng: random.Random) -> int:
    """Leaders ~85% zero; Average ~45% zero; Laggards always >=1."""
    if industry_class == "Leader":
        return rng.choices([0, 1], weights=[0.85, 0.15])[0]
    if industry_class == "Average":
        return rng.choices([0, 1, 2, 3], weights=[0.45, 0.3, 0.15, 0.1])[0]
    return rng.choices([1, 2, 3, 5, 8, 12], weights=[0.25, 0.25, 0.2, 0.15, 0.1, 0.05])[0]


def _clamp_score(x: float) -> float:
    return round(max(0.0, min(10.0, x)), 2)


def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: BUSINESS anchor → MSCI ESG row. Deterministic.

    Per rowspec: seed = SHA-256(account_id || "msci" || YYYY-MM).
    Mid-month re-runs replay exactly; new month rolls a new seed.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')} fails audience predicate "
            f"({_AUDIENCE_PREDICATE})"
        )

    account_id = anchor["ACCOUNT_ID"]
    industry   = (anchor.get("INDUSTRY") or "").strip()
    revenue    = float(anchor.get("ANNUAL_REVENUE") or 0)
    employees  = int(anchor.get("EMPLOYEE_COUNT") or 0)

    seed = seed_for(account_id, DATASET_SALT, run_ts)
    rng  = random.Random(seed)

    # 1. Letter rating — biased by revenue band.
    weights = _rating_weights(revenue)
    rating = rng.choices(_RATINGS, weights=weights)[0]

    # 2. Industry classification (Leader/Average/Laggard) — biased by rating.
    industry_class = _industry_class(rating, rng)

    # 3. Pillar scores — base by industry + adjustment by rating + jitter.
    e_base, s_base, g_base, c_low, c_high = _industry_base(industry)
    adj = _RATING_ADJ[rating]

    env_score = _clamp_score(e_base + adj + (rng.random() - 0.5) * 1.5)
    soc_score = _clamp_score(
        s_base + adj + (rng.random() - 0.5) * 1.5
        + (0.3 if employees >= 500 else 0.0)
    )
    gov_score = _clamp_score(
        g_base + adj + (rng.random() - 0.5) * 1.5
        + (0.5 if revenue >= 100_000_000 else 0.0)
    )
    overall   = _clamp_score(
        (env_score + soc_score + gov_score) / 3 + (rng.random() - 0.5) * 0.4
    )

    # 4. Carbon intensity — industry-bounded with rating modulation.
    carbon_mult = (
        1.3 if rating == "CCC"
        else 1.0 if rating == "BBB"
        else 0.7 if rating in ("AAA", "AA")
        else 1.0
    )
    carbon = round(rng.uniform(c_low, c_high) * carbon_mult, 2)
    carbon = min(2000.0, max(0.0, carbon))  # rowspec hard cap (NUMBER(8,2))

    # 5. Controversy flags — Laggards have more, Leaders close to 0.
    controversy_count = _controversy_count(industry_class, rng)
    top_controversy = (
        rng.choice(_CONTROVERSY_CATEGORIES) if controversy_count > 0 else None
    )

    # 6. Materiality tags — 2-4 industry-relevant, sorted, comma-separated.
    pool = _tag_pool(industry)
    tag_count = rng.choices([2, 3, 4], weights=[0.3, 0.5, 0.2])[0]
    tags = sorted(rng.sample(pool, k=min(tag_count, len(pool))))
    materiality = ",".join(tags)

    # 7. Rating change direction — most firms unchanged.
    last_change = rng.choices(
        ["Upgrade", "Downgrade", "Unchanged"],
        weights=[0.08, 0.07, 0.85],
    )[0]

    return {
        # v1.x multi-org-additive: stamp ORG_ID from the audience row.
        # V_ACCOUNT_ANCHORS supplies ORG_ID as the first column (post-A3).
        "ORG_ID":                              anchor.get("ORG_ID", "JDO"),
        "ACCOUNT_ID":                          account_id,
        "PROFILE_MONTH":                       run_ts.replace(day=1).date(),
        "MSCI_ESG_RATING":                     rating,
        "INDUSTRY_CLASSIFICATION":             industry_class,
        "ESG_SCORE_OVERALL":                   overall,
        "ENVIRONMENTAL_SCORE":                 env_score,
        "SOCIAL_SCORE":                        soc_score,
        "GOVERNANCE_SCORE":                    gov_score,
        "CARBON_INTENSITY_TONS_PER_M_REVENUE": carbon,
        "CONTROVERSY_FLAG_COUNT":              controversy_count,
        "TOP_CONTROVERSY_CATEGORY":            top_controversy,
        "MATERIALITY_TAGS":                    materiality,
        "LAST_RATING_CHANGE_DIRECTION":        last_change,
        # Bucket GENERATED_AT to month-start so same-month re-runs produce
        # byte-identical rows (deterministic-month-bucket contract). Wall-clock
        # execution time is captured separately in TASK_EXECUTION_LOG.
        "GENERATED_AT":                        datetime(run_ts.year, run_ts.month, 1),
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
    staging = "MSCI_ESG_SCORES_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.MSCI_ESG_SCORES tgt
        USING (
            SELECT
                ORG_ID,
                ACCOUNT_ID, PROFILE_MONTH,
                MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                CARBON_INTENSITY_TONS_PER_M_REVENUE,
                CONTROVERSY_FLAG_COUNT, TOP_CONTROVERSY_CATEGORY,
                MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            MSCI_ESG_RATING                     = src.MSCI_ESG_RATING,
            INDUSTRY_CLASSIFICATION             = src.INDUSTRY_CLASSIFICATION,
            ESG_SCORE_OVERALL                   = src.ESG_SCORE_OVERALL,
            ENVIRONMENTAL_SCORE                 = src.ENVIRONMENTAL_SCORE,
            SOCIAL_SCORE                        = src.SOCIAL_SCORE,
            GOVERNANCE_SCORE                    = src.GOVERNANCE_SCORE,
            CARBON_INTENSITY_TONS_PER_M_REVENUE = src.CARBON_INTENSITY_TONS_PER_M_REVENUE,
            CONTROVERSY_FLAG_COUNT              = src.CONTROVERSY_FLAG_COUNT,
            TOP_CONTROVERSY_CATEGORY            = src.TOP_CONTROVERSY_CATEGORY,
            MATERIALITY_TAGS                    = src.MATERIALITY_TAGS,
            LAST_RATING_CHANGE_DIRECTION        = src.LAST_RATING_CHANGE_DIRECTION,
            GENERATED_AT                        = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID,
            ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
            ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
            CARBON_INTENSITY_TONS_PER_M_REVENUE,
            CONTROVERSY_FLAG_COUNT, TOP_CONTROVERSY_CATEGORY,
            MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT
        ) VALUES (
            src.ORG_ID,
            src.ACCOUNT_ID, src.PROFILE_MONTH, src.MSCI_ESG_RATING, src.INDUSTRY_CLASSIFICATION,
            src.ESG_SCORE_OVERALL, src.ENVIRONMENTAL_SCORE, src.SOCIAL_SCORE, src.GOVERNANCE_SCORE,
            src.CARBON_INTENSITY_TONS_PER_M_REVENUE,
            src.CONTROVERSY_FLAG_COUNT, src.TOP_CONTROVERSY_CATEGORY,
            src.MATERIALITY_TAGS, src.LAST_RATING_CHANGE_DIRECTION, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
