# Harmonic Company Signals — Cumulus Synthetic Dataset (Private-Company Funding and Traction)

Synthetic Harmonic-style **private-company funding and traction** signals for Cumulus's young, private commercial clients. Coresignal-style **department headcount mix and job-posting velocity** are folded in as columns. Each row describes one company's growth story as of a month: who just raised, how much runway is left, and whether the company is hiring or freezing.

Those signals drive the highest-value commercial-banking moments:
- **Fresh round:** treasury / sweep / deposit capture.
- **Short runway:** venture-debt offer, or deposit-flight risk.
- **Hiring surge:** payroll, corporate cards, credit-line increase.
- **Postings freeze:** early credit-risk watch.

**Plan 16.** Monthly cadence, 1:1 (one row per audience anchor per month).
- First Cumulus dataset with a **three-way audience** (anchor × ZoomInfo × Moody's).
- First to view a **lifetime event timeline as of each period.** Each account's funding rounds are generated once, anchored on a 2022–2027 funding era (not the founding date), so `TOTAL_RAISED_USD` is monotone and `LAST_FUNDING_DATE ≤ PROFILE_MONTH` by construction, and fresh rounds keep landing in the live window.
- `HEADCOUNT_GROWTH_6M_PCT` and `POSTINGS_TREND` are **recomputed** from pure functions for M-6 / M-3. They are never read back from the table.

## Plan
- Plan: `../docs/superpowers/plans/2026-11-02-cumulus-plan-16-harmonic-company-signals.md` (template v1.5)
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-16-harmonic-company-signals-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)
- **Hard-depends on** [Snowflake_ZoomInfo_Firmographics](../Snowflake_ZoomInfo_Firmographics) (Plan 11, `FOUNDED_YEAR` account-stable since Plan 16 Task 0) and [Snowflake_Moodys_MarketContext](../Snowflake_Moodys_MarketContext) (Plan 13 v2, `LIQUIDITY_TIER`). The SP fails fast if either table is missing, or if ZoomInfo has no row for the run month.

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS` (+ `_STAGING`, identical columns)
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS(BACKFILL_MONTHS INTEGER DEFAULT 0)` (Task 4)
- Task: `TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS`, cron `0 9 1 * * UTC` (after ZoomInfo). Runs on `MAIN_WH_XS` via `SP_RETRY_WRAPPER('…SP_GENERATE_HARMONIC_COMPANY_SIGNALS()', 2)` (Task 6).
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DMO `CumulusHarmonicCompanySignals__dlm`. DC mapping is pending in the UI; see the mapping table in [AGENTS.md](AGENTS.md).

The plan text says `FINS.PUBLIC.*`. The live namespace for every Cumulus sibling is `DATA_JEDAIS.FINS__PUBLIC.*` (there is no `FINS` database in the account), so this repo uses that.

## Audience
```sql
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
```
**672 anchors** for 2026-11 (650–672 across the 7 ZoomInfo months; re-probed 2026-11-02 after Task 0, see plan §2). About 76% are in the `1-10` employee band.

## Columns (22 data + ORG_ID + RECORD_ID)
`ORG_ID`, `RECORD_ID`, `ACCOUNT_ID`, `PROFILE_MONTH`, `FUNDING_STATUS` (Bootstrapped / Angel-Seed / Venture-Backed / PE-Backed), `LAST_FUNDING_STAGE`\*, `LAST_FUNDING_DATE`\*, `LAST_ROUND_USD`\*, `TOTAL_RAISED_USD`, `FUNDING_ROUNDS_COUNT`, `LEAD_INVESTOR`\*, `EST_VALUATION_USD`\*, `EST_RUNWAY_MONTHS`\* (0–60, Angel-Seed / Venture-Backed only), `RECENTLY_FUNDED_FLAG` (BOOLEAN), `HEADCOUNT` (inside the same-month ZoomInfo band), `HEADCOUNT_GROWTH_6M_PCT` (−60…300), `TRACTION_SCORE` (0–100), `ENG_HEADCOUNT_PCT`, `SALES_HEADCOUNT_PCT`, `OPS_HEADCOUNT_PCT` (sum ≤ 100), `OPEN_JOB_POSTINGS`, `POSTINGS_TREND` (Accelerating / Steady / Slowing / Frozen), `LAST_DATA_REFRESH_DATE`, `GENERATED_AT`. \* = NULLable (6 columns). Full DDL: [schemas/harmonic_company_signals.sql](schemas/harmonic_company_signals.sql).

## Expected volume
Plan §2 figures, from the live audience probe (not from generated rows):
- ~650–672 rows/month.
- 4,587 rows after the one-time 7-month backfill, `CALL …(6)`.

## Tests
```bash
cd Snowflake_Harmonic_CompanySignals
pytest tests/ -v      # L1 suite; cumulus_common resolves via pyproject pythonpath
```
- `tests/test_harmonic_company_signals_row_factory.py`: invariants on the 10-anchor coverage fixture (not representative of the live audience).
- `tests/test_harmonic_company_signals_distribution.py`: the plan Task 8 (L3) mix / fresh-round / runway / Frozen / transition targets, asserted offline over the live audience shape in `tests/fixtures/live_audience_shape.csv`.
- `tests/test_harmonic_company_signals_sp_main.py`: the SP entry point (`main`, dependency probes, backfill month list, staging frame, MERGE SQL, coverage) on a fake Snowpark session.
- `tests/test_harmonic_company_signals_deploy.py`: the generated `CREATE PROCEDURE` file and the TASK SQL.
- `tests/integration/test_harmonic_company_signals_sp.sql`: L2 against a GET_DDL clone of the deployed SP on fixture tables, including negative tests. Every column must be TRUE:
  `SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt snow sql -f tests/integration/test_harmonic_company_signals_sp.sql --role ACCOUNTADMIN`

## Deploy
```bash
snow sql -f schemas/harmonic_company_signals.sql   # table + _STAGING
python scripts/deploy_sp.py --role ACCOUNTADMIN    # inline-source SP (Task 5; deployed 2026-11-02)
snow sql -f tasks/task_monthly_harmonic_company_signals.sql   # Task 6, not yet run
# Task 6 one-time backfill: CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS(6);
```
See AGENTS.md → Gotchas → "Deploy connection" for the snow CLI connection to use.
