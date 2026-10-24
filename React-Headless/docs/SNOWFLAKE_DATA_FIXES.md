# Snowflake / source-data fixes for the advisor cockpits

Handoff for the Snowflake agent. Every finding below was probed live in Data Cloud
(org `jdo-oe0sdd`, via `DcBridgeRest`) on 2026-10-20. The React home pages are
book-scoped: they join each DMO's account key to `ssot__Account__dlm.ssot__Id__c`
and filter on `ssot__OwnerId__c`. **A row whose account key isn't a real local
Salesforce Account Id (`001am…`, 18-char) is invisible to every cockpit.**

Local account population: **~36,222 accounts** (`001am00002…`). Person books:
Sarah Smith `005am000006ffBpAAI` (10,541) and Justin Chen `005am000003PbFBAA0` (10,909).
Business books: Allen Carter `005am000003PbFDAA0` (5,626) and Jose Sifontes
`005am000003PbCLAA0` (5,087). Use `CSAT_Snowflake` or `Financial_Trades` (both fully
keyed to all 36,222) as the reference list of valid account Ids.

Rule for all ML datasets: **training tables train the model; they are never read by
the UI.** `Churn_Training_Data`, `ML_Attrition_Training_Data` and `CSAT_Prediction_Training`
stay as-is (synthetic keys are fine there). The UI only reads *input* and *output/scoring*
tables, and those must carry real Account Ids.

---

## 1. Product recommendations: ✅ inputs re-keyed 2026-10-23

Was: the business stream read as an output table keyed `B-000001…`, and the personal input covered
only 741 real keys.

Done (generator `Snowflake_Product_Recommendations`, SP `SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS`,
monthly task `TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS`, `0 4 2 * * America/New_York`, resumed):
- **Inputs carry real Account Ids.** `BUSINESS_PRODUCT_RECOMMENDATION_INPU__dlm` reads 5,725 rows and
  `PERSONAL_PRODUCT_RECOMMENDATION_INPU__dlm` reads 25,424, one per `001am` account (business = non-Household
  business accounts, personal = person accounts; no account on both sides).
- **`BT_Business_Product_Recommendations__dlm` is the business training set**, not an output table.
  It reads `BUSINESS_PRODUCT_RECOMMENDATION_SET` (3,500 labelled rows). Its `B-` keys stay, per the ML rule
  above. All 12 classes now have at least 100 rows (Line_of_Credit 817, Merchant_Services 736 … CDs 100).
- **No batch output table is needed.** The retrained models score one account at a time: the flows
  `DC_Multiclass_Business` and `DC_MLProdPersonal` read the input row by `accountid__c`, and the
  Multiclass Prediction card on the Account page shows the result. No cockpit reads product recommendations yet.

## 2. Attrition, CSAT prediction and enrollments: ✅ inputs backfilled 2026-10-23

Was: `Attrition_Inputs_Snowflake`, `CSAT_Prediction_Input` and `Enrollments` covered only
**159 local accounts** (741 rows total); the rest of the keys were other-org Ids or UUID-like.

Done (generator `Snowflake_Attrition_CSAT_Inputs`, SP `SP_GENERATE_ATTRITION_CSAT_INPUTS`,
monthly task `TASK_MONTHLY_ATTRITION_CSAT_INPUTS`, `0 5 2 * * America/New_York`, resumed):
- `ATTRITION_INPUTS`, `CSAT_ATTRITION_INPUTS` and `ENROLLMENTS` are rewritten monthly for every
  `001am` account in `V_ACCOUNT_ANCHORS`: **36,239 rows each**, 0 NULLs, 0 duplicate or
  non-`001am` keys. Values are grounded in the Cumulus feeds (CSAT/NPS, balances, transactions,
  holdings, Gong, World-Check).
- Live in Data Cloud (federated, `jdo-gj9q5q`): `Attrition_Inputs_Snowflake__dlm`,
  `CSAT_Prediction_Input__dlm` and `Enrollments__dlm` each read 36,239 rows / 36,239 distinct keys.
- `ENROLLMENTS.SNAPSHOT_DATE` = run month's first day (one current row per customer).

Still open (D360 side, not Snowflake):
- Re-score so the output DMOs (`Attrition_Prediction__dlm`, `Predicted_CSAT_Output__dlm`)
  get one current row per account.

The dead Jedi stream `Attrition_Inputs_Snowflake` (FAILURE) and its DLO are gone from the org
(confirmed 2026-10-23); `BT_Attrition_Inputs__dll` is the input DMO's only source.

## 3. Heroku (Deposits / Loans / Lines / Investments): ✅ backfilled 2026-10-20

Not a Snowflake task. It's done directly in the Heroku `data-cloud` app's Postgres (schema `Fins`):

- **Source:** all 31,916 open `FinServ__FinancialAccount__c` records. That's the full set
  minus 220 Treasury Management, 3 Merchant Services and 11 Lost/blank records. The standard
  `FinancialAccount` object is a mirror subset of FinServ: 22,348 link back via `LegacyId__c`.
- **What was written:** 12 monthly snapshots (2025-11-01 → 2026-10-01). The latest snapshot equals the CRM balance;
  earlier months are back-derived (amortization for loans, random walks for deposits and
  lines, market returns for investments).

| Table | Rows | Accounts |
|---|---|---|
| `Deposits` | 261,755 | 22,174 |
| `Loans` | 87,255 | 7,334 |
| `Lines` | 9,599 | 823 |
| `investments` | 18,972 | 1,585 |

- **Keys:** `<PRODUCT>-<FinServ Id>` (e.g. `CHK-a7kam…`, `MTG-…`, `HELOC-…`). The `_Latest` streams map
  this key into `ssot__FinancialAccount` / `LoanAccount` / `InvestmentAccount`, where the bare FinServ
  Id already exists from CRM. The prefix avoids overwriting those records. To join back,
  strip everything up to the first `-`. Customer key = `FinServ__PrimaryOwner__c`.
- **Rollback:** every backfill row has `uniqueid` / `UUID` ≥ 1,000,000. Pre-existing rows (≤ 371) are untouched.
- **Rates:** stored in percent, as the existing rows were. Loans with no CRM rate got a typical product rate.
- **Transactions are out of scope here.** They come from Snowflake (see §7). The Heroku
  `Financial_Transactions` stream stays suppressed: it's a Profile-category DLO that can't map to the
  Engagement DMO `ssot__FinancialAccountTransaction`.

## 4. Financial trades: ✅ latest data landed and TRD keys gone 2026-10-24 (nightly incremental still broken)

Was: stream `BT_Financial_Trades` (INCREMENTAL on `TRADE_DATE`) last ran on 2026-10-01 and failed.
DLO `MAX(trade_date__c)` was 2026-09-01, and some account keys were `TRD-001…` placeholders.

Done (project `Financial_Trades_Generation`, `DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES`):
- **TRD keys nulled** (migration `001`): 35,116 rows now have a NULL `ACCOUNT_ID`. The 5 `TRD-` configs are
  deactivated. `GENERATE_DAILY_TRADES` and `GENERATE_HISTORICAL_TRADES` read only `ACCOUNT_ID LIKE '001%'`.
- **Dates stay `DATE`** (migration `002`). The stream registered the three date fields with format
  `MM/dd/yyyy HH:mm:ss.SSS zzz`. As `TIMESTAMP_TZ` the connector unloads them as strings that this format
  misreads, so 2025-01-01 landed as 0006-07-18. `DATE` columns unload natively and read correctly.
  The Connect API rejects format changes on an existing stream.
- One Full Refresh (DC Setup UI) reloaded the stream. Verified in the DLO: 8,984,809 rows, 2024-06-03 → 2026-10-23,
  0 `TRD-` keys and 35,116 NULL keys.

Still open (DC side):
- **The nightly INCREMENTAL run fails** with `DATE` columns. It reads `max(TRADE_DATE)` and errors, so
  new days only land with a manual Full Refresh. Refresh mode can't be switched: an accelerated stream with
  an incremental column must stay INCREMENTAL. The lasting fix is a rebuilt stream (correct date format or
  TOTAL_REPLACE). That stream feeds a data graph, prompt templates and a semantic model, so rebuilding needs
  a planned re-point.
- Rollback: `FINANCIAL_TRADES_BAK_20261024` (pre-001), `FINANCIAL_TRADES_BAK_20261024_TZ` (pre-002),
  `TRADE_GENERATION_CONFIG_BAK_20261024`.

App side: any trade widget (W5) anchors its window on `MAX(trade_date)`, not `CURRENT_DATE`. No home page reads trades yet.

## 5. D&B business credit (`BT_DNB_Business_Credit`): ✅ generator v1.6 2026-10-24

Was: PAYDEX never fell below 55, days beyond terms topped out at 42, the Severe tier had only ~50 rows,
1A/2A ratings landed in High, and October held a duplicate account row.

Done (project `Snowflake_DnB_BusinessCredit`, SP `SP_GENERATE_DNB_BUSINESS_CREDIT` v1.6; all six months regenerated,
October 11,516 rows / 11,516 accounts):
- **Score directions are documented**, not renamed (AGENTS.md and column comments):
  - `failure_risk_score__c` and `delinquency_predictor_score__c`: higher = safer.
  - `composite_risk_score__c` (1–4): higher = riskier.
- **Late-payer tail.** About 2–10% of accounts per industry are chronic late payers, and the set holds steady
  through the year. October: 728 rows with PAYDEX < 50 (73 below 25, min 1).
- **Days beyond terms follows PAYDEX.** October: 728 rows at 30+ days, 160 at 90+, max 179.
- **Risk level blends** failure score, composite digit and PAYDEX:
  - October: 4,356 Low, 5,570 Moderate, 1,427 High, **163 Severe (1.4%)**.
  - No 1A–5A rating is Severe.
- **One row per account.** The duplicate October row was deleted, and the SP now dedupes anchors.
- **`MATCH_CONFIDENCE_CODE`** (1–10) is added and drives verification status:
  - 8–10 Verified (8,693).
  - 5–7 Probable (2,373).
  - 1–4 Unverified (450).
  - The column is mapped in DC as `match_confidence_code__c` (DLO and DMO). Rows before v1.6 read NULL.
- **Corporate families: no change needed.** `ultimate_parent_duns` is null exactly on standalone rows
  (family size 1). The earlier "946 rows" reading was wrong.

Still open:
- None. May–September were backfilled with v1.6 (`CALL SP_GENERATE_DNB_BUSINESS_CREDIT('2026-0M-01'::DATE)`,
  same accounts per month). In the DMO, every month has 0 null `match_confidence_code__c`, Severe 1.2–1.4%,
  ~720 rows with PAYDEX < 50 and days beyond terms up to ~180.

Owner gap (CRM side, not Snowflake): 684 D&B-keyed accounts have a null `OwnerId` in
`ssot__Account`, so they appear in no banker's book.

## 6. Plaid held-away (`BT_Plaid_Held_Away`): ✅ generator v2 + business 2026-10-24

Was: liabilities were stored as negative balances, Robo-Advisor rows carried `account_type = 'Brokerage'`,
the 20 institutions were uniform (~2.8K rows each), and each month redrew every customer's institutions and
account types (38,358 of 40,330 September→October pairs changed institution).

Done (project `Snowflake_Plaid_HeldAway`, SP `SP_GENERATE_PLAID_HELD_AWAY` v2; all six months May–October
regenerated; personal 55,247 rows / 25,381 accounts each):
- **Positive balances plus `BALANCE_CATEGORY`** (`asset` / `liability`). Credit Card, Mortgage and Auto Loan are
  `liability` (12,070 rows a month); the balance is the amount owed. 0 negative balances in every month.
  Net worth = `SUM(asset) − SUM(liability)`.
- **Account type follows institution type.** Robo-Advisor rows are `Managed Portfolio` or `IRA`; 0 are `Brokerage`.
  `institution_type` values are unchanged, so the Wealth cockpit filters still work.
- **Nulls are by design** and the column comments say so: `investment_risk_tier` is null unless the account type
  is Brokerage / Managed Portfolio / IRA / 401k / HSA, and `interest_rate_pct` is null unless Savings / Mortgage /
  Auto Loan / Credit Card. They stay NULL (no `N/A`: the rate column is numeric).
- **Weighted institutions.** October Brokerage: Fidelity 5,486, Schwab 4,652, Vanguard 4,259, E*TRADE 1,316,
  Robinhood 923. Bank: Chase 5,467 down to Ally 632. The type mix stayed close to before.
- **Stable from month to month.** Each customer keeps the same held-away accounts, institutions, account types,
  link dates, risk tiers and rates. September→October: 0 of 55,247 pairs changed institution or type, and balances
  moved by a median of 2%. Activity (`is_active`, about 4.4K inactive a month) and net flow still vary monthly.
- **`BALANCE_CATEGORY` mapped** as `balance_category__c`: 0 nulls in the DMO in every month.
- **Business held-away (added 2026-10-24).** Small Business and Commercial Banking anchors now get operating,
  treasury and credit accounts at other banks: `Business Checking`, `Business Savings`, `Money Market`,
  `Sweep Account` (Commercial only); `Line of Credit`, `Commercial Loan`, `Commercial Card` as liabilities.
  Institutions are banks (Chase 2,252 … Capital One 446 in October) or the new `Fintech` type (Mercury, Brex).
  Balances scale with `ANNUAL_REVENUE`, capped at $10M (Commercial sweep median $2.46M). All 5,616 business accounts
  are covered, with 11,296 rows a month. Business types are named apart from personal ones, so the Wealth and
  deposit-attrition readers are unaffected. This feeds a Commercial deposit-capture signal.
- Live in the DMO, every month: 66,543 rows (55,247 personal, unchanged, + 11,296 business), 16,412 liabilities
  (12,070 personal + 4,342 business), 0 null `balance_category__c`, 0 negative balances, 0 Robo `Brokerage` rows.
- Sanity: no future link or transaction dates; max balance $10M (the cap, Commercial sweep).
- Rollback: `PLAID_HELD_AWAY_BAK_20261024` (v1 state).

## 7. Financial transactions: key them to FinServ financial accounts: ✅ done 2026-10-22

**What was done** (Snowflake account `SFDC_DC_TECH_ARCH`, the `BT_Managed_Snowflake` source; the old
`GSB13421` Jedi account is gone):

- **The account master drives the generator.** `DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS`
  now holds one `ACTIVE` row per open, classifiable FinServ account: 31,905 rows.
  - `ACCOUNTID` = FinServ Id, `SFACCOUNTID` = `FinServ__PrimaryOwner__c`, `CONTACTID` = PersonContactId,
    `ACCOUNTTYPE` = Personal/Business.
  - New columns: `ACCOUNT_NAME`, `FINANCIAL_ACCOUNT_TYPE`, `RECORD_TYPE`, `PRODUCT_KIND`, `BALANCE`,
    `INTEREST_RATE`, `OPEN_DATE`, `LOAN_END_DATE`, `CREDIT_LIMIT`, `SOURCE_OBJECT`, `LOADED_AT`.
  - Personal checking accounts carry `DIRECT_DEPOSIT_AMOUNT` (monthly, paid on the 1st and 15th);
    about 10% also carry a quarterly `BONUS_AMOUNT`.
  - The old `CC-123456789` / `BC-4421335` rows are kept with `ACTIVE = FALSE`.
  - To add accounts later, insert rows here; the next daily run picks them up.
- **History:** `FINANCIAL_TRANSACTIONS` was replaced with 1,663,795 rows, 2026-07-24 → 2026-10-22,
  following the rules below. Transaction ids start with `FS-`. `ACCOUNT_DAILY_BALANCE` was rebuilt.
- **Going forward:** `GENERATE_DAILY_TRANSACTIONS` (task `DAILY_TRANSACTION_GENERATOR`, 03:05 ET)
  now runs the same product-aware logic for one day, about 18K–34K rows/day.
  - Rows post 0–2 days after the transaction date. Each run settles `Pending` rows whose posting
    date has passed.
  - The `TRANSACTIONS_PER_ACCOUNT` argument is ignored; volume comes from each product's pattern.
- **DC:** `accountid__c` → `ssot__FinancialAccountID__c` (+ `KQ_`) is now mapped on the
  `Financial_Transactions_BT_Snow` mapping. 99.99% of rows join `ssot__FinancialAccount__dlm`.
- **Source:** `scripts/snowflake_transactions/` (`build_sp.sh` regenerates the procedure DDL).
- **Rollback:**
  - `FINANCIAL_TRANSACTIONS_BAK_20261022`, `FINANCIAL_TRANSACTION_ACCOUNTS_BAK_20261022` and
    `ACCOUNT_DAILY_BALANCE_BAK_20261022` are clones of the pre-change tables.
  - The old procedure is kept as `GENERATE_DAILY_TRANSACTIONS_BAK_20261022`.

The original handoff follows.

`ssot__FinancialAccountTransaction__dlm` gets its rows from Snowflake (`Financial_Transactions_BT_Snow`,
19,007 rows). Column roles:

- `sfaccountid` → `SFAccountID__c`: the Salesforce **Account** Id. This is mapped and correct.
- `ssot__FinancialAccountID__c` is **empty** on every row. It should hold the Salesforce
  **FinServ financial-account Id** (`a7kam…`, 18-char). That's the key the DMO
  `ssot__FinancialAccount__dlm.ssot__Id__c` uses.

What the source carries today (probed 2026-10-21):

| `accountid` prefix | Rows | Distinct values | Notes |
|---|---|---|---|
| `a7kam…` (local FinServ Id) | 6,593 | 2 | Correct form, but only 2 financial accounts |
| `BC-4421335` | 5,116 | 1 | Product number, not an Id |
| `CC-123456789` | 5,111 | 1 | Product number, not an Id |
| `a7kal…` (other org) | 2,187 | 8 | No owner, no local record |

All 19,007 rows belong to only **3 distinct Salesforce Accounts**, so coverage is the real gap.

**Where the Ids come from.** Use `FinServ__FinancialAccount__c`, not the standard `FinancialAccount`
object:

- FinServ has 32,150 records. The standard object is a 22,777-record mirror subset of it.
- FinServ Ids equal `ssot__FinancialAccount__dlm.ssot__Id__c` exactly, so a filled key joins with no
  lookup table.
- It's the object the cockpits read.

Land a reference table in Snowflake from this SOQL (Bulk API):

```sql
SELECT Id, Name, RecordType.DeveloperName, FinServ__PrimaryOwner__c,
       FinServ__PrimaryOwner__r.IsPersonAccount, FinServ__FinancialAccountType__c,
       FinServ__Status__c, FinServ__OpenDate__c, FinServ__CloseDate__c, FinServ__Balance__c
FROM FinServ__FinancialAccount__c
WHERE FinServ__Status__c = 'Open'
```

**Assignment rules** (every generated transaction):

1. **The owner must match.** The row's financial-account Id must have `FinServ__PrimaryOwner__c` =
   the row's `sfaccountid`, so the two keys always name the same customer. Use `IsPersonAccount` for
   personal vs business patterns.
2. **The product type must match.** Pick the account by its type, not at random:

   | Account (type / name) | Transactions |
   |---|---|
   | Checking (`Deposits`, name contains *Checking*), personal | payroll direct deposit (MCC 9961), card spend, utilities/phone/subscriptions, loan-payment debits |
   | Checking, business | ACH customer credits, vendor/business-services spend, payroll debits, lease, service fees |
   | Savings / Money Market / CD (`Deposits`) | monthly interest (MCC 9967), occasional transfers (none on CDs) |
   | `Loans` (mortgage, auto, personal, CRE, SBA, commercial) | one monthly payment credit (MCC 9980) |
   | `Credit Cards` / names with *Card*, *HELOC*, *Line of Credit* | card purchases or line draws, plus a monthly payment credit |
   | `Investments` | contributions, quarterly dividends, occasional distributions |

   Skip Treasury Management and Merchant Services records.
3. **The account must be open on the transaction date.** Only `Open` accounts qualify, with
   `FinServ__OpenDate__c` ≤ the transaction date.

Fixes:
1. Add (or repurpose) a financial-account Id column holding the FinServ Id of the account each
   transaction posted to, with `sfaccountid` = that account's `FinServ__PrimaryOwner__c`. Drop the
   `BC-`/`CC-` product numbers and the other-org `a7kal…` Ids.
2. Cover the population: all 31,916 open FinServ accounts, with transactions that fit each product.
   That means payroll and spend on checking, interest on savings, monthly payments on loans, and
   purchases and payments on cards and lines.
3. Seed the home-page signals: recent large inbound credits (bonus / tax refund), outbound
   wires to other banks, and fee spikes on business accounts.
4. DC side (not Snowflake): map that column → `ssot__FinancialAccountID__c` (+ `KQ_FinancialAccountID__c`)
   in the `Financial_Transactions_BT_Snow` → DMO mapping. Today nothing feeds it.

## 8. Minor

- ✅ **Relationship graph `BT_Synth_Relationship_Graph`** (generator v2, 2026-10-24). Before: REFERRAL `confidence_pct` never
  reached 70, no edge was discovered after 2026-09-18, and some ids were 16-char hashes. Now:
  - The standing graph comes from a per-account identity seed, so it stays the same from week to week.
  - A per-week seed adds new REFERRAL and BUSINESS_OWNER edges, each dated on a day inside its week, starting
    2026-08-03.
  - REFERRAL confidence is 70 ± 25.
  - The audience is limited to `001…` Account Ids.
  - The MERGE now also deletes edges that are no longer generated. The old seed re-drew every month and nothing was
    deleted, so edges had piled up to ~137K rows. Backup: `SYNTH_RELATIONSHIP_GRAPH_BAK_20261024`.

  Live and in the DMO: 38,360 rows, all `001…` (SELF 32,161, REFERRAL 3,471, ADVISOR_BOOK 2,410, BUSINESS_OWNER 318).
  REFERRAL confidence runs 30–94.99 (1,146 rows ≥ 70). Edges discovered in October: 384 REFERRAL and 38 BUSINESS_OWNER;
  the latest is 2026-10-18. Weekly runs keep adding edges.
- `Marketing_Engagements` is thin by design until 2026-11-01. The original backfill ends 2026-09-24 (Personal 186,126,
  Business 65,487). The hourly Heroku worker (`Marketing_Engagement/feed.py`) only starts generating campaigns at
  `FIRST_MONTH = 2026-11-01`: one Personal and one Business campaign a month, plus the "All" templates. Business touches
  return then. To close the October gap, move `FIRST_MONTH` to 2026-10-01 and redeploy the worker.
- ✅ **`BT_Gong_Call_Sentiment.last_call_date__c`** (2026-10-24). After each MERGE, the generator fills a null
  `LAST_CALL_DATE` (a week with no calls) with the account's latest earlier call. An account with no call in its
  history gets a fixed hashed date before 2025-12-15. 1,344,919 nulls → 0; existing call dates are unchanged; every
  value is before `PROFILE_WEEK`. Latest week in the DMO: 36,940 of 36,940 filled, median 32 days ago. Backup:
  `GONG_CALL_SENTIMENT_BAK_20261024`.
- Offer model `Offer_Eligibility_Model__dlm` — **not Snowflake.** The source is Databricks
  (`DataSourceObject__c = rraso_offer_eligability_model`, connector `Databricks_Databricks`). Every account (25,431)
  has a row for all 11 action codes, and `BIZ-CHK` is the only business one. `SFID__c` is the model row's `1Xh…` Id.
  The join key is `MDM_ID__c` = `ssot__Account__dlm.External_ID_c__c`. An `account_id` column and treasury or lending
  codes have to be added in the Databricks model, or supplied by a separate Snowflake BT_ stream unioned in the reader.

## 9. Market feeds and the relationship graph: realism (probed 2026-10-23)

- **Moody's outlook (`BT_Moodys_Market_Context`)**: no account's `rating_outlook__c` has changed since 2025, so the
  Commercial C2 "outlook changed in the last 90 days" view never fires. Generate a few real outlook moves in 2026
  (Stable → Negative / Watch, and some back to Stable), dated across the last 90 days, in Allen's and Jose's books.
- **MSCI ESG ratings (`BT_MSCI_ESG`)**: the ratings change at random. 8,089 of 11,484 accounts changed rating from
  September to October, some by up to 6 notches. The upgrade/downgrade flag matches the actual change on only 668 of
  1,679 flagged rows. The cockpit now works out direction from the rating change itself and ignores the flag (moves of
  ≤ 2 notches whose score moved ≥ 1 point the same way). Make ratings sticky: most accounts keep last month's rating,
  a few move one notch, the score moves with the rating, and the flag matches the move.
- **Business owners (`BT_Synth_Relationship_Graph`, `BUSINESS_OWNER` edges)**: they exist only in Vince's, Kim's and
  Adam's books. Sarah's and Justin's books have none, so Wealth W6 falls back to org-wide for them. Seed
  `BUSINESS_OWNER` edges from Sarah's and Justin's person accounts to business accounts in Allen's or Jose's books.
- **Fee spikes and financial stress are uneven across books**: Sarah, Kim and Jose have no business accounts with 3+
  NSF / overdraft / late fees in 30 days (Allen has 97). Kim and Allen have no clients High on stress now (Sarah has
  1,751; Jose has 2). Those feeds are now book-only, so their cards are empty in those books. Spread fee events and
  `financial_stress_indicator` = High across every book.
