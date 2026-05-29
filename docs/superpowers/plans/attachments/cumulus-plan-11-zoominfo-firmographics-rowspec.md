# Plan 11 — ZoomInfo Firmographics rowspec

> Per-dataset attachment for the dataset template. Authored from the source brainstorming doc §11 (ZoomInfo / DiscoverOrg / Crunchbase) + the live BUSINESS-anchor fields available in `FINS.PUBLIC.V_ACCOUNT_ANCHORS`.

## Mimics

**ZoomInfo B2B firmographics** — company-level identity (industry codes, founded year, HQ geography, web presence, employee + revenue bands, technographics). Real ZoomInfo publishes ~100 fields covering both contact-level and company-level data; this dataset mirrors only the **company-level firmographic surface** that's useful for Commercial Banking / SMB / Wealth-prospecting demos. Contact-level enrichment (titles, emails, direct dials) is explicitly out of scope.

## Audience

`ACCOUNT_TYPE_FLAG = 'BUSINESS'` — firmographics describe organizations, not individuals.

**Cardinality caveat (spec §3 v1.2 finding #3):** the org currently classifies 12,021 accounts as BUSINESS, but a sizeable share are likely Person Accounts with NULL `PersonBirthdate__c`. CRM-level expected BUSINESS cardinality is closer to 5K. The SP should warn (not fail) when `accounts_processed > 10000`, suggesting upstream backfill investigation. Same predicate and same caveat as Plans 2 (MSCI) and 3 (D&B).

## Table: `FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | Anchor.ACCOUNT_ID — Salesforce ssot__Id__c |
| `PROFILE_MONTH` | DATE | NOT NULL | First-of-month for the run timestamp |
| `EMPLOYEE_BAND` | VARCHAR(12) | NOT NULL | Categorical band derived from EMPLOYEE_COUNT (7 buckets) |
| `REVENUE_BAND` | VARCHAR(12) | NOT NULL | Categorical band derived from ANNUAL_REVENUE (6 buckets) |
| `INDUSTRY_NAICS_CODE` | VARCHAR(6) | NOT NULL | 6-digit NAICS code mapped from INDUSTRY |
| `INDUSTRY_SIC_CODE` | VARCHAR(4) | NOT NULL | 4-digit SIC code mapped from INDUSTRY |
| `FOUNDED_YEAR` | NUMBER(4,0) | NOT NULL | Year founded, range [1900, run_ts.year], biased by INDUSTRY |
| `HQ_COUNTRY_CODE` | VARCHAR(2) | NOT NULL | 2-char ISO from `LEFT(COUNTRY_CODE, 2)`; literal `'US'` for the demo (per v1.5 finding #5) |
| `HQ_STATE_CODE` | VARCHAR(2) | NOT NULL | 2-char state from `LEFT(STATE_CODE, 2)`; defaulted to `'US'` row state when blank |
| `HQ_POSTAL_CODE` | VARCHAR(5) | NOT NULL | 5-digit ZIP from `LEFT(POSTAL_CODE, 5)`; synth-fallback when empty/null (per v1.5 finding #4) |
| `WEBSITE_DOMAIN` | VARCHAR(120) | NULL | Lowercase, alnum-stripped ACCOUNT_NAME + `.com`. NULL when normalized name length < 3 |
| `LINKEDIN_FOLLOWERS` | NUMBER(8,0) | NOT NULL | Integer 0-1,000,000, biased by EMPLOYEE_COUNT and INDUSTRY |
| `TECH_STACK_FLAGS` | VARCHAR(200) | NULL | Comma-separated 0-5 tech indicators. NULL when zero detected (~10% of rows) |
| `LAST_DATA_REFRESH_DATE` | DATE | NOT NULL | Vendor's last refresh; uniform [run_ts.date() - 90d, run_ts.date()] |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Month-bucketed (`datetime(run_ts.year, run_ts.month, 1)`) per Plan 1 GENERATED_AT precedent |

14 columns. 12 NOT NULL + 2 NULLable (WEBSITE_DOMAIN, TECH_STACK_FLAGS).

## Primary key

`(ACCOUNT_ID, PROFILE_MONTH)` — one row per BUSINESS account per month. Re-running mid-month replaces.

## EMPLOYEE_BAND derivation (7 buckets)

Bands hew to the standard ZoomInfo / Crunchbase / LinkedIn employee tiers. Bucket assignment is **deterministic** from `EMPLOYEE_COUNT` (no jitter — bands must be consistent with the anchor for the L1 invariant).

| Band | EMPLOYEE_COUNT range | Notes |
|---|---|---|
| `1-10` | 1 ≤ count ≤ 10 | Solopreneur / micro-SMB |
| `11-50` | 11 ≤ count ≤ 50 | Small business |
| `51-200` | 51 ≤ count ≤ 200 | Mid-market lower |
| `201-1000` | 201 ≤ count ≤ 1000 | Mid-market upper |
| `1001-5000` | 1001 ≤ count ≤ 5000 | Large enterprise |
| `5001-25000` | 5001 ≤ count ≤ 25000 | Major enterprise |
| `25001+` | count ≥ 25001 | Mega-enterprise (FAANG-scale) |

When `EMPLOYEE_COUNT` is NULL or 0, default to `1-10` (consistent with the BUSINESS-misclassification cohort, where most rows are really persons with no employee data).

## REVENUE_BAND derivation (6 buckets)

Bands match the ZoomInfo published revenue tiers. Deterministic from `ANNUAL_REVENUE`.

| Band | ANNUAL_REVENUE range | Notes |
|---|---|---|
| `<$1M` | revenue < $1,000,000 | Sub-million |
| `$1M-$10M` | $1M ≤ revenue < $10M | Small business |
| `$10M-$50M` | $10M ≤ revenue < $50M | Mid-market |
| `$50M-$200M` | $50M ≤ revenue < $200M | Large mid-market |
| `$200M-$1B` | $200M ≤ revenue < $1B | Enterprise |
| `$1B+` | revenue ≥ $1B | Mega-enterprise |

When `ANNUAL_REVENUE` is NULL or 0, default to `<$1M`.

## INDUSTRY → NAICS / SIC mapping

Real ZoomInfo carries both NAICS (North American Industry Classification System, 6-digit) and SIC (Standard Industrial Classification, 4-digit). We use a small per-INDUSTRY mapping table covering the 10 INDUSTRY values that appear in V_ACCOUNT_ANCHORS' BUSINESS rows; default falls back to `999999` / `9999` for unrecognised industries.

| INDUSTRY substring | NAICS | SIC | Description |
|---|---|---|---|
| `Finance` / `Banking` | `522110` | `6021` | Commercial banking |
| `Healthcare` | `622110` | `8062` | General medical hospitals |
| `Tech` / `Software` / `Information Technology` | `541511` | `7372` | Custom programming services |
| `Manufacturing` / `Industrial` | `336411` | `3711` | Aircraft / motor vehicle mfg (proxy) |
| `Retail` / `Consumer` | `452210` | `5311` | General merchandise stores |
| `Food & Beverage` | `722511` | `5812` | Full-service restaurants |
| `Real Estate` / `Construction` | `236220` | `1542` | Commercial building construction |
| `Energy` / `Mining` / `Oil & Gas` | `211120` | `1311` | Crude petroleum extraction |
| `Personal Services` (default) | `812990` | `7299` | All other personal services |
| (no match / empty) | `999999` | `9999` | Unclassified |

Substring match is case-insensitive — INDUSTRY values from the share are not normalized.

## FOUNDED_YEAR derivation

Bias by INDUSTRY: tech firms skew younger, finance/manufacturing skew older.

| Industry group | FOUNDED_YEAR mean | FOUNDED_YEAR range |
|---|---|---|
| Tech / Software / IT | 2008 | 1990-2024 |
| Healthcare | 1985 | 1940-2024 |
| Finance / Banking | 1965 | 1900-2024 |
| Retail / Consumer / F&B | 1995 | 1950-2024 |
| Manufacturing / Industrial | 1970 | 1900-2024 |
| Energy / Mining | 1955 | 1900-2024 |
| Real Estate / Construction | 1990 | 1940-2024 |
| Personal Services (default) | 2000 | 1960-2024 |

Hard cap: FOUNDED_YEAR ≤ run_ts.year (no future-founded businesses).

## LINKEDIN_FOLLOWERS derivation

Real ZoomInfo correlates LinkedIn followers with employee count and B2B-vs-B2C industry mix. We bias by EMPLOYEE_BAND, with a small INDUSTRY multiplier (Tech / Finance ×1.5; Personal Services / F&B ×0.5).

| EMPLOYEE_BAND | followers base range |
|---|---|
| `1-10` | 0 - 1,500 |
| `11-50` | 200 - 8,000 |
| `51-200` | 1,500 - 35,000 |
| `201-1000` | 10,000 - 150,000 |
| `1001-5000` | 50,000 - 500,000 |
| `5001-25000` | 200,000 - 1,500,000 |
| `25001+` | 800,000 - 5,000,000 |

Then `followers = clamp(0, 5_000_000, round(uniform(low, high) * industry_mult))`.

## TECH_STACK_FLAGS derivation

Pool of 12 indicators: `Salesforce`, `AWS`, `Snowflake`, `Workday`, `Okta`, `Marketo`, `Zoom`, `Slack`, `Google Workspace`, `Microsoft 365`, `Tableau`, `HubSpot`. Industry biases the pool size:

- Tech / Software / IT: 3-5 tags (heavy stack)
- Finance / Banking / Healthcare: 2-4 tags
- Retail / F&B / Construction / Personal Services: 0-2 tags
- Energy / Mining / Manufacturing: 1-3 tags

NULL when `tag_count == 0`. Empirically ~10% of rows are NULL (mostly small-business / personal-services anchors).

## Defensive string handling (v1.5 findings #4 + #5)

Three V_ACCOUNT_ANCHORS string columns require defensive projection in this rowspec — none can be passed through raw:

1. **`POSTAL_CODE`** — has 10,798 empty-string rows (per v1.5 finding #4). The row factory:
   ```python
   raw_zip = (anchor.get("POSTAL_CODE") or "").strip()
   if not raw_zip:
       # synth-fallback: deterministic 5-digit ZIP from the seed
       hq_postal = f"{int.from_bytes(seed[:3], 'big') % 100000:05d}"
   else:
       hq_postal = raw_zip[:5].zfill(5)
   ```
   Result: every row carries a non-empty 5-char ZIP, real-or-synth.

2. **`COUNTRY_CODE`** — has 4 rows with `'USA'` / `'United States'` literals (per v1.5 finding #5). Since the demo is US-only, we project the literal `'US'` regardless of source value. This is the same approach Plan 4 used.
   ```python
   hq_country = "US"  # literal projection — demo is US-only
   ```

3. **`STATE_CODE`** — has empty-string drift symmetric with POSTAL_CODE (defensive against the same upstream issue). The row factory:
   ```python
   raw_state = (anchor.get("STATE_CODE") or "").strip()
   if not raw_state or len(raw_state) < 2:
       hq_state = _state_from_zip(hq_postal)  # fallback: deterministic from ZIP first digit
   else:
       hq_state = raw_state[:2].upper()
   ```
   The `_state_from_zip` helper maps ZIP first digit → 2-char state (a small 10-entry table covering US ZIP regions). This guarantees `len(hq_state) == 2` for every row.

The general rule per spec v1.5: **assume any string column from V_ACCOUNT_ANCHORS may carry empty strings, dirty values, or unexpected widths.** Defensive SQL/Python beats post-deploy fix-up.

## WEBSITE_DOMAIN synthesis

```python
import re
name = (anchor.get("ACCOUNT_NAME") or "").lower()
slug = re.sub(r"[^a-z0-9]", "", name)[:40]   # alnum-only, capped at 40 chars
if len(slug) >= 3:
    website = f"{slug}.com"
else:
    website = None    # NULL when name is too short / non-alphanum
```

Empirically <0.5% of accounts have names short enough to NULL out (most have ≥3 alphanumerics).

## Bias logic for `_row_for` (skeleton)

```python
import random, re
from datetime import datetime, timedelta

account_id   = anchor["ACCOUNT_ID"]
account_name = anchor.get("ACCOUNT_NAME") or ""
industry     = (anchor.get("INDUSTRY") or "").strip()
revenue      = float(anchor.get("ANNUAL_REVENUE") or 0)
employees    = int(anchor.get("EMPLOYEE_COUNT") or 0)

seed = seed_for(account_id, "zoominfo", run_ts)
rng  = random.Random(seed)

# 1. Bands (deterministic from anchors)
employee_band = _employee_band(employees)
revenue_band  = _revenue_band(revenue)

# 2. Industry codes (deterministic from INDUSTRY)
naics, sic = _industry_codes(industry)

# 3. Founded year (industry-biased, capped at run_ts.year)
founded_year = _founded_year(industry, run_ts.year, rng)

# 4. HQ geography — defensive (v1.5 findings #4, #5)
hq_country = "US"  # literal projection
raw_zip   = (anchor.get("POSTAL_CODE") or "").strip()
hq_postal = raw_zip[:5].zfill(5) if raw_zip else f"{int.from_bytes(seed[:3], 'big') % 100000:05d}"
raw_state = (anchor.get("STATE_CODE") or "").strip()
hq_state  = raw_state[:2].upper() if len(raw_state) >= 2 else _state_from_zip(hq_postal)

# 5. Website domain (NULL when name too short)
slug    = re.sub(r"[^a-z0-9]", "", account_name.lower())[:40]
website = f"{slug}.com" if len(slug) >= 3 else None

# 6-8. Followers + tech stack + last refresh
followers    = _linkedin_followers(employee_band, industry, rng)
tech_stack   = _tech_stack(industry, rng)  # str or None
last_refresh = run_ts.date() - timedelta(days=rng.randint(0, 90))

return {
    "ACCOUNT_ID": account_id, "PROFILE_MONTH": run_ts.replace(day=1).date(),
    "EMPLOYEE_BAND": employee_band, "REVENUE_BAND": revenue_band,
    "INDUSTRY_NAICS_CODE": naics, "INDUSTRY_SIC_CODE": sic,
    "FOUNDED_YEAR": founded_year, "HQ_COUNTRY_CODE": hq_country,
    "HQ_STATE_CODE": hq_state, "HQ_POSTAL_CODE": hq_postal,
    "WEBSITE_DOMAIN": website, "LINKEDIN_FOLLOWERS": followers,
    "TECH_STACK_FLAGS": tech_stack, "LAST_DATA_REFRESH_DATE": last_refresh,
    "GENERATED_AT": datetime(run_ts.year, run_ts.month, 1),
}
```

## Boring case (must still emit)

A "boring" anchor — Mid-market business, Manufacturing industry, 120 employees, $25M revenue, account name `"Acme Industrial Co"` — produces:
- `EMPLOYEE_BAND = '51-200'` (since 51 ≤ 120 ≤ 200)
- `REVENUE_BAND = '$10M-$50M'` (since $10M ≤ $25M < $50M)
- `INDUSTRY_NAICS_CODE = '336411'`, `INDUSTRY_SIC_CODE = '3711'`
- `FOUNDED_YEAR ∈ [1995, 2010]` (Manufacturing band, mid-anchor)
- `HQ_COUNTRY_CODE = 'US'`, `HQ_STATE_CODE` 2-char, `HQ_POSTAL_CODE` 5-char (real or synth-fallback)
- `WEBSITE_DOMAIN = 'acmeindustrialco.com'`
- `LINKEDIN_FOLLOWERS ∈ [2000, 15000]` (51-200 band base × Manufacturing ~×1.0)
- `TECH_STACK_FLAGS` 1-3 tags (Manufacturing pool: 1-3)
- `LAST_DATA_REFRESH_DATE` within last 90 days

**No anchor is dropped from the output.** Even anchors with EMPLOYEE_COUNT=0 / NULL revenue / blank ZIP get a row (defaulted to `1-10` / `<$1M` / synth-ZIP).

## Anchor-influence test target (template L1 property #4 — 5 properties)

Per-anchor and per-row invariants. Run against the BUSINESS subset of SAMPLE_ANCHORS over a 6-month roll for sample diversity (~150 rows).

1. **Per-anchor consistency invariants** (deterministic — no rng noise tolerated):
   - `EMPLOYEE_BAND` consistent with `EMPLOYEE_COUNT`: e.g., every anchor with `EMPLOYEE_COUNT < 11` → `band == '1-10'`; every anchor with `EMPLOYEE_COUNT ∈ [51, 200]` → `band == '51-200'`. Check across all 7 buckets.
   - `REVENUE_BAND` consistent with `ANNUAL_REVENUE`: every anchor with `revenue < $1M` → `band == '<$1M'`; every anchor with `revenue ≥ $1B` → `band == '$1B+'`. Check across all 6 buckets.

2. **Range invariants** (per-row):
   - `FOUNDED_YEAR ∈ [1900, run_ts.year]` for every row.
   - `LINKEDIN_FOLLOWERS ∈ [0, 5_000_000]` for every row.
   - `LAST_DATA_REFRESH_DATE ≤ run_ts.date()` for every row.
   - `LAST_DATA_REFRESH_DATE ≥ run_ts.date() - timedelta(days=90)` for every row.

3. **Vocabulary invariants** (per-row):
   - `EMPLOYEE_BAND` ∈ `{1-10, 11-50, 51-200, 201-1000, 1001-5000, 5001-25000, 25001+}` (no other values).
   - `REVENUE_BAND` ∈ `{<$1M, $1M-$10M, $10M-$50M, $50M-$200M, $200M-$1B, $1B+}`.
   - `INDUSTRY_NAICS_CODE` matches `^\d{6}$`; `INDUSTRY_SIC_CODE` matches `^\d{4}$`.

4. **Defensive string invariants** (per-row, derived from v1.5 findings):
   - `len(HQ_COUNTRY_CODE) == 2` for every row (literal `'US'` projection).
   - `len(HQ_STATE_CODE) == 2` for every row (fallback when raw is blank).
   - `len(HQ_POSTAL_CODE) == 5` and `HQ_POSTAL_CODE != ''` for every row (synth-fallback when raw is empty).

5. **Schema contract** (per-row): output dict keys exactly match the table's 14 columns; no extras, none missing.

NULL semantics for `WEBSITE_DOMAIN` and `TECH_STACK_FLAGS` are tested at boring-case rates (~99.5% non-null and ~90% non-null respectively) — distributional, not per-anchor.

## Cadence

Monthly. CRON: `'USING CRON 0 7 1 * * UTC'` (matches Plans 1-3, 6, 8 — same monthly slot at 07:00 UTC). Idempotent re-runs same month replace.

## Volume

~12,021 rows/month at the current ACCOUNT_TYPE_FLAG=BUSINESS cardinality (per Plan 0 verification). Same as Plans 2 and 3. Real CRM BUSINESS count is closer to 5K; the over-count flag from spec §3 v1.2 finding #3 means the SP should warn if `accounts_processed > 10000`.

## Out of scope

- **Real ZoomInfo license / live ZoomInfo API.** Our 14-column structure is recognisable but not licensed.
- **Contact-level enrichment.** Real ZoomInfo is famous for direct-dial phone numbers, work emails, and titles per contact. Out of scope — this dataset is company-level only.
- **Lead scoring / intent signals.** ZoomInfo's intent / scoops / website-visitor surfaces are derived products beyond firmographics; out of scope.
- **Org-chart traversal.** No reporting hierarchy, no executive-level data — those overlap with Plan 10 (BoardEx).
- **Technographics depth.** Real ZoomInfo publishes per-product spend estimates and renewal dates; our `TECH_STACK_FLAGS` is a flat tag list with no spend or contract data.
- **Funding / M&A history.** Real ZoomInfo carries funding round history and parent-company changes; out of scope (those overlap with D&B's corporate-family graph).
