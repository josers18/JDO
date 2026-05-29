# Plan 2 — MSCI ESG Scores rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §12 (MSCI ESG / Sustainalytics) + the live anchor fields available for BUSINESS accounts in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.

## Mimics

**MSCI ESG Ratings** — environmental / social / governance scores for businesses. Real MSCI ESG: AAA / AA / A / BBB / BB / B / CCC letter grades plus per-pillar (E/S/G) numeric scores 0-10 and exposure scores 0-10. We mirror the letter-grade system, the three pillar scores, and an industry-relative classification (Leader / Average / Laggard).

## Audience

`ACCOUNT_TYPE_FLAG = 'BUSINESS'` — ESG ratings are organizational, not individual.

**Cardinality caveat (spec §3 v1.2 finding #3):** the org currently classifies ~12K accounts as BUSINESS, but a sizeable share are likely Person Accounts with NULL `PersonBirthdate__c`. CRM-level expected BUSINESS cardinality is closer to 5K. The SP should warn (not fail) when `accounts_processed > 10000`, suggesting upstream backfill investigation.

## Table: `FINS.PUBLIC.MSCI_ESG_SCORES`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID — Salesforce ssot__Id__c |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp |
| `MSCI_ESG_RATING` | VARCHAR(8) | NOT NULL | One of: `AAA`, `AA`, `A`, `BBB`, `BB`, `B`, `CCC` |
| `INDUSTRY_CLASSIFICATION` | VARCHAR(20) | NOT NULL | One of: `Leader`, `Average`, `Laggard` (relative to industry peers) |
| `ESG_SCORE_OVERALL` | NUMBER(4,2) | NOT NULL | 0.00-10.00, biased by the letter rating |
| `ENVIRONMENTAL_SCORE` | NUMBER(4,2) | NOT NULL | 0.00-10.00, biased by INDUSTRY (lower for Energy/Mining/Manufacturing) |
| `SOCIAL_SCORE` | NUMBER(4,2) | NOT NULL | 0.00-10.00, slight bias by EMPLOYEE_COUNT (larger employers have more S exposure) |
| `GOVERNANCE_SCORE` | NUMBER(4,2) | NOT NULL | 0.00-10.00, biased by ANNUAL_REVENUE band (larger firms = better-resourced governance) |
| `CARBON_INTENSITY_TONS_PER_M_REVENUE` | NUMBER(8,2) | NOT NULL | 0.00-2000.00. Heavy industries → high; tech/services → low |
| `CONTROVERSY_FLAG_COUNT` | NUMBER(3,0) | NOT NULL | 0-15 active controversy flags. Most firms 0-2; Laggards skew higher |
| `TOP_CONTROVERSY_CATEGORY` | VARCHAR(40) | NULL | NULL when CONTROVERSY_FLAG_COUNT=0; otherwise one of: `Environmental Impact`, `Labor Practices`, `Customer`, `Governance`, `Human Rights`, `Product Safety`, `Supply Chain` |
| `MATERIALITY_TAGS` | VARCHAR(200) | NOT NULL | Comma-separated industry-material ESG topics, e.g. `"Climate Risk,Resource Use,Health & Safety"` (2-4 tags from a 12-tag pool, biased by industry) |
| `LAST_RATING_CHANGE_DIRECTION` | VARCHAR(10) | NOT NULL | `Upgrade`, `Downgrade`, `Unchanged` (most firms unchanged month-to-month) |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed (`datetime(run_ts.year, run_ts.month, 1)`) so mid-month re-runs are byte-identical, per Plan 1 GENERATED_AT precedent |

## Primary key

`(ACCOUNT_ID, PROFILE_MONTH)` — one row per business account per month. Re-running mid-month replaces.

## MSCI letter-grade pool (7)

| Rating | Quality | Distribution target | Industry-classification skew |
|---|---|---|---|
| `AAA` | Best | 5% | Leader |
| `AA`  | Excellent | 10% | Leader / Average |
| `A`   | Good | 18% | Average |
| `BBB` | Average | 25% | Average |
| `BB`  | Below average | 22% | Average / Laggard |
| `B`   | Weak | 13% | Laggard |
| `CCC` | Worst | 7% | Laggard |

These weights drive the canonical `_rating_pool` choice; per-account variation comes from anchor signal (industry, revenue, employee count) shifting the weights.

## Industry → ESG-pillar bias

| Industry | E_score base | S_score base | G_score base | Carbon intensity range |
|---|---|---|---|---|
| `Energy` / `Mining` / `Oil & Gas` | 3.5 | 5.5 | 6.0 | 800-2000 |
| `Manufacturing` / `Industrial` | 4.5 | 6.0 | 6.5 | 300-900 |
| `Real Estate` / `Construction` | 5.0 | 5.5 | 6.5 | 200-600 |
| `Retail` / `Consumer` / `Food & Beverage` | 5.5 | 6.0 | 6.0 | 80-300 |
| `Healthcare` | 6.5 | 7.0 | 7.0 | 50-200 |
| `Finance` / `Banking` | 7.0 | 6.5 | 7.5 | 20-100 |
| `Tech` / `Software` / `Information Technology` | 7.5 | 7.0 | 7.5 | 10-80 |
| `Personal Services` (default) | 6.0 | 6.5 | 6.5 | 50-200 |

(Bases are mid-band; per-row variance ±1.5 from rng + ±0.5 from rating.)

## Materiality tag pool (12)

`Climate Risk`, `Resource Use`, `Pollution & Waste`, `Health & Safety`, `Labor Practices`, `Human Capital`, `Product Safety`, `Data Privacy`, `Supply Chain`, `Business Ethics`, `Board Diversity`, `Tax Transparency`.

Each industry biases toward 4-6 of these; the row factory picks 2-4 deterministically per account.

## Bias logic for `_row_for`

```python
import random
from datetime import datetime

# Anchor extraction
account_id   = anchor["ACCOUNT_ID"]
industry     = (anchor.get("INDUSTRY") or "").strip()
revenue      = float(anchor.get("ANNUAL_REVENUE") or 0)
employees    = int(anchor.get("EMPLOYEE_COUNT") or 0)
client_cat   = anchor.get("CLIENT_CATEGORY") or ""

# Determinism
seed = seed_for(account_id, "msci", run_ts)
rng  = random.Random(seed)

# 1. Letter rating — biased by revenue (larger firms have more resources for ESG programs)
def _rating_weights(revenue, industry, rng):
    base = [5, 10, 18, 25, 22, 13, 7]  # AAA..CCC default
    # Larger firms: tilt toward A/AA
    if revenue >= 100_000_000:
        return [w + delta for w, delta in zip(base, [3, 5, 4, 0, -3, -4, -5])]
    if revenue >= 10_000_000:
        return [w + delta for w, delta in zip(base, [1, 2, 2, 0, -1, -2, -2])]
    # SMB: tilt toward BBB/BB
    if revenue < 1_000_000:
        return [w + delta for w, delta in zip(base, [-3, -5, -3, 5, 5, 3, -2])]
    return base

ratings = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"]
weights = _rating_weights(revenue, industry, rng)
# Clamp negative weights so rng.choices is happy
weights = [max(1, w) for w in weights]
rating = rng.choices(ratings, weights=weights)[0]

# 2. Industry classification (Leader/Average/Laggard) — biased by rating
def _industry_class(rating, rng):
    if rating in ("AAA", "AA"):
        return rng.choices(["Leader", "Average"], weights=[0.75, 0.25])[0]
    if rating in ("A", "BBB"):
        return rng.choices(["Leader", "Average", "Laggard"], weights=[0.15, 0.7, 0.15])[0]
    if rating == "BB":
        return rng.choices(["Average", "Laggard"], weights=[0.55, 0.45])[0]
    return rng.choices(["Average", "Laggard"], weights=[0.2, 0.8])[0]

industry_class = _industry_class(rating, rng)

# 3. Pillar scores — base by industry + adjustment by rating + per-row jitter
_INDUSTRY_BASES = {
    "Energy": (3.5, 5.5, 6.0, 800, 2000),
    "Mining": (3.5, 5.5, 6.0, 800, 2000),
    "Oil & Gas": (3.5, 5.5, 6.0, 800, 2000),
    "Manufacturing": (4.5, 6.0, 6.5, 300, 900),
    "Industrial": (4.5, 6.0, 6.5, 300, 900),
    "Real Estate": (5.0, 5.5, 6.5, 200, 600),
    "Construction": (5.0, 5.5, 6.5, 200, 600),
    "Retail": (5.5, 6.0, 6.0, 80, 300),
    "Consumer": (5.5, 6.0, 6.0, 80, 300),
    "Food & Beverage": (5.5, 6.0, 6.0, 80, 300),
    "Healthcare": (6.5, 7.0, 7.0, 50, 200),
    "Finance": (7.0, 6.5, 7.5, 20, 100),
    "Banking": (7.0, 6.5, 7.5, 20, 100),
    "Tech": (7.5, 7.0, 7.5, 10, 80),
    "Software": (7.5, 7.0, 7.5, 10, 80),
    "Information Technology": (7.5, 7.0, 7.5, 10, 80),
}
_DEFAULT_BASE = (6.0, 6.5, 6.5, 50, 200)

def _industry_base(industry):
    # Substring match — INDUSTRY values from the share are not normalized
    for key, base in _INDUSTRY_BASES.items():
        if key.lower() in industry.lower():
            return base
    return _DEFAULT_BASE

def _rating_adj(rating):
    # AAA → +1.5; CCC → -2.0
    return {"AAA": 1.5, "AA": 1.0, "A": 0.5, "BBB": 0.0, "BB": -0.7, "B": -1.3, "CCC": -2.0}[rating]

e_base, s_base, g_base, c_low, c_high = _industry_base(industry)
adj = _rating_adj(rating)

def _clamp_score(x):
    return round(max(0.0, min(10.0, x)), 2)

env_score   = _clamp_score(e_base + adj + (rng.random() - 0.5) * 1.5)
soc_score   = _clamp_score(s_base + adj + (rng.random() - 0.5) * 1.5
                           + (0.3 if employees >= 500 else 0.0))
gov_score   = _clamp_score(g_base + adj + (rng.random() - 0.5) * 1.5
                           + (0.5 if revenue >= 100_000_000 else 0.0))
overall     = _clamp_score((env_score + soc_score + gov_score) / 3
                           + (rng.random() - 0.5) * 0.4)

# 4. Carbon intensity — industry-bounded with rating modulation
carbon = round(rng.uniform(c_low, c_high) * (1.3 if rating == "CCC" else 1.0 if rating == "BBB" else 0.7 if rating in ("AAA", "AA") else 1.0), 2)

# 5. Controversy flags — Laggards have more, Leaders close to 0
def _controversy_count(industry_class, rng):
    if industry_class == "Leader":
        return rng.choices([0, 1], weights=[0.85, 0.15])[0]
    if industry_class == "Average":
        return rng.choices([0, 1, 2, 3], weights=[0.45, 0.3, 0.15, 0.1])[0]
    return rng.choices([1, 2, 3, 5, 8, 12], weights=[0.25, 0.25, 0.2, 0.15, 0.1, 0.05])[0]

controversy_count = _controversy_count(industry_class, rng)

_CONTROVERSY_CATEGORIES = [
    "Environmental Impact", "Labor Practices", "Customer", "Governance",
    "Human Rights", "Product Safety", "Supply Chain",
]
top_controversy = (
    rng.choice(_CONTROVERSY_CATEGORIES) if controversy_count > 0 else None
)

# 6. Materiality tags — 2-4 industry-relevant
_INDUSTRY_TAG_POOLS = {
    "Energy": ["Climate Risk", "Resource Use", "Pollution & Waste", "Health & Safety", "Business Ethics"],
    "Manufacturing": ["Resource Use", "Pollution & Waste", "Health & Safety", "Supply Chain", "Labor Practices"],
    "Real Estate": ["Climate Risk", "Resource Use", "Health & Safety", "Business Ethics"],
    "Retail": ["Supply Chain", "Labor Practices", "Product Safety", "Data Privacy", "Human Capital"],
    "Healthcare": ["Product Safety", "Data Privacy", "Health & Safety", "Human Capital", "Business Ethics"],
    "Finance": ["Data Privacy", "Business Ethics", "Tax Transparency", "Board Diversity", "Human Capital"],
    "Tech": ["Data Privacy", "Human Capital", "Product Safety", "Business Ethics", "Board Diversity"],
}
_DEFAULT_TAG_POOL = ["Business Ethics", "Human Capital", "Labor Practices", "Health & Safety"]

def _tag_pool(industry):
    for key, pool in _INDUSTRY_TAG_POOLS.items():
        if key.lower() in industry.lower():
            return pool
    return _DEFAULT_TAG_POOL

pool = _tag_pool(industry)
tag_count = rng.choices([2, 3, 4], weights=[0.3, 0.5, 0.2])[0]
tags = sorted(rng.sample(pool, k=min(tag_count, len(pool))))
materiality = ",".join(tags)

# 7. Rating change — most firms unchanged
last_change = rng.choices(
    ["Upgrade", "Downgrade", "Unchanged"],
    weights=[0.08, 0.07, 0.85],
)[0]

return {
    "ACCOUNT_ID":                            account_id,
    "PROFILE_MONTH":                         run_ts.replace(day=1).date(),
    "MSCI_ESG_RATING":                       rating,
    "INDUSTRY_CLASSIFICATION":               industry_class,
    "ESG_SCORE_OVERALL":                     overall,
    "ENVIRONMENTAL_SCORE":                   env_score,
    "SOCIAL_SCORE":                          soc_score,
    "GOVERNANCE_SCORE":                      gov_score,
    "CARBON_INTENSITY_TONS_PER_M_REVENUE":   carbon,
    "CONTROVERSY_FLAG_COUNT":                controversy_count,
    "TOP_CONTROVERSY_CATEGORY":              top_controversy,
    "MATERIALITY_TAGS":                      materiality,
    "LAST_RATING_CHANGE_DIRECTION":          last_change,
    "GENERATED_AT":                          datetime(run_ts.year, run_ts.month, 1),
}
```

## Boring case (must still emit)

A "boring" anchor — Small Business, Personal Services industry, $500K revenue, 6 employees — produces a row with rating in `{BBB, BB, B}`, industry_class = `Average`, pillar scores 4-7, controversy count 0-2, materiality tags from the default pool. **No anchor is dropped.**

## Anchor-influence test target (template L1 property #4)

`BIAS_AXIS_FN = ANNUAL_REVENUE`, `OUTPUT_FIELD_TO_CHECK = "MSCI_ESG_RATING"`:
- Low-revenue (<$1M) anchors → distribution dominated by `BBB, BB, B, CCC`.
- High-revenue (≥$100M) anchors → distribution shifted toward `AAA, AA, A`.
- Leader proportion (`INDUSTRY_CLASSIFICATION = 'Leader'`) higher in high-revenue cohort.
- Distributions must not be identical.

Secondary anchor-influence target: `INDUSTRY` → `ENVIRONMENTAL_SCORE` correlation. Tech / Finance industries should have mean E_score > 6.5; Energy / Mining / Manufacturing should have mean E_score < 5.5. The L1 test asserts both means with multi-month roll for stability.

## Cadence

Monthly. CRON: `'USING CRON 0 7 1 * * UTC'` (matches Claritas — same monthly slot at 07:00 UTC). Idempotent re-runs same month replace.

## Volume

~12,021 rows/month at the current ACCOUNT_TYPE_FLAG=BUSINESS cardinality (per Plan 0 verification). Real CRM BUSINESS count is closer to 5K; the over-count flag from spec §3 v1.2 finding #3 means the SP should warn if `accounts_processed > 10000`.

## Out of scope

- Real MSCI ESG license / proprietary scoring model. Our 7-letter + 3-pillar structure is a recognisable cover, not a license-grade dataset.
- Time-series rating change history beyond `LAST_RATING_CHANGE_DIRECTION`. A given account's rating may flip month-over-month with the seed roll; that's intentional (random walk simulating real rating dynamics). If sticky ratings become demo-relevant, that's a v1.x addition.
- Climate scenario analysis, transition risk modeling, financed-emissions scoring. All are real MSCI products but not in this dataset.
- Per-pillar exposure scores (real MSCI publishes both "score" and "exposure" 0-10 per pillar). We collapse to one score per pillar.
