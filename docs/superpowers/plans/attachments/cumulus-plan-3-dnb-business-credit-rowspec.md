# Plan 3 — D&B Business Credit rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §8 (Dun & Bradstreet / Experian Business / RapidRatings) + the live anchor fields available for BUSINESS accounts.

## Mimics

**Dun & Bradstreet (D&B) Hoovers + Risk Suite** — corporate identity (D-U-N-S), payment behavior (PAYDEX), financial strength, failure risk, corporate hierarchy. Real D&B publishes ~30 distinct fields per business; we mirror 14 that hit the demo's "commercial banker copilot" use case. Letter ratings combine the financial-strength tier (5A/4A/3A/2A/1A/BA/BB/CB/CC/DC/DD) with composite risk (1/2/3/4) per the canonical D&B Rating system (`<tier><composite>`, e.g. `5A1`).

## Audience

`ACCOUNT_TYPE_FLAG = 'BUSINESS'`. Same v1.2 over-count caveat as Plan 2 — SP warns when `accounts_processed > 10000`.

## Table: `FINS.PUBLIC.DNB_BUSINESS_CREDIT`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month of run timestamp |
| `DUNS_NUMBER` | VARCHAR(9) | NOT NULL | Deterministic 9-digit string from HASH(account_id, "duns"). Stable across months for the same account. |
| `DNB_RATING` | VARCHAR(4) | NOT NULL | `<tier><composite>` e.g. `5A1`, `BA3`. 11 tiers × 4 composites = 44 valid values. |
| `FINANCIAL_STRENGTH_TIER` | VARCHAR(2) | NOT NULL | One of 11 tiers: `5A` $50M+ net worth → `DD` <$5K. Biased by ANNUAL_REVENUE. |
| `COMPOSITE_RISK_SCORE` | NUMBER(2,0) | NOT NULL | 1=lowest risk, 4=highest. The `<composite>` digit of DNB_RATING. |
| `PAYDEX_SCORE` | NUMBER(3,0) | NOT NULL | 0-100. 80=pays as agreed; 100=30 days early; 20=120+ days late. Industry-biased. |
| `AVERAGE_DAYS_BEYOND_TERMS` | NUMBER(4,0) | NOT NULL | 0-180. Inverse correlate of PAYDEX (~`(80 - PAYDEX) * 1.5` plus jitter). |
| `FAILURE_RISK_SCORE` | NUMBER(3,0) | NOT NULL | 1-100. 1=very high probability of business failure; 100=very low. Industry + revenue biased. |
| `DELINQUENCY_PREDICTOR_SCORE` | NUMBER(3,0) | NOT NULL | 1-100. 1=very high delinquency probability; 100=very low. Correlated with PAYDEX. |
| `SUPPLIER_RISK_LEVEL` | VARCHAR(10) | NOT NULL | `Low` / `Moderate` / `High` / `Severe`. Derived from FAILURE_RISK_SCORE bands. |
| `CORPORATE_FAMILY_SIZE` | NUMBER(5,0) | NOT NULL | Total entities in the corporate family (incl. self). 1=standalone (most SMBs), 2-5 typical mid-market, 50+ large enterprise. |
| `ULTIMATE_PARENT_DUNS` | VARCHAR(9) | NULL | NULL when CORPORATE_FAMILY_SIZE=1 (standalone). Otherwise a deterministic 9-digit DUNS for the parent. |
| `VERIFICATION_STATUS` | VARCHAR(20) | NOT NULL | `Verified` / `Probable` / `Unverified`. Most rows Verified; smaller firms more often Probable. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed (`datetime(run_ts.year, run_ts.month, 1)`) per Plan 1 GENERATED_AT precedent |

## Primary key

`(ACCOUNT_ID, PROFILE_MONTH)`. Re-runs same month replace.

## Financial Strength Tier ladder (11)

Real D&B tiers expressed as net-worth bands. We bias by `ANNUAL_REVENUE` since most accounts won't have a separate net-worth field; revenue is a usable proxy.

| Tier | Net worth band (real D&B) | Revenue proxy threshold | Distribution target |
|---|---|---|---|
| `5A` | $50M+ | revenue ≥ $500M | 1% |
| `4A` | $10M-$50M | revenue ≥ $100M | 4% |
| `3A` | $1M-$10M | revenue ≥ $25M | 10% |
| `2A` | $750K-$1M | revenue ≥ $10M | 12% |
| `1A` | $500K-$750K | revenue ≥ $5M | 14% |
| `BA` | $300K-$500K | revenue ≥ $2.5M | 14% |
| `BB` | $200K-$300K | revenue ≥ $1M | 12% |
| `CB` | $125K-$200K | revenue ≥ $500K | 10% |
| `CC` | $75K-$125K | revenue ≥ $250K | 9% |
| `DC` | $50K-$75K | revenue ≥ $100K | 8% |
| `DD` | <$50K | revenue < $100K | 6% |

The row factory derives the tier from `ANNUAL_REVENUE` directly (with ±1 tier jitter for variance), so distribution comes from the input revenue distribution, not a separate weighted draw.

## Composite Risk Score (1-4)

Real D&B publishes 1=Low risk → 4=High risk. We bias by tier (5A skews 1-2, DD skews 3-4) and add ±1 jitter:

| Tier-derived base | Composite distribution |
|---|---|
| `5A`, `4A` | 1 (60%) / 2 (35%) / 3 (5%) |
| `3A`, `2A`, `1A` | 1 (25%) / 2 (50%) / 3 (20%) / 4 (5%) |
| `BA`, `BB`, `CB` | 2 (30%) / 3 (45%) / 4 (25%) |
| `CC`, `DC`, `DD` | 2 (10%) / 3 (35%) / 4 (55%) |

## PAYDEX bias by industry

Real D&B PAYDEX scores cluster around 75-85 ("pays as agreed"); industry conventions push some sectors toward late-payment behavior.

| Industry | PAYDEX base (mean) | Industry note |
|---|---|---|
| `Finance`, `Banking` | 88 | Punctual; high PAYDEX. |
| `Healthcare` | 84 | Generally punctual. |
| `Tech`, `Software` | 82 | Standard B2B terms. |
| `Real Estate` | 75 | Project-based delays common. |
| `Manufacturing`, `Industrial` | 75 | Supplier-network pressure pulls down. |
| `Retail`, `Consumer`, `Food & Beverage` | 70 | Seasonality, cash-flow squeezes. |
| `Construction` | 65 | Notoriously slow-paying industry. |
| `Energy`, `Mining` | 78 | Variable. |
| `Personal Services` (default) | 78 | |

Per-row PAYDEX = `clamp(0, 100, base + size_bonus + rng_jitter)` where:
- `size_bonus = +5` if `revenue ≥ $100M`, `+2` if `≥ $10M`, `0` otherwise.
- `rng_jitter = (rng.random() - 0.5) * 20` (±10).

## Failure Risk Score

Real D&B failure risk: 1 = imminent failure likely, 100 = stable. Bias by tier + industry + age proxy. We don't have business age, so use revenue + industry as proxies for stability:

```
base = 50
if tier in (5A, 4A, 3A): base = 85
elif tier in (2A, 1A, BA): base = 75
elif tier in (BB, CB, CC): base = 60
elif tier in (DC, DD): base = 40

# Industry adjustments (real D&B bakes in NAICS-level failure rates)
if industry == "Construction": base -= 15
elif industry in ("Real Estate", "Retail", "Food & Beverage"): base -= 8
elif industry in ("Manufacturing", "Industrial"): base -= 3
elif industry in ("Healthcare", "Finance", "Banking", "Tech", "Software"): base += 5

failure_risk = clamp(1, 100, base + (rng.random() - 0.5) * 20)
```

## Supplier Risk Level

Derived from FAILURE_RISK_SCORE:
- ≥ 80 → `Low`
- 60-79 → `Moderate`
- 30-59 → `High`
- < 30 → `Severe`

## Delinquency Predictor Score

Highly correlated with PAYDEX (PAYDEX measures past payment; delinquency predicts future):
```
delinquency = clamp(1, 100, paydex + (rng.random() - 0.5) * 20 - 5)
```
The `-5` constant biases delinquency slightly worse than PAYDEX, since "future likelihood" is a stricter prediction than "past behavior".

## Average Days Beyond Terms

Inverse PAYDEX:
```
avg_dbt = max(0, round((80 - paydex) * 1.5 + (rng.random() - 0.5) * 10))
```
PAYDEX 80 → 0 days. PAYDEX 60 → ~30 days. PAYDEX 20 → ~90 days.

## Corporate Family Size

Most accounts are standalone (`size=1`). Bias by revenue: larger firms have more subsidiaries.

| Revenue band | size distribution |
|---|---|
| `< $5M` | 1 (95%) / 2 (4%) / 3 (1%) |
| `$5M-$50M` | 1 (75%) / 2 (15%) / 3-5 (10%) |
| `$50M-$200M` | 1 (35%) / 2-5 (45%) / 6-15 (15%) / 16-50 (5%) |
| `≥ $200M` | 1 (10%) / 2-5 (25%) / 6-20 (35%) / 21-100 (25%) / 100+ (5%) |

When `size=1`, `ULTIMATE_PARENT_DUNS` is NULL. When `size>1`, generate a deterministic parent DUNS:
```
parent_seed = seed_for(account_id + "_parent", "dnb", run_ts)
parent_duns = _duns_from_bytes(parent_seed)  # same 9-digit derivation as the account's DUNS
```

## Verification Status

Real D&B distinguishes between fully-verified businesses and shadow/probable records:
- `revenue ≥ $1M` and `tier ∈ {5A,4A,3A,2A,1A,BA,BB}` → 95% Verified, 5% Probable
- `revenue < $1M` or `tier ∈ {CB,CC,DC,DD}` → 70% Verified, 25% Probable, 5% Unverified
- Always include some Unverified to exercise downstream filters

## DUNS Number derivation

D-U-N-S is a 9-digit unique business identifier. Real DUNS allocation is centralized; ours is deterministic from `seed_for(account_id, "duns_id", anchor_run_ts_year=2026)`:

```python
def _duns_from_bytes(seed_bytes: bytes) -> str:
    # First 4 bytes → integer mod 10^9 → zero-pad to 9 digits.
    # Stable across months because the seed only includes year, not month-bucket.
    n = int.from_bytes(seed_bytes[:4], "big") % 1_000_000_000
    return f"{n:09d}"
```

**Stability across months:** unlike most fields, DUNS must NOT change month-to-month for the same account (real DUNS are permanent). Use `seed_for(account_id, "duns_id", datetime(run_ts.year, 1, 1))` so the year (not month) determines the seed. New calendar year is allowed to roll a new DUNS — that's an intentional simplification, since real DUNS are permanent for life but our demo doesn't need that strict.

## Bias logic for `_row_for` (skeleton)

```python
import random
import hashlib

# Anchor extraction
account_id = anchor["ACCOUNT_ID"]
industry   = (anchor.get("INDUSTRY") or "").strip()
revenue    = float(anchor.get("ANNUAL_REVENUE") or 0)
employees  = int(anchor.get("EMPLOYEE_COUNT") or 0)

# Determinism
seed = seed_for(account_id, "dnb", run_ts)
rng  = random.Random(seed)

# 1. DUNS (year-stable, not month-stable)
duns_seed = seed_for(account_id, "duns_id", datetime(run_ts.year, 1, 1))
duns_number = _duns_from_bytes(duns_seed)

# 2. Financial strength tier
tier = _tier_from_revenue(revenue, rng)        # see ladder above; ±1 jitter

# 3. Composite risk
composite = _composite_from_tier(tier, rng)    # see weights above
dnb_rating = f"{tier}{composite}"

# 4. PAYDEX
paydex = _paydex(industry, revenue, rng)       # base + size_bonus + jitter, clamp 0-100

# 5. Average days beyond terms (inverse PAYDEX)
avg_dbt = max(0, round((80 - paydex) * 1.5 + (rng.random() - 0.5) * 10))

# 6. Failure risk
failure_risk = _failure_risk(tier, industry, rng)  # base by tier + industry adj + jitter

# 7. Supplier risk band
supplier_risk = _supplier_risk_band(failure_risk)

# 8. Delinquency predictor
delinquency = max(1, min(100, round(paydex + (rng.random() - 0.5) * 20 - 5)))

# 9. Corporate family size
family_size = _family_size(revenue, rng)

# 10. Ultimate parent DUNS
if family_size > 1:
    parent_seed = seed_for(account_id + "_parent", "duns_id", datetime(run_ts.year, 1, 1))
    parent_duns = _duns_from_bytes(parent_seed)
else:
    parent_duns = None

# 11. Verification status
verification = _verification_status(revenue, tier, rng)

return {
    "ACCOUNT_ID":                  account_id,
    "PROFILE_MONTH":               run_ts.replace(day=1).date(),
    "DUNS_NUMBER":                 duns_number,
    "DNB_RATING":                  dnb_rating,
    "FINANCIAL_STRENGTH_TIER":     tier,
    "COMPOSITE_RISK_SCORE":        composite,
    "PAYDEX_SCORE":                paydex,
    "AVERAGE_DAYS_BEYOND_TERMS":   avg_dbt,
    "FAILURE_RISK_SCORE":          failure_risk,
    "DELINQUENCY_PREDICTOR_SCORE": delinquency,
    "SUPPLIER_RISK_LEVEL":         supplier_risk,
    "CORPORATE_FAMILY_SIZE":       family_size,
    "ULTIMATE_PARENT_DUNS":        parent_duns,
    "VERIFICATION_STATUS":         verification,
    "GENERATED_AT":                datetime(run_ts.year, run_ts.month, 1),
}
```

## Boring case (must still emit)

A "boring" anchor — Small Business, Personal Services, $500K revenue, 6 employees — produces:
- DUNS: 9-digit string
- Tier: `BB` or `CB` (revenue $500K range)
- Rating: e.g. `BB3`, `CB2`
- PAYDEX: ~75-80 (Personal Services default base 78)
- Failure risk: ~55-70 (mid-band)
- Supplier risk: `Moderate` or `High`
- Family size: 1
- Ultimate parent: NULL
- Verification: 70% Verified, 25% Probable, 5% Unverified

**No anchor is dropped from the output.**

## Anchor-influence test target (template L1 property #4)

Two assertions:
1. **Revenue → Financial Strength Tier distribution shifts.**
   - Low revenue (< $1M) → tiers cluster in `{CC, DC, DD, CB}`.
   - High revenue (≥ $100M) → tiers cluster in `{5A, 4A, 3A}`.
   - Distributions must not be identical.

2. **Industry → PAYDEX mean differs.**
   - Construction-industry anchors (or Retail/F&B) → mean PAYDEX < 73.
   - Finance/Banking/Healthcare anchors → mean PAYDEX > 82.
   - Gap ≥ 8 points (well above noise; real D&B industry differences are 10-20 points).

Tertiary check (#3): DUNS_NUMBER is stable across months for the same account, but ROLES across years. Test by computing the DUNS for `(account, 2026-01-01)` and `(account, 2026-12-01)` and asserting equality, then for `(account, 2027-01-01)` and asserting inequality with the 2026 value.

## Cadence

Monthly. CRON: `'USING CRON 0 7 1 * * UTC'`. Idempotent re-runs same month replace.

## Volume

~12K rows/month at the current ACCOUNT_TYPE_FLAG=BUSINESS cardinality (per Plan 0). Same over-count caveat as Plan 2.

## Out of scope

- **Real D&B license / live D-U-N-S allocation.** Our 9-digit derivation is recognisable but not registered with D&B.
- **PAYDEX history / weighted average.** Real D&B PAYDEX is a 12-month weighted score; ours is a single point-in-time draw.
- **Trade payment data** (the underlying invoice records that feed PAYDEX). That'd be a separate dataset (e.g., a hypothetical "Cumulus Trade Receivables" table); out of scope for Plan 3.
- **D&B Decision Tools / Risk Suite predictions.** Failure risk + delinquency are surface scores only; no expanded decision tree.
- **Corporate hierarchy traversal.** ULTIMATE_PARENT_DUNS gives one level; multi-level hierarchies (`global ultimate` → `domestic ultimate` → `parent` → `subsidiary`) are out of scope.
