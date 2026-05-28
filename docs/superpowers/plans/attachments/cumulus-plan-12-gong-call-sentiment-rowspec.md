# Plan 12 — Gong Call Sentiment rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc (Gong / Chorus / ExecVision conversation-intelligence section) + the live `CLIENT_CATEGORY` distribution on Wealth Management + Commercial Banking anchors in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.
>
> **Plan 12 is the second weekly-cadence dataset in the Cumulus rollout.** Plan 6 (Plaid Held-Away) was first; Plan 9 (Synth Relationship Graph) is being drafted as the third. Cron `'USING CRON 0 5 * * 1 UTC'` (Monday 05:00 UTC). Row factory week-buckets the seed via `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight (anchor on the Monday of the run-week).
>
> **Plan 12 is also the first Cumulus dataset where NULL semantics cascade from a single zero-activity Boolean predicate** (`CALL_COUNT_LAST_7D == 0`) rather than gating on a multi-valued enum (Plan 8) or a per-row IS_ACTIVE flag (Plan 6). When an anchor had no calls in the past week, the row STILL emits — most fields collapse to zero / NULL / `Neutral` defaults. Coverage invariant holds; the boring case is just very boring.

## Mimics

**Gong + Chorus.ai + ExecVision** — revenue-intelligence platforms that record relationship-management calls, transcribe them, and publish derived metrics: per-call sentiment, talk ratios, action items, deal-risk scores, key-topic flags. Real Gong publishes 50+ fields per call and rolls them up across arbitrary windows; we mirror 11 weekly rollups that hit the demo's "is the relationship healthy?" + "are we at risk of losing this client?" + "did the RM follow up?" use cases.

## Audience

`CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')` — Wealth Management (3,920) + Commercial Banking (960) = **4,880 distinct anchors** (probed 2026-05-28).

The audience predicate intentionally uses `IN (...)` rather than `=` because §3 of the umbrella spec called out that `CLIENT_CATEGORY` carries 9 distinct values (not 4) on `V_ACCOUNT_ANCHORS` — including Wealth sub-bands. `IN (...)` is the safe shape: if upstream renames `'Wealth Management'` to `'Private Wealth Management'` later, the predicate still matches the explicit value list and either becomes empty (caught by coverage assertion) or picks up the rename when the SP is updated.

Why these two categories: Gong's revenue-intelligence product targets high-touch relationship segments where RM call activity matters — Wealth advisors covering HNW clients, and Commercial Bankers covering corporate-treasury accounts. Retail self-serves through digital channels (no RM calls); Small Business and Household are below the call-volume threshold where conversation analytics earn their keep.

## Table: `FINS.PUBLIC.GONG_CALL_SENTIMENT`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_WEEK` | DATE | NOT NULL | Monday-of-week for the run timestamp (`run_ts - timedelta(days=run_ts.weekday())` then truncated to midnight) |
| `CALL_COUNT_LAST_7D` | NUMBER(3,0) | NOT NULL | Number of recorded calls during the past 7 days. 0–15. Zero is common (most anchors have no calls in any given week). |
| `TOTAL_TALK_TIME_MINUTES` | NUMBER(5,0) | NOT NULL | Sum of call durations in minutes. 0–300+. Driven by CALL_COUNT_LAST_7D × per-call mean (Wealth ~22min, Commercial ~38min). |
| `CUSTOMER_TALK_RATIO_PCT` | NUMBER(5,2) | NOT NULL | % of total talk time the customer spoke (vs RM). 0.00–100.00. 0.00 when no calls; otherwise biased to 30–70% range. |
| `OVERALL_SENTIMENT` | VARCHAR(15) | NOT NULL | `Very Positive`, `Positive`, `Neutral`, `Negative`, `Very Negative`. ~5/30/45/15/5 distribution. `Neutral` when no calls (the boring case). |
| `SENTIMENT_TREND` | VARCHAR(12) | NOT NULL | `Improving`, `Stable`, `Declining`. Biased by combination of OVERALL_SENTIMENT and a year-stable per-anchor base trajectory. |
| `KEY_TOPICS_FLAGS` | VARCHAR(120) | NULL | Pipe-delimited 0–3 topics from a 4-topic pool: `Pricing|Renewal|Competitor|FeatureRequest`. NULL when CALL_COUNT_LAST_7D = 0 (cascade gate). |
| `ACTION_ITEMS_COUNT` | NUMBER(2,0) | NOT NULL | Detected action items across all calls in the week. 0–10. 0 when no calls. |
| `DEAL_RISK_SCORE` | NUMBER(5,2) | NOT NULL | 0.00–100.00. Higher = more at risk. Driven by negative sentiment + Competitor topic flag + RM staleness. 0.00 when no calls + no RM staleness. |
| `LAST_CALL_DATE` | DATE | NULL | Most-recent call date in the week. NULL when CALL_COUNT_LAST_7D = 0 (cascade gate). |
| `NEXT_SCHEDULED_CALL_DATE` | DATE | NULL | Next scheduled call. NULL ~40% of the time (independent gate — RMs don't always schedule the next touch immediately). |
| `RM_NAME` | VARCHAR(60) | NOT NULL | Synthesized relationship manager. Year-stable per anchor (RMs don't reassign weekly). |
| `RM_LAST_LOGGED_NOTE_DATE` | DATE | NULL | RM's last activity log entry. NULL when the RM hasn't logged a note in the past 90 days (~15% of rows). |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Week-bucketed for byte-identical mid-week re-runs. |

15 columns total: 12 NOT NULL + 3 NULLable (KEY_TOPICS_FLAGS, LAST_CALL_DATE, NEXT_SCHEDULED_CALL_DATE) + 1 mixed (RM_LAST_LOGGED_NOTE_DATE). Two of the NULLable columns cascade-gate on `CALL_COUNT_LAST_7D == 0`; one (NEXT_SCHEDULED_CALL_DATE) has its own independent ~40% NULL gate.

## Primary key

`(ACCOUNT_ID, PROFILE_WEEK)` — one row per anchor per week. Re-runs same week replace.

## Cohort split — Wealth vs Commercial bias differences

| Field | Wealth Management bias | Commercial Banking bias |
|---|---|---|
| `CALL_COUNT_LAST_7D` | mean ~0.6/wk; mode 0; max 4 | mean ~1.8/wk; mode 1; max 8 (more frequent RM cadence) |
| `TOTAL_TALK_TIME_MINUTES` per call | ~22 min (advisor 1:1) | ~38 min (multi-stakeholder corporate review) |
| `CUSTOMER_TALK_RATIO_PCT` | mean ~58% (HNW client drives agenda) | mean ~42% (banker walks through deck) |

Sentiment, topics, action items, risk score all flow through call activity, so cohort effects are indirect — Commercial averages higher action-item counts simply because more calls happen.

## CALL_COUNT_LAST_7D / TOTAL_TALK_TIME_MINUTES / CUSTOMER_TALK_RATIO_PCT

```python
def _call_count(client_cat, rng):
    """Most weeks have 0 calls. Commercial averages more than Wealth."""
    if client_cat == "Wealth Management":
        return rng.choices([0, 1, 2, 3, 4], weights=[65, 22, 10, 2, 1])[0]
    return rng.choices(
        [0, 1, 2, 3, 4, 5, 6, 8],
        weights=[35, 32, 18, 9, 4, 1.5, 0.4, 0.1],
    )[0]

def _total_talk_time(call_count, client_cat, rng):
    if call_count == 0:
        return 0
    per_call_mean = 38 if client_cat == "Commercial Banking" else 22
    minutes = sum(
        max(2, int(rng.gauss(per_call_mean, per_call_mean * 0.4)))
        for _ in range(call_count)
    )
    return min(minutes, 600)  # cap at 10h/wk

def _customer_talk_ratio(call_count, client_cat, rng):
    if call_count == 0:
        return 0.00
    mean = 58.0 if client_cat == "Wealth Management" else 42.0
    return round(max(10.0, min(90.0, rng.gauss(mean, 10.0))), 2)
```

Expected mean across cohort: 4,880 anchors × ~0.83 mean calls/wk ≈ ~4,050 call-events/wk. Most weeks the row reports 0 calls and collapses to the boring case.

## OVERALL_SENTIMENT

```python
_SENTIMENT_VOCAB = ["Very Positive", "Positive", "Neutral", "Negative", "Very Negative"]

def _overall_sentiment(call_count, rng):
    """Neutral when no calls. Otherwise ~5/30/45/15/5 across the 5-vocab."""
    if call_count == 0:
        return "Neutral"
    return rng.choices(_SENTIMENT_VOCAB, weights=[5, 30, 45, 15, 5])[0]
```

## SENTIMENT_TREND — uses year-stable base trajectory

A real RM's call sentiment usually doesn't whipsaw week-to-week — it has a per-account drift (improving / stable / declining) that persists across weeks. We synthesize a year-stable base trajectory per anchor, then add this-week sentiment as a small perturbation:

```python
_TREND_VOCAB = ["Improving", "Stable", "Declining"]

def _sentiment_trend_base(account_id, run_ts):
    """Year-stable trajectory per anchor — RMs don't whipsaw weekly."""
    seed = seed_for(
        account_id + "_trend", "gong_trend",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    return rng.choices(_TREND_VOCAB, weights=[25, 55, 20])[0]

def _sentiment_trend(base_trend, this_week_sentiment, rng):
    """Mostly the year-stable base; small ~10% chance of perturbation when
    this week's sentiment strongly disagrees."""
    if this_week_sentiment in ("Very Negative", "Negative") and base_trend == "Improving":
        if rng.random() < 0.20:
            return "Stable"
    if this_week_sentiment in ("Very Positive", "Positive") and base_trend == "Declining":
        if rng.random() < 0.20:
            return "Stable"
    return base_trend
```

Same pattern as Plan 5's year-stable mortgage rate and Plan 7's year-stable jurisdiction code.

## KEY_TOPICS_FLAGS / ACTION_ITEMS_COUNT / DEAL_RISK_SCORE

`KEY_TOPICS_FLAGS` cascade-gates on `call_count == 0`. The empty-string-vs-NULL distinction is meaningful: an anchor with calls but no flagged topic is `""` (we listened, nothing crossed threshold); an anchor with no calls is `NULL` (we never listened).

```python
_TOPIC_POOL = ["Pricing", "Renewal", "Competitor", "FeatureRequest"]

def _key_topics(call_count, rng):
    if call_count == 0:
        return None
    n = rng.choices([0, 1, 2, 3], weights=[15, 50, 25, 10])[0]
    if n == 0:
        return ""
    return "|".join(sorted(rng.sample(_TOPIC_POOL, n)))

def _action_items(call_count, sentiment, rng):
    if call_count == 0:
        return 0
    base_max = call_count * 2
    bias = 1.5 if sentiment in ("Very Negative", "Negative") else 1.0
    return min(10, int(rng.uniform(0, base_max) * bias))

def _deal_risk_score(call_count, sentiment, topics_str, rm_note_stale, rng):
    """Boring case (no calls, RM fresh): 5-20. Worst case stacks to 80-95."""
    base = rng.uniform(5.0, 25.0)
    if sentiment == "Very Negative":   base += rng.uniform(35.0, 55.0)
    elif sentiment == "Negative":      base += rng.uniform(15.0, 30.0)
    elif sentiment == "Very Positive": base -= rng.uniform(5.0, 15.0)
    if topics_str and "Competitor" in topics_str: base += rng.uniform(10.0, 20.0)
    if rm_note_stale: base += rng.uniform(5.0, 15.0)
    if call_count == 0 and not rm_note_stale:
        base = rng.uniform(5.0, 20.0)
    return round(max(0.0, min(100.0, base)), 2)
```

## LAST_CALL_DATE / NEXT_SCHEDULED_CALL_DATE

`LAST_CALL_DATE` cascade-gates on `call_count == 0`. `NEXT_SCHEDULED_CALL_DATE` has an independent ~40% NULL gate.

```python
def _last_call_date(call_count, run_ts, rng):
    if call_count == 0:
        return None
    return run_ts.date() - timedelta(days=rng.randint(0, 6))

def _next_scheduled_call_date(run_ts, rng):
    if rng.random() < 0.40:
        return None
    return run_ts.date() + timedelta(days=rng.randint(1, 60))
```

## RM_NAME — year-stable per anchor

The relationship manager assigned to an anchor doesn't change week-to-week. We use a year-stable seed (salt `"gong_rm"`, year-bucketed) and synthesize from a 60-name pool — RMs rotate at most annually:

```python
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

def _rm_name_stable(account_id, run_ts):
    """Year-stable RM name for this anchor — RMs don't reassign weekly.

    Salt: 'gong_rm', bucket: datetime(run_ts.year, 1, 1).
    Pattern adapted from Plan 7's year-stable jurisdiction.
    """
    seed = seed_for(
        account_id + "_rm", "gong_rm",
        datetime(run_ts.year, 1, 1),
    )
    rng = random.Random(seed)
    first = rng.choice(_RM_FIRST_NAMES)
    last = rng.choice(_RM_LAST_NAMES)
    return f"{first} {last}"
```

## RM_LAST_LOGGED_NOTE_DATE

```python
def _rm_last_logged_note_date(call_count, run_ts, rng):
    """Mostly past 30 days. NULL ~15% — RM is genuinely stale."""
    if rng.random() < 0.15:
        return None
    days_ago = rng.choices([1, 3, 7, 14, 30, 60], weights=[20, 25, 25, 15, 10, 5])[0]
    return run_ts.date() - timedelta(days=days_ago)
```

The `rm_note_stale` boolean fed into `_deal_risk_score` is `RM_LAST_LOGGED_NOTE_DATE is None or (run_ts.date() - RM_LAST_LOGGED_NOTE_DATE).days > 30`.

## Bias logic for `_row_for` (skeleton)

```python
import random
from datetime import datetime, timedelta

# Anchor extraction.
account_id = anchor["ACCOUNT_ID"]
client_cat = anchor.get("CLIENT_CATEGORY") or ""

# Week-bucketed seed — anchor on the Monday of the run-week.
week_start = run_ts - timedelta(days=run_ts.weekday())
week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
seed = seed_for(account_id, "gong", week_start)
rng = random.Random(seed)

# 1. Call activity drives most cascade-gated fields.
call_count = _call_count(client_cat, rng)
talk_time = _total_talk_time(call_count, client_cat, rng)
talk_ratio = _customer_talk_ratio(call_count, client_cat, rng)

# 2. Sentiment + trend (trend uses year-stable base).
sentiment = _overall_sentiment(call_count, rng)
trend_base = _sentiment_trend_base(account_id, run_ts)
trend = _sentiment_trend(trend_base, sentiment, rng)

# 3. Topics + action items (cascade-gated by call_count == 0).
topics = _key_topics(call_count, rng)
action_items = _action_items(call_count, sentiment, rng)

# 4. RM state (year-stable name; RM staleness independent of calls).
rm_name = _rm_name_stable(account_id, run_ts)
rm_note_date = _rm_last_logged_note_date(call_count, run_ts, rng)
rm_note_stale = rm_note_date is None or (run_ts.date() - rm_note_date).days > 30

# 5. Risk score uses everything above.
risk_score = _deal_risk_score(call_count, sentiment, topics, rm_note_stale, rng)

# 6. Cascade-gated dates.
last_call = _last_call_date(call_count, run_ts, rng)
next_call = _next_scheduled_call_date(run_ts, rng)

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
```

## `_anchor_in_audience`

```python
def _anchor_in_audience(anchor: dict) -> bool:
    return anchor.get("CLIENT_CATEGORY") in ("Wealth Management", "Commercial Banking")
```

## Boring case (must still emit)

A typical Wealth anchor with 1-2 calls/wk, Neutral sentiment, ~50% talk ratio is the "boring positive" case. The truly boring case — a Wealth anchor with **zero calls this week** — still emits a row, with:
- `CALL_COUNT_LAST_7D = 0`, `TOTAL_TALK_TIME_MINUTES = 0`, `CUSTOMER_TALK_RATIO_PCT = 0.00`
- `OVERALL_SENTIMENT = 'Neutral'`, `SENTIMENT_TREND = ` year-stable base (most likely `Stable`)
- `KEY_TOPICS_FLAGS = NULL`, `LAST_CALL_DATE = NULL` (cascade gate)
- `ACTION_ITEMS_COUNT = 0`, `DEAL_RISK_SCORE` 5-20 (no signal — unless RM is also stale)
- `NEXT_SCHEDULED_CALL_DATE`: ~60% populated, ~40% NULL (independent gate, unaffected by call_count)
- `RM_NAME`: year-stable, `RM_LAST_LOGGED_NOTE_DATE` ~85% populated

A "hot deal" Commercial anchor with 3 calls, Negative sentiment, `Competitor` topic flagged, RM stale produces `DEAL_RISK_SCORE` 70-95 (sentiment + competitor + RM staleness all stack).

**No anchor is dropped.** Every Wealth + Commercial anchor produces exactly one row per week.

## Anchor-influence test target (template L1 property #4)

Plan 12 has the same 5-property structure but property #4 has FIVE assertions because the cascade-gated NULL semantics are the load-bearing demo behavior:

1. **Per-anchor invariants for no-call weeks (the cascade gate):** for every row where `CALL_COUNT_LAST_7D == 0`:
   - `TOTAL_TALK_TIME_MINUTES == 0`
   - `CUSTOMER_TALK_RATIO_PCT == 0.00`
   - `OVERALL_SENTIMENT == 'Neutral'`
   - `LAST_CALL_DATE IS NULL`
   - `KEY_TOPICS_FLAGS IS NULL`
   - `ACTION_ITEMS_COUNT == 0`

2. **Range invariants** (per-row): `CUSTOMER_TALK_RATIO_PCT` in [0.00, 100.00]; `DEAL_RISK_SCORE` in [0.00, 100.00]; `CALL_COUNT_LAST_7D` in [0, 15]; `ACTION_ITEMS_COUNT` in [0, 10]; `TOTAL_TALK_TIME_MINUTES` in [0, 600]; `LAST_CALL_DATE` (when populated) ≤ `run_ts.date()`; `NEXT_SCHEDULED_CALL_DATE` (when populated) > `run_ts.date()`.

3. **Vocabulary invariants** (per-row): `OVERALL_SENTIMENT` in `_SENTIMENT_VOCAB`; `SENTIMENT_TREND` in `_TREND_VOCAB`; `KEY_TOPICS_FLAGS` (when not NULL/empty) is a pipe-delimited subset of `_TOPIC_POOL`.

4. **Year-stable RM_NAME:** for the same anchor, `_row_for(anchor, week_1_in_2026)["RM_NAME"] == _row_for(anchor, week_15_in_2026)["RM_NAME"]`. Intra-year stability is hard-required. Cross-year drift (week 53 of 2026 vs week 1 of 2027) is *expected* and not asserted — RMs may rotate annually.

5. **Schema contract**: output dict keys exactly match the 15 columns above.

Plus the standard determinism + boring-case + audience-scoping tests.

The L1 conftest reuses Plan 6's pattern: `SAMPLE_ANCHORS` from Cumulus_Common, `in_audience_anchors = [a for a in all_anchors if a["CLIENT_CATEGORY"] in ("Wealth Management", "Commercial Banking")]`. With ~6-9 anchors expected in this audience out of SAMPLE_ANCHORS' 100, the cohort tests roll over multiple weeks (8+) to get enough call-count realizations to encounter both zero and non-zero weeks.

## Cadence

**Weekly.** CRON: `'USING CRON 0 5 * * 1 UTC'` — Monday 05:00 UTC. Matches Plan 6 (Plaid Held-Away) and Plan 9 (Synth Relationship Graph). Plan 12 is the second weekly-cadence dataset to ship; weekly cadence is rare in the rollout (3 of 13 plans total — the rest are daily / monthly / quarterly).

Idempotent re-runs the same week replace.

## Volume

**~4,880 rows/week → ~21,000/month** average. Mid-volume — bigger than Plan 8 but smaller than most other Plans. SP runtime <3s.

## Out of scope

- Real Gong / Chorus / ExecVision license, OAuth, or API access.
- Transcript text — only derived rollup fields.
- Speaker diarization beyond CUSTOMER_TALK_RATIO_PCT.
- Topic extraction beyond the simulated 4-topic pool.
- Per-call rows — weekly rollups only.
- Multi-RM accounts — every anchor has exactly one RM.
- Real deal-risk simulation — DEAL_RISK_SCORE is biased by inputs.
- Email / chat / messaging — voice-call rollups only.
