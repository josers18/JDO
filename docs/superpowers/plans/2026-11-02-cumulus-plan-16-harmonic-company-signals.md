# Cumulus Plan 16 — Harmonic Company Signals Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the sixteenth per-dataset Cumulus pipeline, Harmonic-style **private-company funding and traction signals**. Coresignal-style **department headcount mix and job-posting velocity** are folded in as columns. Coverage is young, private commercial clients. Monthly cadence. The SP emits **one row per audience anchor per month** into `FINS.PUBLIC.HARMONIC_COMPANY_SIGNALS`, roughly 670 rows/month and ~4.6K rows with the 7-month backfill (re-probed after Task 0; see §2). The table is federated as `CumulusHarmonicCompanySignals__dlm`.

**Why this dataset:** the 2026-11-02 vendor-gap assessment found that the existing company data is either static firmographics (ZoomInfo: band, NAICS, founded year) or public-market context (Moody's: rating, market cap, liquidity tier). Nothing describes the **private-company growth story**: who just raised, how much runway they have, and whether they're hiring or freezing. That story drives the highest-value commercial-banking moments:
- **Fresh round:** treasury / sweep / deposit capture.
- **Short runway:** venture-debt offer, or deposit-flight risk.
- **Hiring surge:** payroll, corporate cards, credit-line increase.
- **Postings freeze:** early credit-risk watch.

**Architecture:** Instantiates the dataset template (v1.5). Plan 11 (ZoomInfo, monthly) is the closest sibling. There are **four structural deviations**:

1. **Three-way audience (first in the rollout).** The audience predicate joins `V_ACCOUNT_ANCHORS` × `ZOOMINFO_FIRMOGRAPHICS` (FOUNDED_YEAR ≥ 2010, same-month EMPLOYEE_BAND) × `MOODYS_MARKET_CONTEXT` (latest `LIQUIDITY_TIER = 'Illiquid'`). Two **hard** cross-plan dependencies.
2. **Prerequisite fix to Plan 11 (Task 0).** ZoomInfo's `FOUNDED_YEAR` is currently re-drawn every month, so the audience would churn. Task 0 makes it account-stable before anything else lands; see §2.
3. **Lifetime funding timeline (account-only salt).** A per-account funding history (round dates, stages, sizes, investors) is generated once from salt `harmonic_funding` keyed on `ACCOUNT_ID` alone. Each month's row is a *view* of that timeline as of `PROFILE_MONTH`. That gives monotone `TOTAL_RAISED_USD`, ordered stage progression, and `LAST_FUNDING_DATE ≤ PROFILE_MONTH` by construction rather than by checking.
4. **Stateless trajectory recomputation (the Plan 14 pattern, monthly).** `HEADCOUNT_GROWTH_6M_PCT` and `POSTINGS_TREND` recompute headcount and postings for M-6 and M-3 from the same pure function. There is no self-read.

**Depends on:** Plan 0, **Plan 11 (ZoomInfo) — hard dependency, plus Task 0 fix**, **Plan 13 v2 (Moody's) — hard dependency**. The SP fails fast if either table is absent. Independent of Plans 14 and 15. Plan 14 lists a Harmonic→Treasury-intent soft-dep as a follow-up.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `16` |
| `<<DATASET_SLUG>>` | `harmonic-company-signals` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `harmonic_company_signals` |
| `<<MIMICS_VENDOR>>` | `Harmonic` (with Coresignal for headcount mix / job postings) |
| `<<DATASET_TABLE>>` | `HARMONIC_COMPANY_SIGNALS` |
| `<<DATASET_TABLE_LOWER>>` | `harmonic_company_signals` |
| `<<REPO_DIR>>` | `Snowflake_Harmonic_CompanySignals` |
| `<<DC_DMO>>` | `CumulusHarmonicCompanySignals__dlm` |
| `<<DATASET_SALT>>` | `harmonic` (monthly noise: headcount jitter, postings, refresh date) + `harmonic_funding` (account-lifetime funding timeline + dept-mix baseline) — two salts |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_harmonic_company_signals` |
| `<<SP_NAME>>` | `SP_GENERATE_HARMONIC_COMPANY_SIGNALS` |
| `<<CRON>>` | `'USING CRON 0 5 1 * * America/New_York'` (1st of month 05:00 ET). The LIVE ZoomInfo task runs `USING CRON 40 3 1 * * America/New_York` (03:40 ET, logged 08:40 UTC on 2026-11-01), not the `0 7 1 * * UTC` its repo SQL said. Same time zone keeps an 80-minute gap all year, so the same-month band exists. Revised 2026-11-02 from the draft `0 9 1 * * UTC`, which left only 20 min (EST) / 80 min (EDT). |
| `<<AUDIENCE_PREDICATE>>` | See §2: anchor `BUSINESS` + non-Household, ZoomInfo `FOUNDED_YEAR >= 2010`, Moody's latest `LIQUIDITY_TIER = 'Illiquid'` |
| `<<COVERAGE_RULE>>` | distinct accts = audience (one row per audience anchor per month) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 22 data columns (+ `ORG_ID`, `RECORD_ID`) including 6 NULLable, 1 BOOLEAN |

## §2 Audience-predicate probe

```sql
-- Harmonic covers young private companies. Moody's LIQUIDITY_TIER='Illiquid' is the private-company proxy
-- (stable per account); ZoomInfo FOUNDED_YEAR >= 2010 is the "young" cut. COALESCE keeps NULL-category anchors.
SELECT a.ACCOUNT_ID
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS a
JOIN FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS z
  ON z.ACCOUNT_ID = a.ACCOUNT_ID AND z.PROFILE_MONTH = :month
JOIN (SELECT ACCOUNT_ID, LIQUIDITY_TIER FROM FINS.PUBLIC.MOODYS_MARKET_CONTEXT
      QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY PROFILE_DATE DESC) = 1) m
  ON m.ACCOUNT_ID = a.ACCOUNT_ID
WHERE a.ACCOUNT_TYPE_FLAG = 'BUSINESS'
  AND COALESCE(a.CLIENT_CATEGORY, '') <> 'Household'
  AND m.LIQUIDITY_TIER = 'Illiquid'
  AND z.FOUNDED_YEAR >= 2010
```

**Live cardinality (re-probed 2026-11-02 after Task 0, against `DATA_JEDAIS.FINS__PUBLIC`, every ZoomInfo month, §2 SQL verbatim):** **672 anchors** in the latest month (2026-11). FOUNDED_YEAR is now account-stable (0 accounts with >1 distinct value across all 7 months), so the month-to-month growth below is new BUSINESS anchors arriving, not churn: every account in an earlier month's audience is also in the 2026-11 audience (0 missing).

| ZoomInfo PROFILE_MONTH | Audience anchors (rows = distinct accounts) |
|---|---|
| 2026-05 | 650 |
| 2026-06 | 650 |
| 2026-07 | 650 |
| 2026-08 | 650 |
| 2026-09 | 651 |
| 2026-10 | 664 |
| **2026-11 (latest)** | **672** |

| Founded cut | Anchors (2026-11, stable FOUNDED_YEAR) |
|---|---|
| ≥ 2005 | 1,242 |
| ≥ 2008 | 898 |
| **≥ 2010 (chosen)** | **672** |
| ≥ 2012 | 498 |
| ≥ 2015 | 280 |

| ZoomInfo EMPLOYEE_BAND (≥2010 cut, 2026-11) | Anchors |
|---|---|
| 1-10 | 511 |
| 11-50 | 46 |
| 51-200 | 49 |
| 201-1000 | 59 |
| 1001-5000 | 5 |
| 5001-25000 | 2 |

**Why Moody's `Illiquid` and not "no Moody's row"?** Plan 13 v2 covers *every* BUSINESS account, so absence can't signal "private". `LIQUIDITY_TIER='Illiquid'` is stable per account and is the closest synthetic proxy for "not publicly traded". Moody's history is only 90 days deep, so the predicate reads the **latest** row per account rather than month-matching. That's safe because the tier doesn't move.

**FOUNDED_YEAR churn (found at draft time, 2026-11-02) — the reason for Task 0. FIXED by Task 0 (2026-11-02).**
- **Cause:** Plan 11 seeds `_founded_year` (`Snowflake_ZoomInfo_Firmographics/procedures/sp_generate_zoominfo_firmographics.py:293`) from the per-month rng (`seed_for(account_id, DATASET_SALT, month_start)`, line ~516).
- **Effect:** a company's founding year is re-drawn every month. The same predicate run per ZoomInfo month gives 682 / 668 / 642 / 657 / 653 / 657 / 703, with different accounts each month.
- **Conclusion (pre-fix):** the draft-time 703 was one random monthly draw.
- **Resolution:** Task 0 landed; the stable counts are in the tables above (650–672 across the 7 months, 672 latest). That sits inside the L3 550–850 band, so the band is unchanged.

**Size ladder:** ~650–672 anchors × 1 row/month ≈ **~670 rows/month**. With the 7-month backfill (aligned to ZoomInfo's history) the total is **4,587 rows** (sum of the per-month counts above).

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-16-harmonic-company-signals-rowspec.md`

The attachment contains:
- 22-data-column DDL (16 NOT NULL + 6 NULLable) plus `ORG_ID` + `RECORD_ID`, and PK `(ACCOUNT_ID, PROFILE_MONTH)`.
- The lifetime funding timeline: destiny class, stage ladder, round sizes and investors by band.
- The as-of-month view that derives the funding columns.
- Headcount-in-band and growth recomputation.
- Coresignal dept mix and postings, plus the runway / valuation / traction formulas.
- `_row_for(anchor, zi_row, run_ts)` skeleton.
- L1 targets.

## §4 What changes from the v1.5 template (Plan 11 baseline)

0. **Task 0 (prerequisite — Plan 11 fix, lands first, own commit).**
   - In `sp_generate_zoominfo_firmographics.py`, give `_founded_year` its own account-stable rng: `random.Random(seed_for(account_id + "_founded", DATASET_SALT, datetime(2000, 1, 1)))`. Do **not** pull from the monthly `rng`.
   - Removing the founded draw from the monthly stream **shifts every later draw** in that row, including WEBSITE_DOMAIN suffix, LINKEDIN_FOLLOWERS and TECH_STACK_FLAGS. This is acceptable because those fields already re-draw monthly. Call it out in the commit message.
   - `high = min(high, current_year)` is a no-op once every band's `high` is ≤ 2024 (true today). Leave a comment noting that a band with a `high` > current year would re-introduce year-to-year drift.
   - Add an L1 test: `FOUNDED_YEAR` is identical across 12 consecutive `run_ts` months for the same anchor.
   - **Redeploy and rewrite history:**
     1. Redeploy the SP and `CALL` it once for the current month.
     2. Run a one-off history rewrite: `UPDATE ZOOMINFO_FIRMOGRAPHICS t SET FOUNDED_YEAR = c.FOUNDED_YEAR FROM (SELECT ACCOUNT_ID, FOUNDED_YEAR FROM ZOOMINFO_FIRMOGRAPHICS WHERE PROFILE_MONTH = :current) c WHERE t.ACCOUNT_ID = c.ACCOUNT_ID AND t.PROFILE_MONTH < :current`. Plan 11 has no backfill arg; this is cheaper than adding one.
     3. Verify: `SELECT COUNT(*) FROM (SELECT ACCOUNT_ID FROM ZOOMINFO_FIRMOGRAPHICS GROUP BY 1 HAVING COUNT(DISTINCT FOUNDED_YEAR) > 1)` = **0**.
   - Re-probe the §2 audience on every month and record the count here.

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Three-way audience.** Use the §2 SQL verbatim. Keep the comment, and the `COALESCE`.
   - **Hard deps.** Probe `INFORMATION_SCHEMA.TABLES` for both `ZOOMINFO_FIRMOGRAPHICS` and `MOODYS_MARKET_CONTEXT`, and raise if either is missing. Also raise if ZoomInfo has **no row for `:month`**, which means the ZoomInfo task hasn't run yet. Don't silently emit an empty month.
   - **Funding timeline is account-lifetime.** Salt `harmonic_funding` with `datetime(2000, 1, 1)` and key `ACCOUNT_ID`. Never seed it from `PROFILE_MONTH`: that would break monotonicity.
   - **Trajectory recomputation.** `_headcount_for(anchor, band, month)` and `_postings_for(anchor, band, month)` are pure functions. Growth and trend call them for M-6 / M-3. No `SELECT` from `HARMONIC_COMPANY_SIGNALS` inside the SP.
   - **Headcount stays inside the ZoomInfo band** of the *same* month. Prior-month recomputation uses that month's band, and the SP reads ZoomInfo history from `M_first - 9` through `M_last` (M-3's growth needs the M-9 headcount). If an older month is missing (pre-history), fall back to M's band.
   - DC mapping descriptions ≤521 chars.

2. **Task 2 (table DDL).**
   - `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'`, then `RECORD_ID VARCHAR(36) NOT NULL` = `record_id_for(org_id, account_id, profile_month)`.
   - PK `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`.
   - `_STAGING` sibling.
   - Schema at `Snowflake_Harmonic_CompanySignals/schemas/harmonic_company_signals.sql`.

3. **Task 3 (L1 tests).** Inline **10-anchor** fixture with a synthetic ZoomInfo dict covering every band (1-10 ×4, 11-50 ×2, 51-200, 201-1000, 1001-5000, 5001-25000). INDUSTRY covers Technology, Healthcare, Restaurant, Construction, Professional Services and NULL. Property #4 classes:
   - **4a Range:**
     - ENG + SALES + OPS percentages each in [0,100] with sum ≤ 100; TRACTION_SCORE in [0,100].
     - HEADCOUNT within the band bounds; HEADCOUNT_GROWTH_6M_PCT in [-60, 300].
     - OPEN_JOB_POSTINGS ≥ 0; EST_RUNWAY_MONTHS in [0, 60] or NULL.
   - **4b Vocabulary:** FUNDING_STATUS ∈ {Bootstrapped, Angel-Seed, Venture-Backed, PE-Backed}; LAST_FUNDING_STAGE ∈ the 8-stage ladder or None; POSTINGS_TREND ∈ {Accelerating, Steady, Slowing, Frozen}.
   - **4c Timeline monotonicity (load-bearing).** For each anchor over 36 consecutive months:
     - TOTAL_RAISED_USD and FUNDING_ROUNDS_COUNT are non-decreasing;
     - the LAST_FUNDING_STAGE ladder index is non-decreasing;
     - LAST_FUNDING_DATE ≤ last day of PROFILE_MONTH;
     - FUNDING_STATUS never goes back to `Bootstrapped` after a round.
   - **4d Cross-field:**
     - `Bootstrapped` ⇔ FUNDING_ROUNDS_COUNT = 0 ⇔ TOTAL_RAISED_USD = 0 ⇔ every funding NULLable is NULL.
     - EST_RUNWAY_MONTHS is non-NULL only for Angel-Seed / Venture-Backed.
     - `RECENTLY_FUNDED_FLAG` ⇔ LAST_FUNDING_DATE ≥ PROFILE_MONTH − 90 days.
     - LAST_ROUND_USD ≤ TOTAL_RAISED_USD.
   - **4e Bias band.** Over 1,000 synthetic anchors:
     - Technology is Venture-Backed or Angel-Seed ≥ 45%; Restaurant/Construction are Bootstrapped ≥ 75%.
     - 1-10 band never exceeds `Seed`.
   - **Schema:** dict keys = 22 data columns.

4. **Task 4 (SP).**
   - `SP_GENERATE_HARMONIC_COMPANY_SIGNALS(BACKFILL_MONTHS INTEGER DEFAULT 0)`, using the Plan 14 pattern at monthly grain. The TASK calls the no-arg form.
   - MERGE `ON (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`; there's no fan-out, so MERGE-only is fine.
   - Boolean cast on `RECENTLY_FUNDED_FLAG`; `TO_TIMESTAMP_NTZ(... / 1e9)` on GENERATED_AT.
   - `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER/1e9))` on PROFILE_MONTH, LAST_FUNDING_DATE (NULLable; this is exactly the all-NULL mistype case) and LAST_DATA_REFRESH_DATE.
   - `assert_coverage` against the §2 SQL for the run month.

5. **Task 5 (L2).**
   - Fixtures: `V_ACCOUNT_ANCHORS_FIXTURE`, `ZOOMINFO_FIRMOGRAPHICS_FIXTURE` (7 months, stable FOUNDED_YEAR, 2 anchors at 2008 so they're excluded) and `MOODYS_MARKET_CONTEXT_FIXTURE` (1 anchor `Liquid`, so excluded).
   - **Assertions:**
     - Distinct accounts = fixture audience size.
     - `CALL SP(6)` gives 7 months.
     - The monotonicity SQL (see Task 8) returns 0 violations.
     - An idempotent re-run leaves the checksum unchanged.
     - Month-M rows from the backfill are byte-identical to a standalone month-M run, excluding GENERATED_AT.
   - **Negative test:** drop the ZoomInfo fixture's current-month rows; the SP raises.

6. **Task 6 (deploy).**
   - Clone Plan 11's `deploy_sp.py` (monthly) and add the two salts.
   - Cron `0 5 1 * * America/New_York` (revised from the draft `0 9 1 * * UTC`, see §1), `MAIN_WH_XS`, `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()', 2)`.
   - After deploy: `CALL FINS.PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS(6)` once. That gives 7 months, matching ZoomInfo's history.

7. **Task 7 (DC stream + DMO).** Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | RECORD_ID | recordId__c | Text (PK) |
   | ORG_ID | orgId__c | Text |
   | ACCOUNT_ID | ssot__AccountId__c | Text (KQ → `ssot__Account__dlm`) |
   | PROFILE_MONTH | profileMonth__c | Date (MM/dd/yyyy) |
   | FUNDING_STATUS | fundingStatus__c | Text |
   | LAST_FUNDING_STAGE | lastFundingStage__c | Text (NULLable) |
   | LAST_FUNDING_DATE | lastFundingDate__c | Date (MM/dd/yyyy, NULLable) |
   | LAST_ROUND_USD | lastRoundUsd__c | Number (NULLable) |
   | TOTAL_RAISED_USD | totalRaisedUsd__c | Number |
   | FUNDING_ROUNDS_COUNT | fundingRoundsCount__c | Number |
   | LEAD_INVESTOR | leadInvestor__c | Text (NULLable) |
   | EST_VALUATION_USD | estValuationUsd__c | Number (NULLable) |
   | EST_RUNWAY_MONTHS | estRunwayMonths__c | Number (NULLable) |
   | RECENTLY_FUNDED_FLAG | recentlyFundedFlag__c | Boolean |
   | HEADCOUNT | headcount__c | Number |
   | HEADCOUNT_GROWTH_6M_PCT | headcountGrowth6mPct__c | Number |
   | TRACTION_SCORE | tractionScore__c | Number |
   | ENG_HEADCOUNT_PCT | engHeadcountPct__c | Number |
   | SALES_HEADCOUNT_PCT | salesHeadcountPct__c | Number |
   | OPS_HEADCOUNT_PCT | opsHeadcountPct__c | Number |
   | OPEN_JOB_POSTINGS | openJobPostings__c | Number |
   | POSTINGS_TREND | postingsTrend__c | Text |
   | LAST_DATA_REFRESH_DATE | lastDataRefreshDate__c | Date (MM/dd/yyyy) |
   | GENERATED_AT | generatedAt__c | DateTime |

8. **Task 8 (L3 smoke).** Re-probed audience count (expect 550–850) equals distinct accounts per month; 7 distinct months. Spot-check:
   - **Monotonicity SQL** (must be 0): `LAG(TOTAL_RAISED_USD) OVER (PARTITION BY ACCOUNT_ID ORDER BY PROFILE_MONTH) > TOTAL_RAISED_USD`, and the same for FUNDING_ROUNDS_COUNT.
   - **Date sanity:** 0 rows with `LAST_FUNDING_DATE > LAST_DAY(PROFILE_MONTH)`.
   - **Band sanity:** 0 rows where HEADCOUNT falls outside the same-month ZoomInfo EMPLOYEE_BAND, joined on (ACCOUNT_ID, PROFILE_MONTH).
   - **Mix:** Bootstrapped ~55–70%, Angel-Seed ~15–25%, Venture-Backed ~8–18%, PE-Backed ~3–10% (audience is 80% 1-10-employee firms).
   - **Fresh rounds:** RECENTLY_FUNDED_FLAG on 2–6% of rows per month; at least one Bootstrapped→funded transition visible across the 7 months.
   - **Runway:** among Venture-Backed + Angel-Seed, EST_RUNWAY_MONTHS < 9 on 15–30%. That's the venture-debt / deposit-flight list.
   - **Postings:** `Frozen` ≥ 2× more common among negative-growth rows than among positive-growth rows.
   - **Demo pick:** Commercial Banking anchors with `RECENTLY_FUNDED_FLAG` and LAST_ROUND_USD ≥ $5M (the treasury/sweep list), and Venture-Backed with runway < 6 and `POSTINGS_TREND IN ('Slowing','Frozen')` (the risk list).

## §5 Self-review checklist

- [x] Task 0 landed first: FOUNDED_YEAR stable across all ZoomInfo months (0 accounts with >1 distinct value); audience re-probed and recorded.
- [x] Audience SQL reads Moody's latest row per account (QUALIFY), not month-matched.
- [x] SP raises when ZoomInfo or Moody's is missing, or ZoomInfo lacks the run month.
- [x] Funding timeline seeded account-only (`harmonic_funding`, `datetime(2000,1,1)`); monotonicity holds by construction.
- [x] HEADCOUNT within the same-month band; growth/trend recomputed, no self-read.
- [x] Dept percentages sum ≤ 100.
- [x] 6 NULLable (incl. NULLable DATE) / 1 BOOLEAN handled in the MERGE casts.
- [x] `BACKFILL_MONTHS` arg; TASK calls the no-arg form.
- [x] No `<<` placeholders left (the only `<<…>>` tokens are the §1 placeholder-definition table; none remain in the repo).

## §6 Out of scope

- Real Harmonic / Coresignal / Crunchbase / PitchBook data, investor-graph fidelity, or round-level cap tables.
- Public companies (Moody's covers them), and companies founded before 2010 (ZoomInfo covers them as static firmographics).
- Feeding funding events into Plan 14's Treasury Management intent (listed in Plan 14 §6), or adding `INVESTOR` edges to Plan 9's relationship graph.
- Founder / executive identity (Plan 10 BoardEx and Plan 15 UserGems cover people).
- Fixing ZoomInfo's other monthly-redrawn static-ish fields (WEBSITE_DOMAIN, LINKEDIN_FOLLOWERS). Only FOUNDED_YEAR feeds an audience, so only it is fixed here.

## §7 Status

**LIVE in Snowflake 2026-11-02; DC mapping pending UI.** Drafted 2026-11-02 from the vendor-gap assessment. Tasks 0–6 and 8 are done; Task 7's mapping table is recorded in `Snowflake_Harmonic_CompanySignals/AGENTS.md` with status "DC mapping pending UI" (same as Plans 1–13). Plan-owner sign-off on the revised timeline / destiny / runway / postings parameters (rowspec revision note) is still pending.

**Task 6 (deploy).** `SP_GENERATE_HARMONIC_COMPANY_SIGNALS(BACKFILL_MONTHS INTEGER DEFAULT 0)` deployed to `DATA_JEDAIS.FINS__PUBLIC` (the live namespace this plan's `FINS.PUBLIC` means). `TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS` created and resumed: state `started`, `USING CRON 0 9 1 * * UTC` (re-created 2026-11-02 on `USING CRON 0 5 1 * * America/New_York` after the final review found the live ZoomInfo schedule drift), `MAIN_WH_XS`, `SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()', 2)`. The one-time `CALL …(6)` returned `SUCCEEDED rows=4587 accounts=672 months=7 (2026-05-01..2026-11-01)` (log `DURATION_MS` 52367).

**Task 8 (L3 smoke, 2026-11-02): every check passes.** All figures are from live query output.

| Check | Target | Live |
|---|---|---|
| Rows per month = re-probed §2 audience | equal, 7 months | 650 / 650 / 650 / 650 / 651 / 664 / 672 (2026-05 … 2026-11), all equal; 4,587 rows, 672 accounts, 7 months |
| Latest audience | 550–850 | 672 |
| Monotonicity (TOTAL_RAISED, ROUNDS; plus stage index, funded→Bootstrapped) | 0 | 0 / 0 / 0 / 0 |
| `LAST_FUNDING_DATE > LAST_DAY(PROFILE_MONTH)` | 0 | 0 |
| HEADCOUNT outside same-month ZoomInfo band | 0 | 0 of 4,587 |
| Mix | Boot 55–70, Angel 15–25, VC 8–18, PE 3–10 % | 61.91 / 22.17 / 11.79 / 4.12 % |
| RECENTLY_FUNDED per month | 2–6 % | 3.38 / 2.62 / 3.54 / 3.38 / 3.23 / 2.86 / 2.38 % |
| Bootstrapped→funded transitions | ≥ 1 | 10 (10 accounts) |
| Runway < 9 among Angel-Seed + VC | 15–30 % | 22.40 % (349 / 1,558) |
| Frozen, negative vs positive growth | ≥ 2× | 53.58 % vs 22.60 % = 2.37× |
| Demo: CB + fresh round ≥ $5M | non-empty | 6 / 6 / 8 / 8 / 7 / 6 / 3 per month |
| Demo: VC, runway < 6, Slowing/Frozen | non-empty | 3 / 5 / 2 / 4 / 6 / 8 / 7 per month |

Also 0 on every 4a / 4d check, 0 duplicate PKs, 0 RECORD_ID mismatches against the SQL formula, and an unchanged `HASH_AGG(*)` after re-running `CALL …()`. No mix band missed, so no estimate had to be revised. The closest call is 2026-11's RECENTLY_FUNDED share (2.38 % vs the 2 % floor). One ZoomInfo account changed band in the window, but it is outside this audience, so the monotonicity SQL needed no band-change exclusion. Full detail: `Snowflake_Harmonic_CompanySignals/AGENTS.md` → "L3 smoke".

**Runway caveat (for plan-owner review, verified live 2026-11-02).** The runway band passes mostly on floor-clamped zeros: `EST_RUNWAY_MONTHS = 0` on 259 of the 349 under-9 rows (74 %), out of 1,558 Angel-Seed + Venture-Backed rows. So the under-9 list is a pile-up at 0 (including companies still operating after Series C), not a spread of short runways. Options: floor runway at 1–3 months, or model a bridge round / shutdown once runway is used up. Left as-is pending plan-owner sign-off on the revised parameters.

Plan 16 is the first dataset with a **three-way audience** (anchor × ZoomInfo × Moody's), the first to **ship a prerequisite fix to an upstream plan** (Task 0), and the first to model a **lifetime event timeline viewed as-of each period**.
