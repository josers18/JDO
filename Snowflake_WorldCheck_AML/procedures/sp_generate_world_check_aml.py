"""LSEG World-Check / Dow Jones / ComplyAdvantage-style synthetic AML generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_WORLD_CHECK_AML. **First daily-cadence Cumulus
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

import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE                       = "FINS.PUBLIC.WORLD_CHECK_AML"
TASK_NAME                   = "TASK_DAILY_WORLD_CHECK_AML"
DATASET_SALT                = "worldcheck"
DATASET_SALT_JURISDICTION   = "worldcheck_jurisdiction"
DATASET_SALT_CASE           = "worldcheck_case"

# Plan 7 has no audience predicate — every distinct account is screened daily.
_AUDIENCE_PREDICATE = ""  # all-accounts; kept as empty string for symmetry
AUDIENCE_SQL = "SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"

# 14-column output contract (v1.x multi-org-additive: ORG_ID added as
# leading PK column; backward-compatible default 'JDO'). Kept in sync with
# the table DDL by the L1 schema test.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_DATE", "OVERALL_RISK_RATING",
    "SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT",
    "ADVERSE_MEDIA_CATEGORIES",
    "RISK_JURISDICTION_CODE", "RISK_JURISDICTION_TIER",
    "LAST_SCREENED_AT", "CHANGE_SINCE_LAST_RUN",
    "CASE_REFERENCE", "GENERATED_AT",
})


# -------------------------------------------------------------------
# Day-bucket helper — truncates a run timestamp to its calendar-day start.
# -------------------------------------------------------------------

def _day_start(run_ts: datetime) -> datetime:
    """Bucket run_ts to its calendar-day start (UTC). Mid-day re-runs
    re-bucket to the same instant so the seed (and therefore the row) is
    byte-identical."""
    return run_ts.replace(hour=0, minute=0, second=0, microsecond=0)


def _daily_seed(account_id: str, run_ts: datetime) -> bytes:
    """Daily seed for the main rng stream.

    seed_for() buckets only by Y-M, so we fold the day-of-month into the
    account_id parameter to obtain a distinct seed per calendar day. This
    keeps the seed_for contract intact (no day-bucket flag) while letting
    Plan 7's day-cadence pipeline differentiate adjacent days within a month.
    """
    day = _day_start(run_ts)
    return seed_for(
        f"{account_id}|{day.strftime('%Y%m%d')}", DATASET_SALT, day
    )


# -------------------------------------------------------------------
# Jurisdiction tables — 30-jurisdiction pool with explicit tier.
# Constants from rowspec; do not import-cycle into helpers below.
# -------------------------------------------------------------------

_PROHIBITED_JURISDICTIONS = {
    "IR": "Iran", "KP": "North Korea", "SY": "Syria", "CU": "Cuba",
}
_ENHANCED_JURISDICTIONS = {
    "RU": "Russia", "VE": "Venezuela", "BY": "Belarus", "MM": "Myanmar",
    "AF": "Afghanistan", "ZW": "Zimbabwe", "SD": "Sudan",
    "PK": "Pakistan", "NG": "Nigeria",
}
_STANDARD_JURISDICTIONS = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada",
    "DE": "Germany", "FR": "France", "JP": "Japan", "AU": "Australia",
    "CH": "Switzerland", "SG": "Singapore", "AE": "United Arab Emirates",
    "MX": "Mexico", "BR": "Brazil", "IN": "India", "CN": "China",
    "KR": "South Korea", "IT": "Italy", "ES": "Spain",
}

_ADVERSE_MEDIA_CATEGORY_POOL = [
    "Financial Crime", "Bribery", "Tax Evasion", "Fraud",
    "Money Laundering", "Terrorism Financing", "Cybercrime",
    "Drug Trafficking", "Human Trafficking", "Corruption",
]

_RATING_RANK = {"Low": 0, "Medium": 1, "High": 2, "Severe": 3}


# -------------------------------------------------------------------
# Component-flag rate functions — pure, no shared state.
# Called twice per anchor (once for today, once for yesterday's diff).
#
# Each flag is YEAR-STABLE per account at the rowspec target rate, with a
# small (~0.3%) per-day flip probability around the year-stable base. This
# hybrid model is what gives the rowspec's two simultaneous invariants:
#   - marginal rate ≈ base + flip ≈ target (within ±0.3 pp on 36,500 samples)
#   - day-to-day Unchanged rate ≈ 99% (the load-bearing demo invariant)
#
# A pure daily-independent draw can only deliver one of those; a pure
# year-stable flag can only deliver the other (and only on huge samples).
# -------------------------------------------------------------------

# Per-day flip probability for each flag — small enough to keep day-to-day
# Unchanged rate ~99%, large enough to add detectable variance over 365 days.
_DAILY_FLIP_PROB = 0.003


def _sanctions_hit(rng: random.Random) -> bool:
    """Daily-independent component: ~0.5% raw rate; combined with the
    year-stable base in `_sanctions_hit_combined`."""
    return rng.random() < 0.005


def _pep_hit(rng: random.Random) -> bool:
    """Daily-independent component: ~1.2% raw rate."""
    return rng.random() < 0.012


def _adverse_media_hit(rng: random.Random) -> bool:
    """Daily-independent component: ~3.0% raw rate."""
    return rng.random() < 0.030


def _year_stable_base_flag(account_id: str, run_ts: datetime,
                            flag_name: str, rate: float) -> bool:
    """Year-stable base flag at the given rate.

    The flag_name is folded into the account_id parameter so each flag
    (sanctions / PEP / media) gets its own independent rng stream. Salt
    reuses 'worldcheck_jurisdiction' (same year-stable bucket).
    """
    seed = seed_for(
        f"{account_id}_{flag_name}",
        DATASET_SALT_JURISDICTION,
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return rng.random() < rate


def _flag_with_daily_flip(account_id: str, run_ts: datetime,
                           flag_name: str, base_rate: float,
                           daily_rng: random.Random) -> bool:
    """Combine year-stable base flag with a small daily flip event.

    The base (year-stable) rate is `base_rate`. The daily flip probability
    is `_DAILY_FLIP_PROB` ~0.3%. Marginal rate ≈ base_rate + flip_prob × (1 - 2 × base_rate).
    Day-to-day Unchanged rate per flag ≈ 1 - 2 × flip_prob = ~99.4%.
    """
    base = _year_stable_base_flag(account_id, run_ts, flag_name, base_rate)
    flipped = daily_rng.random() < _DAILY_FLIP_PROB
    return base != flipped  # XOR — flip toggles the year-stable base


def _adverse_media_categories(adverse_media_hit: bool,
                               rng: random.Random) -> str | None:
    """Pipe-delimited sorted 1-3 categories, or None when no media hit."""
    if not adverse_media_hit:
        return None
    n = rng.choices([1, 2, 3], weights=[0.65, 0.28, 0.07])[0]
    cats = rng.sample(_ADVERSE_MEDIA_CATEGORY_POOL, n)
    return "|".join(sorted(cats))


# -------------------------------------------------------------------
# Jurisdiction helpers — year-stable per account.
# -------------------------------------------------------------------

def _risk_jurisdiction(rng: random.Random) -> tuple[str, str]:
    """Return (RISK_JURISDICTION_CODE, RISK_JURISDICTION_TIER).

    Distribution targets:
      Standard:   ~98.5% (US-heavy: US ~85% of standard tier)
      Enhanced:   ~1.0%
      Prohibited: ~0.5%
    """
    bucket = rng.choices(
        ["standard", "enhanced", "prohibited"],
        weights=[0.985, 0.010, 0.005],
    )[0]
    if bucket == "prohibited":
        return rng.choice(list(_PROHIBITED_JURISDICTIONS.keys())), "Prohibited"
    if bucket == "enhanced":
        return rng.choice(list(_ENHANCED_JURISDICTIONS.keys())), "Enhanced"
    # Standard: US-heavy
    if rng.random() < 0.85:
        return "US", "Standard"
    return rng.choice(list(_STANDARD_JURISDICTIONS.keys())), "Standard"


def _risk_jurisdiction_stable(account_id: str,
                               run_ts: datetime) -> tuple[str, str]:
    """Year-stable jurisdiction: a customer's primary jurisdiction doesn't
    shift day-to-day, only across calendar-year refreshes.

    Salt: 'worldcheck_jurisdiction'. Year-bucketed via datetime(year, 1, 1).
    """
    seed = seed_for(
        account_id + "_jurisdiction",
        DATASET_SALT_JURISDICTION,
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return _risk_jurisdiction(rng)


# -------------------------------------------------------------------
# Rollup + diff — pure functions used twice (today + yesterday).
# -------------------------------------------------------------------

def _overall_risk_rating(sanctions_hit: bool, pep_hit: bool,
                          adverse_media_hit: bool, jurisdiction_tier: str,
                          noise_tail_bump: bool) -> str:
    """Roll up component flags into a single rating (rowspec exact).

    Severe: sanctions match OR Prohibited jurisdiction
    High:   PEP match OR (Enhanced jurisdiction AND any other flag)
    Medium: adverse-media match OR Enhanced jurisdiction alone
    Low:    none of the above (year-stable noise tail can bump to Medium)

    Note: the noise-tail bump is YEAR-STABLE per account (computed by the
    caller via `_noise_tail_bump`), so day-to-day re-runs with otherwise
    identical component flags produce IDENTICAL ratings — the ~99%
    Unchanged rate in the rowspec depends on this. A daily-rng noise tail
    would flip ~0.6% of clean days and collapse Unchanged to ~90%.
    """
    if sanctions_hit or jurisdiction_tier == "Prohibited":
        return "Severe"
    if pep_hit:
        return "High"
    if jurisdiction_tier == "Enhanced" and adverse_media_hit:
        return "High"
    if adverse_media_hit or jurisdiction_tier == "Enhanced":
        return "Medium"
    # Long tail: ~0.3% of clean accounts get a year-stable rating bump.
    return "Medium" if noise_tail_bump else "Low"


def _noise_tail_bump(account_id: str, run_ts: datetime) -> bool:
    """Year-stable noise-tail bump for the rating rollup.

    ~0.3% of clean accounts have their rating bumped from Low to Medium.
    This bump is YEAR-STABLE — it doesn't flip day-to-day, which keeps
    the CHANGE_SINCE_LAST_RUN Unchanged rate ~99% as the rowspec specifies.

    Salt reuses 'worldcheck_jurisdiction' (same year-stable bucket); the
    account_id is suffixed with '_noise' to keep this rng stream
    independent from the jurisdiction draw.
    """
    seed = seed_for(
        account_id + "_noise",
        DATASET_SALT_JURISDICTION,
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return rng.random() < 0.003


def _diff_rating(yesterday: str, today: str) -> str:
    """Compare two ratings; return CHANGE_SINCE_LAST_RUN string."""
    if yesterday == today:
        return "Unchanged"
    if today != "Low" and yesterday == "Low":
        return "New"  # First-day-flagged
    if today == "Low" and yesterday != "Low":
        return "Cleared"
    if _RATING_RANK[today] > _RATING_RANK[yesterday]:
        return "Risk Increased"
    return "Risk Decreased"


def _change_since_last_run(account_id: str, run_ts: datetime,
                            today_rating: str) -> str:
    """Re-derive yesterday's rating components (fresh rng), then diff.

    The component-flag helpers are pure functions, so we can replay them
    against a separate `random.Random` keyed on yesterday's daily seed.
    The jurisdiction and noise-tail bump are year-stable so we reuse them.
    """
    yesterday = _day_start(run_ts) - timedelta(days=1)
    y_seed = _daily_seed(account_id, yesterday)
    y_rng = random.Random(y_seed)

    # Replay yesterday's draw order EXACTLY as _row_for does for today:
    # (1) sanctions flip, (2) pep flip, (3) media flip, (4) media categories.
    # Each `_flag_with_daily_flip` consumes ONE rng.random() from y_rng AFTER
    # combining the year-stable base for yesterday's date.
    y_sanctions = _flag_with_daily_flip(
        account_id, yesterday, "sanctions", 0.002, y_rng
    )
    y_pep = _flag_with_daily_flip(
        account_id, yesterday, "pep", 0.009, y_rng
    )
    y_media = _flag_with_daily_flip(
        account_id, yesterday, "media", 0.027, y_rng
    )
    _ = _adverse_media_categories(y_media, y_rng)  # consume rng to align
    _, y_tier = _risk_jurisdiction_stable(account_id, yesterday)
    y_noise = _noise_tail_bump(account_id, yesterday)
    y_rating = _overall_risk_rating(
        y_sanctions, y_pep, y_media, y_tier, y_noise
    )

    return _diff_rating(y_rating, today_rating)


def _case_reference(account_id: str, run_ts: datetime,
                     overall_rating: str) -> str | None:
    """Year-stable vendor case ID for High/Severe ratings; None otherwise.

    Format: WCH-YYYY-NNNNNN. Once a case is opened, the ID stays the same
    for the rest of the calendar year (year-stable seed keyed on Jan 1).
    """
    if overall_rating not in ("High", "Severe"):
        return None
    seed = seed_for(
        account_id + "_case",
        DATASET_SALT_CASE,
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return f"WCH-{run_ts.year}-{rng.randint(100000, 999999)}"


# -------------------------------------------------------------------
# _anchor_in_audience — Plan 7 audience is all-accounts.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Plan 7 audience is all-accounts — no predicate. Every distinct
    anchor with a non-empty ACCOUNT_ID is in audience."""
    return bool(anchor.get("ACCOUNT_ID"))


# -------------------------------------------------------------------
# _row_for — substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row -> fact row. Deterministic on (account_id, day_start).

    Reads ONLY anchor['ACCOUNT_ID'] — NO BIRTHDATE / income / state / category /
    POSTAL_CODE. All bias is account-id-driven via the daily + year-stable salts.
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

    # 1. Year-stable jurisdiction (rowspec invariant: doesn't drift day-to-day).
    jurisdiction_code, jurisdiction_tier = _risk_jurisdiction_stable(
        account_id, run_ts
    )

    # 2. Today's component flags. Each flag = year-stable base XOR daily-flip
    # event. Base rates are calibrated so that
    #   marginal rate ≈ base + _DAILY_FLIP_PROB × (1 - 2 × base) ≈ target
    # i.e. for target X, base = X - 0.003 (since base is small relative to 1).
    # That keeps SANCTIONS marginal at ~0.005, PEP at ~0.012, MEDIA at ~0.030
    # while letting the daily-flip event drive day-to-day variance.
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

    # 3. Roll up overall rating. The noise-tail bump is YEAR-STABLE so
    # day-to-day Unchanged rates match the rowspec target (~99%).
    noise_bump = _noise_tail_bump(account_id, run_ts)
    overall = _overall_risk_rating(
        sanctions, pep, media, jurisdiction_tier, noise_bump
    )

    # 4. Compare to yesterday (re-derives yesterday's seed; doesn't share state).
    change = _change_since_last_run(account_id, run_ts, overall)

    # 5. Case reference (year-stable; populated only when High/Severe).
    case_ref = _case_reference(account_id, run_ts, overall)

    # Multi-org tag: V_ACCOUNT_ANCHORS post-Phase A exposes ORG_ID first;
    # legacy single-org callers / fixtures without ORG_ID default to 'JDO'.
    org_id = anchor.get("ORG_ID") or "JDO"

    return {
        "ORG_ID":                   org_id,
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
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_WORLD_CHECK_AML
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log."""
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)  # 1:1 — also matches row count.

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

        # 3. Idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_DATE).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion — 1:1 audience-vs-actual.
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
    """Snowpark Row -> plain dict so _row_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_DATE)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.

    Casts in the source SELECT (defensive against write_pandas auto-typing
    on an empty target):
      - GENERATED_AT, LAST_SCREENED_AT — datetime64[ns] mis-types as
        NUMBER(38,0) (nanoseconds-since-epoch); cast back via TO_TIMESTAMP_NTZ.
      - SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT — the 3 BOOLEAN columns
        cast explicitly (write_pandas can infer int8 on empty stage).

    The 2 NULLable columns (ADVERSE_MEDIA_CATEGORIES, CASE_REFERENCE) pass
    through; pandas + write_pandas serialize Python None -> SQL NULL transparently.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "WORLD_CHECK_AML_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.WORLD_CHECK_AML tgt
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
            FROM FINS.PUBLIC.{staging}
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
