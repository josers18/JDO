"""Harmonic-style synthetic private-company funding and traction generator.

Snowpark Python stored procedure registered as
DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS (Plan 16).
Harmonic-style funding rounds / investors / headcount traction, plus
Coresignal-style department mix and job-posting counts, for young private
commercial clients. Monthly cadence, 1:1 (one row per audience anchor per
month).

Structural deviations from the v1.5 template (Plan 11 baseline):

  1. Three-way audience: V_ACCOUNT_ANCHORS x ZOOMINFO_FIRMOGRAPHICS
     (same-month FOUNDED_YEAR >= 2010, EMPLOYEE_BAND) x the latest
     MOODYS_MARKET_CONTEXT row (LIQUIDITY_TIER = 'Illiquid'). Two HARD
     cross-plan dependencies.
  2. Lifetime funding timeline. `_timeline(anchor, founded_year, band)`
     generates every round once, from salt "harmonic_funding" at the fixed
     epoch 2000-01-01, keyed on ACCOUNT_ID alone. Each month's funding
     columns are `_funding_as_of(rounds, month_end, account_id)`, a filter on
     that one list, so TOTAL_RAISED_USD / FUNDING_ROUNDS_COUNT / stage index
     are non-decreasing and LAST_FUNDING_DATE <= month-end by construction.
  3. Stateless trajectory recomputation. HEADCOUNT_GROWTH_6M_PCT and
     POSTINGS_TREND call the pure `_headcount_for` / `_postings_for` for M-6
     and M-3 (each with that month's ZoomInfo band, falling back to M's band
     when the month is missing). The SP never reads its own table.

Salts:
  - "harmonic_funding" (account-lifetime, epoch 2000-01-01): destiny and
    rounds (key ACCOUNT_ID), valuation multiple (ACCOUNT_ID_date_stage),
    headcount position/drift (_hc), lean hirer (_post), burn (_burn), dept
    baseline (_dept).
  - "harmonic" (month-bucketed): headcount jitter (ACCOUNT_ID), postings
    noise (_post), dept jitter (_dept), refresh day (_refresh).
  NOTE: cumulus_common.seed_for only uses %Y-%m of its run_ts argument.

The SP entry point (main / hard-dep probes / MERGE / coverage / log) lands
in Plan 16 Task 4; this module currently holds the pure row factory that the
L1 tests exercise.

No ampersand character anywhere in this module: the body is inlined into a
snow sql file, which treats it as a template directive.

Plan:    docs/superpowers/plans/2026-11-02-cumulus-plan-16-harmonic-company-signals.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-16-harmonic-company-signals-rowspec.md
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from random import Random

# Locally, cumulus_common resolves via the pytest pythonpath; in Snowflake,
# scripts/deploy_sp.py inlines seed_for / assert_coverage / record_id_for.
from cumulus_common import seed_for
from cumulus_common.record_id import record_id_for


# -------------------------------------------------------------------
# Constants — MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE              = "DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS"
STAGING_TABLE      = "DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_STAGING"
TASK_NAME          = "TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS"
DATASET_SALT       = "harmonic"          # month-bucketed noise
FUNDING_SALT       = "harmonic_funding"  # account-lifetime timeline and baselines
_LIFETIME_EPOCH    = datetime(2000, 1, 1)
_MIN_FOUNDED_YEAR  = 2010
_TIMELINE_END      = date(2030, 12, 31)

# Plan section 2 audience SQL, verbatim except for the live namespace
# (DATA_JEDAIS.FINS__PUBLIC; there is no FINS database). `:month` is the
# first-of-month DATE of the run, bound by the SP (Task 4). Keep the comment
# and the COALESCE: NULL <> 'Household' is NULL and would drop NULL-category
# anchors.
AUDIENCE_SQL = """
-- Harmonic covers young private companies. Moody's LIQUIDITY_TIER='Illiquid' is the private-company proxy
-- (stable per account); ZoomInfo FOUNDED_YEAR >= 2010 is the "young" cut. COALESCE keeps NULL-category anchors.
SELECT a.ACCOUNT_ID
FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS a
JOIN DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS z
  ON z.ACCOUNT_ID = a.ACCOUNT_ID AND z.PROFILE_MONTH = :month
JOIN (SELECT ACCOUNT_ID, LIQUIDITY_TIER FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT
      QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY PROFILE_DATE DESC) = 1) m
  ON m.ACCOUNT_ID = a.ACCOUNT_ID
WHERE a.ACCOUNT_TYPE_FLAG = 'BUSINESS'
  AND COALESCE(a.CLIENT_CATEGORY, '') <> 'Household'
  AND m.LIQUIDITY_TIER = 'Illiquid'
  AND z.FOUNDED_YEAR >= 2010
"""

# 22 data columns emitted by the row factory, in DDL order. ORG_ID and
# RECORD_ID are stamped by `_with_ids` (RECORD_ID = record_id_for(ORG_ID,
# ACCOUNT_ID, PROFILE_MONTH)).
DATA_COLUMNS: tuple[str, ...] = (
    "ACCOUNT_ID", "PROFILE_MONTH",
    "FUNDING_STATUS", "LAST_FUNDING_STAGE", "LAST_FUNDING_DATE", "LAST_ROUND_USD",
    "TOTAL_RAISED_USD", "FUNDING_ROUNDS_COUNT", "LEAD_INVESTOR", "EST_VALUATION_USD",
    "EST_RUNWAY_MONTHS", "RECENTLY_FUNDED_FLAG",
    "HEADCOUNT", "HEADCOUNT_GROWTH_6M_PCT", "TRACTION_SCORE",
    "ENG_HEADCOUNT_PCT", "SALES_HEADCOUNT_PCT", "OPS_HEADCOUNT_PCT",
    "OPEN_JOB_POSTINGS", "POSTINGS_TREND",
    "LAST_DATA_REFRESH_DATE", "GENERATED_AT",
)
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset(DATA_COLUMNS)


# -------------------------------------------------------------------
# Stage ladder, round sizes, investors (rowspec "Stage ladder and investors")
# -------------------------------------------------------------------

_LADDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth",
           "PE Growth Equity", "PE Buyout"]
_ROUND_USD = {   # (low, high) — uniform, rounded to 50K
    "Pre-Seed": (250_000, 1_000_000),      "Seed": (1_000_000, 4_000_000),
    "Series A": (5_000_000, 15_000_000),   "Series B": (15_000_000, 40_000_000),
    "Series C": (40_000_000, 100_000_000), "Growth": (100_000_000, 300_000_000),
    "PE Growth Equity": (10_000_000, 75_000_000), "PE Buyout": (25_000_000, 250_000_000),
}
_POST_MONEY_MULT = {"Pre-Seed": (4, 8), "Seed": (4, 7), "Series A": (4, 6), "Series B": (4, 6),
                    "Series C": (3.5, 5), "Growth": (3, 5), "PE Growth Equity": (2.5, 4),
                    "PE Buyout": (1.5, 2.5)}
_INVESTORS = {
    "angel":   ["Angel syndicate", "Local Angel Network", "Founder friends and family",
                "Y Combinator", "Techstars"],
    "venture": ["Sequoia Capital", "Andreessen Horowitz", "Accel", "Lightspeed", "General Catalyst",
                "Bessemer Venture Partners", "Insight Partners", "Index Ventures",
                "First Round Capital"],
    "pe":      ["Vista Equity Partners", "Thoma Bravo", "TA Associates", "Summit Partners",
                "Main Street Capital"],
}
_STATUS_OF = {"Pre-Seed": "Angel-Seed", "Seed": "Angel-Seed", "Series A": "Venture-Backed",
              "Series B": "Venture-Backed", "Series C": "Venture-Backed", "Growth": "Venture-Backed",
              "PE Growth Equity": "PE-Backed", "PE Buyout": "PE-Backed"}

# Destiny (rowspec "Destiny — the lifetime funding class")
_MAX_STAGE_BY_BAND = {"1-10": "Seed", "11-50": "Series A", "51-200": "Series B",
                      "201-1000": "Series C", "1001-5000": "Growth", "5001-25000": "Growth"}
_VENTURE_TILT = {"Technology": 3.0, "Healthcare": 1.6, "Financial Services": 1.8,
                 "Professional Services": 1.1, "Manufacturing": 0.8, "Logistics": 0.8,
                 "Restaurant": 0.3, "Construction": 0.3, "Retail Trade": 0.5,
                 "Real Estate": 0.4, "Wholesale": 0.5}
_PE_BANDS = ("51-200", "201-1000", "1001-5000", "5001-25000")

# Headcount bounds per ZoomInfo EMPLOYEE_BAND. Unknown bands (incl. 25001+)
# fall back to (1, 10) per the rowspec; none are in the audience today.
_BAND_BOUNDS = {"1-10": (1, 10), "11-50": (11, 50), "51-200": (51, 200),
                "201-1000": (201, 1000), "1001-5000": (1001, 5000), "5001-25000": (5001, 25000)}

# Coresignal dept mix: (eng, sales, ops) means; the remainder is G and A.
_DEPT_BASE = {
    "Technology": (45, 25, 10), "Healthcare": (10, 15, 55), "Professional Services": (15, 30, 35),
    "Restaurant": (0, 10, 80), "Construction": (5, 10, 75), "Manufacturing": (12, 12, 62),
    "Logistics": (8, 12, 68), "Retail Trade": (3, 45, 40), "Financial Services": (25, 30, 25),
}
_DEPT_DEFAULT = (10, 25, 50)
_DEPT_MAX_SUM_TENTHS = 980   # G and A keeps at least 2 pct

_POSTINGS_TREND_POINTS = {"Accelerating": 15, "Steady": 5, "Slowing": -8, "Frozen": -15}


# -------------------------------------------------------------------
# Small helpers
# -------------------------------------------------------------------

def _month_start(ts) -> date:
    return date(ts.year, ts.month, 1)


def _month_end(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def _add_months(d: date, n: int) -> date:
    idx = d.year * 12 + (d.month - 1) + n
    return date(idx // 12, idx % 12 + 1, 1)


def _lifetime_rng(key: str) -> Random:
    """Account-lifetime stream: salt harmonic_funding at the fixed epoch."""
    return Random(seed_for(key, FUNDING_SALT, _LIFETIME_EPOCH))


def _monthly_rng(key: str, month: date) -> Random:
    """Month-bucketed stream: salt harmonic."""
    return Random(seed_for(key, DATASET_SALT, datetime(month.year, month.month, 1)))


def _anchor_in_audience(anchor: dict) -> bool:
    """Python mirror of the anchor half of the plan section 2 predicate.

    ZoomInfo FOUNDED_YEAR is checked in _row_for; Moody's LIQUIDITY_TIER can't
    be checked here (the SQL audience is authoritative).
    """
    return (
        anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"
        and (anchor.get("CLIENT_CATEGORY") or "") != "Household"
        and bool(anchor.get("ACCOUNT_ID"))
    )


def _band_at(zi: dict, month: date, fallback: str) -> str:
    """That month's ZoomInfo band, or M's band when the month is missing."""
    row = zi.get(month)
    return row["EMPLOYEE_BAND"] if row and row.get("EMPLOYEE_BAND") else fallback


# -------------------------------------------------------------------
# Funding timeline (account-lifetime) and as-of view
# -------------------------------------------------------------------

def _destiny(anchor: dict, band: str, frng: Random) -> str:
    """'bootstrapped' | 'angel' | 'venture' | 'pe'. frng is seeded once per account."""
    tilt = _VENTURE_TILT.get(anchor.get("INDUSTRY") or "", 1.0)
    roll = frng.random()
    p_venture = min(0.55, 0.10 * tilt) if band != "1-10" else min(0.25, 0.06 * tilt)
    p_angel   = min(0.35, 0.14 * tilt)
    p_pe      = 0.12 if band in _PE_BANDS else 0.0
    if roll < p_venture:
        return "venture"
    if roll < p_venture + p_angel:
        return "angel"
    if roll < p_venture + p_angel + p_pe:
        return "pe"
    return "bootstrapped"


def _timeline(anchor: dict, founded_year: int, band: str) -> list[tuple]:
    """Every round [(date, stage, usd, lead)] for the account's lifetime (through 2030-12).

    Seeded from ACCOUNT_ID alone (harmonic_funding, epoch 2000-01-01). Never
    seed this from PROFILE_MONTH: that would break monotonicity.
    """
    frng = _lifetime_rng(anchor["ACCOUNT_ID"])
    destiny = _destiny(anchor, band, frng)
    if destiny == "bootstrapped":
        return []
    cap = _LADDER.index(_MAX_STAGE_BY_BAND.get(band, "Seed"))
    if destiny == "pe":
        stages = ["PE Growth Equity"] + (["PE Buyout"] if frng.random() < 0.35 else [])
    else:
        top = min(cap, _LADDER.index("Seed") if destiny == "angel" else cap)
        start = 0 if frng.random() < 0.6 else 1                 # skip Pre-Seed 40% of the time
        stages = _LADDER[start:top + 1]
    d = date(founded_year, 1, 1) + timedelta(days=frng.randint(120, 900))  # 4-30 months after founding
    rounds = []
    for st in stages:
        lo, hi = _ROUND_USD[st]
        usd = round(frng.uniform(lo, hi) / 50_000) * 50_000
        pool = "pe" if st.startswith("PE") else (
            "angel" if st in ("Pre-Seed", "Seed") and frng.random() < 0.6 else "venture")
        rounds.append((d, st, usd, frng.choice(_INVESTORS[pool])))
        d = d + timedelta(days=frng.randint(300, 760))          # 10-25 months between rounds
    return [r for r in rounds if r[0] <= _TIMELINE_END]


def _funding_as_of(rounds: list[tuple], month_end: date, account_id: str) -> dict:
    """View of the lifetime timeline as of month_end.

    The per-round valuation seed includes ACCOUNT_ID (rowspec: the sketch
    omits it for brevity), so two accounts with a same-day same-stage round
    don't share a multiple.
    """
    seen = [r for r in rounds if r[0] <= month_end]
    if not seen:
        return dict(FUNDING_STATUS="Bootstrapped", LAST_FUNDING_STAGE=None, LAST_FUNDING_DATE=None,
                    LAST_ROUND_USD=None, TOTAL_RAISED_USD=0, FUNDING_ROUNDS_COUNT=0,
                    LEAD_INVESTOR=None, EST_VALUATION_USD=None)
    d, st, usd, lead = seen[-1]
    vrng = _lifetime_rng(f"{account_id}_{d.isoformat()}_{st}")
    lo, hi = _POST_MONEY_MULT[st]
    return dict(FUNDING_STATUS=_STATUS_OF[st], LAST_FUNDING_STAGE=st, LAST_FUNDING_DATE=d,
                LAST_ROUND_USD=usd, TOTAL_RAISED_USD=sum(r[2] for r in seen),
                FUNDING_ROUNDS_COUNT=len(seen), LEAD_INVESTOR=lead,
                EST_VALUATION_USD=round(usd * vrng.uniform(lo, hi) / 100_000) * 100_000)


# -------------------------------------------------------------------
# Pure per-month functions (recomputed for M-6 / M-3; never read back)
# -------------------------------------------------------------------

def _headcount_for(anchor: dict, band: str, month: date, rounds: list[tuple]) -> int:
    """Headcount for `month`, always inside `band`'s bounds."""
    lo, hi = _BAND_BOUNDS.get(band, (1, 10))
    frng = _lifetime_rng(anchor["ACCOUNT_ID"] + "_hc")
    pos = frng.uniform(0.2, 0.8)                                 # resting position within band
    drift = frng.gauss(0.004, 0.012)                             # monthly growth trend, account-stable
    months_since_2024 = (month.year - 2024) * 12 + month.month - 1
    boost = sum(0.04 for r in rounds if 0 <= (month - r[0]).days <= 365)   # +4%/round, trailing 12 mo
    mrng = _monthly_rng(anchor["ACCOUNT_ID"], month)
    raw = ((lo + pos * (hi - lo)) * (1 + drift) ** months_since_2024 * (1 + boost)
           * (1 + mrng.gauss(0, 0.02)))
    return int(max(lo, min(hi, round(raw))))


def _runway(funding: dict, hc: int, month_end: date, rrng: Random):
    """Months of runway [0, 60]; Angel-Seed / Venture-Backed only, else None."""
    if funding["FUNDING_STATUS"] not in ("Angel-Seed", "Venture-Backed"):
        return None
    burn = hc * rrng.uniform(9_000, 16_000)                      # USD/month fully loaded
    months_since = (month_end - funding["LAST_FUNDING_DATE"]).days / 30.4
    runway = funding["LAST_ROUND_USD"] / max(burn, 1) - months_since
    return int(max(0, min(60, round(runway))))


def _postings_for(anchor: dict, band: str, month: date, rounds: list[tuple], hc: int,
                  runway=None) -> int:
    """Open job postings for `month`. `band` is carried for signature parity with
    _headcount_for (hc already reflects it)."""
    rate = 0.03 + (0.05 if any(0 <= (month - r[0]).days <= 180 for r in rounds) else 0.0)
    frng = _lifetime_rng(anchor["ACCOUNT_ID"] + "_post")
    if frng.random() < 0.15:                                     # account-stable lean hirer
        rate *= 0.2
    if runway is not None and runway < 6:                        # burning company freezes hiring
        rate *= 0.3
    mrng = _monthly_rng(anchor["ACCOUNT_ID"] + "_post", month)
    return max(0, int(round(hc * rate * mrng.uniform(0.4, 1.6))))


def _postings_trend(now: int, prev3: int) -> str:
    if now == 0:
        return "Frozen"
    if prev3 == 0 or now >= prev3 * 1.3:
        return "Accelerating"
    if now <= prev3 * 0.7:
        return "Slowing"
    return "Steady"


def _month_state(anchor: dict, band: str, month: date, rounds: list[tuple]) -> dict:
    """Funding view, headcount, runway and postings for one month (pure)."""
    month_end = _month_end(month)
    funding = _funding_as_of(rounds, month_end, anchor["ACCOUNT_ID"])
    hc = _headcount_for(anchor, band, month, rounds)
    runway = _runway(funding, hc, month_end, _lifetime_rng(anchor["ACCOUNT_ID"] + "_burn"))
    postings = _postings_for(anchor, band, month, rounds, hc, runway)
    return {"funding": funding, "hc": hc, "runway": runway, "postings": postings}


def _growth_pct(hc: int, hc6: int) -> float:
    return round(max(-60.0, min(300.0, (hc - hc6) / hc6 * 100)), 1)


def _traction(growth_pct: float, postings_trend: str, recently_funded: bool,
              total_raised: int) -> int:
    s = 40 + max(-30, min(30, growth_pct * 0.6))
    s += _POSTINGS_TREND_POINTS[postings_trend]
    s += 12 if recently_funded else 0
    s += 5 if total_raised >= 10_000_000 else 0
    return int(max(0, min(100, round(s))))


def _dept_mix(anchor: dict, month: date, funding: dict) -> tuple[float, float, float]:
    """(eng, sales, ops) pct. Account-stable baseline + monthly jitter; sum <= 98."""
    industry = anchor.get("INDUSTRY") or ""
    base = _DEPT_BASE.get(industry, _DEPT_DEFAULT)
    brng = _lifetime_rng(anchor["ACCOUNT_ID"] + "_dept")
    mrng = _monthly_rng(anchor["ACCOUNT_ID"] + "_dept", month)
    vals = [brng.gauss(mu, 4) for mu in base]
    vals = [v + mrng.gauss(0, 1) for v in vals]
    # Cosmetic funding -> hiring story: a venture-track Technology company
    # shifts engineering +1pt per round seen.
    if industry == "Technology" and funding["FUNDING_STATUS"] in ("Angel-Seed", "Venture-Backed"):
        vals[0] += funding["FUNDING_ROUNDS_COUNT"]
    vals = [max(0.0, v) for v in vals]
    total = sum(vals)
    if total > _DEPT_MAX_SUM_TENTHS / 10:
        vals = [v * (_DEPT_MAX_SUM_TENTHS / 10) / total for v in vals]
    tenths = [int(round(v * 10)) for v in vals]
    excess = sum(tenths) - _DEPT_MAX_SUM_TENTHS
    if excess > 0:                                   # rounding can push the sum past 98.0
        i = tenths.index(max(tenths))
        tenths[i] -= excess
    return tenths[0] / 10, tenths[1] / 10, tenths[2] / 10


def _last_refresh(anchor: dict, month: date) -> date:
    """Vendor refresh day within [PROFILE_MONTH, PROFILE_MONTH + 27]."""
    return month + timedelta(days=_monthly_rng(anchor["ACCOUNT_ID"] + "_refresh", month).randint(0, 27))


# -------------------------------------------------------------------
# _row_for — rowspec assembly order
# -------------------------------------------------------------------

def _row_for(anchor: dict, zi: dict, run_ts: datetime) -> dict:
    """Pure function: (anchor, per-account ZoomInfo dict, run_ts) -> 22-column row.

    `zi` maps a first-of-month `date` to that month's ZoomInfo row for this
    account ({"EMPLOYEE_BAND", "FOUNDED_YEAR"}). The run month must be present;
    M-3 / M-6 fall back to M's band when missing.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')!r} fails the audience predicate "
            "(BUSINESS, non-Household, non-empty ACCOUNT_ID)")

    # 1. Month anchor.
    month = _month_start(run_ts)
    month_end = _month_end(month)

    # 2. Same-month ZoomInfo band and founded year (hard dependency).
    zm = zi.get(month)
    if not zm:
        raise ValueError(f"no ZoomInfo row for {anchor['ACCOUNT_ID']} in {month.isoformat()}")
    band = zm["EMPLOYEE_BAND"]
    founded = int(zm["FOUNDED_YEAR"])
    if founded < _MIN_FOUNDED_YEAR:
        raise ValueError(
            f"anchor {anchor['ACCOUNT_ID']} FOUNDED_YEAR {founded} < {_MIN_FOUNDED_YEAR} "
            "(outside the audience)")

    # 3. Lifetime timeline and the as-of view.
    rounds = _timeline(anchor, founded, band)

    # 4-6. Month M state (funding, headcount, runway, postings), M-6 headcount
    #      and M-3 postings, each recomputed with that month's band.
    now = _month_state(anchor, band, month, rounds)
    funding = now["funding"]
    m6 = _add_months(month, -6)
    hc6 = _headcount_for(anchor, _band_at(zi, m6, band), m6, rounds)
    growth = _growth_pct(now["hc"], hc6)
    m3 = _add_months(month, -3)
    prev3 = _month_state(anchor, _band_at(zi, m3, band), m3, rounds)
    trend = _postings_trend(now["postings"], prev3["postings"])

    # 7. Dept mix, traction, flag, refresh, generated-at.
    eng, sales, ops = _dept_mix(anchor, month, funding)
    last_date = funding["LAST_FUNDING_DATE"]
    recently_funded = last_date is not None and last_date >= month - timedelta(days=90)
    traction = _traction(growth, trend, recently_funded, funding["TOTAL_RAISED_USD"])
    _ = month_end  # month_end feeds _month_state; kept for assembly-order parity

    return {
        "ACCOUNT_ID":              anchor["ACCOUNT_ID"],
        "PROFILE_MONTH":           month,
        "FUNDING_STATUS":          funding["FUNDING_STATUS"],
        "LAST_FUNDING_STAGE":      funding["LAST_FUNDING_STAGE"],
        "LAST_FUNDING_DATE":       last_date,
        "LAST_ROUND_USD":          funding["LAST_ROUND_USD"],
        "TOTAL_RAISED_USD":        funding["TOTAL_RAISED_USD"],
        "FUNDING_ROUNDS_COUNT":    funding["FUNDING_ROUNDS_COUNT"],
        "LEAD_INVESTOR":           funding["LEAD_INVESTOR"],
        "EST_VALUATION_USD":       funding["EST_VALUATION_USD"],
        "EST_RUNWAY_MONTHS":       now["runway"],
        "RECENTLY_FUNDED_FLAG":    bool(recently_funded),
        "HEADCOUNT":               now["hc"],
        "HEADCOUNT_GROWTH_6M_PCT": growth,
        "TRACTION_SCORE":          traction,
        "ENG_HEADCOUNT_PCT":       eng,
        "SALES_HEADCOUNT_PCT":     sales,
        "OPS_HEADCOUNT_PCT":       ops,
        "OPEN_JOB_POSTINGS":       now["postings"],
        "POSTINGS_TREND":          trend,
        "LAST_DATA_REFRESH_DATE":  _last_refresh(anchor, month),
        # Month-bucketed so same-month re-runs are byte-identical; wall-clock
        # execution time goes to TASK_EXECUTION_LOG.
        "GENERATED_AT":            datetime(month.year, month.month, 1),
    }


def _with_ids(row: dict, org_id) -> dict:
    """Prepend ORG_ID (default 'JDO') and the deterministic RECORD_ID."""
    org = org_id or "JDO"
    return {"ORG_ID": org,
            "RECORD_ID": record_id_for(org, row["ACCOUNT_ID"], row["PROFILE_MONTH"]),
            **row}
