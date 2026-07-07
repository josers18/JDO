"""Gong / Chorus.ai / ExecVision-style synthetic weekly conversation-intelligence
rollups generator — REBROADCAST shape.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT. **Second weekly-cadence Cumulus
dataset** (after Plan 6 Plaid Held-Away). Account-scoped 1:1 — emits exactly
one row per distinct anchor per week.

REBROADCAST changes (Plan 12 T4):
  - **All-accounts audience.** The legacy Wealth+Commercial predicate has
    been dropped; audience is every distinct anchor in V_ACCOUNT_ANCHORS
    (~36,813 anchors).
  - **Per-CLIENT_CATEGORY call-rate tiering.** _call_count_last_7d now reads
    a tier table keyed on CLIENT_CATEGORY. Commercial Banking caps at 5 calls
    per week with 20 percent zero-rate; Wealth Management caps at 3 calls
    with 40 percent zero-rate; Small Business caps at 2 with 75 percent
    zero-rate; Retail and Household cap at 1 with 90 percent zero-rate; any
    unknown category (and NULL CLIENT_CATEGORY) falls back to max_calls=0
    with 95 percent zero-rate. When max_calls == 0 the function ALWAYS
    returns 0 -> dominant cascade-NULL fires for every Retail / Household /
    unknown-category row, but the row still emits (coverage invariant
    holds: 1 row per anchor per week).
  - **Backfill companion.** sp_backfill_gong_call_sentiment.py iterates this
    same row factory across the prior 24 weeks for one-shot history hydration
    (~884K rows total).

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
  When CALL_COUNT_LAST_7D == 0, six fields collapse to no-call defaults
  (TOTAL_TALK_TIME_MINUTES = 0, CUSTOMER_TALK_RATIO_PCT = 0.00,
  OVERALL_SENTIMENT = 'Neutral', KEY_TOPICS_FLAGS IS NULL,
  LAST_CALL_DATE IS NULL, ACTION_ITEMS_COUNT = 0) but the row still emits.
  After rebroadcast the dominant-cascade case is Retail and Household
  anchors, which always have call_count == 0. Coverage invariant still
  holds — the boring case is a meaningful row, not a row that's filtered out.

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

TABLE                = "DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT"
TASK_NAME            = "TASK_WEEKLY_GONG_CALL_SENTIMENT"
DATASET_SALT         = "gong"      # week-bucketed; primary rng stream
DATASET_SALT_RM      = "gong_rm"   # year-stable; RM_NAME stickiness
DATASET_SALT_TREND   = "gong_trend"  # year-stable helper for trend base trajectory

# Audience predicate — empty after rebroadcast. Repeated for symmetry with
# Plans 1-9; both AUDIENCE_SQL and COVERAGE_SQL must match.
_AUDIENCE_PREDICATE = ""  # all-accounts
AUDIENCE_SQL = "SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS"

# 16-column output contract (kept in sync with the table DDL by the L1 schema test).
# v1.x multi-org-additive: ORG_ID is the first key in every emitted row.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_WEEK",
    "CALL_COUNT_LAST_7D", "TOTAL_TALK_TIME_MINUTES", "CUSTOMER_TALK_RATIO_PCT",
    "OVERALL_SENTIMENT", "SENTIMENT_TREND",
    "KEY_TOPICS_FLAGS", "ACTION_ITEMS_COUNT", "DEAL_RISK_SCORE",
    "LAST_CALL_DATE", "NEXT_SCHEDULED_CALL_DATE",
    "RM_NAME", "RM_LAST_LOGGED_NOTE_DATE",
    "GENERATED_AT",
})


# -------------------------------------------------------------------
# Per-CLIENT_CATEGORY call-rate tiering — NEW for rebroadcast.
#
# max_calls: upper bound (inclusive) for randint draws when not zero-gated.
# zero_call_rate: probability of returning 0 calls outright.
# When max_calls == 0 the function ALWAYS returns 0 (dominant cascade-NULL
# for that tier).
# -------------------------------------------------------------------

_CALL_RATE_BY_CATEGORY: dict[str, dict[str, Any]] = {
    "Commercial Banking":  {"max_calls": 5, "zero_call_rate": 0.20},
    "Wealth Management":   {"max_calls": 3, "zero_call_rate": 0.40},
    "Small Business":      {"max_calls": 2, "zero_call_rate": 0.75},
    "Retail":              {"max_calls": 1, "zero_call_rate": 0.90},
    "Household":           {"max_calls": 1, "zero_call_rate": 0.90},
}
_DEFAULT_CALL_RATE: dict[str, Any] = {"max_calls": 0, "zero_call_rate": 0.95}


def _call_rate_for(anchor: dict) -> dict:
    """Look up the anchor's CLIENT_CATEGORY tier; return the dict or default.

    NULL or unknown category falls through to _DEFAULT_CALL_RATE
    (max_calls=0) so cascade-NULL fires for every row in that tier.
    """
    return _CALL_RATE_BY_CATEGORY.get(
        anchor.get("CLIENT_CATEGORY") or "",
        _DEFAULT_CALL_RATE,
    )


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
# Week-bucket helpers — Monday-of-week date / datetime.
# -------------------------------------------------------------------

def _week_start(run_ts: datetime) -> datetime:
    """Bucket run_ts to the Monday-of-week at 00:00:00 (UTC). Mid-week re-runs
    re-bucket to the same instant so the seed (and therefore the row) is
    byte-identical."""
    monday = run_ts - timedelta(days=run_ts.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _profile_week_from(run_ts: datetime) -> date:
    """Return the Monday-of-week DATE for the given run timestamp."""
    return _week_start(run_ts).date()


def _to_datetime(profile_week: date) -> datetime:
    """Promote a Monday-of-week date to a UTC midnight datetime — used for
    seed_for and GENERATED_AT, which both expect a datetime."""
    return datetime(profile_week.year, profile_week.month, profile_week.day)


# -------------------------------------------------------------------
# _anchor_in_audience — all-accounts audience after rebroadcast.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """All-accounts audience: True iff ACCOUNT_ID is non-empty.

    Defense-in-depth alongside the SQL predicate. The audience view is
    DISTINCT but the L1 input-shape test wants this check to be
    load-bearing.
    """
    return bool(anchor.get("ACCOUNT_ID"))


# -------------------------------------------------------------------
# Bias-logic helpers — translate the rowspec faithfully.
#
# All non-call-rate helpers (talk time, sentiment, topics, action items,
# deal risk, dates, RM name) are unchanged from the pre-rebroadcast SP.
# -------------------------------------------------------------------

def _call_count_last_7d(anchor: dict, rng: random.Random) -> int:
    """Per-CLIENT_CATEGORY tiered call-rate.

    Rebroadcast: tier dict comes from _call_rate_for(anchor). When
    max_calls == 0 (Retail / Household / unknown category) the function
    ALWAYS returns 0 -> dominant cascade-NULL fires for every row in
    that tier.
    """
    rate = _call_rate_for(anchor)
    if rng.random() < rate["zero_call_rate"]:
        return 0
    if rate["max_calls"] == 0:
        return 0
    return rng.randint(1, rate["max_calls"])


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


def _sentiment_trend_base(account_id: str, profile_week: date) -> str:
    """Year-stable trajectory per anchor — RMs do not whipsaw weekly.

    Salt: 'gong_trend'. Year-bucketed via datetime(profile_week.year, 1, 1).
    Same pattern as Plan 5's year-stable mortgage rate and Plan 7's
    year-stable jurisdiction code.
    """
    seed = seed_for(
        account_id + "_trend",
        DATASET_SALT_TREND,
        datetime(profile_week.year, 1, 1),
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


def _last_call_date(call_count: int, profile_week: date,
                     rng: random.Random) -> date | None:
    """Most-recent call date in the prior 7 days. None when no calls (cascade
    gate). Returns a date strictly BEFORE profile_week (the Monday of the
    run-week) so the rowspec invariant holds for any run during the week.
    Subtracting from profile_week (not run_ts) keeps the value
    week-bucket-stable across mid-week re-runs (Plan 8 lesson)."""
    if call_count == 0:
        return None
    return profile_week - timedelta(days=rng.randint(1, 7))


def _next_scheduled_call_date(profile_week: date,
                               rng: random.Random) -> date | None:
    """Next scheduled RM touch. Independent ~40% NULL gate (RMs don't always
    schedule the next touch). When populated, > profile_week + 1 day so the
    rowspec's `> run_ts.date()` invariant holds for any run during the week.

    Anchored on profile_week rather than run_ts so the value is
    week-bucket-stable (Plan 8 lesson).
    """
    if rng.random() < 0.40:
        return None
    # profile_week + 2..62 days. Adding at least 2 days from the Monday
    # of the run-week guarantees the value is strictly after any plausible
    # run_ts within that calendar week (Mon-Sun).
    return profile_week + timedelta(days=rng.randint(2, 62))


def _rm_name(account_id: str, profile_week: date) -> str:
    """Year-stable RM name for this anchor — RMs don't reassign weekly.

    Salt: 'gong_rm'. Year-bucketed via datetime(profile_week.year, 1, 1).
    Pattern adapted from Plan 7's year-stable jurisdiction. 20 first names
    x 20 last names = 400-name pool (rowspec calls for a 60-name pool;
    we use a wider grid for diversity, which still satisfies the year-
    stable invariant).
    """
    seed = seed_for(
        account_id + "_rm",
        DATASET_SALT_RM,
        datetime(profile_week.year, 1, 1),
    )
    rng = random.Random(seed)
    first = rng.choice(_RM_FIRST_NAMES)
    last = rng.choice(_RM_LAST_NAMES)
    return f"{first} {last}"


def _rm_last_logged_note_date(call_count: int, profile_week: date,
                               rng: random.Random) -> date | None:
    """RM's last activity log entry. ~15% NULL (RM is genuinely stale).
    Otherwise drawn from [1, 3, 7, 14, 30, 60] days back from profile_week.

    Auxiliary mixed gate — independent of call_count. The `call_count`
    parameter is accepted for symmetry with the rowspec helper signature
    but the rate is uniform across activity weeks. Anchored on
    profile_week (Plan 8 lesson)."""
    if rng.random() < 0.15:
        return None
    days_ago = rng.choices([1, 3, 7, 14, 30, 60], weights=[20, 25, 25, 15, 10, 5])[0]
    return profile_week - timedelta(days=days_ago)


# -------------------------------------------------------------------
# _rows_for — substantive synthesis logic (per rowspec).
#
# Rebroadcast contract: returns a list of length 1. Same anchor + same
# profile_week always yields a byte-identical row.
# -------------------------------------------------------------------

def _rows_for(anchor: dict, profile_week: date) -> list[dict]:
    """Pure function: anchor row -> list-of-1 fact row. Deterministic on
    (account_id, profile_week). Profile_week is the Monday-of-week DATE.

    Status-first computation — call_count drives the cascade:
      Stage 1: call_count (drives cascade gate; tier from _call_rate_for).
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
            f"anchor failed all-accounts audience predicate "
            f"(ACCOUNT_ID empty/missing): {anchor!r}"
        )

    account_id = anchor["ACCOUNT_ID"]
    client_category = anchor.get("CLIENT_CATEGORY") or ""

    # Week-bucketed seed. Encode profile_week into the account_id slot of
    # seed_for so different weeks get distinct seeds (seed_for itself only
    # uses %Y-%m on its run_ts arg, which collides within a calendar month).
    week_dt = _to_datetime(profile_week)
    seed_key = f"{account_id}|{profile_week.isoformat()}"
    seed = seed_for(seed_key, DATASET_SALT, week_dt)
    rng = random.Random(seed)

    # Stage 1: call activity drives most cascade-gated fields.
    call_count = _call_count_last_7d(anchor, rng)

    # Stage 2: count-dependent fields (cascade-gated by call_count == 0).
    talk_time = _total_talk_time_minutes(call_count, client_category, rng)
    talk_ratio = _customer_talk_ratio_pct(call_count, client_category, rng)
    sentiment = _overall_sentiment(call_count, rng)
    trend_base = _sentiment_trend_base(account_id, profile_week)
    trend = _sentiment_trend(trend_base, sentiment, rng)
    topics = _key_topics_flags(call_count, rng)
    action_items = _action_items_count(call_count, sentiment, rng)

    # Stage 3: RM auxiliary state (independent of cascade) + derived risk.
    rm_note_date = _rm_last_logged_note_date(call_count, profile_week, rng)
    rm_note_stale = (
        rm_note_date is None
        or (profile_week - rm_note_date).days > 30
    )
    risk_score = _deal_risk_score(
        call_count, sentiment, topics, rm_note_stale, rng
    )

    # Cascade-gated dates + independent-gated next-scheduled date.
    last_call = _last_call_date(call_count, profile_week, rng)
    next_call = _next_scheduled_call_date(profile_week, rng)

    # Stage 4: year-stable RM name (separate salt; not from rng above).
    rm_name = _rm_name(account_id, profile_week)

    # v1.x multi-org-additive: stamp ORG_ID first key from the anchor row.
    # V_ACCOUNT_ANCHORS exposes ORG_ID as the first column post-Phase-A.
    # Fixture anchors that omit ORG_ID fall back to 'JDO' so legacy L1 tests
    # keep passing without rewriting the 100-anchor sample.
    return [{
        "ORG_ID":                    anchor.get("ORG_ID") or "JDO",
        "ACCOUNT_ID":                account_id,
        "PROFILE_WEEK":              profile_week,
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
        "GENERATED_AT":              week_dt,
    }]


# -------------------------------------------------------------------
# Entry point — invoked by DATA_JEDAIS.FINS__PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_GONG_CALL_SENTIMENT
# -------------------------------------------------------------------

def main(session: Any, num_weeks: int = 1) -> str:
    """5-step pattern with optional history backfill.

    `num_weeks=1` (default): cron-driven, current Monday only.
    `num_weeks=24`: one-shot historical backfill.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        # Build N week-starts walking backward from current Monday.
        current_profile_week = _profile_week_from(started)
        profile_weeks = []
        for i in range(max(1, num_weeks)):
            profile_weeks.append(current_profile_week - timedelta(weeks=i))

        records, errors = [], []
        for row in audience:
            anchor = _anchor_to_dict(row)
            for pw in profile_weeks:
                try:
                    records.extend(_rows_for(anchor, pw))
                except Exception as exc:
                    errors.append((row.ACCOUNT_ID, str(exc)[:200]))
        max_tolerated = max(10, (len(audience) * len(profile_weeks)) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience) * len(profile_weeks)} pairs "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience) * len(profile_weeks)} pairs; "
                f"first: {errors[0]}"
            )

        # Batched MERGE for backfill safety (884K rows / 100K = ~9 batches).
        BATCH_SIZE = 100_000
        rows_inserted = 0
        for batch_start in range(0, len(records), BATCH_SIZE):
            batch = records[batch_start:batch_start + BATCH_SIZE]
            rows_inserted += _merge(session, batch)

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
    """Snowpark Row -> plain dict so _rows_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK (ORG_ID, ACCOUNT_ID, PROFILE_WEEK).
#
# v1.x multi-org-additive: ORG_ID is the first PK component (per ROLLOUT.md
# Phase A6); UPDATE SET deliberately skips ORG_ID — the PK component is
# fixed per row and never gets re-stamped to a different tenant.
#
# Exposed at module scope so the backfill SP can reuse it for batch MERGEs.
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict],
           staging_suffix: str = "") -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas -> staging table -> MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state. `staging_suffix` lets the backfill SP isolate
    per-batch staging tables when desired (default: shared staging name).

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
    if staging_suffix:
        staging = f"{staging}_{staging_suffix}"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT tgt
        USING (
            SELECT
                ORG_ID,
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
            FROM DATA_JEDAIS.FINS__PUBLIC.{staging}
        ) src
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
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
            ORG_ID, ACCOUNT_ID, PROFILE_WEEK,
            CALL_COUNT_LAST_7D, TOTAL_TALK_TIME_MINUTES, CUSTOMER_TALK_RATIO_PCT,
            OVERALL_SENTIMENT, SENTIMENT_TREND,
            KEY_TOPICS_FLAGS, ACTION_ITEMS_COUNT, DEAL_RISK_SCORE,
            LAST_CALL_DATE, NEXT_SCHEDULED_CALL_DATE,
            RM_NAME, RM_LAST_LOGGED_NOTE_DATE,
            GENERATED_AT
        ) VALUES (
            src.ORG_ID, src.ACCOUNT_ID, src.PROFILE_WEEK,
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
