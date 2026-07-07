"""CoreLogic-style synthetic property generator.

Snowpark Python stored procedure registered as DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY.
Mirrors the canonical 5-step pattern from the Cumulus umbrella spec §5.1.

Audience: ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''
Cadence:  QUARTERLY (first quarterly-cadence Cumulus dataset)
Salt:     "corelogic" (quarter-bucketed) + "corelogic_year" (year-stable)
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-5-corelogic-property.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-5-corelogic-property-rowspec.md
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

TABLE             = "DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY"
TASK_NAME         = "TASK_QUARTERLY_CORELOGIC_PROPERTY"
DATASET_SALT      = "corelogic"
# Year-stable salt for fields that don't reprice/change quarter-to-quarter
# within a calendar year: LAST_TRANSFER_YEAR (deed transfer date is immutable)
# and MORTGAGE_RATE_PCT (fixed-rate mortgages don't reprice).
DATASET_SALT_YEAR = "corelogic_year"

# Audience predicate — repeated in 2 places (AUDIENCE_SQL + COVERAGE_SQL).
# Mirrors the v1.5 defensive POSTAL_CODE filter so an empty-string ZIP cannot
# leak through. Both strings must match exactly to keep the coverage assertion
# meaningful.
_AUDIENCE_PREDICATE = (
    "ACCOUNT_TYPE_FLAG = 'PERSON' "
    "AND POSTAL_CODE IS NOT NULL "
    "AND POSTAL_CODE <> ''"
)
AUDIENCE_SQL = f"SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

# 16-column output contract (kept in sync with table DDL by the L1 schema test)
# v1.x multi-org-additive: ORG_ID leads the contract list; stamped from anchor.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID", "ACCOUNT_ID", "PROFILE_QUARTER", "IS_OWNER",
    "PRIMARY_PROPERTY_TYPE", "ESTIMATED_PROPERTY_VALUE",
    "OUTSTANDING_MORTGAGE_BALANCE", "LOAN_TO_VALUE_PCT", "EQUITY_USD",
    "MORTGAGE_RATE_PCT", "LIEN_COUNT", "FLOOD_ZONE_CODE",
    "WILDFIRE_RISK_SCORE", "LAST_TRANSFER_YEAR",
    "HELOC_OPPORTUNITY_SCORE", "GENERATED_AT",
})


# -------------------------------------------------------------------
# Quarter helper — buckets a run timestamp to its quarter-start date.
# -------------------------------------------------------------------

def _quarter_start(run_ts: datetime) -> datetime:
    """First-of-quarter for run_ts.  Jan/Apr/Jul/Oct 1, 00:00."""
    q_month = ((run_ts.month - 1) // 3) * 3 + 1
    return datetime(run_ts.year, q_month, 1)


# -------------------------------------------------------------------
# Entry point — invoked by DATA_JEDAIS.FINS__PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_CORELOGIC_PROPERTY
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log."""
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

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

        # 3. Idempotent MERGE on PK (ORG_ID, ACCOUNT_ID, PROFILE_QUARTER).
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
# _anchor_in_audience — defense-in-depth for the audience predicate
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate the AUDIENCE_PREDICATE into a Python predicate.

    PERSON anchors with non-null, non-empty POSTAL_CODE are in-audience.
    """
    return (
        anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON"
        and anchor.get("POSTAL_CODE") is not None
        and anchor.get("POSTAL_CODE") != ""
    )


# -------------------------------------------------------------------
# Bias-logic helpers — translate the rowspec faithfully
# -------------------------------------------------------------------

def _age_from_birthdate(birthdate: Any, today: date) -> int:
    """Tolerate ISO string, datetime, date, or None inputs."""
    if birthdate is None:
        return 40  # safe default; should not happen for PERSON audience
    if isinstance(birthdate, str):
        bd = datetime.fromisoformat(birthdate.split("T")[0]).date()
    elif isinstance(birthdate, datetime):
        bd = birthdate.date()
    elif isinstance(birthdate, date):
        bd = birthdate
    else:
        return 40
    return (today - bd).days // 365


def _is_owner(age: int, client_cat: str, rng: random.Random) -> bool:
    """Per rowspec owner-probability table.

    Wealth Management override: floor of 75% regardless of age.
    """
    if age < 25:
        prob = 0.05
    elif age < 35:
        prob = 0.30
    elif age < 45:
        prob = 0.60
    elif age < 55:
        prob = 0.72
    elif age < 65:
        prob = 0.78
    else:
        prob = 0.80
    if client_cat == "Wealth Management":
        prob = max(prob, 0.75)
    return rng.random() < prob


_PROPERTY_TYPE_URBAN = [
    ("Condo", 0.35), ("Townhouse", 0.25),
    ("Single Family", 0.30), ("Multi-Family", 0.10),
]
_PROPERTY_TYPE_SUBURBAN = [
    ("Single Family", 0.75), ("Townhouse", 0.15),
    ("Condo", 0.08), ("Multi-Family", 0.02),
]
_PROPERTY_TYPE_RURAL = [
    ("Single Family", 0.70), ("Manufactured Home", 0.18),
    ("Multi-Family", 0.08), ("Vacant Land", 0.04),
]


def _property_type(postal_code: str, rng: random.Random) -> str:
    """ZIP first-digit -> urbanicity bias -> property type distribution."""
    first = (postal_code or "0")[0]
    if first in ("0", "1", "9"):
        bias = _PROPERTY_TYPE_URBAN
    elif first in ("2", "3", "8"):
        bias = _PROPERTY_TYPE_SUBURBAN
    else:  # 4, 5, 6, 7
        bias = _PROPERTY_TYPE_RURAL
    choices, weights = zip(*bias)
    return rng.choices(choices, weights=weights)[0]


_ZIP_VALUE_BAND = {
    # Urban / California / NE
    "0": (450_000, 1_200_000), "1": (400_000, 1_500_000), "9": (550_000, 1_800_000),
    # Mid-tier suburbs
    "2": (300_000, 700_000), "3": (250_000, 600_000), "8": (300_000, 800_000),
    # Plains / South / Midwest
    "4": (180_000, 450_000), "5": (170_000, 420_000),
    "6": (160_000, 400_000), "7": (200_000, 500_000),
}


def _property_value(postal_code: str, income: float, rng: random.Random) -> int:
    """ZIP first-digit + income -> property value range."""
    first = (postal_code or "0")[0]
    low, high = _ZIP_VALUE_BAND.get(first, (200_000, 500_000))
    if income >= 250_000:
        income_mult = 2.0
    elif income >= 150_000:
        income_mult = 1.5
    elif income < 50_000:
        income_mult = 0.7
    else:
        income_mult = 1.0
    val = round(rng.uniform(low, high) * income_mult)
    return min(10_000_000, max(50_000, val))


def _mortgage_balance(property_value: int, age: int, rng: random.Random) -> int:
    """0 with age-biased probability, otherwise an LTV-biased fraction of value."""
    paid_off_prob = 0.30
    if age >= 65:
        paid_off_prob = 0.55
    elif age >= 55:
        paid_off_prob = 0.40
    if rng.random() < paid_off_prob:
        return 0
    if age < 35:
        ltv = rng.uniform(0.70, 0.95)
    elif age < 50:
        ltv = rng.uniform(0.50, 0.85)
    else:
        ltv = rng.uniform(0.20, 0.60)
    return round(property_value * ltv)


def _mortgage_rate(account_id: str, run_ts: datetime, rng: random.Random) -> float:
    """Bimodal: pre-2022 owners locked low rates; post-2022 face higher rates.

    Year-stable: a fixed-rate mortgage doesn't reprice quarter-to-quarter,
    so we compute the loan_year from a year-anchored seed and only let the
    intra-rate jitter come from the quarter-level rng.

    NOTE on year-stability: we *also* draw the rate jitter from a year-stable
    rng so the final rate is byte-identical across quarters.  The per-quarter
    rng (`rng` parameter) is intentionally NOT consumed here — that keeps
    MORTGAGE_RATE_PCT deterministic across all 4 quarters, matching the
    rowspec invariant for fixed-rate mortgages.
    """
    year_seed = seed_for(
        account_id + "_year", DATASET_SALT_YEAR,
        datetime(run_ts.year, 1, 1),
    )
    year_rng = random.Random(year_seed)
    loan_year = year_rng.choices(
        list(range(2010, 2027)),
        weights=[2, 2, 3, 3, 3, 4, 5, 6, 8, 10, 15, 20, 8, 5, 3, 2, 1],
    )[0]
    if loan_year < 2022:
        return round(year_rng.uniform(2.500, 4.750), 3)
    return round(year_rng.uniform(6.000, 8.500), 3)


def _lien_count(rng: random.Random) -> int:
    return rng.choices(
        [0, 1, 2, 3, 4, 5],
        weights=[0.78, 0.15, 0.04, 0.02, 0.008, 0.002],
    )[0]


_HIGH_FLOOD_STATES = {"FL", "LA", "TX", "NC", "SC", "NJ"}
_MID_FLOOD_STATES = {"CA", "GA", "VA", "MD", "MA", "NY", "MS", "AL"}


def _flood_zone(state: str, rng: random.Random) -> str:
    if state in _HIGH_FLOOD_STATES:
        return rng.choices(
            ["X", "B", "C", "AE", "A", "VE", "V"],
            weights=[0.45, 0.10, 0.10, 0.20, 0.10, 0.04, 0.01],
        )[0]
    if state in _MID_FLOOD_STATES:
        return rng.choices(
            ["X", "B", "C", "AE", "A"],
            weights=[0.65, 0.10, 0.10, 0.10, 0.05],
        )[0]
    return rng.choices(
        ["X", "B", "C", "AE"],
        weights=[0.85, 0.08, 0.05, 0.02],
    )[0]


_HIGH_WILDFIRE_STATES = {"CA", "AZ", "CO", "OR", "MT", "ID", "WA", "NV"}
_MID_WILDFIRE_STATES = {"TX", "NM", "UT", "WY", "OK"}


def _wildfire_score(state: str, rng: random.Random) -> int:
    if state in _HIGH_WILDFIRE_STATES:
        return round(rng.uniform(50, 95))
    if state in _MID_WILDFIRE_STATES:
        return round(rng.uniform(30, 65))
    return round(rng.uniform(0, 30))


def _last_transfer_year(account_id: str, birthdate: Any,
                        run_ts: datetime, today: date) -> int:
    """Year of last deed transfer.  Year-stable across quarters.

    Pseudocode: min(2026, max(1980, year_of_birth + 22 + year_rng.randint(0, 30)))
    Most owners bought 22-52 years after birth, capped to current year.
    """
    year_seed = seed_for(
        account_id + "_year", DATASET_SALT_YEAR,
        datetime(run_ts.year, 1, 1),
    )
    year_rng = random.Random(year_seed)
    if birthdate is None:
        birth_year = 1980
    elif isinstance(birthdate, str):
        birth_year = datetime.fromisoformat(birthdate.split("T")[0]).year
    elif isinstance(birthdate, datetime):
        birth_year = birthdate.year
    elif isinstance(birthdate, date):
        birth_year = birthdate.year
    else:
        birth_year = 1980
    raw = birth_year + 22 + year_rng.randint(0, 30)
    return min(today.year, max(1980, raw))


def _heloc_opportunity(equity: int, lien_count: int,
                        ltv_pct: float, rng: random.Random) -> int:
    """Combines equity + lien count + LTV into a 0-100 score."""
    if equity is None or equity < 50_000:
        return 0
    base = min(100, (equity / 5_000) + 20)  # $400K equity -> 100
    if lien_count >= 2:
        base -= 30
    if ltv_pct is not None and ltv_pct > 80:
        base -= 25
    return round(max(0, min(100, base + (rng.random() - 0.5) * 10)))


# -------------------------------------------------------------------
# _row_for — the substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row -> fact row. Deterministic.

    Per rowspec: seed = SHA-256(account_id || "corelogic" || YYYY-MQ).
    Mid-quarter re-runs replay exactly; new quarter rolls a new seed.
    Year-stable fields (LAST_TRANSFER_YEAR, MORTGAGE_RATE_PCT) use a separate
    salt + year-bucketed timestamp so they're identical across quarters.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')} fails audience predicate "
            f"({_AUDIENCE_PREDICATE})"
        )

    account_id  = anchor["ACCOUNT_ID"]
    birthdate   = anchor.get("BIRTHDATE")
    income      = float(anchor.get("ANNUAL_INCOME") or 0)
    client_cat  = anchor.get("CLIENT_CATEGORY") or ""
    postal_code = anchor.get("POSTAL_CODE")
    state       = anchor.get("STATE_CODE") or ""

    # Quarter-bucketed seed (most fields).
    quarter_start = _quarter_start(run_ts)
    seed = seed_for(account_id, DATASET_SALT, quarter_start)
    rng  = random.Random(seed)

    # 1. Owner status.
    age = _age_from_birthdate(birthdate, run_ts.date())
    is_owner = _is_owner(age, client_cat, rng)

    # 2. Common-to-everyone fields (always populated, even for renters).
    flood_zone = _flood_zone(state, rng)
    wildfire = _wildfire_score(state, rng)

    if not is_owner:
        return {
            # v1.x multi-org-additive: ORG_ID leads each emitted row (default 'JDO' backstop
            # if anchor lacks the column — matches V_ACCOUNT_ANCHORS post-Plan-5 contract).
            "ORG_ID":                       anchor.get("ORG_ID") or "JDO",
            "ACCOUNT_ID":                   account_id,
            "PROFILE_QUARTER":              quarter_start.date(),
            "IS_OWNER":                     False,
            "PRIMARY_PROPERTY_TYPE":        None,
            "ESTIMATED_PROPERTY_VALUE":     None,
            "OUTSTANDING_MORTGAGE_BALANCE": None,
            "LOAN_TO_VALUE_PCT":            None,
            "EQUITY_USD":                   None,
            "MORTGAGE_RATE_PCT":            None,
            "LIEN_COUNT":                   0,
            "FLOOD_ZONE_CODE":              flood_zone,
            "WILDFIRE_RISK_SCORE":          wildfire,
            "LAST_TRANSFER_YEAR":           None,
            "HELOC_OPPORTUNITY_SCORE":      None,
            "GENERATED_AT":                 quarter_start,
        }

    # 3. Owner: synthesize property fields.
    prop_type     = _property_type(postal_code, rng)
    prop_value    = _property_value(postal_code, income, rng)
    mortgage      = _mortgage_balance(prop_value, age, rng)
    mortgage_rate = _mortgage_rate(account_id, run_ts, rng) if mortgage > 0 else None
    ltv           = round(mortgage / prop_value * 100, 2) if mortgage > 0 else None
    equity        = max(0, prop_value - mortgage)
    lien_count    = _lien_count(rng)
    last_year     = _last_transfer_year(account_id, birthdate, run_ts, run_ts.date())
    heloc         = _heloc_opportunity(equity, lien_count, ltv, rng)

    return {
        # v1.x multi-org-additive: ORG_ID leads each emitted row (default 'JDO' backstop
        # if anchor lacks the column — matches V_ACCOUNT_ANCHORS post-Plan-5 contract).
        "ORG_ID":                       anchor.get("ORG_ID") or "JDO",
        "ACCOUNT_ID":                   account_id,
        "PROFILE_QUARTER":              quarter_start.date(),
        "IS_OWNER":                     True,
        "PRIMARY_PROPERTY_TYPE":        prop_type,
        "ESTIMATED_PROPERTY_VALUE":     prop_value,
        "OUTSTANDING_MORTGAGE_BALANCE": mortgage,
        "LOAN_TO_VALUE_PCT":            ltv,
        "EQUITY_USD":                   equity,
        "MORTGAGE_RATE_PCT":            mortgage_rate,
        "LIEN_COUNT":                   lien_count,
        "FLOOD_ZONE_CODE":              flood_zone,
        "WILDFIRE_RISK_SCORE":          wildfire,
        "LAST_TRANSFER_YEAR":           last_year,
        "HELOC_OPPORTUNITY_SCORE":      heloc,
        "GENERATED_AT":                 quarter_start,
    }


# -------------------------------------------------------------------
# _merge — idempotent MERGE on PK (ORG_ID, ACCOUNT_ID, PROFILE_QUARTER)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.

    v1.4: write_pandas auto_create_table=True mis-types datetime64[ns] as
    NUMBER(38,0) (nanoseconds-since-epoch) — cast back to TIMESTAMP_NTZ in
    the source SELECT so the target TIMESTAMP_NTZ(9) column is satisfied.

    8 NULLable property columns are passed through; pandas + write_pandas
    serializes Python None -> SQL NULL transparently.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "CORELOGIC_PROPERTY_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    # v1.x multi-org-additive: ORG_ID is part of the join eligibility; we
    # never UPDATE it in WHEN MATCHED (a row can't change orgs).
    merge_sql = f"""
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY tgt
        USING (
            SELECT
                ORG_ID,
                ACCOUNT_ID,
                PROFILE_QUARTER,
                IS_OWNER,
                PRIMARY_PROPERTY_TYPE,
                ESTIMATED_PROPERTY_VALUE,
                OUTSTANDING_MORTGAGE_BALANCE,
                LOAN_TO_VALUE_PCT,
                EQUITY_USD,
                MORTGAGE_RATE_PCT,
                LIEN_COUNT,
                FLOOD_ZONE_CODE,
                WILDFIRE_RISK_SCORE,
                LAST_TRANSFER_YEAR,
                HELOC_OPPORTUNITY_SCORE,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM DATA_JEDAIS.FINS__PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_QUARTER = src.PROFILE_QUARTER
        WHEN MATCHED THEN UPDATE SET
            IS_OWNER                     = src.IS_OWNER,
            PRIMARY_PROPERTY_TYPE        = src.PRIMARY_PROPERTY_TYPE,
            ESTIMATED_PROPERTY_VALUE     = src.ESTIMATED_PROPERTY_VALUE,
            OUTSTANDING_MORTGAGE_BALANCE = src.OUTSTANDING_MORTGAGE_BALANCE,
            LOAN_TO_VALUE_PCT            = src.LOAN_TO_VALUE_PCT,
            EQUITY_USD                   = src.EQUITY_USD,
            MORTGAGE_RATE_PCT            = src.MORTGAGE_RATE_PCT,
            LIEN_COUNT                   = src.LIEN_COUNT,
            FLOOD_ZONE_CODE              = src.FLOOD_ZONE_CODE,
            WILDFIRE_RISK_SCORE          = src.WILDFIRE_RISK_SCORE,
            LAST_TRANSFER_YEAR           = src.LAST_TRANSFER_YEAR,
            HELOC_OPPORTUNITY_SCORE      = src.HELOC_OPPORTUNITY_SCORE,
            GENERATED_AT                 = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ORG_ID, ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER,
            PRIMARY_PROPERTY_TYPE, ESTIMATED_PROPERTY_VALUE,
            OUTSTANDING_MORTGAGE_BALANCE, LOAN_TO_VALUE_PCT, EQUITY_USD,
            MORTGAGE_RATE_PCT, LIEN_COUNT, FLOOD_ZONE_CODE,
            WILDFIRE_RISK_SCORE, LAST_TRANSFER_YEAR,
            HELOC_OPPORTUNITY_SCORE, GENERATED_AT
        ) VALUES (
            src.ORG_ID, src.ACCOUNT_ID, src.PROFILE_QUARTER, src.IS_OWNER,
            src.PRIMARY_PROPERTY_TYPE, src.ESTIMATED_PROPERTY_VALUE,
            src.OUTSTANDING_MORTGAGE_BALANCE, src.LOAN_TO_VALUE_PCT, src.EQUITY_USD,
            src.MORTGAGE_RATE_PCT, src.LIEN_COUNT, src.FLOOD_ZONE_CODE,
            src.WILDFIRE_RISK_SCORE, src.LAST_TRANSFER_YEAR,
            src.HELOC_OPPORTUNITY_SCORE, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
