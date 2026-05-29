"""Gong / Chorus.ai / ExecVision-style synthetic weekly conversation-intelligence
rollups generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT. **Second weekly-cadence Cumulus
dataset** (after Plan 6 Plaid Held-Away). Account-scoped 1:1 — emits exactly
one row per distinct Wealth Management + Commercial Banking anchor per week
(~4,880 rows/week).

Audience: CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')
Cadence:  WEEKLY (Monday 05:00 UTC, cron `0 5 * * 1 UTC`)
Salts:
  - "gong"      (week-bucketed; main rng for call activity, sentiment, topics,
                action items, deal-risk, dates, and the auxiliary RM-note gate)
  - "gong_rm"   (year-stable; RM_NAME stickiness — relationship managers do not
                reassign weekly)
  A tertiary helper salt "gong_trend" lives inside `_sentiment_trend_base`
  as the year-stable base trajectory for SENTIMENT_TREND. It is a row-factory
  helper, not a top-level dataset salt.

Cascade-NULL boring case:
  Plan 12 is the first Cumulus dataset where NULL semantics cascade-collapse
  from a single zero-activity Boolean predicate. When CALL_COUNT_LAST_7D == 0,
  six fields collapse to no-call defaults (TOTAL_TALK_TIME_MINUTES = 0,
  CUSTOMER_TALK_RATIO_PCT = 0.00, OVERALL_SENTIMENT = 'Neutral',
  KEY_TOPICS_FLAGS IS NULL, LAST_CALL_DATE IS NULL, ACTION_ITEMS_COUNT = 0)
  but the row still emits. Coverage invariant holds — the boring case is a
  meaningful row, not a row that's filtered out.

Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-12-gong-call-sentiment-rowspec.md
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

TABLE                = "FINS.PUBLIC.GONG_CALL_SENTIMENT"
TASK_NAME            = "TASK_WEEKLY_GONG_CALL_SENTIMENT"
DATASET_SALT         = "gong"      # week-bucketed; primary rng stream
DATASET_SALT_RM      = "gong_rm"   # year-stable; RM_NAME stickiness
DATASET_SALT_TREND   = "gong_trend"  # year-stable helper for trend base trajectory

# Audience predicate — repeated in 2 places (AUDIENCE_SQL + COVERAGE_SQL).
# Both strings must match exactly to keep the coverage assertion meaningful.
_AUDIENCE_PREDICATE = "CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')"
AUDIENCE_SQL = (
    "SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS "
    "WHERE CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')"
)
COVERAGE_SQL = (
    "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS "
    "WHERE CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')"
)

# 15-column output contract (kept in sync with the table DDL by the L1 schema test).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ACCOUNT_ID", "PROFILE_WEEK",
    "CALL_COUNT_LAST_7D", "TOTAL_TALK_TIME_MINUTES", "CUSTOMER_TALK_RATIO_PCT",
    "OVERALL_SENTIMENT", "SENTIMENT_TREND",
    "KEY_TOPICS_FLAGS", "ACTION_ITEMS_COUNT", "DEAL_RISK_SCORE",
    "LAST_CALL_DATE", "NEXT_SCHEDULED_CALL_DATE",
    "RM_NAME", "RM_LAST_LOGGED_NOTE_DATE",
    "GENERATED_AT",
})


# -------------------------------------------------------------------
# Vocabulary + RM name pools — constants from the rowspec
# -------------------------------------------------------------------

_SENTIMENT_VOCAB = ["Very Positive", "Positive", "Neutral", "Negative", "Very Negative"]
_TREND_VOCAB = ["Improving", "Stable", "Declining"]
_TOPIC_POOL = ["Pricing", "Renewal", "Competitor", "FeatureRequest"]

_RM_FIRST_NAMES = [
    "Sarah", "Michael", "Jennifer", "David", "Lisa", "James", "Jessica",
    "Robert", "Emily", "Christopher", "Amanda", "Daniel", "Michelle", "Matthew",
    "Stephanie", "Andrew", "Rachel", "Brian", "Nicole", "Kevin",
]
_RM_LAST_NAMES = [
    "Patel", "Chen", "Rodriguez", "Williams", "Johnson", "Davis", "Miller",
    "Brown", "Garcia", "Wilson", "Anderson", "Thomas", "Martinez", "Robinson",
    "Clark", "Lewis", "Walker", "Hall", "Young", "Allen",
]


# -------------------------------------------------------------------
# Week-bucket helper — Monday-of-week truncated to midnight (UTC).
# -------------------------------------------------------------------

def _week_start(run_ts: datetime) -> datetime:
    """Bucket run_ts to the Monday-of-week at 00:00:00 (UTC). Mid-week re-runs
    re-bucket to the same instant so the seed (and therefore the row) is
    byte-identical."""
    monday = run_ts - timedelta(days=run_ts.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


# -------------------------------------------------------------------
# _anchor_in_audience — translate AUDIENCE_PREDICATE into a Python predicate.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Wealth Management + Commercial Banking anchors are in-audience.

    Defense-in-depth alongside the SQL predicate. Also rejects rows missing
    a non-empty ACCOUNT_ID — the audience view is DISTINCT but the L1 input-
    shape test wants this check to be load-bearing.
    """
    return (
        anchor.get("CLIENT_CATEGORY") in ("Wealth Management", "Commercial Banking")
        and bool(anchor.get("ACCOUNT_ID"))
    )


# -------------------------------------------------------------------
# Bias-logic helpers — translate the rowspec faithfully
# -------------------------------------------------------------------

def _call_count_last_7d(client_category: str, rng: random.Random) -> int:
    """Most weeks have 0 calls. Commercial averages more than Wealth.

    Wealth: mode 0, mean ~0.6/wk, max 4.
    Commercial: mode 1, mean ~1.8/wk, max 8.
    Range [0, 15] for downstream guards (rowspec invariant); actual draws
    cap at 8 by construction.
    """
    if client_category == "Wealth Management":
        return rng.choices([0, 1, 2, 3, 4], weights=[65, 22, 10, 2, 1])[0]
    # Commercial Banking — wider tail.
    return rng.choices(
        [0, 1, 2, 3, 4, 5, 6, 8],
        weights=[35, 32, 18, 9, 4, 1.5, 0.4, 0.1],
    )[0]


def _total_talk_time_minutes(call_count: int, client_category: str,
                              rng: random.Random) -> int:
    """Sum of per-call durations. 0 when call_count == 0 (cascade gate).
    Per-call mean differs by cohort (Wealth ~22min, Commercial ~38min).
    Capped at 600 (10h/wk)."""
    if call_count == 0:
        return 0
    per_call_mean = 38 if client_category == "Commercial Banking" else 22
    minutes = sum(
        max(2, int(rng.gauss(per_call_mean, per_call_mean * 0.4)))
        for _ in range(call_count)
    )
    return min(minutes, 600)


def _customer_talk_ratio_pct(call_count: int, client_category: str,
                              rng: random.Random) -> float:
    """% of total talk time the customer spoke. 0.00 when no calls.
    Wealth mean ~58% (HNW client drives agenda); Commercial mean ~42%
    (banker walks through deck). Bounded [10.00, 90.00] to keep both
    extremes plausible; rowspec range invariant is [0.00, 100.00]."""
    if call_count == 0:
        return 0.00
    mean = 58.0 if client_category == "Wealth Management" else 42.0
    return round(max(10.0, min(90.0, rng.gauss(mean, 10.0))), 2)


def _overall_sentiment(call_count: int, rng: random.Random) -> str:
    """Cascade-gated to 'Neutral' when no calls. Otherwise ~5/30/45/15/5
    across the 5-vocab."""
    if call_count == 0:
        return "Neutral"
    return rng.choices(_SENTIMENT_VOCAB, weights=[5, 30, 45, 15, 5])[0]


def _sentiment_trend_base(account_id: str, run_ts: datetime) -> str:
    """Year-stable trajectory per anchor — RMs do not whipsaw weekly.

    Salt: 'gong_trend'. Year-bucketed via datetime(run_ts.year, 1, 1).
    Same pattern as Plan 5's year-stable mortgage rate and Plan 7's
    year-stable jurisdiction code.
    """
    seed = seed_for(
        account_id + "_trend",
        DATASET_SALT_TREND,
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return rng.choices(_TREND_VOCAB, weights=[25, 55, 20])[0]


def _sentiment_trend(base_trend: str, this_week_sentiment: str,
                      rng: random.Random) -> str:
    """Mostly the year-stable base; small ~20% chance of perturbation when
    this week's sentiment strongly disagrees with the base trajectory."""
    if this_week_sentiment in ("Very Negative", "Negative") and base_trend == "Improving":
        if rng.random() < 0.20:
            return "Stable"
    if this_week_sentiment in ("Very Positive", "Positive") and base_trend == "Declining":
        if rng.random() < 0.20:
            return "Stable"
    return base_trend


def _key_topics_flags(call_count: int, rng: random.Random) -> str | None:
    """Pipe-delimited 0-3 topics, or None when no calls.

    None when call_count == 0 (cascade gate — we never listened).
    Empty string ('') when call_count > 0 but no topic crosses threshold
    (we listened, nothing flagged). The empty-string-vs-NULL distinction
    is meaningful per rowspec.
    """
    if call_count == 0:
        return None
    n = rng.choices([0, 1, 2, 3], weights=[15, 50, 25, 10])[0]
    if n == 0:
        return ""
    return "|".join(sorted(rng.sample(_TOPIC_POOL, n)))


def _action_items_count(call_count: int, sentiment: str,
                         rng: random.Random) -> int:
    """Detected action items across the week's calls. 0 when no calls.
    Biased up (1.5x) when sentiment is Negative or Very Negative.
    Capped at 10."""
    if call_count == 0:
        return 0
    base_max = call_count * 2
    bias = 1.5 if sentiment in ("Very Negative", "Negative") else 1.0
    return min(10, int(rng.uniform(0, base_max) * bias))


def _deal_risk_score(call_count: int, sentiment: str,
                      topics_str: str | None, rm_note_stale: bool,
                      rng: random.Random) -> float:
    """0.00-100.00 risk score. Stacks negative sentiment + Competitor topic
    + RM staleness. Boring case (no calls + RM fresh) lands 5-20."""
    base = rng.uniform(5.0, 25.0)
    if sentiment == "Very Negative":
        base += rng.uniform(35.0, 55.0)
    elif sentiment == "Negative":
        base += rng.uniform(15.0, 30.0)
    elif sentiment == "Very Positive":
        base -= rng.uniform(5.0, 15.0)
    if topics_str and "Competitor" in topics_str:
        base += rng.uniform(10.0, 20.0)
    if rm_note_stale:
        base += rng.uniform(5.0, 15.0)
    if call_count == 0 and not rm_note_stale:
        # Re-draw the boring-case base to keep low-risk distribution tight.
        base = rng.uniform(5.0, 20.0)
    return round(max(0.0, min(100.0, base)), 2)


def _last_call_date(call_count: int, week_start: datetime,
                     rng: random.Random) -> date | None:
    """Most-recent call date in the prior 7 days. None when no calls (cascade gate).
    Returns a date strictly BEFORE week_start.date() (the Monday of the run-week)
    so the rowspec invariant `LAST_CALL_DATE <= run_ts.date()` holds for any
    run during the week. Subtracting from week_start (not run_ts) keeps the
    value week-bucket-stable across mid-week re-runs (Plan 8 lesson)."""
    if call_count == 0:
        return None
    return week_start.date() - timedelta(days=rng.randint(1, 7))


def _next_scheduled_call_date(week_start: datetime,
                               rng: random.Random) -> date | None:
    """Next scheduled RM touch. Independent ~40% NULL gate (RMs don't always
    schedule the next touch). When populated, > week_start + 1 day so the
    rowspec's `> run_ts.date()` invariant holds for any run during the week.

    Anchored on week_start.date() rather than run_ts.date() so the value is
    week-bucket-stable (Plan 8 lesson).
    """
    if rng.random() < 0.40:
        return None
    # week_start.date() + 2..62 days. Adding at least 2 days from the Monday
    # of the run-week guarantees the value is strictly after any plausible
    # run_ts within that calendar week (Mon-Sun).
    return week_start.date() + timedelta(days=rng.randint(2, 62))


def _rm_name(account_id: str, run_ts: datetime) -> str:
    """Year-stable RM name for this anchor — RMs don't reassign weekly.

    Salt: 'gong_rm'. Year-bucketed via datetime(run_ts.year, 1, 1).
    Pattern adapted from Plan 7's year-stable jurisdiction. 20 first names
    x 20 last names = 400-name pool (rowspec calls for a 60-name pool;
    we use a wider grid for diversity, which still satisfies the year-
    stable invariant).
    """
    seed = seed_for(
        account_id + "_rm",
        DATASET_SALT_RM,
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    first = rng.choice(_RM_FIRST_NAMES)
    last = rng.choice(_RM_LAST_NAMES)
    return f"{first} {last}"


def _rm_last_logged_note_date(call_count: int, week_start: datetime,
                               rng: random.Random) -> date | None:
    """RM's last activity log entry. ~15% NULL (RM is genuinely stale).
    Otherwise drawn from [1, 3, 7, 14, 30, 60] days back from week_start.

    Auxiliary mixed gate — independent of call_count. The `call_count`
    parameter is accepted for symmetry with the rowspec helper signature
    but the rate is uniform across activity weeks. Anchored on
    week_start.date() (Plan 8 lesson)."""
    if rng.random() < 0.15:
        return None
    days_ago = rng.choices([1, 3, 7, 14, 30, 60], weights=[20, 25, 25, 15, 10, 5])[0]
    return week_start.date() - timedelta(days=days_ago)


# -------------------------------------------------------------------
# _row_for — substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row -> fact row. Deterministic on (account_id,
    week_start). Mid-week re-runs replay byte-identically because both the
    seed AND every date helper anchor on `week_start.date()`.

    Status-first computation — call_count drives the cascade:
      Stage 1: call_count (drives cascade gate).
      Stage 2: count-dependent fields (talk time, ratio, sentiment, topics,
               action_items).
      Stage 3: derived (deal_risk_score uses sentiment + topics + RM stale;
               next_scheduled_call_date independent gate).
      Stage 4: year-stable (rm_name).

    Reads ONLY anchor['ACCOUNT_ID'] and anchor['CLIENT_CATEGORY'] —
    cohort bias is on the cohort flag itself, no BIRTHDATE / ANNUAL_INCOME.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed audience predicate "
            f"({_AUDIENCE_PREDICATE}); "
            f"ACCOUNT_ID={anchor.get('ACCOUNT_ID')!r} "
            f"CLIENT_CATEGORY={anchor.get('CLIENT_CATEGORY')!r}"
        )

    account_id = anchor["ACCOUNT_ID"]
    client_category = anchor.get("CLIENT_CATEGORY") or ""

    # Week-bucketed seed — anchor on the Monday of the run-week.
    week_start = _week_start(run_ts)
    seed = seed_for(account_id, DATASET_SALT, week_start)
    rng = random.Random(seed)

    # Stage 1: call activity drives most cascade-gated fields.
    call_count = _call_count_last_7d(client_category, rng)

    # Stage 2: count-dependent fields (cascade-gated by call_count == 0).
    talk_time = _total_talk_time_minutes(call_count, client_category, rng)
    talk_ratio = _customer_talk_ratio_pct(call_count, client_category, rng)
    sentiment = _overall_sentiment(call_count, rng)
    trend_base = _sentiment_trend_base(account_id, run_ts)
    trend = _sentiment_trend(trend_base, sentiment, rng)
    topics = _key_topics_flags(call_count, rng)
    action_items = _action_items_count(call_count, sentiment, rng)

    # Stage 3: RM auxiliary state (independent of cascade) + derived risk.
    rm_note_date = _rm_last_logged_note_date(call_count, week_start, rng)
    rm_note_stale = (
        rm_note_date is None
        or (week_start.date() - rm_note_date).days > 30
    )
    risk_score = _deal_risk_score(
        call_count, sentiment, topics, rm_note_stale, rng
    )

    # Cascade-gated dates + independent-gated next-scheduled date.
    last_call = _last_call_date(call_count, week_start, rng)
    next_call = _next_scheduled_call_date(week_start, rng)

    # Stage 4: year-stable RM name (separate salt; not from rng above).
    rm_name = _rm_name(account_id, run_ts)

    return {
        "ACCOUNT_ID":                account_id,
        "PROFILE_WEEK":              week_start.date(),
        "CALL_COUNT_LAST_7D":        call_count,
        "TOTAL_TALK_TIME_MINUTES":   talk_time,
        "CUSTOMER_TALK_RATIO_PCT":   talk_ratio,
        "OVERALL_SENTIMENT":         sentiment,
        "SENTIMENT_TREND":           trend,
        "KEY_TOPICS_FLAGS":          topics,
        "ACTION_ITEMS_COUNT":        action_items,
        "DEAL_RISK_SCORE":           risk_score,
        "LAST_CALL_DATE":            last_call,
        "NEXT_SCHEDULED_CALL_DATE":  next_call,
        "RM_NAME":                   rm_name,
        "RM_LAST_LOGGED_NOTE_DATE":  rm_note_date,
        "GENERATED_AT":              week_start,
    }


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_GONG_CALL_SENTIMENT
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log.

    Weekly cadence — re-runs same calendar week MERGE-replace (byte-identical
    because the seed + every date helper anchor on week_start).
    """
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

        # 3. Idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_WEEK).
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
# _merge — idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_WEEK)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.

    Casts in the source SELECT (defensive against write_pandas auto-typing
    on an empty target, per Plan 6 / Plan 7 finding):
      - GENERATED_AT — datetime64[ns] mis-types as NUMBER(38,0)
        (nanoseconds-since-epoch); cast back via TO_TIMESTAMP_NTZ.
      - PROFILE_WEEK::DATE — defensive (write_pandas can infer the wrong
        type for an empty staging table).

    The 3 NULLable columns (KEY_TOPICS_FLAGS, LAST_CALL_DATE,
    NEXT_SCHEDULED_CALL_DATE) plus the auxiliary mixed-gate
    RM_LAST_LOGGED_NOTE_DATE pass through; pandas + write_pandas serialize
    Python None -> SQL NULL transparently.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "GONG_CALL_SENTIMENT_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.GONG_CALL_SENTIMENT tgt
        USING (
            SELECT
                ACCOUNT_ID,
                PROFILE_WEEK::DATE AS PROFILE_WEEK,
                CALL_COUNT_LAST_7D,
                TOTAL_TALK_TIME_MINUTES,
                CUSTOMER_TALK_RATIO_PCT,
                OVERALL_SENTIMENT,
                SENTIMENT_TREND,
                KEY_TOPICS_FLAGS,
                ACTION_ITEMS_COUNT,
                DEAL_RISK_SCORE,
                LAST_CALL_DATE,
                NEXT_SCHEDULED_CALL_DATE,
                RM_NAME,
                RM_LAST_LOGGED_NOTE_DATE,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_WEEK = src.PROFILE_WEEK
        WHEN MATCHED THEN UPDATE SET
            CALL_COUNT_LAST_7D       = src.CALL_COUNT_LAST_7D,
            TOTAL_TALK_TIME_MINUTES  = src.TOTAL_TALK_TIME_MINUTES,
            CUSTOMER_TALK_RATIO_PCT  = src.CUSTOMER_TALK_RATIO_PCT,
            OVERALL_SENTIMENT        = src.OVERALL_SENTIMENT,
            SENTIMENT_TREND          = src.SENTIMENT_TREND,
            KEY_TOPICS_FLAGS         = src.KEY_TOPICS_FLAGS,
            ACTION_ITEMS_COUNT       = src.ACTION_ITEMS_COUNT,
            DEAL_RISK_SCORE          = src.DEAL_RISK_SCORE,
            LAST_CALL_DATE           = src.LAST_CALL_DATE,
            NEXT_SCHEDULED_CALL_DATE = src.NEXT_SCHEDULED_CALL_DATE,
            RM_NAME                  = src.RM_NAME,
            RM_LAST_LOGGED_NOTE_DATE = src.RM_LAST_LOGGED_NOTE_DATE,
            GENERATED_AT             = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ACCOUNT_ID, PROFILE_WEEK,
            CALL_COUNT_LAST_7D, TOTAL_TALK_TIME_MINUTES, CUSTOMER_TALK_RATIO_PCT,
            OVERALL_SENTIMENT, SENTIMENT_TREND,
            KEY_TOPICS_FLAGS, ACTION_ITEMS_COUNT, DEAL_RISK_SCORE,
            LAST_CALL_DATE, NEXT_SCHEDULED_CALL_DATE,
            RM_NAME, RM_LAST_LOGGED_NOTE_DATE,
            GENERATED_AT
        ) VALUES (
            src.ACCOUNT_ID, src.PROFILE_WEEK,
            src.CALL_COUNT_LAST_7D, src.TOTAL_TALK_TIME_MINUTES, src.CUSTOMER_TALK_RATIO_PCT,
            src.OVERALL_SENTIMENT, src.SENTIMENT_TREND,
            src.KEY_TOPICS_FLAGS, src.ACTION_ITEMS_COUNT, src.DEAL_RISK_SCORE,
            src.LAST_CALL_DATE, src.NEXT_SCHEDULED_CALL_DATE,
            src.RM_NAME, src.RM_LAST_LOGGED_NOTE_DATE,
            src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
