# AGENTS.md — Snowflake_Harmonic_CompanySignals

Synthetic Harmonic-style **private-company funding and traction** signals, with Coresignal-style department mix and job postings, for the Cumulus FSC demo. Plan 16 (one of 16). Monthly cadence, 1:1: one row per audience anchor per month. **It is the first plan with a three-way audience (anchor × ZoomInfo × Moody's), the first to ship a prerequisite fix to an upstream plan (Task 0, ZoomInfo FOUNDED_YEAR), and the first to view a lifetime event timeline as of each period.**

## Status

| Task | State |
|---|---|
| T0 ZoomInfo FOUNDED_YEAR account-stable | done (commit `3cba15fdc`, see `../Snowflake_ZoomInfo_Firmographics/AGENTS.md`) |
| T1 scaffold | done |
| T2 DDL (`schemas/harmonic_company_signals.sql`, table + `_STAGING`) | done; **deployed live 2026-11-02** (both tables 24 columns, 6 NULLable, 0 rows) |
| T3 row factory + L1 tests (`procedures/sp_generate_harmonic_company_signals.py`) | done; **timeline revised 2026-11-02** after review (era-anchored rounds, planned-horizon runway, growth-coupled postings, industry prefix normalisation). 40 L1 tests green (33 row-factory + 7 live-shape distribution); `main` / MERGE land in T4 |
| T4 SP entry point (`main`, MERGE, hard-dep probes, coverage, log) | done 2026-11-02; 26 L1 tests in `tests/test_harmonic_company_signals_sp_main.py` |
| T5 `scripts/deploy_sp.py` (both salts) + TASK SQL + L2 | done 2026-11-02. SP **deployed live** (`SP_GENERATE_HARMONIC_COMPANY_SIGNALS(DEFAULT NUMBER)`, procedure only; the real table is still 0 rows). L2 `tests/integration/test_harmonic_company_signals_sp.sql`: 18/18 TRUE, including 5 negative tests. 7 L1 tests for the deploy script and TASK SQL |
| T6 create TASK + `CALL …(6)` backfill | done 2026-11-02. SP redeployed from this commit (generated SQL byte-identical to the committed file). `TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS` created and RESUMEd (`started`, `USING CRON 0 9 1 * * UTC`, `MAIN_WH_XS`). `CALL …(6)` returned `SUCCEEDED rows=4587 accounts=672 months=7 (2026-05-01..2026-11-01)` in ~52 s (TASK_EXECUTION_LOG `DURATION_MS` 52367) |
| T8 L3 smoke | done 2026-11-02; **every check passes**, see "L3 smoke" below |
| T7 DC stream + DMO | **DC mapping pending UI** (mapping table below) |

## Boundaries
- Owns `DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS` and `..._STAGING`, plus `SP_GENERATE_HARMONIC_COMPANY_SIGNALS`, `TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS`, and the DC Data Stream / DLO / DMO `CumulusHarmonicCompanySignals__dlm`.
- Does NOT own `V_ACCOUNT_ANCHORS`, `ZOOMINFO_FIRMOGRAPHICS` (Plan 11), `MOODYS_MARKET_CONTEXT` (Plan 13 v2), or the `seed_for` / `assert_coverage` / `record_id_for` helpers. Those belong to their own repos and to `Snowflake_Cumulus_Common`; `scripts/deploy_sp.py` inlines the helpers. Don't edit Cumulus_Common from here.
- **Account-scoped, 1:1 monthly.** PK `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`. FK `ACCOUNT_ID` points to `ssot__Account__dlm`. The DC PK is the single column `recordId__c`.

## Conventions
- **Namespace.** Everything lives in `DATA_JEDAIS.FINS__PUBLIC` like the 13 live siblings. The plan text says `FINS.PUBLIC`, but there is no `FINS` database in the account.
- **Two salts:**
  - `harmonic_funding`, always at the fixed epoch `datetime(2000, 1, 1)`. Drives everything account-lifetime: the funding destiny and round timeline (key `ACCOUNT_ID`), per-round valuation multiple (key `f"{ACCOUNT_ID}_{round_date}_{stage}"`), headcount resting position and drift (`_hc`), lean-hirer flag (`_post`), planned runway horizon (`_burn`) and the dept-mix baseline (`_dept`).
  - `harmonic`, month-bucketed (`datetime(year, month, 1)`). Drives the monthly noise: headcount jitter (key `ACCOUNT_ID`), postings multiplier (`_post`), dept-mix jitter (`_dept`) and LAST_DATA_REFRESH_DATE (`_refresh`).
  - Each field group gets its own `random.Random` with its own key suffix, so adding a draw to one group never shifts another.
- **Month anchor.** `PROFILE_MONTH = run_ts` truncated to the 1st; `GENERATED_AT = PROFILE_MONTH 00:00:00`. Every `run_ts` in a month gives a byte-identical row.
- **Row factory shape.** `_row_for(anchor, zi, run_ts)` returns exactly the 22 data columns. `zi` maps a first-of-month `date` to that month's ZoomInfo row (`EMPLOYEE_BAND`, `FOUNDED_YEAR`) for this account. The SP stamps `ORG_ID` and `RECORD_ID` with `_with_ids(row, org_id)`, which uses `record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`.
- `accounts_processed` = audience size = row count.

## Tests
- **L1 row factory** (`tests/test_harmonic_company_signals_row_factory.py`, 33 tests) runs on the inline 10-anchor fixture in `tests/conftest.py`, not on the shared SAMPLE_ANCHORS. Run it with `python3 -m pytest -q` from this directory.
  - **The 10-anchor fixture is a code-coverage fixture, not representative of the live audience** (flat band/industry mix, hand-picked ID suffixes). Don't read distribution behaviour off it.
  - Covers determinism, audience scoping, the AUDIENCE_SQL fragments, the 22-column contract, the RECORD_ID formula, timeline stability (36 monthly rows rebuild one lifetime round list), timeline shape and era anchoring, industry prefix normalisation, PE-first destiny order, 4a range, 4b vocabulary, 4c monotonicity over 36 months, 4d cross-field, 4e bias over 1,000 synthetic anchors, the band bound, band-change and missing-month fallback, growth/trend recomputation, the no-self-read and no-ampersand guards, and the boring case.
  - Fixture ID suffixes (anchor 1 `AAA` founded 2019, 7 `AAA`, 8 `AAC`) were picked so the fixture shows all four FUNDING_STATUS values and a Bootstrapped→Angel-Seed transition inside 2025-01…2027-12. If seeding changes, re-pick them; `test_fixture_exercises_destinies` fails loudly.
- **L1 distribution** (`tests/test_harmonic_company_signals_distribution.py`, 7 tests) runs the row factory over the live audience shape (`tests/fixtures/live_audience_shape.csv`: the §2 audience aggregated to band × founded × industry × category × first month, 672 anchors / 4,587 rows, pulled read-only 2026-11-02, no account IDs; synthetic IDs ×3 replicas). It asserts the plan Task 8 targets: mix (Bootstrapped 55–70 / Angel-Seed 15–25 / Venture-Backed 8–18 / PE-Backed 3–10 %), RECENTLY_FUNDED 2–6 % every month, ≥1 Bootstrapped→funded transition, runway < 9 on 15–30 % of Angel-Seed + Venture-Backed, Frozen ≥ 2× more common at negative vs positive growth, and non-empty demo lists. Re-pull the shape if the audience moves a lot.
  - The test module imports helpers as `from tests.conftest import zi_const` (tests/ is a package).
- **L1 SP entry point** (`tests/test_harmonic_company_signals_sp_main.py`, 26 tests) drives `main` through a fake Snowpark session that routes SQL by substring. It covers the month list (`_target_months`, 0..36), the §2 audience binding, the coverage SQL (and that it is the only `FROM {TABLE}` in the module), each hard-dependency failure, fail-fast before any write with a FAILED log row, the empty-audience, row-failure and coverage-gap raises, the ZoomInfo window M_first-9..M_last, backfill rows equal to standalone rows, staging dtypes (including an all-NULL batch and the ns epoch), and the MERGE casts and keys.
  - The routing keys on SQL prefixes (`SELECT anc.ORG_ID`, `SELECT z.ACCOUNT_ID, z.PROFILE_MONTH`, `SELECT COUNT(*) FROM …MOODYS_MARKET_CONTEXT`, …). If you reword a query in the SP, update the fake.
- **L1 deploy** (`tests/test_harmonic_company_signals_deploy.py`, 7 tests): the generated signature, both salts in the header and body, inlined helpers and no `cumulus_common` import, an ast-parsable body, no `&`, an unflagged `snow`, and the TASK SQL cron/warehouse/wrapper.
- **L2** (`tests/integration/test_harmonic_company_signals_sp.sql`) clones the deployed SP via `GET_DDL('PROCEDURE', '…(NUMBER)')` and swaps the anchors view, both dependency tables (`ZOOMINFO_FIRMOGRAPHICS_HFIX` / `MOODYS_MARKET_CONTEXT_HFIX`, FQN-qualified swaps only so the error text's `TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS` survives), the table, staging and task names. Fixture: 6 in-audience anchors plus 5 excluded (2 founded 2008, 1 whose latest Moody's tier is `Tier 2` after an older `Illiquid` row, Household, PERSON), ZoomInfo M-6..M relative to the current UTC month (plus a duplicate row), a duplicate older anchor snapshot. It asserts 42 rows / 7 months, per-month §2 coverage, funding monotonicity, as-of-month dates, NULLable consistency, ranges, the band bound, the RECORD_ID SQL formula, month-bucketed timestamps, idempotency for `(6)` and `()`, backfill month M = standalone month M, and 4 raising runs (`(7)`, ZoomInfo month M deleted, Moody's dropped, `(-1)`) that write nothing, plus the log rows. Every column must be TRUE. Run it with the deploy connection below.
  - Live Moody's tiers are `Tier 1` / `Tier 2` / `Tier 3` / `Illiquid`. There is no `Liquid` value.

## Gotchas
- **Three-way audience.** Use the plan §2 SQL verbatim, comment included. It joins `V_ACCOUNT_ANCHORS` × `ZOOMINFO_FIRMOGRAPHICS` (same month, `FOUNDED_YEAR >= 2010`) × the **latest** `MOODYS_MARKET_CONTEXT` row per account (`QUALIFY ROW_NUMBER() … ORDER BY PROFILE_DATE DESC = 1`, `LIQUIDITY_TIER = 'Illiquid'`).
  - Moody's history is only 90 days deep, so don't month-match it. The tier is stable per account.
  - **Keep the `COALESCE(a.CLIENT_CATEGORY, '') <> 'Household'`.** `NULL <> 'Household'` is NULL in SQL and would drop the NULL-category anchors.
  - The Python mirror `_anchor_in_audience` checks the anchor half (BUSINESS, non-Household, non-empty id) and `_row_for` checks `FOUNDED_YEAR >= 2010` on the month's ZoomInfo row. It can't check Moody's.
- **Hard dependencies.** Task 4 must probe `INFORMATION_SCHEMA.TABLES` for both `ZOOMINFO_FIRMOGRAPHICS` and `MOODYS_MARKET_CONTEXT` and raise if either is missing. It must also raise if ZoomInfo has **no row for `:month`**, which means the ZoomInfo task hasn't run yet. Don't silently emit an empty month. `_row_for` raises `ValueError` when `zi` lacks the run month too.
- **Funding timeline is account-lifetime.** `_timeline(anchor, founded_year, band)` seeds `harmonic_funding` with `datetime(2000, 1, 1)` keyed on `ACCOUNT_ID`. **Never seed it from `PROFILE_MONTH`**: a per-month draw would break monotonicity. Each month's funding columns are `_funding_as_of(rounds, month_end, account_id)`, a filter on that one list. That gives non-decreasing `TOTAL_RAISED_USD` / `FUNDING_ROUNDS_COUNT` / stage index and `LAST_FUNDING_DATE ≤ month_end` by construction. Rounds dated after the month are simply not visible yet, which is how Bootstrapped→funded transitions show up.
- **Rounds are era-anchored, not founding-anchored.** The live audience is founded 2010–2023 (none later), so the original "first round 4–30 months after founding" put every round years before the 2026 window: 81 % Bootstrapped, ~0 % recently funded, runway 0 on 759 rows, 0 transitions. Each funded account now draws a pivot day uniformly in `[_PIVOT_START, _PIVOT_END]` = 2022-01-01 … 2027-12-31 (PE: 730 days earlier) and raises a pivot stage there (index drawn from the upper half of its ladder); earlier stages go backwards from the pivot and later ones forwards, 10–25 months apart. Rounds before `founded + 120 days` or after 2030-12-31 are dropped (their draws are still consumed, so the stream stays aligned).
- **Destiny tables** (`_DESTINY_P`) are split micro (1-10) vs non-micro, tuned on the live shape. PE (PE bands only, scaled by `_PE_TILT`) is rolled **first**, so a high venture probability can't crowd it out. Probabilities are cumulative; when they sum past 1 (Technology in PE bands) angel, then venture, get the remainder.
- **Per-round valuation seed includes ACCOUNT_ID.** The rowspec's `_funding_as_of` sketch keys the valuation multiple on `f"{d}_{st}"` only. The rowspec text says to use `f"{account_id}_{d}_{st}"`, and so does the code. Otherwise two accounts with a same-day, same-stage round would share a multiple.
- **Timeline inputs.** `ACCOUNT_ID`, `founded_year` (account-stable after Task 0) and `band` (deterministic from EMPLOYEE_COUNT in Plan 11). If the band changes upstream, the timeline can change. That's a genuine re-baseline. The L3 monotonicity SQL should exclude band-change months.
- **Trajectory recomputation, no self-read.** `_headcount_for(anchor, band, month, rounds)` and `_postings_for(anchor, band, month, rounds, hc, runway, growth)` are pure. `_month_state(anchor, zi, month, fallback_band, rounds)` computes a month's funding view, headcount, 6-month growth, runway and postings; `_row_for` calls it for M and M-3 (which in turn reads M-6 / M-9 headcount). **No `SELECT` from `HARMONIC_COMPANY_SIGNALS` inside the SP**; an L1 guard test greps the module for it.
- **Headcount stays inside the same-month ZoomInfo band.** The prior-month recomputation uses that month's band, so the SP must read the ZoomInfo rows for M, M-3 and M-6. If an older month is missing (pre-history), fall back to M's band.
- **Runway is planned-horizon burn.** A round is sized for an account-stable planned runway of 30–66 months (`_PLANNED_RUNWAY`), so net burn at the round is `LAST_ROUND_USD / planned`, scaled by `hc / hc_at_round_month` (hiring burns cash faster). Runway = round / burn − months since the round, clamped [0, 60]. The rowspec's original `hc × U(9K, 16K)` burn gave a 600-person company a $7.5M/month burn and runway < 9 on ~98 % of funded rows.
- **Postings couplings.** Base rate 0.04/head (+0.05 with a round in the trailing 180 days); ×2.5 when 6-month growth > 0, ×0.25 when < 0; ×0.2 for an account-stable lean hirer; ×0.3 for Angel-Seed / Venture-Backed with `EST_RUNWAY_MONTHS < 6`. The expected count is stochastically rounded (floor + Bernoulli on the fraction, monthly rng), so small companies don't always round to 0 (the old round() made Frozen ~universal for 1-10 firms, ratio 0.81). Runway is computed before postings from the funding view and headcount, so there's no cycle. The M-3 postings used for the trend use M-3's own funding view, runway and headcount, so they equal what the M-3 row stores (with the same band).
- **Write path (Task 4).**
  - MERGE `ON (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`. There's no fan-out, so MERGE-only is fine.
  - `RECENTLY_FUNDED_FLAG::BOOLEAN`.
  - `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)`.
  - `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER / 1e9))` for PROFILE_MONTH, LAST_FUNDING_DATE and LAST_DATA_REFRESH_DATE. LAST_FUNDING_DATE is NULLable and is often all-NULL in a batch, which is exactly the write_pandas mistype case. Coerce the date columns with `pd.to_datetime` on the pandas side first.
  - Write `RECORD_ID` on INSERT **and** UPDATE.
  - `write_pandas(auto_create_table=True, overwrite=True)` recreates `_STAGING` from the DataFrame dtypes, dropping the DDL'd types. **Shipped choice:** keep that path with the casts. `_staging_frame` coerces the dates and GENERATED_AT to `datetime64[ns]`, the 3 nullable ints to `Int64` and the nullable strings to `string`, so an all-NULL batch still gets a usable type.
  - **Run semantics.** The month list is M-N..M. Dependency probes run first. A month with an empty audience raises. ZoomInfo is read once for M_first-9..M_last (deduped per account and month). Any row-factory error fails the whole run before any write, because it would be a coverage gap anyway. There is one MERGE, then `assert_coverage` for each month. A TASK_EXECUTION_LOG row is written in `finally`, on success and on failure.
  - Snowflake reports the deployed signature as `(DEFAULT NUMBER)`. `CALL …()` resolves to it.
- **SP signature:** `SP_GENERATE_HARMONIC_COMPANY_SIGNALS(BACKFILL_MONTHS INTEGER DEFAULT 0)`. `0` runs the current month only (the TASK path). `N` runs months M-N … M in ascending order. One SP, no inter-SP imports. DROP the procedure before redeploying if the signature changes.
- **Industry lookups are prefix-normalised** by `_canon_industry` (`_INDUSTRY_PREFIXES`) before the venture tilt, PE tilt and dept-mix lookups: `Healthcare Systems` / `Healthcare & Life Sciences` → Healthcare, `Wholesale Distribution` → Wholesale, `Professional Services Mid-Market` → Professional Services, `Real Estate Holdings` → Real Estate, `Retail` → Retail Trade, `Hospitality` → Restaurant. The empty string and unlisted industries (Insurance, Communications, Other) keep tilt 1.0 and the default dept mix. `_DEPT_BASE` gained Wholesale (5, 30, 55) and Real Estate (3, 40, 30).
- **Band coverage.** `_BAND_BOUNDS` covers the six bands present in the audience (1-10 … 5001-25000). An unknown band, including ZoomInfo's `25001+`, falls back to `(1, 10)` per the rowspec, which would fail the L3 band check. No `25001+` anchor is in the audience today (2026-11-02 probe).
- **No bare `&` anywhere in SQL or in the inlined SP body** (snow sql template trap). The investor is `Founder friends and family`, and the dept remainder is written "G and A".
- **Deploy connection.** `~/.snowflake/config.toml` sets `default_connection_name` to the dead `GSB13421_jwt` account. Select the JWT connection with `SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt` and pass `--role ACCOUNTADMIN` (the siblings' objects are owned by ACCOUNTADMIN). Never pass `-c`, which triggers an OAuth popup.
- DC mapping descriptions must be ≤521 chars (Plan 6 finding).

## L3 smoke (Task 8) — live results 2026-11-02

Read from `DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS` right after `CALL …(6)`. All numbers come from query output.

| Check | Target | Live |
|---|---|---|
| Rows / months / accounts | 7 months, distinct accts = §2 audience per month | 4,587 rows, 7 months, 672 accounts. Per month 650 / 650 / 650 / 650 / 651 / 664 / 672 (2026-05 … 2026-11), each equal to the re-probed §2 audience (all 7 TRUE) |
| Audience size (latest) | 550–850 | 672 |
| PK / RECORD_ID | unique, SQL formula | 0 duplicate `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`; 4,587 distinct RECORD_IDs; 0 mismatches against the SQL `record_id_for` formula |
| Monotonicity | 0 | TOTAL_RAISED_USD 0, FUNDING_ROUNDS_COUNT 0, stage-ladder index 0, funded→Bootstrapped 0 |
| Date sanity | 0 rows with `LAST_FUNDING_DATE > LAST_DAY(PROFILE_MONTH)` | 0 |
| Band sanity | 0 out-of-band vs same-month ZoomInfo | 0 of 4,587 (every row joined a same-month ZoomInfo row) |
| Mix (all rows) | Boot 55–70 / Angel 15–25 / VC 8–18 / PE 3–10 % | Bootstrapped 61.91 % (2,840), Angel-Seed 22.17 % (1,017), Venture-Backed 11.79 % (541), PE-Backed 4.12 % (189). Per month: Boot 61.2–62.5, Angel 21.7–23.1, VC 11.7–12.0, PE 4.0–4.2 |
| RECENTLY_FUNDED per month | 2–6 % | 3.38 / 2.62 / 3.54 / 3.38 / 3.23 / 2.86 / 2.38 % (22 / 17 / 23 / 22 / 21 / 19 / 16 rows). Lowest is 2026-11 at 2.38 %, inside the band but close to the 2 % floor |
| Bootstrapped→funded transitions | ≥ 1 | 10 transitions on 10 accounts |
| Runway < 9 (Angel-Seed + VC) | 15–30 % | 349 of 1,558 = 22.40 %. 0 NULL runway on those statuses, 0 non-NULL runway on Bootstrapped / PE-Backed. Distribution: runway 0 on 196 Angel-Seed + 63 VC rows, 1–8 on 74 + 16, 9–24 on 151 + 139, > 24 on 596 + 323 |
| Postings: Frozen ratio | ≥ 2× (negative vs positive growth) | negative growth 322 / 601 = 53.58 % Frozen; positive growth 292 / 1,292 = 22.60 %; ratio 2.37×. (Zero growth: 1,959 / 2,694 = 72.72 %, mostly 1-10 firms pinned at a band edge.) Trend mix: Frozen 2,573, Accelerating 970, Steady 706, Slowing 338 |
| 4d cross-field / 4a ranges | 0 | 0 on every check: Bootstrapped ⇔ rounds = 0 ⇔ raised = 0, Bootstrapped NULLables, funded non-NULLs, RECENTLY_FUNDED ⇔ 90-day rule, LAST_ROUND ≤ TOTAL, dept sum ≤ 100, traction 0–100, growth −60…300, postings ≥ 0, refresh date in [M, M+27], GENERATED_AT = PROFILE_MONTH 00:00 |
| Idempotency | checksum unchanged | `HASH_AGG(*)` = -4940624338310171557 over 4,587 rows before and after a re-run of `CALL …()` (2026-11, 672 rows MERGEd) |

**Demo picks.**
- Treasury / sweep list (Commercial Banking, RECENTLY_FUNDED, LAST_ROUND_USD ≥ $5M): 6 / 6 / 8 / 8 / 7 / 6 / 3 accounts per month (2026-05 … 2026-11). Any category: 9 / 9 / 11 / 11 / 9 / 8 / 7.
- Risk list (Venture-Backed, runway < 6, POSTINGS_TREND Slowing / Frozen): 3 / 5 / 2 / 4 / 6 / 8 / 7.
- 2026-11 audience by CLIENT_CATEGORY: Small Business 446, NULL 117, Commercial Banking 93, Gold 4, Silver 4, empty string 4, Bronze 3, Platinum 1.

**Band change.** One ZoomInfo account changed band in the window (`001am00000qvjs6AAA`, 5001-25000 → 1-10 in 2026-10, the same account with the duplicate 2026-10 ZoomInfo row). It isn't in the Harmonic audience, so the monotonicity SQL didn't need a band-change exclusion.

## DC mapping (Task 7) — status: DC mapping pending UI

Single-column PK `recordId__c` (Plan 4 rule). `RECENTLY_FUNDED_FLAG` is declared **Boolean** in the stream schema. All three DATE columns use `format: "MM/dd/yyyy"`.

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
