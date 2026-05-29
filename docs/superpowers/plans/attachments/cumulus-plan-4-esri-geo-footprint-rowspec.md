# Plan 4 — Esri Geo Footprint rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §16 (Esri / SafeGraph / Placer.ai) + the live POSTAL_CODE / STATE_CODE distribution in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.
>
> **Plan 4 deviates from the standard template** per spec §3.1 — this dataset is **NOT account-scoped**. Rows are keyed by `BRANCH_ZIP` (the union of distinct postal codes where Cumulus has customers). One row per ZIP per month.

## Mimics

**Esri Tapestry Segmentation + Business Locations + Placer.ai foot-traffic** — geographic enrichment data per ZIP code. Real Esri publishes 50+ fields per ZIP (demographic, market, business density); we mirror 14 that hit the demo's "branch territory optimization" + "geo-targeted campaigns" use cases.

## Audience

**Branch-scoped, not account-scoped.** The audience SQL enumerates distinct postal codes from `V_ACCOUNT_ANCHORS` where customers exist:

```sql
SELECT DISTINCT POSTAL_CODE, STATE_CODE, COUNTRY_CODE
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
WHERE POSTAL_CODE IS NOT NULL
```

**Live cardinality (probed 2026-05-28):** 13,328 distinct ZIPs across 23 US states. That's the row count the SP must produce; coverage assertion compares `COUNT(DISTINCT BRANCH_ZIP) FROM ESRI_GEO_FOOTPRINT` against this query's `COUNT(DISTINCT POSTAL_CODE)`.

## Table: `FINS.PUBLIC.ESRI_GEO_FOOTPRINT`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `BRANCH_ZIP` | VARCHAR(10) | NOT NULL | The ZIP this row covers. Derived from V_ACCOUNT_ANCHORS distinct POSTAL_CODE. |
| `STATE_CODE` | VARCHAR(2) | NOT NULL | US state from V_ACCOUNT_ANCHORS. |
| `COUNTRY_CODE` | VARCHAR(2) | NOT NULL | Always `US` for our audience. |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp |
| `TAPESTRY_SEGMENT_CODE` | VARCHAR(8) | NOT NULL | One of 12 codes from the Esri Tapestry-style pool below |
| `TAPESTRY_SEGMENT_NAME` | VARCHAR(60) | NOT NULL | Display name for the segment |
| `URBANICITY_TIER` | VARCHAR(20) | NOT NULL | `Urban Core`, `Suburban`, `Small Town`, `Rural` (heuristic from ZIP first digit) |
| `MEDIAN_HOUSEHOLD_INCOME` | NUMBER(8,0) | NOT NULL | Median income for the ZIP, $20K-$350K. Biased by URBANICITY_TIER + state. |
| `WEALTH_INDEX` | NUMBER(5,2) | NOT NULL | 50.00-200.00, 100=US national average. Correlates with MEDIAN_HOUSEHOLD_INCOME. |
| `FOOT_TRAFFIC_INDEX` | NUMBER(5,2) | NOT NULL | 0.00-300.00, 100=US national average pedestrian density. Urban Core skews high. |
| `COMMERCIAL_DENSITY_PER_SQ_MI` | NUMBER(8,2) | NOT NULL | Businesses per square mile, 0-2000. Urban Core 500-2000, Rural 0-50. |
| `DISTANCE_TO_NEAREST_BRANCH_MI` | NUMBER(6,2) | NOT NULL | 0.00-50.00. Urban Core 0.5-2; Rural 8-50. |
| `MARKET_PENETRATION_PCT` | NUMBER(5,2) | NOT NULL | 0.00-100.00. Cumulus's market share in this ZIP, biased by ANNUAL_REVENUE-weighted customer mass in the ZIP. |
| `BRANCH_RECOMMENDATION` | VARCHAR(20) | NOT NULL | `Expand`, `Maintain`, `Optimize`, `Consolidate` — derived from market penetration + foot traffic + branch distance |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed for byte-identical mid-month re-runs |

## Primary key

`(BRANCH_ZIP, PROFILE_MONTH)` — one row per ZIP per month. Re-runs same month replace.

**Note:** the PK column is `BRANCH_ZIP`, NOT `ACCOUNT_ID`. The DC field mapping in T7 will map `BRANCH_ZIP` → `branchZip__c` (a **non-FK** field; this DMO is not joinable to `ssot__Account__dlm`).

## Tapestry segment pool (12)

Real Esri Tapestry has ~67 segments grouped into 14 LifeMode groups. Our 12-segment subset:

| Code | Segment Name | LifeMode | Income tier |
|---|---|---|---|
| TC | Top Tier | Affluent Estates | High |
| EE | Exurban Estates | Affluent Estates | High |
| ND | Networked Neighbors | Upscale Avenues | Mid-High |
| BS | Bright Young Professionals | Middle Ground | Mid-High |
| SF | Soccer Moms | GenXurban | Mid-High |
| MD | Midlife Constants | Cozy Country Living | Mid |
| SH | Small Town Sincerity | Cozy Country Living | Mid |
| RD | Rooted Rural | Hometown | Mid-Low |
| RC | Rural Resort Dwellers | Senior Styles | Mid |
| HM | Hardscrabble Road | Hometown | Low |
| MS | Modest Income Homes | Midtown Singles | Low |
| RH | Rustbelt Traditions | Sprouting Explorers | Mid-Low |

## URBANICITY_TIER heuristic

Same first-digit ZIP heuristic Plan 1 (Claritas) used, but with finer tiers:

| ZIP first digit | Region | Default urbanicity weights |
|---|---|---|
| 0, 1, 9 | Northeast / Mid-Atlantic / California | Urban Core 45%, Suburban 35%, Small Town 15%, Rural 5% |
| 2, 3, 8 | Southeast / Mountain | Urban Core 25%, Suburban 50%, Small Town 20%, Rural 5% |
| 4, 5, 6, 7 | Midwest / South / Plains | Urban Core 10%, Suburban 35%, Small Town 35%, Rural 20% |

Special-case STATE_CODE overrides:
- `NY`/`CA`/`MA`/`IL`/`DC` ZIPs always biased toward Urban Core / Suburban (no Rural)
- `MT`/`WY`/`AK`/`ND`/`SD` ZIPs always biased toward Small Town / Rural (no Urban Core)

## Tapestry segment → income+urbanicity bias

```python
def _tapestry_segment(urbanicity, median_income, rng):
    if urbanicity == "Urban Core":
        if median_income >= 150_000:
            pool = [("TC", "Top Tier"), ("ND", "Networked Neighbors")]
        elif median_income >= 80_000:
            pool = [("ND", "Networked Neighbors"), ("BS", "Bright Young Professionals")]
        else:
            pool = [("MS", "Modest Income Homes"), ("BS", "Bright Young Professionals")]
    elif urbanicity == "Suburban":
        if median_income >= 150_000:
            pool = [("EE", "Exurban Estates"), ("TC", "Top Tier"), ("SF", "Soccer Moms")]
        elif median_income >= 80_000:
            pool = [("SF", "Soccer Moms"), ("MD", "Midlife Constants")]
        else:
            pool = [("MD", "Midlife Constants"), ("MS", "Modest Income Homes")]
    elif urbanicity == "Small Town":
        if median_income >= 80_000:
            pool = [("MD", "Midlife Constants"), ("SH", "Small Town Sincerity")]
        else:
            pool = [("SH", "Small Town Sincerity"), ("HM", "Hardscrabble Road"), ("RH", "Rustbelt Traditions")]
    else:  # Rural
        if median_income >= 80_000:
            pool = [("EE", "Exurban Estates"), ("RC", "Rural Resort Dwellers"), ("RD", "Rooted Rural")]
        else:
            pool = [("RD", "Rooted Rural"), ("HM", "Hardscrabble Road"), ("RH", "Rustbelt Traditions")]
    return rng.choice(pool)
```

## Median Income bias (by urbanicity + state)

State-level base medians (rough US Census 2024 figures):

```python
_STATE_BASE_INCOME = {
    "MA": 95000, "NJ": 92000, "CA": 90000, "NY": 82000, "WA": 90000, "CT": 89000,
    "MD": 95000, "VA": 88000, "CO": 88000, "IL": 78000, "TX": 75000, "FL": 70000,
    "NC": 67000, "GA": 72000, "PA": 73000, "OH": 67000, "MI": 65000, "AZ": 75000,
    "OR": 78000, "MN": 84000, "TN": 67000, "IN": 67000, "MO": 65000,
}
_DEFAULT_BASE_INCOME = 70000

def _median_income(state, urbanicity, rng):
    base = _STATE_BASE_INCOME.get(state, _DEFAULT_BASE_INCOME)
    if urbanicity == "Urban Core":
        # Urban income is bimodal — affluent enclaves AND poverty pockets
        return round(base * rng.choices([0.5, 1.0, 1.6, 2.5], weights=[0.2, 0.4, 0.25, 0.15])[0])
    if urbanicity == "Suburban":
        return round(base * rng.uniform(0.85, 1.6))
    if urbanicity == "Small Town":
        return round(base * rng.uniform(0.6, 1.05))
    return round(base * rng.uniform(0.55, 1.1))  # Rural
```

Clamp to [20000, 350000].

## WEALTH_INDEX

```python
def _wealth_index(median_income):
    # Esri's wealth index pegs 100=US average ($75K median).
    return round(min(200.0, max(50.0, (median_income / 75000) * 100)), 2)
```

## FOOT_TRAFFIC_INDEX

```python
def _foot_traffic(urbanicity, rng):
    base = {"Urban Core": 180, "Suburban": 90, "Small Town": 50, "Rural": 20}[urbanicity]
    return round(max(0.0, min(300.0, base + rng.uniform(-30, 50))), 2)
```

## COMMERCIAL_DENSITY_PER_SQ_MI

```python
def _commercial_density(urbanicity, rng):
    if urbanicity == "Urban Core": return round(rng.uniform(500, 2000), 2)
    if urbanicity == "Suburban":   return round(rng.uniform(80, 500), 2)
    if urbanicity == "Small Town": return round(rng.uniform(15, 100), 2)
    return round(rng.uniform(0, 30), 2)  # Rural
```

## DISTANCE_TO_NEAREST_BRANCH_MI

```python
def _branch_distance(urbanicity, rng):
    if urbanicity == "Urban Core": return round(rng.uniform(0.3, 2.5), 2)
    if urbanicity == "Suburban":   return round(rng.uniform(1.0, 6.0), 2)
    if urbanicity == "Small Town": return round(rng.uniform(2.0, 15.0), 2)
    return round(rng.uniform(8.0, 50.0), 2)  # Rural
```

## MARKET_PENETRATION_PCT

For each ZIP, count distinct ACCOUNT_IDs from V_ACCOUNT_ANCHORS that share that POSTAL_CODE; divide by an estimated household count for the ZIP (synthesized from urbanicity).

```python
def _market_penetration(zip_customer_count, urbanicity, rng):
    estimated_households = {
        "Urban Core": 25000, "Suburban": 8000, "Small Town": 3000, "Rural": 800
    }[urbanicity]
    pct = (zip_customer_count / estimated_households) * 100
    # Add small jitter so identical-customer-count ZIPs don't collapse to the same penetration value
    pct += (rng.random() - 0.5) * 0.5
    return round(max(0.0, min(100.0, pct)), 2)
```

The SP must aggregate `V_ACCOUNT_ANCHORS` to compute `zip_customer_count` per ZIP — see "SP shape" below.

## BRANCH_RECOMMENDATION

Decision tree on the three downstream signals:

```python
def _branch_recommendation(market_penetration, foot_traffic, branch_distance):
    if branch_distance > 15 and market_penetration > 5:
        return "Expand"          # underserved with traction
    if market_penetration > 8 and foot_traffic > 100:
        return "Maintain"        # healthy market
    if market_penetration < 1 and foot_traffic < 50:
        return "Consolidate"     # weak position, weak market
    return "Optimize"            # default — improve operations
```

## SP shape — different from Plans 1-3

Plans 1-3's `_row_for(anchor, run_ts) -> dict` was per-account. Plan 4's input is per-ZIP, with a pre-aggregated customer count.

The SP's main loop changes shape:

```python
def main(session):
    # 1. Aggregate audience: distinct ZIPs + customer count per ZIP
    audience_sql = """
        SELECT POSTAL_CODE, STATE_CODE, COUNTRY_CODE,
               COUNT(DISTINCT ACCOUNT_ID) AS CUSTOMER_COUNT
        FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
        WHERE POSTAL_CODE IS NOT NULL
        GROUP BY POSTAL_CODE, STATE_CODE, COUNTRY_CODE
    """
    rows = session.sql(audience_sql).collect()
    accounts_processed = sum(r.CUSTOMER_COUNT for r in rows)  # for log
    zip_count = len(rows)  # this is what coverage_sql counts

    # 2. Build per-ZIP rows (each ZIP becomes one fact row)
    records = [_row_for_zip(r.POSTAL_CODE, r.STATE_CODE, r.COUNTRY_CODE,
                            r.CUSTOMER_COUNT, run_ts) for r in rows]

    # 3, 4, 5 — MERGE, coverage assert, log — same shape as Plans 1-3.
```

`accounts_processed` is the **total customer-count rolled up across all ZIPs**, NOT the row count. This keeps `TASK_EXECUTION_LOG` semantically meaningful: how many customers does this dataset cover?

The coverage assertion uses ZIP cardinality:

```python
COVERAGE_SQL = """
    SELECT COUNT(DISTINCT POSTAL_CODE)
    FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
    WHERE POSTAL_CODE IS NOT NULL
"""
ACTUAL_SQL = "SELECT COUNT(DISTINCT BRANCH_ZIP) FROM FINS.PUBLIC.ESRI_GEO_FOOTPRINT"
```

Both numbers should be **13,328** at deploy time (per the live probe).

## `_anchor_in_audience` — different shape

Plans 1-3 used `anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON"` (or BUSINESS). Plan 4's `_row_for_zip` is invoked from a `(zip, state, country, customer_count)` tuple, not an anchor dict. There's no anchor-shaped predicate to validate.

For defense-in-depth, `_row_for_zip` raises `ValueError` if `zip_code` is None or not a string of digits, but this is more an input-shape check than an audience-violation check.

## Boring case (must still emit)

A "boring" ZIP — Suburban, mid-income (~$70K), 80 customers — produces:
- `TAPESTRY_SEGMENT_CODE` from `{MD, MS}`
- Median income ~$60K-$110K
- Wealth index ~80-145
- Foot traffic ~70-110
- Commercial density 80-500
- Distance ~1-6 mi
- Market penetration ~1% (80/8000)
- Branch recommendation: most likely `Optimize`

**No ZIP is dropped.**

## Anchor-influence test target (template L1 property #4)

Plan 4 has neither the standard `in_audience_anchors` fixture (it's ZIP-scoped) nor an account-vs-account anchor-influence axis. The L1 tests need a **different shape**. Since the row factory takes `(zip, state, country, customer_count)` not an anchor dict:

1. **Determinism on the same input tuple** — `_row_for_zip("94110", "CA", "US", 100, datetime(2026,5,1))` produces the same dict on re-run.
2. **Different ZIP → different output** — `_row_for_zip("94110", ...)` differs from `_row_for_zip("10025", ...)` even with same state/customer_count.
3. **State-income correlation** — MA ZIPs should have higher mean MEDIAN_HOUSEHOLD_INCOME than e.g. MS ZIPs (mid-12-month roll, ≥$15K gap).
4. **Urbanicity-foot-traffic correlation** — Urban Core ZIPs (forced via `STATE_CODE in ('NY','CA','MA','IL','DC')` + `ZIP first digit 0/1/9`) should have higher mean FOOT_TRAFFIC_INDEX than Rural ZIPs.
5. **Schema contract** — output dict keys match table columns.

The fixture for L1 will use a small synthetic ZIP list (~30 ZIPs across 8 states, urbanicity-balanced) instead of `SAMPLE_ANCHORS`. Per-plan conftest provides this fixture; Cumulus_Common's anchor fixture is unused for Plan 4.

## Cadence

Monthly. CRON: `'USING CRON 0 7 1 * * UTC'` (matches Plans 1-3). Idempotent re-runs same month replace.

## Volume

**13,328 rows/month** (one per distinct US ZIP in the customer base). Doesn't grow with account count — grows with geographic spread. Manageable: ~160K rows/year if we ever wanted 12-month history (we don't yet — re-runs replace).

## Out of scope

- Real Esri license / Tapestry Segmentation grade. Our 12-segment subset is recognisable but not license-grade.
- Real Placer.ai foot-traffic data — our `FOOT_TRAFFIC_INDEX` is synthesized from urbanicity + jitter, not actual cell-phone-derived foot traffic.
- Geographic precision below ZIP — block-level segmentation, drive-time analysis, market-saturation by census tract are all beyond scope.
- Multi-month time-series of any field — single point-in-time per month, replaces on re-run.
- Foreign ZIPs / non-US — ignored (the audience filter implicitly drops them since V_ACCOUNT_ANCHORS POSTAL_CODE is US-only).
