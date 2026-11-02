# Plan 16 — Harmonic Company Signals rowspec

> Per-dataset attachment for the dataset template. Authored 2026-11-02 from the vendor-gap assessment (Hunter B2B data list → "Private-company funding / traction" and "Workforce / job postings" categories, merged), plus live probes of:
> - the three-way audience: **703 anchors** on the latest ZoomInfo month;
> - the ZoomInfo EMPLOYEE_BAND mix: 563 in 1-10 / 47 in 11-50 / 30 in 51-200 / 58 in 201-1000 / 5 in 1001+.
>
> **First dataset that views a lifetime timeline as-of each period.** Every funding column derives from a per-account round list generated once, so cross-month invariants hold by construction.

## Mimics

**Harmonic** (private-company discovery: funding rounds, investors, headcount traction) plus **Coresignal** (employee-record-derived department mix and job-posting counts). Real Harmonic tracks ~25M companies with round-level funding and headcount growth signals; Coresignal sells parsed public-profile and job-posting data. We mirror 22 fields for **young private commercial clients**, the segment where funding and hiring signals are most predictive of banking need.

## Audience

Three-way join; SQL is in plan §2. The audience is:
- `BUSINESS` and non-Household;
- ZoomInfo `FOUNDED_YEAR >= 2010` for the run month (stable after plan Task 0);
- latest Moody's `LIQUIDITY_TIER = 'Illiquid'`.

**703 anchors** on the latest month at draft time. Re-probe after Task 0.

## Table: `FINS.PUBLIC.HARMONIC_COMPANY_SIGNALS`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ORG_ID` | VARCHAR(18) | NOT NULL | DEFAULT `'JDO'` |
| `RECORD_ID` | VARCHAR(36) | NOT NULL | `record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)` |
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_MONTH` | DATE | NOT NULL | 1st of the run month |
| `FUNDING_STATUS` | VARCHAR(16) | NOT NULL | `Bootstrapped` / `Angel-Seed` / `Venture-Backed` / `PE-Backed`, derived from the last round ≤ month-end |
| `LAST_FUNDING_STAGE` | VARCHAR(20) | NULL | Stage of the last round ≤ month-end; NULL if Bootstrapped |
| `LAST_FUNDING_DATE` | DATE | NULL | Date of that round; NULL if Bootstrapped |
| `LAST_ROUND_USD` | NUMBER(12,0) | NULL | Size of that round; NULL if Bootstrapped |
| `TOTAL_RAISED_USD` | NUMBER(12,0) | NOT NULL | Σ rounds ≤ month-end; 0 if Bootstrapped |
| `FUNDING_ROUNDS_COUNT` | NUMBER(2,0) | NOT NULL | Count of rounds ≤ month-end |
| `LEAD_INVESTOR` | VARCHAR(60) | NULL | Lead of the last round; NULL if Bootstrapped |
| `EST_VALUATION_USD` | NUMBER(13,0) | NULL | Post-money estimate from the last round; NULL if Bootstrapped |
| `EST_RUNWAY_MONTHS` | NUMBER(2,0) | NULL | [0, 60]; Angel-Seed / Venture-Backed only; NULL otherwise |
| `RECENTLY_FUNDED_FLAG` | BOOLEAN | NOT NULL | `LAST_FUNDING_DATE >= PROFILE_MONTH - 90 days` |
| `HEADCOUNT` | NUMBER(6,0) | NOT NULL | `_headcount_for(anchor, band, month)`, always inside the same-month ZoomInfo EMPLOYEE_BAND |
| `HEADCOUNT_GROWTH_6M_PCT` | NUMBER(5,1) | NOT NULL | `(hc(M) - hc(M-6)) / hc(M-6) * 100`, recomputed; clamped [-60, 300] |
| `TRACTION_SCORE` | NUMBER(3,0) | NOT NULL | [0, 100]: growth + postings + funding recency (`_traction`) |
| `ENG_HEADCOUNT_PCT` | NUMBER(4,1) | NOT NULL | Coresignal dept mix: engineering / technical |
| `SALES_HEADCOUNT_PCT` | NUMBER(4,1) | NOT NULL | Coresignal dept mix: sales / customer-facing |
| `OPS_HEADCOUNT_PCT` | NUMBER(4,1) | NOT NULL | Coresignal dept mix: operations / field / production. Sum of the three ≤ 100; the remainder is G and A |
| `OPEN_JOB_POSTINGS` | NUMBER(5,0) | NOT NULL | `_postings_for(anchor, band, month)` |
| `POSTINGS_TREND` | VARCHAR(12) | NOT NULL | `Accelerating` / `Steady` / `Slowing` / `Frozen`, from postings(M) vs postings(M-3), recomputed |
| `LAST_DATA_REFRESH_DATE` | DATE | NOT NULL | Day within [PROFILE_MONTH, PROFILE_MONTH+27] |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed for byte-identical re-runs |

That is 22 data columns plus ORG_ID and RECORD_ID: 16 NOT NULL and 6 NULLable (LAST_FUNDING_STAGE, LAST_FUNDING_DATE, LAST_ROUND_USD, LEAD_INVESTOR, EST_VALUATION_USD, EST_RUNWAY_MONTHS). There is 1 BOOLEAN column.

## Primary key

`(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`. The DC PK is `RECORD_ID`.

## Stage ladder and investors

```python
_LADDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth", "PE Growth Equity", "PE Buyout"]
_ROUND_USD = {   # (low, high) — uniform, rounded to $50K
    "Pre-Seed": (250_000, 1_000_000),      "Seed": (1_000_000, 4_000_000),
    "Series A": (5_000_000, 15_000_000),   "Series B": (15_000_000, 40_000_000),
    "Series C": (40_000_000, 100_000_000), "Growth": (100_000_000, 300_000_000),
    "PE Growth Equity": (10_000_000, 75_000_000), "PE Buyout": (25_000_000, 250_000_000),
}
_POST_MONEY_MULT = {"Pre-Seed": (4, 8), "Seed": (4, 7), "Series A": (4, 6), "Series B": (4, 6),
                    "Series C": (3.5, 5), "Growth": (3, 5), "PE Growth Equity": (2.5, 4), "PE Buyout": (1.5, 2.5)}
_INVESTORS = {
    "angel":   ["Angel syndicate", "Local Angel Network", "Founder friends and family", "Y Combinator", "Techstars"],
    "venture": ["Sequoia Capital", "Andreessen Horowitz", "Accel", "Lightspeed", "General Catalyst",
                "Bessemer Venture Partners", "Insight Partners", "Index Ventures", "First Round Capital"],
    "pe":      ["Vista Equity Partners", "Thoma Bravo", "TA Associates", "Summit Partners", "Main Street Capital"],
}
_STATUS_OF = {"Pre-Seed": "Angel-Seed", "Seed": "Angel-Seed", "Series A": "Venture-Backed", "Series B": "Venture-Backed",
              "Series C": "Venture-Backed", "Growth": "Venture-Backed",
              "PE Growth Equity": "PE-Backed", "PE Buyout": "PE-Backed"}
```

Never use a bare `&` in investor names or anywhere in SQL (snow-sql render trap). Write `Friends and family`.

## Destiny — the lifetime funding class (salt `harmonic_funding`)

```python
_MAX_STAGE_BY_BAND = {"1-10": "Seed", "11-50": "Series A", "51-200": "Series B",
                      "201-1000": "Series C", "1001-5000": "Growth", "5001-25000": "Growth"}
_VENTURE_TILT = {"Technology": 3.0, "Healthcare": 1.6, "Financial Services": 1.8, "Professional Services": 1.1,
                 "Manufacturing": 0.8, "Logistics": 0.8, "Restaurant": 0.3, "Construction": 0.3,
                 "Retail Trade": 0.5, "Real Estate": 0.4, "Wholesale": 0.5}

def _destiny(anchor, band, frng):
    """'bootstrapped' | 'angel' | 'venture' | 'pe'. Account-lifetime: frng is seeded once per account."""
    tilt = _VENTURE_TILT.get(anchor.get("INDUSTRY") or "", 1.0)
    roll = frng.random()
    p_venture = min(0.55, 0.10 * tilt) if band != "1-10" else min(0.25, 0.06 * tilt)
    p_angel   = min(0.35, 0.14 * tilt)
    p_pe      = 0.12 if band in ("51-200", "201-1000", "1001-5000", "5001-25000") else 0.0
    if roll < p_venture: return "venture"
    if roll < p_venture + p_angel: return "angel"
    if roll < p_venture + p_angel + p_pe: return "pe"
    return "bootstrapped"
```

The 1-10 band caps at `Seed`, so a 1-10 "venture" destiny climbs only Pre-Seed→Seed and resolves to `Angel-Seed` status. That's intended: 80% of the audience is tiny, and the L3 mix targets account for it.

## Timeline — `_timeline(anchor, founded_year, band)`

```python
def _timeline(anchor, founded_year, band):
    """Return the full list of rounds [(date, stage, usd, lead)] for the account's lifetime (through 2030-12)."""
    frng = Random(seed_for(anchor["ACCOUNT_ID"], "harmonic_funding", datetime(2000, 1, 1)))
    destiny = _destiny(anchor, band, frng)
    if destiny == "bootstrapped":
        return []
    cap = _LADDER.index(_MAX_STAGE_BY_BAND.get(band, "Seed"))
    if destiny == "pe":
        stages = ["PE Growth Equity"] + (["PE Buyout"] if frng.random() < 0.35 else [])
    else:
        top = min(cap, _LADDER.index("Seed") if destiny == "angel" else cap)
        start = 0 if frng.random() < 0.6 else 1                      # skip Pre-Seed 40% of the time
        stages = _LADDER[start:top + 1]
    d = date(founded_year, 1, 1) + timedelta(days=frng.randint(120, 900))   # first round 4–30 months after founding
    rounds = []
    for st in stages:
        lo, hi = _ROUND_USD[st]
        usd = round(frng.uniform(lo, hi) / 50_000) * 50_000
        pool = "pe" if st.startswith("PE") else ("angel" if st in ("Pre-Seed", "Seed") and frng.random() < 0.6 else "venture")
        rounds.append((d, st, usd, frng.choice(_INVESTORS[pool])))
        d = d + timedelta(days=frng.randint(300, 760))                  # 10–25 months between rounds
    return rounds
```

**Determinism contract:**
- Inputs are `ACCOUNT_ID`, `founded_year` (stable after Task 0) and `band` (stable per ZoomInfo; Plan 11 derives it deterministically from EMPLOYEE_COUNT).
- If an anchor's EMPLOYEE_COUNT changes upstream, the band changes and so can the timeline. That is acceptable, because it's a genuine re-baseline. L3 does **not** treat it as a monotonicity violation if it coincides with a band change; the monotonicity SQL should exclude band-change months.
- Rounds dated in the future are simply not visible yet. That's how Bootstrapped→funded transitions appear over the backfill and live months.

## As-of view

```python
def _funding_as_of(rounds, month_end):
    seen = [r for r in rounds if r[0] <= month_end]
    if not seen:
        return dict(FUNDING_STATUS="Bootstrapped", LAST_FUNDING_STAGE=None, LAST_FUNDING_DATE=None,
                    LAST_ROUND_USD=None, TOTAL_RAISED_USD=0, FUNDING_ROUNDS_COUNT=0, LEAD_INVESTOR=None,
                    EST_VALUATION_USD=None)
    d, st, usd, lead = seen[-1]
    vrng = Random(seed_for(f"{d.isoformat()}_{st}", "harmonic_funding", datetime(2000, 1, 1)))  # per-round, stable
    lo, hi = _POST_MONEY_MULT[st]
    return dict(FUNDING_STATUS=_STATUS_OF[st], LAST_FUNDING_STAGE=st, LAST_FUNDING_DATE=d,
                LAST_ROUND_USD=usd, TOTAL_RAISED_USD=sum(r[2] for r in seen), FUNDING_ROUNDS_COUNT=len(seen),
                LEAD_INVESTOR=lead, EST_VALUATION_USD=round(usd * vrng.uniform(lo, hi) / 100_000) * 100_000)
```

The per-round seed key must also include `ACCOUNT_ID`. The implementer should use `f"{account_id}_{d}_{st}"`; the sketch above omits it only for brevity. Otherwise two accounts with a same-day same-stage round would share a multiple.

## Headcount — `_headcount_for(anchor, band, month)`

```python
_BAND_BOUNDS = {"1-10": (1, 10), "11-50": (11, 50), "51-200": (51, 200), "201-1000": (201, 1000),
                "1001-5000": (1001, 5000), "5001-25000": (5001, 25000)}

def _headcount_for(anchor, band, month, rounds):
    lo, hi = _BAND_BOUNDS.get(band, (1, 10))
    frng = Random(seed_for(anchor["ACCOUNT_ID"] + "_hc", "harmonic_funding", datetime(2000, 1, 1)))
    pos = frng.uniform(0.2, 0.8)                                    # resting position within band
    drift = frng.gauss(0.004, 0.012)                                # monthly growth trend, account-stable
    months_since_2024 = (month.year - 2024) * 12 + month.month - 1
    boost = sum(0.04 for r in rounds if 0 <= (month - r[0]).days <= 365)   # +4%/round in trailing 12 mo
    mrng = Random(seed_for(anchor["ACCOUNT_ID"], "harmonic", datetime(month.year, month.month, 1)))
    raw = (lo + pos * (hi - lo)) * (1 + drift) ** months_since_2024 * (1 + boost) * (1 + mrng.gauss(0, 0.02))
    return int(max(lo, min(hi, round(raw))))
```

- `HEADCOUNT_GROWTH_6M_PCT` = `(hc(M) − hc(M−6)) / hc(M−6) × 100`, calling `_headcount_for` for M−6 with **M−6's band**. If ZoomInfo has no M−6 row, use M's band.
- Band clamping flattens growth for companies pinned at a band edge. That's realistic enough, since a 1-10 shop can't grow 40% and stay in 1-10.

## Coresignal dept mix (account-stable baseline + small monthly jitter)

```python
_DEPT_BASE = {   # (eng, sales, ops) means; remainder = G and A
    "Technology": (45, 25, 10), "Healthcare": (10, 15, 55), "Professional Services": (15, 30, 35),
    "Restaurant": (0, 10, 80), "Construction": (5, 10, 75), "Manufacturing": (12, 12, 62),
    "Logistics": (8, 12, 68), "Retail Trade": (3, 45, 40), "Financial Services": (25, 30, 25),
}
_DEPT_DEFAULT = (10, 25, 50)
```

- Each mean is drawn from `gauss(mean, 4)` on the account-stable `harmonic_funding` rng, then gets `gauss(0, 1)` monthly jitter on the `harmonic` rng.
- Clamp each to ≥0. If the sum exceeds 98, scale all three down proportionally so G and A ≥ 2%.
- Round to 0.1.
- A Technology venture-backed company drifts eng +1pt per round seen. This is cosmetic, but it makes the funding→hiring story visible.

## Job postings and trend

```python
def _postings_for(anchor, band, month, rounds, hc):
    rate = 0.03 + (0.05 if any(0 <= (month - r[0]).days <= 180 for r in rounds) else 0.0)   # fresh money hires
    frng = Random(seed_for(anchor["ACCOUNT_ID"] + "_post", "harmonic_funding", datetime(2000, 1, 1)))
    if frng.random() < 0.15:  rate *= 0.2                          # account-stable "lean hirer"
    mrng = Random(seed_for(anchor["ACCOUNT_ID"] + "_post", "harmonic", datetime(month.year, month.month, 1)))
    return max(0, int(round(hc * rate * mrng.uniform(0.4, 1.6))))

def _postings_trend(now, prev3):
    if now == 0: return "Frozen"
    if prev3 == 0 or now >= prev3 * 1.3: return "Accelerating"
    if now <= prev3 * 0.7: return "Slowing"
    return "Steady"
```

There's a funding-to-runway coupling: for Venture/Angel accounts with `EST_RUNWAY_MONTHS < 6`, multiply `rate` by 0.3. A burning company freezes hiring. That makes the L3 "Frozen correlates with negative growth / short runway" check pass for a real reason. Runway is computed before postings, from the funding view and headcount, so there is no cycle.

## Runway

```python
def _runway(funding, hc, month_end, rrng):
    if funding["FUNDING_STATUS"] not in ("Angel-Seed", "Venture-Backed"):
        return None
    burn = hc * rrng.uniform(9_000, 16_000)                         # $/month fully loaded
    months_since = (month_end - funding["LAST_FUNDING_DATE"]).days / 30.4
    runway = funding["LAST_ROUND_USD"] / max(burn, 1) - months_since
    return int(max(0, min(60, round(runway))))
```

`rrng` is account-stable (`harmonic_funding`, key `ACCOUNT_ID + "_burn"`), so runway declines smoothly month over month between rounds and jumps after one. That's a coherent demo narrative.

## Traction score

```python
def _traction(growth_pct, postings_trend, recently_funded, total_raised):
    s = 40 + max(-30, min(30, growth_pct * 0.6))
    s += {"Accelerating": 15, "Steady": 5, "Slowing": -8, "Frozen": -15}[postings_trend]
    s += 12 if recently_funded else 0
    s += 5 if total_raised >= 10_000_000 else 0
    return int(max(0, min(100, round(s))))
```

## `_row_for(anchor, zi, run_ts)` — assembly order

1. `month = run_ts` month-start; `month_end = last day`.
2. `band = zi[M].EMPLOYEE_BAND`; `founded = zi[M].FOUNDED_YEAR`.
3. `rounds = _timeline(anchor, founded, band)`; `funding = _funding_as_of(rounds, month_end)`.
4. `hc = _headcount_for(..., M)`; `hc6 = _headcount_for(..., M-6)` → growth.
5. Runway, which depends on funding and hc.
6. Postings at M and M-3 (each with that month's hc), then trend.
7. Dept mix, traction, `RECENTLY_FUNDED_FLAG`, `LAST_DATA_REFRESH_DATE`, `GENERATED_AT`.

## Bias logic summary

- EMPLOYEE_BAND caps the stage ladder and bounds headcount.
- INDUSTRY tilts venture destiny (Technology 3×, Restaurant/Construction 0.3×) and sets the dept mix.
- Funding recency boosts headcount growth and postings.
- Short runway suppresses postings.

## Boring case (must still emit)

Take an anchor with `INDUSTRY=None` in band `1-10`, founded 2010, with a bootstrapped destiny.
- Funding: `Bootstrapped` with all six NULLables NULL, TOTAL_RAISED=0, ROUNDS=0 and RECENTLY_FUNDED_FLAG=False.
- HEADCOUNT is in [1, 10] and the dept mix is near (10, 25, 50).
- POSTINGS is 0–1, so the trend is mostly `Frozen` or `Steady`, and TRACTION_SCORE is ~30–50.

It never raises.

## L1 property targets

1. **Determinism:** same `(anchor, zi, run_ts)` gives an identical dict. Any `run_ts` in the same month gives an identical dict.
2. **Timeline stability:** `_timeline` is identical across 36 different `run_ts` values for the same anchor and band.
3. **Monotonicity:** see plan 4c.
4. **Invariants 4a–4e:** as listed in the plan §4 Task 3.
5. **Band bound:** across 36 months × all fixture anchors, HEADCOUNT stays within `_BAND_BOUNDS[band]`.
6. **Boring case:** as above.
