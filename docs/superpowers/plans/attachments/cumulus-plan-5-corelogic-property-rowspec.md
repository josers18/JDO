# Plan 5 — CoreLogic Property rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §14 (CoreLogic / Black Knight / Zillow) + the live anchor fields available for PERSON accounts in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.

## Mimics

**CoreLogic Property Insights** — property-level ownership records (deeds), tax assessments, valuation estimates (AVM), mortgage status, flood/fire risk. Real CoreLogic publishes 80+ fields per property and a hierarchy (parcel → lot → improvement). We mirror 14 that hit the demo's "mortgage targeting" + "HELOC opportunity" + "flood risk" use cases. **Owner-status is a first-class field** so non-owners (renters) appear with `IS_OWNER=false`, keeping the audience simple (no audience-side filter on owner-status).

## Audience

`ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''`

The `<> ''` is the **v1.5 defensive predicate** discovered in Plan 4 — V_ACCOUNT_ANCHORS POSTAL_CODE includes empty strings alongside real ZIPs and NULLs. **Live audience: 25,424 PERSON anchors** (probed 2026-05-28). All PERSON rows happen to have valid POSTAL_CODE, so adding the ZIP predicate is a defensive guard, not an active filter.

## Table: `FINS.PUBLIC.CORELOGIC_PROPERTY`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID |
| `PROFILE_QUARTER` | DATE | NOT NULL | First-of-quarter for the run timestamp (Jan/Apr/Jul/Oct 1st). Quarter-bucketed determinism. |
| `IS_OWNER` | BOOLEAN | NOT NULL | true = property owner; false = renter. Biased by life stage + income. **All other "property fields" below are NULL when IS_OWNER=false.** |
| `PRIMARY_PROPERTY_TYPE` | VARCHAR(30) | NULL | One of: `Single Family`, `Condo`, `Townhouse`, `Multi-Family`, `Manufactured Home`, `Vacant Land`. NULL when IS_OWNER=false. |
| `ESTIMATED_PROPERTY_VALUE` | NUMBER(12,0) | NULL | $50K-$10M, biased by ZIP median income. NULL when IS_OWNER=false. |
| `OUTSTANDING_MORTGAGE_BALANCE` | NUMBER(12,0) | NULL | $0-$8M. ~30% of owners are paid-off (balance=0). NULL when IS_OWNER=false. |
| `LOAN_TO_VALUE_PCT` | NUMBER(5,2) | NULL | 0-95%. Computed: `mortgage / value * 100`. NULL when IS_OWNER=false OR mortgage=0. |
| `EQUITY_USD` | NUMBER(12,0) | NULL | `value - mortgage`, never negative. NULL when IS_OWNER=false. |
| `MORTGAGE_RATE_PCT` | NUMBER(5,3) | NULL | 2.500-8.500%. Bimodal: pre-2022 owners cluster 2.75-4.5%; post-2022 cluster 6.0-8.5%. NULL when IS_OWNER=false OR mortgage=0. |
| `LIEN_COUNT` | NUMBER(2,0) | NOT NULL | 0-5 active liens. Most owners 0-1; non-owners 0. |
| `FLOOD_ZONE_CODE` | VARCHAR(8) | NOT NULL | FEMA zones: `X` (minimal), `B`, `C`, `AE`, `A`, `VE`, `V`. Biased by state (coastal states skew higher risk). |
| `WILDFIRE_RISK_SCORE` | NUMBER(3,0) | NOT NULL | 0-100. Biased by state (CA/AZ/CO/OR/MT high; NY/MA/IL low). |
| `LAST_TRANSFER_YEAR` | NUMBER(4,0) | NULL | 1980-2026 year of last deed transfer. NULL when IS_OWNER=false. |
| `HELOC_OPPORTUNITY_SCORE` | NUMBER(3,0) | NULL | 0-100. Biased by EQUITY_USD + LIEN_COUNT + LOAN_TO_VALUE_PCT. NULL when IS_OWNER=false. |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Quarter-bucketed (`datetime(run_ts.year, _quarter_start_month(run_ts.month), 1)`) so mid-quarter re-runs are byte-identical. |

## Primary key

`(ACCOUNT_ID, PROFILE_QUARTER)` — one row per PERSON account per quarter. Re-runs same quarter replace.

**Note:** unlike Plans 1-3 (`PROFILE_MONTH`), Plan 5 uses `PROFILE_QUARTER`. Both are DATE columns; the difference is just the bucketing function used to produce the date value.

## Owner ratio target

US homeownership ~65%; we bias by life stage + income to get a realistic cohort distribution:

| Life stage proxy | Owner probability |
|---|---|
| Age < 25 | 5% |
| Age 25-34 | 30% |
| Age 35-44 | 60% |
| Age 45-54 | 72% |
| Age 55-64 | 78% |
| Age 65+ | 80% |
| Wealth Management override | min owner_prob to 75% |

The age proxy comes from `BIRTHDATE`. Wealth-Management clients always lean owner-heavy regardless of age (because they're typically established).

Expected output: ~25,424 anchors × ~62% owner = **~15.7K owners + ~9.7K renters**. Most rows have IS_OWNER=true; renters are 9.7K rows with NULL property fields (still emitted — boring case rule).

## Property type bias

| Urbanicity proxy (ZIP first digit) | Distribution |
|---|---|
| Urban (0/1/9 prefix) | Condo 35%, Townhouse 25%, Single Family 30%, Multi-Family 10% |
| Suburban (2/3/8 prefix) | Single Family 75%, Townhouse 15%, Condo 8%, Multi-Family 2% |
| Rural (4-7 prefix) | Single Family 70%, Manufactured Home 18%, Multi-Family 8%, Vacant Land 4% |

## Estimated property value bias

```python
def _property_value(zip_code, income, rng):
    """ZIP first-digit + income → property value range."""
    base_zip_band = {
        # Urban / California / NE
        "0": (450_000, 1_200_000), "1": (400_000, 1_500_000), "9": (550_000, 1_800_000),
        # Mid-tier suburbs
        "2": (300_000, 700_000), "3": (250_000, 600_000), "8": (300_000, 800_000),
        # Plains / South / Midwest
        "4": (180_000, 450_000), "5": (170_000, 420_000),
        "6": (160_000, 400_000), "7": (200_000, 500_000),
    }
    low, high = base_zip_band.get(zip_code[0], (200_000, 500_000))
    # Income multiplier: high earners typically own more expensive properties
    income_mult = 1.0
    if income >= 250_000:
        income_mult = 2.0
    elif income >= 150_000:
        income_mult = 1.5
    elif income < 50_000:
        income_mult = 0.7
    val = round(rng.uniform(low, high) * income_mult)
    return min(10_000_000, max(50_000, val))
```

## Mortgage balance bias

About 30% of owners are paid-off (mortgage=0). The remaining 70% carry balances:

```python
def _mortgage_balance(property_value, age, rng):
    """0 with 30% probability, otherwise a fraction of property value."""
    # Older owners more likely paid off
    paid_off_prob = 0.30
    if age >= 65:
        paid_off_prob = 0.55
    elif age >= 55:
        paid_off_prob = 0.40
    if rng.random() < paid_off_prob:
        return 0
    # Active mortgage: 30-90% of value, biased by age (younger = higher LTV)
    if age < 35:
        ltv = rng.uniform(0.70, 0.95)
    elif age < 50:
        ltv = rng.uniform(0.50, 0.85)
    else:
        ltv = rng.uniform(0.20, 0.60)
    return round(property_value * ltv)
```

## Mortgage rate bias

Bimodal — split based on a deterministic "loan year":

```python
def _mortgage_rate(account_id, run_ts, rng):
    """Pre-2022 owners locked low rates; post-2022 owners face higher rates."""
    # Use year_anchor seed for stable rate (rate doesn't change quarter-to-quarter
    # for the same account — that's the point of fixed mortgages).
    year_anchor_seed = seed_for(account_id + "_loan_year", "corelogic", datetime(run_ts.year, 1, 1))
    year_rng = random.Random(year_anchor_seed)
    loan_year = year_rng.choices(range(2010, 2027), weights=[2,2,3,3,3,4,5,6,8,10,15,20,8,5,3,2,1])[0]
    if loan_year < 2022:
        return round(rng.uniform(2.500, 4.750), 3)
    return round(rng.uniform(6.000, 8.500), 3)
```

## Flood zone bias by state

```python
_HIGH_FLOOD_STATES = {"FL", "LA", "TX", "NC", "SC", "NJ"}  # Coastal + hurricane belt
_MID_FLOOD_STATES = {"CA", "GA", "VA", "MD", "MA", "NY", "MS", "AL"}

def _flood_zone(state, rng):
    if state in _HIGH_FLOOD_STATES:
        return rng.choices(
            ["X", "B", "C", "AE", "A", "VE", "V"],
            weights=[0.45, 0.10, 0.10, 0.20, 0.10, 0.04, 0.01],
        )[0]
    if state in _MID_FLOOD_STATES:
        return rng.choices(
            ["X", "B", "C", "AE", "A"],
            weights=[0.65, 0.10, 0.10, 0.10, 0.05],
        )[0]
    return rng.choices(["X", "B", "C", "AE"], weights=[0.85, 0.08, 0.05, 0.02])[0]
```

## Wildfire risk score by state

```python
_HIGH_WILDFIRE_STATES = {"CA", "AZ", "CO", "OR", "MT", "ID", "WA", "NV"}
_MID_WILDFIRE_STATES = {"TX", "NM", "UT", "WY", "OK"}

def _wildfire_score(state, rng):
    if state in _HIGH_WILDFIRE_STATES:
        return round(rng.uniform(50, 95))
    if state in _MID_WILDFIRE_STATES:
        return round(rng.uniform(30, 65))
    return round(rng.uniform(0, 30))
```

## HELOC opportunity score

Combines equity, lien count, and LTV:

```python
def _heloc_opportunity(equity, lien_count, ltv_pct, rng):
    if equity is None or equity < 50_000:
        return 0  # not enough equity to draw against
    base = min(100, (equity / 5_000) + 20)  # $400K equity → 100
    if lien_count >= 2:
        base -= 30  # liens block HELOC underwriting
    if ltv_pct is not None and ltv_pct > 80:
        base -= 25  # high-LTV borrowers can't draw more
    return round(max(0, min(100, base + (rng.random() - 0.5) * 10)))
```

## Bias logic for `_row_for` (skeleton)

```python
import random
from datetime import datetime

# Anchor extraction
account_id  = anchor["ACCOUNT_ID"]
birthdate   = anchor.get("BIRTHDATE")
income      = float(anchor.get("ANNUAL_INCOME") or 0)
client_cat  = anchor.get("CLIENT_CATEGORY") or ""
postal_code = anchor.get("POSTAL_CODE")
state       = anchor.get("STATE_CODE") or ""

# Determinism — seed bucketed by quarter, not month
quarter_start = _quarter_start(run_ts)
seed = seed_for(account_id, "corelogic", quarter_start)
rng  = random.Random(seed)

# 1. Owner status
age = _age_from_birthdate(birthdate, run_ts.date())
is_owner = _is_owner(age, client_cat, rng)

# Common-to-everyone fields (always populated)
flood_zone = _flood_zone(state, rng)
wildfire_score = _wildfire_score(state, rng)

if not is_owner:
    return {
        "ACCOUNT_ID":                   account_id,
        "PROFILE_QUARTER":              quarter_start.date(),
        "IS_OWNER":                     False,
        "PRIMARY_PROPERTY_TYPE":        None,
        "ESTIMATED_PROPERTY_VALUE":     None,
        "OUTSTANDING_MORTGAGE_BALANCE": None,
        "LOAN_TO_VALUE_PCT":            None,
        "EQUITY_USD":                   None,
        "MORTGAGE_RATE_PCT":            None,
        "LIEN_COUNT":                   0,
        "FLOOD_ZONE_CODE":              flood_zone,
        "WILDFIRE_RISK_SCORE":          wildfire_score,
        "LAST_TRANSFER_YEAR":           None,
        "HELOC_OPPORTUNITY_SCORE":      None,
        "GENERATED_AT":                 quarter_start,
    }

# 2. Owner: synthesize property fields
prop_type   = _property_type(postal_code, rng)
prop_value  = _property_value(postal_code, income, rng)
mortgage    = _mortgage_balance(prop_value, age, rng)
mortgage_rate = _mortgage_rate(account_id, run_ts, rng) if mortgage > 0 else None
ltv         = round(mortgage / prop_value * 100, 2) if mortgage > 0 else None
equity      = max(0, prop_value - mortgage)
lien_count  = _lien_count(rng)
last_year   = _last_transfer_year(age, rng)
heloc       = _heloc_opportunity(equity, lien_count, ltv, rng)

return {
    "ACCOUNT_ID":                   account_id,
    "PROFILE_QUARTER":              quarter_start.date(),
    "IS_OWNER":                     True,
    "PRIMARY_PROPERTY_TYPE":        prop_type,
    "ESTIMATED_PROPERTY_VALUE":     prop_value,
    "OUTSTANDING_MORTGAGE_BALANCE": mortgage,
    "LOAN_TO_VALUE_PCT":            ltv,
    "EQUITY_USD":                   equity,
    "MORTGAGE_RATE_PCT":            mortgage_rate,
    "LIEN_COUNT":                   lien_count,
    "FLOOD_ZONE_CODE":              flood_zone,
    "WILDFIRE_RISK_SCORE":          wildfire_score,
    "LAST_TRANSFER_YEAR":           last_year,
    "HELOC_OPPORTUNITY_SCORE":      heloc,
    "GENERATED_AT":                 quarter_start,
}
```

### Helpers (skeleton hints)

- `_quarter_start(run_ts) -> datetime`: returns `datetime(year, ((month-1) // 3) * 3 + 1, 1)`.
- `_is_owner(age, client_cat, rng)`: per the table above; rng.random() < owner_prob.
- `_property_type(postal_code, rng)`: per the urbanicity table.
- `_lien_count(rng)`: `rng.choices([0, 1, 2, 3, 4, 5], weights=[0.78, 0.15, 0.04, 0.02, 0.008, 0.002])[0]`.
- `_last_transfer_year(age, rng)`: `min(2026, max(1980, year_of_birth + 22 + rng.randint(0, 30)))` — most owners bought 22-52 years after birth, capped to current year.

## Boring case (must still emit)

A "boring" anchor — Retail, age 28, income $55K, urban ZIP — produces:
- `IS_OWNER`: most likely False (~70% prob). If True (~30%), prop_type Condo/Townhouse, value $300K-$700K, mortgage 70-95% LTV, rate post-2022 (6-8.5%).
- `FLOOD_ZONE_CODE`: usually `X` (minimal); coastal states have higher chance of `B`/`C`/`AE`.
- `WILDFIRE_RISK_SCORE`: 0-30 if not in high-risk state.
- `HELOC_OPPORTUNITY_SCORE`: 0 if non-owner or low equity.

A "wealth" anchor — Wealth Management, age 65, income $400K, urban ZIP — produces:
- `IS_OWNER`: ~95% True (Wealth override).
- Prop value $900K-$3.6M, mortgage usually 0 (paid off, age 65+ → 55% paid-off probability).
- HELOC_OPPORTUNITY_SCORE: very high (huge equity, no liens).

**No anchor is dropped.**

## Anchor-influence test target (template L1 property #4)

Three assertions:

1. **Age → owner probability:** persons age 65+ have ≥75% IS_OWNER=true; persons age 18-25 have ≤15%. Multi-month roll for stability.
2. **Income → property value:** high-income (≥$250K) PERSON anchors have ≥2× mean ESTIMATED_PROPERTY_VALUE vs low-income (<$50K) anchors. Restrict to IS_OWNER=true rows.
3. **State → flood zone:** FL/LA/TX (high) have higher rate of non-X flood zones than NY/CO/OH (low). Multi-quarter roll. Gap ≥20 percentage points.

Plus a fourth: **Determinism across re-runs within a quarter** — a given account's `IS_OWNER` and `ESTIMATED_PROPERTY_VALUE` must be byte-identical when re-run mid-quarter.

## Cadence

**Quarterly** (not monthly). CRON: `'USING CRON 0 8 1 1,4,7,10 * UTC'` (1st of Jan/Apr/Jul/Oct, 08:00 UTC). The seed bucket is `(run_ts.year, _quarter_start_month, 1)`, so re-runs anywhere in Q2 (Apr/May/Jun) produce identical rows.

## Volume

~25,424 rows/quarter (one per PERSON anchor with valid POSTAL_CODE — every PERSON has one in the live data). `IS_OWNER=true` ≈ 15.7K rows; `IS_OWNER=false` ≈ 9.7K rows.

## Out of scope

- **Real CoreLogic license / parcel-level fidelity.** Our property-type subset is recognisable but not license-grade.
- **Multiple properties per account.** A real CoreLogic feed has 1:N — vacation homes, investment properties. We model one primary property per owner only.
- **Property history / sale-event records.** Single point-in-time per quarter, no transaction trail beyond `LAST_TRANSFER_YEAR`.
- **Real flood maps / wildfire models.** Our state-level heuristic is a recognisable cover, not actual FEMA / Cal-Fire layers.
- **Rental-side fields** (lease start, rent amount). Plan 5 only models ownership; lease detail is out of scope.
