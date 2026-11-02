"""Demandbase / G2 / Bombora-style synthetic weekly buying-intent generator.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS (Plan 14).
Third 1:N Cumulus dataset (after Plan 6 Plaid and Plan 9 Graph) and the
first with a VARIABLE fan-out per period: each non-household business anchor
emits 1-4 topic rows per week.

  - The year-stable top-affinity topic ALWAYS emits (even at score 5), so
    distinct accounts per week == audience size. `_rows_for` never returns [].
  - 0-3 extra topics emit when their score clears _REPORT_THRESHOLD (40).
  - Because the topic set changes week to week, the SP rewrites each week
    wholesale (DELETE that week + INSERT, one transaction). Snowflake MERGE
    has no NOT MATCHED BY SOURCE.

Trajectory fields (WEEKS_SURGING, SCORE_DELTA_WOW) are recomputed from the
pure `_score_for(anchor, topic, week_start)` for weeks W-1 .. W-12. The SP
never SELECTs from DEMANDBASE_INTENT_SIGNALS, so backfill and live runs are
order-independent and byte-identical.

Cadence:  WEEKLY (Monday 05:30 UTC, cron `30 5 * * 1 UTC`, 30 min after Gong)
Salts:
  - "demandbase"      week-bucketed: score noise, surge bump, researchers,
                      keywords, source, last-signal day, competitor gate.
  - "demandbase_year" year-bucketed: per-(account, topic) base affinity,
                      surge-episode boundaries, competitor identity.
  Both keyed on account_id + "_" + topic. NOTE: cumulus_common.seed_for only
  uses %Y-%m of its run_ts argument, so every weekly seed also carries the
  ISO week date inside the key string (Plan 12 pattern), and episode seeds
  carry the block index.

Gong soft-dep (Plan 12): `gong_flags` is the same-week KEY_TOPICS_FLAGS
string (pipe-delimited) or None. A `Competitor` flag raises the chance that
RESEARCHING_COMPETITOR is non-NULL from 20% to 70% on score >= 50 rows, and
on the IS_TOP_TOPIC row it also lifts the score >= 50 gate (70% at any
score) -- see `_researching_competitor`.

The SP entry point (main / per-week DELETE+INSERT / coverage / log) lands in
Plan 14 Task 4; this module currently holds the pure row factory that the L1
tests exercise.

Plan:    docs/superpowers/plans/2026-11-02-cumulus-plan-14-demandbase-intent-signals.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-14-demandbase-intent-signals-rowspec.md
"""
from __future__ import annotations

import random
from datetime import date, datetime, timedelta

# Locally, cumulus_common resolves via the pytest pythonpath; in Snowflake,
# scripts/deploy_sp.py inlines seed_for / assert_coverage / record_id_for.
from cumulus_common import seed_for


# -------------------------------------------------------------------
# Constants — MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE             = "DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS"
STAGING_TABLE     = "DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_STAGING"
TASK_NAME         = "TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS"
DATASET_SALT      = "demandbase"       # week-bucketed
DATASET_SALT_YEAR = "demandbase_year"  # year-stable affinity / competitor

# Household exclusion MUST use COALESCE: `NULL <> 'Household'` is NULL in SQL
# and would silently drop the ~711 NULL-category business anchors. Do not
# "simplify" to `CLIENT_CATEGORY <> 'Household'`. Probed 2026-11-02: 6,435.
_AUDIENCE_PREDICATE = (
    "ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'"
)
AUDIENCE_SQL = (
    "SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS "
    f"WHERE {_AUDIENCE_PREDICATE}"
)
COVERAGE_SQL = (
    "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS "
    f"WHERE {_AUDIENCE_PREDICATE}"
)

# 17 data columns emitted by the row factory. ORG_ID and RECORD_ID are
# stamped by the SP (RECORD_ID = record_id_for(ORG_ID, ACCOUNT_ID,
# PROFILE_WEEK, INTENT_TOPIC)).
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ACCOUNT_ID", "PROFILE_WEEK", "INTENT_TOPIC", "TOPIC_CATEGORY",
    "IS_TOP_TOPIC", "INTENT_SCORE", "SURGE_FLAG", "WEEKS_SURGING",
    "SCORE_DELTA_WOW", "JOURNEY_STAGE", "UNIQUE_RESEARCHERS",
    "RESEARCHING_COMPETITOR", "KEYWORD_SAMPLE", "SIGNAL_SOURCE",
    "LAST_SIGNAL_DATE", "INTENT_NOTE", "GENERATED_AT",
})

_REPORT_THRESHOLD = 40
_SURGE_THRESHOLD = 70
_MAX_WEEKS_SURGING = 12
_MAX_EXTRA_TOPICS = 3
_EPISODE_BLOCK_WEEKS = 12
# Episode tuning. The rowspec's illustrative values (hazard min(0.6, 0.08*aff),
# bump U(28, 45), blocks aligned for every account) yielded ~1.3 rows per
# anchor-week, ~6% surging rows and ~7% of accounts surging on a 337-anchor
# live sample (5% hash sample of the 6,435 audience, 2026-11-02) -- below
# every L3 band -- and a book-wide 12-week sawtooth because every account's
# block started on the same Monday. With a per-(account, topic) block phase
# and the values below, the same sample over 10 weeks gave 1.62 rows per
# anchor-week (~10.4K rows/week), 13.3% surging rows and 18-24% of accounts
# surging each week (L3 bands: 9K-15K rows, 8-15%, 15-25%).
_EPISODE_HAZARD_PER_AFF = 0.15
_EPISODE_HAZARD_CAP = 0.70
_SURGE_BUMP = (35.0, 50.0)
# Fixed Monday epoch for episode-block alignment (weeks since 1970-01-05).
_EPOCH_MONDAY = datetime(1970, 1, 5)

# topic -> (TOPIC_CATEGORY, keyword bank). No ampersand character anywhere in
# this module: the body is inlined into a snow sql file, which treats it as a
# template directive. Hence "International Payments and FX".
_TOPICS: dict[str, tuple[str, list[str]]] = {
    "Treasury Management":            ("Cash Management", ["treasury management platform", "cash positioning", "sweep account", "liquidity forecasting"]),
    "Commercial Lending":             ("Lending",         ["commercial term loan", "working capital line", "revolving credit facility", "business acquisition financing"]),
    "Equipment Finance":              ("Lending",         ["equipment lease", "equipment loan rates", "fleet financing", "section 179"]),
    "Merchant Services":              ("Payments",        ["POS system", "card processing fees", "merchant account", "tap to pay"]),
    "International Payments and FX":  ("Payments",        ["international wire", "FX hedging", "multi-currency account", "cross-border payments"]),
    "Payroll Services":               ("Cash Management", ["payroll provider", "payroll software small business", "PEO comparison"]),
    "Commercial Real Estate Lending": ("Lending",         ["CRE loan", "commercial mortgage rates", "construction-to-perm loan", "DSCR loan"]),
    "SBA Lending":                    ("Lending",         ["SBA 7a loan", "SBA 504", "SBA lender", "small business loan requirements"]),
    "AP Automation":                  ("Payments",        ["accounts payable automation", "virtual card payments", "invoice processing", "ACH vendor payments"]),
    "Business Credit Cards":          ("Cards",           ["business credit card", "corporate card", "expense management card", "cash back business card"]),
}

_COMPETITORS = ["JPMorgan Chase", "Bank of America", "Wells Fargo", "U.S. Bank", "PNC",
                "Truist", "Live Oak Bank", "Brex", "Ramp", "Square"]
_FINTECH_TOPICS = ("Business Credit Cards", "Merchant Services", "AP Automation")

_SIGNAL_SOURCES = (("Demandbase", 0.55), ("Bombora", 0.30), ("G2", 0.15))

# Human-readable research activity per topic, used in INTENT_NOTE.
_TOPIC_ACTIVITY = {
    "Treasury Management":            "comparing treasury platforms",
    "Commercial Lending":             "comparing commercial credit lines",
    "Equipment Finance":              "pricing equipment financing",
    "Merchant Services":              "comparing card processing providers",
    "International Payments and FX":  "researching cross-border payments",
    "Payroll Services":               "comparing payroll providers",
    "Commercial Real Estate Lending": "researching commercial mortgage rates",
    "SBA Lending":                    "researching SBA loan programs",
    "AP Automation":                  "evaluating AP automation tools",
    "Business Credit Cards":          "comparing business card programs",
}

# topic -> multiplier on base affinity; unlisted topics = 1.0
# Restaurant SBA Lending is 1.2, not the rowspec's 1.5: with the <$1M revenue
# tilt (SBA x1.8) a 1.5 gave SBA 2.7 vs Merchant 3.0 and only ~69% of
# main-street restaurants landed a top topic in the {Merchant, Payroll,
# Equipment, Cards} set, failing the plan's >=80% (L1) / >=75% (L3) band.
# 1.2 gives ~89% on 4,000 simulated $0.72M restaurant anchor-years.
_INDUSTRY_AFFINITY: dict[str, dict[str, float]] = {
    "Restaurant":             {"Merchant Services": 3.0, "Payroll Services": 2.0, "Equipment Finance": 1.8, "Business Credit Cards": 1.6, "SBA Lending": 1.2},
    "Retail Trade":           {"Merchant Services": 3.0, "Business Credit Cards": 1.8, "SBA Lending": 1.5, "Payroll Services": 1.4},
    "Construction":           {"Equipment Finance": 3.0, "Commercial Lending": 1.8, "Payroll Services": 1.5, "SBA Lending": 1.4},
    "Professional Services":  {"Business Credit Cards": 2.0, "Payroll Services": 1.8, "AP Automation": 1.4},
    "Healthcare":             {"Equipment Finance": 2.2, "AP Automation": 1.8, "SBA Lending": 1.5, "Payroll Services": 1.4},
    "Wholesale":              {"International Payments and FX": 2.2, "AP Automation": 2.0, "Commercial Lending": 1.5},
    "Real Estate":            {"Commercial Real Estate Lending": 3.5, "Treasury Management": 1.2},
    "Real Estate Holdings":   {"Commercial Real Estate Lending": 3.5, "Treasury Management": 1.6},
    "Manufacturing":          {"Equipment Finance": 2.5, "International Payments and FX": 2.0, "Commercial Lending": 1.8, "Treasury Management": 1.5},
    "Logistics":              {"Equipment Finance": 2.5, "International Payments and FX": 2.0, "AP Automation": 1.8},
    "Wholesale Distribution": {"International Payments and FX": 2.5, "AP Automation": 2.0, "Treasury Management": 1.6},
    "Healthcare Systems":     {"Treasury Management": 2.0, "AP Automation": 2.0, "Equipment Finance": 1.8},
    "Technology":             {"Treasury Management": 2.2, "Business Credit Cards": 2.0, "International Payments and FX": 1.6},
    "Hospitality":            {"Merchant Services": 2.5, "Commercial Real Estate Lending": 1.8, "Payroll Services": 1.6},
}


# -------------------------------------------------------------------
# Week helpers
# -------------------------------------------------------------------

def _week_start(run_ts: datetime) -> datetime:
    """Monday 00:00:00 of run_ts's week (Plan 12 pattern)."""
    monday = run_ts - timedelta(days=run_ts.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _week_seed(key: str, salt: str, week: datetime) -> bytes:
    """Week-bucketed seed. seed_for only buckets on %Y-%m, so the ISO date
    goes into the key to keep weeks within one month distinct."""
    return seed_for(f"{key}|{week.date().isoformat()}", salt, week)


def _year_seed(key: str, year: int) -> bytes:
    return seed_for(key, DATASET_SALT_YEAR, datetime(year, 1, 1))


# -------------------------------------------------------------------
# Audience
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Python mirror of _AUDIENCE_PREDICATE (defense in depth)."""
    return (
        bool(anchor.get("ACCOUNT_ID"))
        and anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"
        and (anchor.get("CLIENT_CATEGORY") or "") != "Household"
    )


# -------------------------------------------------------------------
# Affinity + score trajectory (pure functions of anchor, topic, week)
# -------------------------------------------------------------------

def _num(value) -> float:
    """Coerce an anchor numeric (int / Decimal from Snowpark NUMBER, str from
    JSON exports, None) to float; None -> 0.0."""
    return float(value) if value is not None and value != "" else 0.0


def _revenue_tilt(topic: str, annual_revenue) -> float:
    """Main street (<$1M) skews SBA/cards; mid-market (>=$10M) skews
    treasury/FX/commercial lending. NULL revenue is treated as main street."""
    rev = _num(annual_revenue)
    if rev >= 10_000_000:
        return {"Treasury Management": 2.0, "International Payments and FX": 1.6,
                "Commercial Lending": 1.6, "SBA Lending": 0.3,
                "Business Credit Cards": 0.7}.get(topic, 1.0)
    if rev < 1_000_000:
        return {"SBA Lending": 1.8, "Business Credit Cards": 1.4,
                "Treasury Management": 0.3,
                "International Payments and FX": 0.4}.get(topic, 1.0)
    return 1.0


def _base_affinity(anchor: dict, topic: str, year: int) -> float:
    """Year-stable per-(account, topic) affinity, ~0.1 .. ~7."""
    rng = random.Random(_year_seed(anchor["ACCOUNT_ID"] + "_" + topic, year))
    ind = _INDUSTRY_AFFINITY.get(anchor.get("INDUSTRY") or "", {})
    return (rng.uniform(0.6, 1.4) * ind.get(topic, 1.0)
            * _revenue_tilt(topic, anchor.get("ANNUAL_REVENUE")))


def _in_surge_episode(anchor: dict, topic: str, week: datetime, aff: float) -> bool:
    """Episode scheme: weeks are grouped into 12-week blocks counted from a
    Monday epoch, shifted by a fixed per-(account, topic) phase so blocks
    don't line up across the book. Each block may hold one episode of 2-8
    consecutive weeks, with probability rising with affinity. The draws depend
    only on (account, topic, block index), so the result is recomputable from
    the week alone. Episodes running past the block end truncate."""
    key = f"{anchor['ACCOUNT_ID']}_{topic}"
    phase = random.Random(seed_for(key + "_phase", DATASET_SALT_YEAR, _EPOCH_MONDAY)
                          ).randrange(_EPISODE_BLOCK_WEEKS)
    n = (week - _EPOCH_MONDAY).days // 7 + phase
    block_idx, offset = divmod(n, _EPISODE_BLOCK_WEEKS)
    # seed_for buckets its datetime on %Y-%m only, so the block index lives
    # in the key and the datetime is the fixed epoch.
    brng = random.Random(seed_for(f"{key}_episode|{block_idx}",
                                  DATASET_SALT_YEAR, _EPOCH_MONDAY))
    has_episode = brng.random() < min(_EPISODE_HAZARD_CAP, _EPISODE_HAZARD_PER_AFF * aff)
    start = brng.randint(0, 9)
    length = brng.randint(2, 8)
    return has_episode and start <= offset < start + length


def _score_for(anchor: dict, topic: str, week_start: datetime) -> int:
    """INTENT_SCORE in [0, 100] — pure function of (anchor, topic, week).
    Must never depend on any other week's output: WEEKS_SURGING and
    SCORE_DELTA_WOW call it for prior weeks."""
    week = _week_start(week_start)
    aff = _base_affinity(anchor, topic, week.year)
    base = min(55.0, 12.0 * aff)
    surging = _in_surge_episode(anchor, topic, week, aff)
    wrng = random.Random(_week_seed(anchor["ACCOUNT_ID"] + "_" + topic, DATASET_SALT, week))
    bump = wrng.uniform(*_SURGE_BUMP) if surging else 0.0
    score = base + bump + wrng.gauss(0, 6)
    return int(max(0, min(100, round(score))))


def _weeks_surging(anchor: dict, topic: str, week: datetime, score_now: int) -> int:
    if score_now < _SURGE_THRESHOLD:
        return 0
    n = 1
    while (n < _MAX_WEEKS_SURGING
           and _score_for(anchor, topic, week - timedelta(weeks=n)) >= _SURGE_THRESHOLD):
        n += 1
    return n


# -------------------------------------------------------------------
# Derived per-row fields
# -------------------------------------------------------------------

def _journey_stage(score: int, weeks_surging: int) -> str:
    if weeks_surging >= 4 and score >= 85:
        return "Purchase"
    if weeks_surging >= 2:
        return "Decision"
    if score >= 50:
        return "Consideration"
    return "Awareness"


def _unique_researchers(employee_count, score: int, rng: random.Random) -> int:
    emp = _num(employee_count)
    cap = 3 if emp < 20 else (12 if emp < 500 else 40)
    return max(1, min(cap, round(cap * (score / 100.0) * rng.uniform(0.5, 1.2))))


def _gong_competitor_flag(gong_flags) -> bool:
    return bool(gong_flags) and "Competitor" in str(gong_flags).split("|")


def _researching_competitor(anchor: dict, topic: str, week: datetime, score: int,
                            is_top: bool, gong_flags, rng: random.Random):
    """Competitor gate.

    - Baseline: NULL below score 50 (nobody compares vendors at the awareness
      stage); at score >= 50 non-NULL with p = 0.20, or 0.70 when the
      same-week Gong KEY_TOPICS_FLAGS carries `Competitor`.
    - Gong override on the TOP row: a Gong `Competitor` flag is first-party
      evidence that the account is comparing banks, whatever its third-party
      score. So on the IS_TOP_TOPIC row (the account's core product need)
      the score >= 50 gate is lifted when Gong flags Competitor, and p = 0.70
      applies at any score. Without this, top rows -- which rest at
      min(55, 12*aff) and mostly score < 50 -- got a competitor only ~18 pct
      of the time on 868 live anchors even with every week flagged, failing
      the plan's L2 (>=3 of 6 flagged anchors' top rows) and L3 (>=55 pct of
      top rows in Gong-Competitor weeks) gates. Non-top rows keep the gate.

    The rng draw happens unconditionally so the gate is independent of the
    Gong flag (flagged and unflagged runs share every other field)."""
    gate = rng.random()
    gong_competitor = _gong_competitor_flag(gong_flags)
    if score < 50 and not (is_top and gong_competitor):
        return None
    p = 0.70 if gong_competitor else 0.20
    if gate >= p:
        return None
    yrng = random.Random(_year_seed(anchor["ACCOUNT_ID"] + "_" + topic + "_comp", week.year))
    pool = ["Brex", "Ramp", "Square"] if topic in _FINTECH_TOPICS else _COMPETITORS[:7]
    return yrng.choice(pool)  # year-stable: the account keeps comparing the same rival


def _signal_source(competitor, rng: random.Random) -> str:
    x = rng.random()
    if competitor is not None:
        return "G2"  # vendor comparisons come from review-site intent
    acc = 0.0
    for name, w in _SIGNAL_SOURCES:
        acc += w
        if x < acc:
            return name
    return _SIGNAL_SOURCES[-1][0]


def _intent_note(topic: str, weeks_surging: int, researchers: int, competitor):
    if weeks_surging <= 0:
        return None
    noun = "researcher" if researchers == 1 else "researchers"
    note = f"{weeks_surging}-week surge: {researchers} {noun} {_TOPIC_ACTIVITY[topic]}"
    if competitor:
        note += f", incl. {competitor}"
    return note[:200]


def _row(anchor: dict, topic: str, week: datetime, score: int, is_top: bool,
         gong_flags) -> dict:
    rng = random.Random(_week_seed(anchor["ACCOUNT_ID"] + "_" + topic + "_row",
                                   DATASET_SALT, week))
    surge = score >= _SURGE_THRESHOLD
    weeks_surging = _weeks_surging(anchor, topic, week, score)
    prev_score = _score_for(anchor, topic, week - timedelta(weeks=1))
    researchers = _unique_researchers(anchor.get("EMPLOYEE_COUNT"), score, rng)
    keywords = rng.sample(_TOPICS[topic][1], rng.randint(2, 3))
    # LAST_SIGNAL_DATE: within the 7-day window ending on PROFILE_WEEK. The
    # TASK runs Monday 05:30, so a date later in the week would be in the
    # future; anchoring to the trailing window keeps it <= run date AND
    # identical for any run_ts in the same week.
    last_signal = week.date() - timedelta(days=rng.randint(0, 6))
    competitor = _researching_competitor(anchor, topic, week, score, is_top, gong_flags, rng)
    source = _signal_source(competitor, rng)
    return {
        "ACCOUNT_ID":             anchor["ACCOUNT_ID"],
        "PROFILE_WEEK":           week.date(),
        "INTENT_TOPIC":           topic,
        "TOPIC_CATEGORY":         _TOPICS[topic][0],
        "IS_TOP_TOPIC":           bool(is_top),
        "INTENT_SCORE":           int(score),
        "SURGE_FLAG":             bool(surge),
        "WEEKS_SURGING":          int(weeks_surging),
        "SCORE_DELTA_WOW":        int(score - prev_score),
        "JOURNEY_STAGE":          _journey_stage(score, weeks_surging),
        "UNIQUE_RESEARCHERS":     int(researchers),
        "RESEARCHING_COMPETITOR": competitor,
        "KEYWORD_SAMPLE":         "; ".join(keywords),
        "SIGNAL_SOURCE":          source,
        "LAST_SIGNAL_DATE":       last_signal,
        "INTENT_NOTE":            _intent_note(topic, weeks_surging, researchers, competitor),
        "GENERATED_AT":           datetime(week.year, week.month, week.day),
    }


# -------------------------------------------------------------------
# Row factory
# -------------------------------------------------------------------

def _rows_for(anchor: dict, run_ts: datetime, gong_flags=None) -> list[dict]:
    """1-4 topic rows for (anchor, week of run_ts). Never empty.

    IS_TOP_TOPIC is the YEAR-STABLE highest-affinity topic (ties broken by
    name), not this week's highest score, so "what is this account usually
    in-market for" doesn't flicker. Extra rows: up to 3 other topics with
    score >= _REPORT_THRESHOLD, highest score first (ties by name).
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            "anchor failed Plan 14 audience predicate "
            f"({_AUDIENCE_PREDICATE}; ACCOUNT_ID non-empty): {anchor!r}"
        )
    week = _week_start(run_ts)
    scores = {t: _score_for(anchor, t, week) for t in _TOPICS}
    top = max(_TOPICS, key=lambda t: (_base_affinity(anchor, t, week.year), t))
    extras = sorted(
        (t for t in _TOPICS if t != top and scores[t] >= _REPORT_THRESHOLD),
        key=lambda t: (-scores[t], t),
    )[:_MAX_EXTRA_TOPICS]
    return [_row(anchor, t, week, scores[t], t == top, gong_flags)
            for t in [top] + extras]
