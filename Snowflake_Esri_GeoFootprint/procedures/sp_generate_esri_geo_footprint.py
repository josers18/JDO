"""Esri-style geographic enrichment generator.

Snowpark Python stored procedure registered as FINS.PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT.
Branch-scoped (NOT account-scoped) — emits one row per distinct US ZIP.

Audience: GROUP BY POSTAL_CODE, STATE_CODE, COUNTRY_CODE — see AUDIENCE_SQL
          constant (NOT a WHERE-filtered V_ACCOUNT_ANCHORS read).
Cadence:  MONTHLY
Salt:     "esri"
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-4-esri-geo-footprint.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-4-esri-geo-footprint-rowspec.md
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

TABLE        = "FINS.PUBLIC.ESRI_GEO_FOOTPRINT"
TASK_NAME    = "TASK_MONTHLY_ESRI_GEO_FOOTPRINT"
DATASET_SALT = "esri"

# Branch-scoped: aggregate V_ACCOUNT_ANCHORS to enumerate distinct ZIPs +
# per-ZIP customer count (used by MARKET_PENETRATION_PCT).
#
# Filter notes (live audience cleanup, surfaced during Plan 4 T6 deploy):
#   - V_ACCOUNT_ANCHORS contains ~10,798 rows with empty-string POSTAL_CODE
#     that pass `IS NOT NULL` — drop those with POSTAL_CODE <> ''.
#   - COUNTRY_CODE is dirty: 25,420 'US' + 3 'United States' + 1 'USA' + 10,798 ''.
#     The DDL pins COUNTRY_CODE to VARCHAR(2). Normalize to literal 'US' (the
#     audience is implicitly US-only — non-US customers don't have US ZIPs in
#     this dataset, and the 4 non-canonical rows are typos). The 4 non-empty
#     rows would otherwise truncate against VARCHAR(2) ('USA' -> error).
#
# Multi-org note (v1.5): ORG_ID is part of the GROUP BY (and SELECT) so two
# orgs sharing the same POSTAL_CODE do not collapse into one row and silently
# lose org-isolation. ORG_ID also becomes the leading PK component on the
# target table.
AUDIENCE_SQL = """
    SELECT ORG_ID, POSTAL_CODE, STATE_CODE, 'US' AS COUNTRY_CODE,
           COUNT(DISTINCT ACCOUNT_ID) AS CUSTOMER_COUNT
    FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
    WHERE POSTAL_CODE IS NOT NULL
      AND POSTAL_CODE <> ''
    GROUP BY ORG_ID, POSTAL_CODE, STATE_CODE
"""

# Coverage compares (ORG_ID, ZIP) cardinality, not account cardinality.
# Mirror the AUDIENCE_SQL filter + GROUP BY shape exactly (drift = silent coverage gap).
COVERAGE_SQL = """
    SELECT COUNT(DISTINCT (ORG_ID || '|' || POSTAL_CODE))
    FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
    WHERE POSTAL_CODE IS NOT NULL
      AND POSTAL_CODE <> ''
"""

# 16-column output contract (kept in sync with table DDL by the L1 schema test).
# ORG_ID is the leading PK component (multi-org migration v1.5).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "BRANCH_ZIP", "STATE_CODE", "COUNTRY_CODE", "PROFILE_MONTH",
    "TAPESTRY_SEGMENT_CODE", "TAPESTRY_SEGMENT_NAME",
    "URBANICITY_TIER",
    "MEDIAN_HOUSEHOLD_INCOME", "WEALTH_INDEX",
    "FOOT_TRAFFIC_INDEX", "COMMERCIAL_DENSITY_PER_SQ_MI",
    "DISTANCE_TO_NEAREST_BRANCH_MI", "MARKET_PENETRATION_PCT",
    "BRANCH_RECOMMENDATION", "GENERATED_AT",
})


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """5-step canonical pattern adapted for branch-scoped audience.

    1. Aggregate audience: distinct ZIPs + per-ZIP customer count.
    2. Build deterministic per-ZIP rows (tolerate up to 1% per-row failures).
    3. Idempotent MERGE on PK (BRANCH_ZIP, PROFILE_MONTH).
    4. Coverage assertion: ZIP cardinality, not account cardinality.
    5. Always log to TASK_EXECUTION_LOG (success or failure).
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Aggregate audience: distinct ZIPs + per-ZIP customer count.
        audience = session.sql(AUDIENCE_SQL).collect()
        # accounts_processed is the total customer-coverage, NOT row count.
        accounts_processed = sum(int(_field(r, "CUSTOMER_COUNT")) for r in audience)
        zip_count = len(audience)

        # 2. Build per-ZIP rows. Tolerate up to 1% per-row failures.
        records, errors = [], []
        for row in audience:
            try:
                records.append(_row_for_zip(
                    _field(row, "POSTAL_CODE"),
                    _field(row, "STATE_CODE"),
                    _field(row, "COUNTRY_CODE"),
                    int(_field(row, "CUSTOMER_COUNT")),
                    started,
                    org_id=_field(row, "ORG_ID"),
                ))
            except Exception as exc:
                errors.append((_field(row, "POSTAL_CODE"), str(exc)[:200]))
        max_tolerated = max(10, zip_count // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{zip_count} ZIPs "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{zip_count} ZIPs; "
                f"first: {errors[0]}"
            )

        # 3. MERGE on PK (BRANCH_ZIP, PROFILE_MONTH).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion: (ORG_ID, ZIP) cardinality, not account cardinality.
        # Multi-org: pipe-concat to mirror COVERAGE_SQL's shape exactly.
        actual_sql = f"SELECT COUNT(DISTINCT (ORG_ID || '|' || BRANCH_ZIP)) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Log.
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

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts_covered={accounts_processed}"


def _field(row: Any, name: str) -> Any:
    """Snowpark Row / dict safe accessor."""
    if isinstance(row, dict):
        return row[name]
    if hasattr(row, "asDict"):
        return row.asDict()[name]
    return row[name]


# -------------------------------------------------------------------
# Bias logic — rowspec translations
# -------------------------------------------------------------------

# State-level base medians (rough US Census 2024 figures, per rowspec).
_STATE_BASE_INCOME = {
    "MA": 95000, "NJ": 92000, "CA": 90000, "NY": 82000, "WA": 90000, "CT": 89000,
    "MD": 95000, "VA": 88000, "CO": 88000, "IL": 78000, "TX": 75000, "FL": 70000,
    "NC": 67000, "GA": 72000, "PA": 73000, "OH": 67000, "MI": 65000, "AZ": 75000,
    "OR": 78000, "MN": 84000, "TN": 67000, "IN": 67000, "MO": 65000,
}
_DEFAULT_BASE_INCOME = 70000


# Urbanicity weight tables (per rowspec §"URBANICITY_TIER heuristic").
# Keyed by ZIP first-digit region; weights are over (Urban Core, Suburban,
# Small Town, Rural).
_URBANICITY_WEIGHTS_BY_REGION = {
    # 0, 1, 9 -> Northeast / Mid-Atlantic / California
    "NE_CA": [0.45, 0.35, 0.15, 0.05],
    # 2, 3, 8 -> Southeast / Mountain
    "SE_MT": [0.25, 0.50, 0.20, 0.05],
    # 4, 5, 6, 7 -> Midwest / South / Plains
    "MW_PL": [0.10, 0.35, 0.35, 0.20],
}
_URBAN_FORCED_STATES = {"NY", "CA", "MA", "IL", "DC"}      # no Rural
_RURAL_FORCED_STATES = {"MT", "WY", "AK", "ND", "SD"}      # no Urban Core
_URBANICITY_TIERS = ["Urban Core", "Suburban", "Small Town", "Rural"]


def _urbanicity_tier(zip_code: str, state_code: str, rng: random.Random) -> str:
    """ZIP first-digit + STATE_CODE override. Per rowspec §URBANICITY_TIER heuristic."""
    first = zip_code[0]
    if first in ("0", "1", "9"):
        weights = list(_URBANICITY_WEIGHTS_BY_REGION["NE_CA"])
    elif first in ("2", "3", "8"):
        weights = list(_URBANICITY_WEIGHTS_BY_REGION["SE_MT"])
    else:  # 4, 5, 6, 7
        weights = list(_URBANICITY_WEIGHTS_BY_REGION["MW_PL"])

    # State overrides — rebalance the weights, do NOT just narrow the pool
    # (we still pick from all four tiers, but force-zero certain ones).
    if state_code in _URBAN_FORCED_STATES:
        # No Rural: redistribute Rural mass to Urban Core + Suburban (60/40).
        rural = weights[3]
        weights[3] = 0.0
        weights[0] += rural * 0.6
        weights[1] += rural * 0.4
        # Also tilt slightly toward Urban Core for these dense states.
        # Move 10% of Small Town mass into Urban Core.
        shift = weights[2] * 0.20
        weights[2] -= shift
        weights[0] += shift
    elif state_code in _RURAL_FORCED_STATES:
        # No Urban Core: redistribute to Small Town + Rural (40/60).
        urban = weights[0]
        weights[0] = 0.0
        weights[2] += urban * 0.4
        weights[3] += urban * 0.6
        # Tilt: move 30% of Suburban mass into Rural.
        shift = weights[1] * 0.30
        weights[1] -= shift
        weights[3] += shift

    return rng.choices(_URBANICITY_TIERS, weights=weights)[0]


def _median_income(state_code: str, urbanicity: str, rng: random.Random) -> int:
    """Per rowspec §Median Income bias."""
    base = _STATE_BASE_INCOME.get(state_code, _DEFAULT_BASE_INCOME)
    if urbanicity == "Urban Core":
        # Urban income is bimodal — affluent enclaves AND poverty pockets
        mult = rng.choices([0.5, 1.0, 1.6, 2.5], weights=[0.2, 0.4, 0.25, 0.15])[0]
        income = round(base * mult)
    elif urbanicity == "Suburban":
        income = round(base * rng.uniform(0.85, 1.6))
    elif urbanicity == "Small Town":
        income = round(base * rng.uniform(0.6, 1.05))
    else:  # Rural
        income = round(base * rng.uniform(0.55, 1.1))
    # Clamp to [20_000, 350_000].
    return max(20_000, min(350_000, income))


def _wealth_index(median_income: float) -> float:
    """Per rowspec §WEALTH_INDEX. 100 = US average ($75K median)."""
    return round(min(200.0, max(50.0, (median_income / 75000) * 100)), 2)


def _foot_traffic(urbanicity: str, rng: random.Random) -> float:
    """Per rowspec §FOOT_TRAFFIC_INDEX."""
    base = {"Urban Core": 180, "Suburban": 90, "Small Town": 50, "Rural": 20}[urbanicity]
    return round(max(0.0, min(300.0, base + rng.uniform(-30, 50))), 2)


def _commercial_density(urbanicity: str, rng: random.Random) -> float:
    """Per rowspec §COMMERCIAL_DENSITY_PER_SQ_MI."""
    if urbanicity == "Urban Core":
        return round(rng.uniform(500, 2000), 2)
    if urbanicity == "Suburban":
        return round(rng.uniform(80, 500), 2)
    if urbanicity == "Small Town":
        return round(rng.uniform(15, 100), 2)
    return round(rng.uniform(0, 30), 2)  # Rural


def _branch_distance(urbanicity: str, rng: random.Random) -> float:
    """Per rowspec §DISTANCE_TO_NEAREST_BRANCH_MI."""
    if urbanicity == "Urban Core":
        return round(rng.uniform(0.3, 2.5), 2)
    if urbanicity == "Suburban":
        return round(rng.uniform(1.0, 6.0), 2)
    if urbanicity == "Small Town":
        return round(rng.uniform(2.0, 15.0), 2)
    return round(rng.uniform(8.0, 50.0), 2)  # Rural


def _market_penetration(zip_customer_count: int, urbanicity: str, rng: random.Random) -> float:
    """Per rowspec §MARKET_PENETRATION_PCT.

    Special case: if customer_count is 0, return exactly 0.0 (test contract).
    """
    if zip_customer_count <= 0:
        return 0.0
    estimated_households = {
        "Urban Core": 25000, "Suburban": 8000, "Small Town": 3000, "Rural": 800
    }[urbanicity]
    pct = (zip_customer_count / estimated_households) * 100
    # Add small jitter so identical-customer-count ZIPs don't collapse to the same value.
    pct += (rng.random() - 0.5) * 0.5
    return round(max(0.0, min(100.0, pct)), 2)


def _branch_recommendation(market_penetration: float,
                            foot_traffic: float,
                            branch_distance: float) -> str:
    """Per rowspec §BRANCH_RECOMMENDATION."""
    if branch_distance > 15 and market_penetration > 5:
        return "Expand"          # underserved with traction
    if market_penetration > 8 and foot_traffic > 100:
        return "Maintain"        # healthy market
    if market_penetration < 1 and foot_traffic < 50:
        return "Consolidate"     # weak position, weak market
    return "Optimize"            # default — improve operations


def _tapestry_segment(urbanicity: str, median_income: int, rng: random.Random) -> tuple[str, str]:
    """Per rowspec §"Tapestry segment -> income+urbanicity bias"."""
    if urbanicity == "Urban Core":
        if median_income >= 150_000:
            pool = [("TC", "Top Tier"), ("ND", "Networked Neighbors")]
        elif median_income >= 80_000:
            pool = [("ND", "Networked Neighbors"), ("BS", "Bright Young Professionals")]
        else:
            pool = [("MS", "Modest Income Homes"), ("BS", "Bright Young Professionals")]
    elif urbanicity == "Suburban":
        if median_income >= 150_000:
            pool = [("EE", "Exurban Estates"), ("TC", "Top Tier"), ("SF", "Soccer Moms")]
        elif median_income >= 80_000:
            pool = [("SF", "Soccer Moms"), ("MD", "Midlife Constants")]
        else:
            pool = [("MD", "Midlife Constants"), ("MS", "Modest Income Homes")]
    elif urbanicity == "Small Town":
        if median_income >= 80_000:
            pool = [("MD", "Midlife Constants"), ("SH", "Small Town Sincerity")]
        else:
            pool = [("SH", "Small Town Sincerity"), ("HM", "Hardscrabble Road"),
                    ("RH", "Rustbelt Traditions")]
    else:  # Rural
        if median_income >= 80_000:
            pool = [("EE", "Exurban Estates"), ("RC", "Rural Resort Dwellers"),
                    ("RD", "Rooted Rural")]
        else:
            pool = [("RD", "Rooted Rural"), ("HM", "Hardscrabble Road"),
                    ("RH", "Rustbelt Traditions")]
    return rng.choice(pool)


# -------------------------------------------------------------------
# _row_for_zip — translate the rowspec faithfully
# -------------------------------------------------------------------

def _row_for_zip(zip_code: str,
                 state_code: str,
                 country_code: str,
                 customer_count: int,
                 run_ts: datetime,
                 org_id: str = "JDO") -> dict:
    """Pure function: per-ZIP fact row. Deterministic via seed_for(zip, "esri", run_ts).

    Input validation:
    - zip_code must be non-None.
    - zip_code must be a non-empty string.
    - zip_code must be all-digits (raises ValueError on "ABCDE").

    Multi-org (v1.5): ``org_id`` is the leading PK component on the target
    table. Defaults to ``'JDO'`` to keep call-sites that haven't migrated
    backward-compatible.
    """
    # Validate input shape (defense-in-depth — the audience SQL filters to
    # non-null US ZIPs but tests exercise these paths directly).
    if zip_code is None:
        raise TypeError("zip_code must be non-None")
    if not isinstance(zip_code, str) or not zip_code:
        raise ValueError("zip_code must be a non-empty string")
    if not zip_code.isdigit():
        raise ValueError(f"zip_code must be all-digit, got {zip_code!r}")

    seed = seed_for(zip_code, DATASET_SALT, run_ts)
    rng = random.Random(seed)

    # 1. Urbanicity tier (drives most downstream bias).
    urbanicity = _urbanicity_tier(zip_code, state_code, rng)

    # 2. Median household income (state + urbanicity biased).
    income = _median_income(state_code, urbanicity, rng)

    # 3. Wealth index (deterministic from income — no rng draw).
    wealth = _wealth_index(income)

    # 4. Foot traffic (urbanicity biased + jitter).
    foot_traffic = _foot_traffic(urbanicity, rng)

    # 5. Commercial density (urbanicity biased).
    comm_density = _commercial_density(urbanicity, rng)

    # 6. Distance to nearest branch (urbanicity biased).
    distance = _branch_distance(urbanicity, rng)

    # 7. Market penetration (customer_count + urbanicity).
    penetration = _market_penetration(customer_count, urbanicity, rng)

    # 8. Branch recommendation (decision tree on prior values).
    recommendation = _branch_recommendation(penetration, foot_traffic, distance)

    # 9. Tapestry segment (urbanicity + income biased).
    seg_code, seg_name = _tapestry_segment(urbanicity, income, rng)

    return {
        "ORG_ID":                        org_id,
        "BRANCH_ZIP":                    zip_code,
        "STATE_CODE":                    state_code,
        "COUNTRY_CODE":                  country_code,
        "PROFILE_MONTH":                 run_ts.replace(day=1).date(),
        "TAPESTRY_SEGMENT_CODE":         seg_code,
        "TAPESTRY_SEGMENT_NAME":         seg_name,
        "URBANICITY_TIER":               urbanicity,
        "MEDIAN_HOUSEHOLD_INCOME":       income,
        "WEALTH_INDEX":                  wealth,
        "FOOT_TRAFFIC_INDEX":            foot_traffic,
        "COMMERCIAL_DENSITY_PER_SQ_MI":  comm_density,
        "DISTANCE_TO_NEAREST_BRANCH_MI": distance,
        "MARKET_PENETRATION_PCT":        penetration,
        "BRANCH_RECOMMENDATION":         recommendation,
        # Bucket GENERATED_AT to month-start so same-month re-runs produce
        # byte-identical rows. Wall-clock execution time is captured in
        # TASK_EXECUTION_LOG separately.
        "GENERATED_AT":                  datetime(run_ts.year, run_ts.month, 1),
    }


# -------------------------------------------------------------------
# _merge — idempotent MERGE on PK with v1.4 datetime cast
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. PK is (BRANCH_ZIP, PROFILE_MONTH).

    v1.4: write_pandas auto_create_table=True mis-types datetime64[ns] as
    NUMBER(38,0) (nanoseconds-since-epoch) — cast back to TIMESTAMP_NTZ in
    the source SELECT so the target TIMESTAMP_NTZ(9) column is satisfied.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "ESRI_GEO_FOOTPRINT_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.ESRI_GEO_FOOTPRINT tgt
        USING (
            SELECT
                ORG_ID,
                BRANCH_ZIP, STATE_CODE, COUNTRY_CODE, PROFILE_MONTH,
                TAPESTRY_SEGMENT_CODE, TAPESTRY_SEGMENT_NAME,
                URBANICITY_TIER,
                MEDIAN_HOUSEHOLD_INCOME, WEALTH_INDEX,
                FOOT_TRAFFIC_INDEX, COMMERCIAL_DENSITY_PER_SQ_MI,
                DISTANCE_TO_NEAREST_BRANCH_MI, MARKET_PENETRATION_PCT,
                BRANCH_RECOMMENDATION,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.BRANCH_ZIP = src.BRANCH_ZIP
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            STATE_CODE                    = src.STATE_CODE,
            COUNTRY_CODE                  = src.COUNTRY_CODE,
            TAPESTRY_SEGMENT_CODE         = src.TAPESTRY_SEGMENT_CODE,
            TAPESTRY_SEGMENT_NAME         = src.TAPESTRY_SEGMENT_NAME,
            URBANICITY_TIER               = src.URBANICITY_TIER,
            MEDIAN_HOUSEHOLD_INCOME       = src.MEDIAN_HOUSEHOLD_INCOME,
            WEALTH_INDEX                  = src.WEALTH_INDEX,
            FOOT_TRAFFIC_INDEX            = src.FOOT_TRAFFIC_INDEX,
            COMMERCIAL_DENSITY_PER_SQ_MI  = src.COMMERCIAL_DENSITY_PER_SQ_MI,
            DISTANCE_TO_NEAREST_BRANCH_MI = src.DISTANCE_TO_NEAREST_BRANCH_MI,
            MARKET_PENETRATION_PCT        = src.MARKET_PENETRATION_PCT,
            BRANCH_RECOMMENDATION         = src.BRANCH_RECOMMENDATION,
            GENERATED_AT                  = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID,
            BRANCH_ZIP, STATE_CODE, COUNTRY_CODE, PROFILE_MONTH,
            TAPESTRY_SEGMENT_CODE, TAPESTRY_SEGMENT_NAME, URBANICITY_TIER,
            MEDIAN_HOUSEHOLD_INCOME, WEALTH_INDEX,
            FOOT_TRAFFIC_INDEX, COMMERCIAL_DENSITY_PER_SQ_MI,
            DISTANCE_TO_NEAREST_BRANCH_MI, MARKET_PENETRATION_PCT,
            BRANCH_RECOMMENDATION, GENERATED_AT
        ) VALUES (
            src.ORG_ID,
            src.BRANCH_ZIP, src.STATE_CODE, src.COUNTRY_CODE, src.PROFILE_MONTH,
            src.TAPESTRY_SEGMENT_CODE, src.TAPESTRY_SEGMENT_NAME, src.URBANICITY_TIER,
            src.MEDIAN_HOUSEHOLD_INCOME, src.WEALTH_INDEX,
            src.FOOT_TRAFFIC_INDEX, src.COMMERCIAL_DENSITY_PER_SQ_MI,
            src.DISTANCE_TO_NEAREST_BRANCH_MI, src.MARKET_PENETRATION_PCT,
            src.BRANCH_RECOMMENDATION, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
