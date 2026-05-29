# Plan 1 — Claritas Demographics rowspec

> Per-dataset attachment for the dataset template (`docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md`). Authored from the source brainstorming doc §1 (Claritas / Environics) and the live anchor fields available in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.

## Mimics

**Claritas PRIZM Premier** — household segmentation provider. Real Claritas PRIZM has ~68 segments grouped into 14 lifestyle groups; we'll use a 12-segment subset that's recognisable to a banker without being a fan-fic mismatch.

## Audience

`ACCOUNT_TYPE_FLAG = 'PERSON'` (PRIZM is consumer-only; businesses get D&B, BoardEx, ZoomInfo per Plans 2/8/9).

## Table: `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID — Salesforce ssot__Id__c |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp (`run_ts.replace(day=1)`) |
| `PRIZM_SEGMENT_CODE` | VARCHAR(8) | NOT NULL | One of 12 codes — see §"PRIZM segments" below |
| `PRIZM_SEGMENT_NAME` | VARCHAR(120) | NOT NULL | Display name for the segment, e.g. "Upper Crust" |
| `PRIZM_LIFESTYLE_GROUP` | VARCHAR(40) | NOT NULL | Parent lifestyle group, e.g. "Affluent Empty Nests" |
| `LIFE_STAGE` | VARCHAR(40) | NOT NULL | One of: "Gen Z", "Young Singles", "Young Couples", "Young Families", "Established Families", "Empty Nesters", "Retirees" — derived from BIRTHDATE |
| `HOUSEHOLD_COMPOSITION` | VARCHAR(40) | NOT NULL | One of: "Single", "Couple", "Family with Children", "Multi-Generational", "Roommates" — biased by life stage |
| `ESTIMATED_NET_WORTH_BAND` | VARCHAR(20) | NOT NULL | "<$50K", "$50K-$250K", "$250K-$1M", "$1M-$5M", "$5M+" — biased by ANNUAL_INCOME and CLIENT_CATEGORY |
| `WEALTH_PROPENSITY_SCORE` | NUMBER(5,2) | NOT NULL | 0.00–100.00, biased by income + age |
| `INVESTMENT_PROPENSITY_SCORE` | NUMBER(5,2) | NOT NULL | 0.00–100.00, biased by income + life_stage (peak in pre-retiree band) |
| `MORTGAGE_PROPENSITY_SCORE` | NUMBER(5,2) | NOT NULL | 0.00–100.00, biased high in Young Families / Young Couples, low in Retirees |
| `URBANICITY` | VARCHAR(20) | NOT NULL | "Urban", "Suburban", "Town", "Rural" — biased by POSTAL_CODE leading digit (rough US convention; see §"Urbanicity bias") |
| `FINANCIAL_STRESS_INDICATOR` | VARCHAR(10) | NOT NULL | "Low", "Moderate", "High" — biased low for high-income/Wealth, high for low-income |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | **Month-bucketed** (`datetime(run_ts.year, run_ts.month, 1)`) so mid-month re-runs are byte-identical. Audit timestamp lives in `TASK_EXECUTION_LOG.EXECUTION_TIME`, not here. |

## Primary key

`(ACCOUNT_ID, PROFILE_MONTH)` — one row per person account per month. Re-running the SP within the same month replaces.

## PRIZM segments (12)

These map to real Claritas Premier names so the demo is recognisable. Codes are 2-letter shorthand for downstream readability.

| Code | Segment Name | Lifestyle Group | Notes |
|---|---|---|---|
| UC | Upper Crust | Affluent Empty Nests | Wealthy retirees / pre-retirees |
| MB | Money & Brains | Affluent Empty Nests | Highly educated affluents |
| YA | Young Achievers | Affluent Pre-Family | Affluent young professionals |
| MS | Movers & Shakers | Established Families | High-income mid-career |
| PP | Pools & Patios | Established Families | Suburban affluents w/ kids |
| BB | Beltway Boomers | Empty Nesters | Mid-affluent late-career |
| CR | City Roots | Urban Singles | Mid-income urban dwellers |
| CD | Cosmopolitan Domesticity | Young Couples | DINK urban couples |
| SS | Striving Singles | Young Singles | Lower-income young urban |
| HR | Hometown Retired | Retirees | Mid-income rural/town retirees |
| FS | Farms & Suburbs | Town/Rural Families | Rural family households |
| MT | Multi-Cultural Talent | Young Families | Diverse young families |

## Bias logic for `_row_for`

```python
import random
from datetime import date, datetime

# Anchor extraction
account_id   = anchor["ACCOUNT_ID"]
birthdate    = anchor["BIRTHDATE"]            # ISO string (fixture) or datetime (live)
income       = anchor["ANNUAL_INCOME"] or 0   # may be None
client_cat   = anchor["CLIENT_CATEGORY"] or ""
postal_code  = anchor["POSTAL_CODE"]          # may be None

# Determinism
seed = seed_for(account_id, "claritas", run_ts)  # 32 bytes
rng  = random.Random(seed)

# 1. Life stage from age
def _age(bd, today):
    if bd is None: return 40  # safe fallback — won't happen for PERSON audience
    if isinstance(bd, str):
        bd = datetime.fromisoformat(bd.split("T")[0]).date()
    elif hasattr(bd, "date"):
        bd = bd.date()
    return (today - bd).days // 365

age = _age(birthdate, run_ts.date())
if age < 25:                       life_stage = "Gen Z"
elif age < 32 and rng.random() < 0.6: life_stage = "Young Singles"
elif age < 38:                     life_stage = "Young Couples"
elif age < 50:                     life_stage = "Young Families" if rng.random() < 0.65 else "Established Families"
elif age < 60:                     life_stage = "Established Families" if rng.random() < 0.6 else "Empty Nesters"
elif age < 70:                     life_stage = "Empty Nesters"
else:                              life_stage = "Retirees"

# 2. PRIZM segment — biased by income × life_stage × urbanicity
def _urbanicity_from_zip(zip_code, rng):
    if not zip_code: return rng.choice(["Suburban", "Town", "Rural"])  # missing-ZIP heuristic
    first = zip_code[0]
    # Rough US convention: 0/1/2 = NE/Mid-Atlantic urban, 9 = California urban,
    # 5/6/7 = Plains/South largely rural-leaning. Hand-tuned, not real Esri data.
    if first in ("0", "1", "9"):
        return rng.choices(["Urban", "Suburban", "Town"], weights=[0.5, 0.35, 0.15])[0]
    if first in ("2", "3", "8"):
        return rng.choices(["Urban", "Suburban", "Town"], weights=[0.3, 0.5, 0.2])[0]
    return rng.choices(["Suburban", "Town", "Rural"], weights=[0.4, 0.4, 0.2])[0]

urbanicity = _urbanicity_from_zip(postal_code, rng)

# Choose a PRIZM segment from a candidate pool weighted by anchor signal
def _prizm_pool(income, life_stage, urbanicity, client_cat):
    pool = []
    # Wealth-biased segments
    if income >= 250_000 or client_cat == "Wealth Management":
        pool.extend([("UC", "Upper Crust", "Affluent Empty Nests"),
                     ("MB", "Money & Brains", "Affluent Empty Nests"),
                     ("MS", "Movers & Shakers", "Established Families")])
    if income >= 150_000:
        pool.extend([("YA", "Young Achievers", "Affluent Pre-Family"),
                     ("PP", "Pools & Patios", "Established Families"),
                     ("BB", "Beltway Boomers", "Empty Nesters")])
    if 50_000 <= income < 150_000:
        pool.extend([("CR", "City Roots", "Urban Singles"),
                     ("CD", "Cosmopolitan Domesticity", "Young Couples"),
                     ("MT", "Multi-Cultural Talent", "Young Families")])
    if income < 50_000:
        pool.extend([("SS", "Striving Singles", "Young Singles"),
                     ("HR", "Hometown Retired", "Retirees")])
    # Rural overlay
    if urbanicity == "Rural":
        pool.append(("FS", "Farms & Suburbs", "Town/Rural Families"))
    # Life-stage overlay (so retirees don't end up "Young Achievers")
    if life_stage == "Retirees":
        pool = [p for p in pool if p[2] in ("Affluent Empty Nests", "Empty Nesters", "Retirees", "Town/Rural Families")] or pool
    return pool or [("CR", "City Roots", "Urban Singles")]   # always have a fallback

code, name, group = rng.choice(_prizm_pool(income, life_stage, urbanicity, client_cat))

# 3. Household composition
hh_pool = {
    "Gen Z":               [("Single", 0.55), ("Roommates", 0.35), ("Family with Children", 0.10)],
    "Young Singles":       [("Single", 0.70), ("Roommates", 0.25), ("Couple", 0.05)],
    "Young Couples":       [("Couple", 0.70), ("Family with Children", 0.20), ("Single", 0.10)],
    "Young Families":      [("Family with Children", 0.85), ("Couple", 0.10), ("Multi-Generational", 0.05)],
    "Established Families":[("Family with Children", 0.60), ("Couple", 0.25), ("Multi-Generational", 0.15)],
    "Empty Nesters":       [("Couple", 0.70), ("Single", 0.20), ("Multi-Generational", 0.10)],
    "Retirees":            [("Couple", 0.55), ("Single", 0.40), ("Multi-Generational", 0.05)],
}
choices, weights = zip(*[(c, w) for c, w in hh_pool[life_stage]])
household = rng.choices(choices, weights=weights)[0]

# 4. Estimated net worth band — biased by income + client_category
def _net_worth(income, client_cat, rng):
    base_idx = 0
    if income >= 1_000_000: base_idx = 4
    elif income >= 250_000: base_idx = 3
    elif income >= 100_000: base_idx = 2
    elif income >=  50_000: base_idx = 1
    if client_cat == "Wealth Management": base_idx = max(base_idx, 3)
    # Add some lognormal noise (people with high income often have higher accumulated wealth than income alone implies)
    base_idx += rng.choices([0, 0, 1, -1], weights=[0.5, 0.25, 0.15, 0.1])[0]
    base_idx = max(0, min(4, base_idx))
    return ["<$50K", "$50K-$250K", "$250K-$1M", "$1M-$5M", "$5M+"][base_idx]

net_worth = _net_worth(income, client_cat, rng)

# 5. Propensity scores (0-100) — biased by anchor signal, ±10 jitter
def _wealth_propensity(income, age):
    base = min(100, 5 + (income / 5_000))  # $500K → 100
    if 45 <= age <= 65: base += 10           # peak accumulation years
    return round(max(0, min(100, base + (rng.random() - 0.5) * 20)), 2)

def _investment_propensity(income, life_stage):
    base = min(100, 10 + (income / 4_000))
    if life_stage in ("Empty Nesters", "Retirees", "Established Families"): base += 15
    return round(max(0, min(100, base + (rng.random() - 0.5) * 20)), 2)

def _mortgage_propensity(life_stage, client_cat):
    base = {"Young Couples": 65, "Young Families": 80, "Established Families": 50,
            "Empty Nesters": 25, "Retirees": 5, "Young Singles": 30, "Gen Z": 15}.get(life_stage, 30)
    if client_cat == "Wealth Management": base -= 10  # already own homes
    return round(max(0, min(100, base + (rng.random() - 0.5) * 20)), 2)

wealth_prop     = _wealth_propensity(income, age)
investment_prop = _investment_propensity(income, life_stage)
mortgage_prop   = _mortgage_propensity(life_stage, client_cat)

# 6. Financial stress indicator — inverse of income, but capped low for Wealth
def _stress(income, client_cat, rng):
    if client_cat == "Wealth Management" or income >= 250_000:
        return rng.choices(["Low", "Moderate"], weights=[0.85, 0.15])[0]
    if income >= 75_000:
        return rng.choices(["Low", "Moderate", "High"], weights=[0.6, 0.3, 0.1])[0]
    if income >= 35_000:
        return rng.choices(["Low", "Moderate", "High"], weights=[0.3, 0.5, 0.2])[0]
    return rng.choices(["Low", "Moderate", "High"], weights=[0.1, 0.4, 0.5])[0]

stress = _stress(income, client_cat, rng)

return {
    "ACCOUNT_ID":                 account_id,
    "PROFILE_MONTH":              run_ts.replace(day=1).date(),
    "PRIZM_SEGMENT_CODE":         code,
    "PRIZM_SEGMENT_NAME":         name,
    "PRIZM_LIFESTYLE_GROUP":      group,
    "LIFE_STAGE":                 life_stage,
    "HOUSEHOLD_COMPOSITION":      household,
    "ESTIMATED_NET_WORTH_BAND":   net_worth,
    "WEALTH_PROPENSITY_SCORE":    wealth_prop,
    "INVESTMENT_PROPENSITY_SCORE":investment_prop,
    "MORTGAGE_PROPENSITY_SCORE":  mortgage_prop,
    "URBANICITY":                 urbanicity,
    "FINANCIAL_STRESS_INDICATOR": stress,
    "GENERATED_AT":               run_ts,
}
```

## Boring case (must still emit)

A "boring" anchor — Retail PERSON, age 35, income $55K, suburban ZIP — produces a row with PRIZM segment from `{CR, CD, MT}`, life stage "Young Couples" or "Young Families", net-worth band "$50K-$250K", propensity scores in the 40-60 range, financial stress "Low" or "Moderate". **No anchor is dropped from the output.**

## Anchor-influence test target (template L1 property #4)

The test in the template's `test_<dataset>_row_factory.py` uses `BIAS_AXIS_FN = ANNUAL_INCOME` and `OUTPUT_FIELD_TO_CHECK = "PRIZM_SEGMENT_CODE"`:
- Low income (`< 50_000`) anchors should produce a distribution dominated by `SS, HR, MT` (no `UC, MB, YA`).
- High income (`≥ 250_000`) anchors should produce a distribution dominated by `UC, MB, MS, PP` (no `SS`).
- The two distributions must not be identical — that's the canonical "row factory ignored its anchor" detector.

## Cadence

Monthly. CRON: `'USING CRON 0 7 1 * * UTC'` (1st of month, 07:00 UTC). Idempotent re-runs same month replace.

## Volume

~25,400 rows/month (one row per PERSON anchor; current V_ACCOUNT_ANCHORS shows 25,424 PERSON rows). 1-year backfill = ~305K rows; steady state 25K/month is well within free-tier compute headroom.

## Out of scope

- **Real Claritas PRIZM Premier mapping.** Our 12-segment subset is a recognisable cover, not a license-grade dataset.
- **Behavioral attribution** (which products people will buy). That's the propensity scores' job; deeper behavioral work is the relationship graph dataset (Plan 9).
- **Time-varying segments.** A given account's PRIZM segment may flip month-to-month with the seed roll; that's intentional (random walk simulating life changes), not a stability requirement.
