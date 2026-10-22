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

## 1. Product recommendations: re-key to Salesforce Account Ids

| DLO | Rows | Problem |
|---|---|---|
| `BT_Business_Product_Recommendations__dll` | 3,500 | `accountid__c` = `B-000001…` in the Snowflake source itself. It has `recommended_product__c`, so it's the **output** table |
| `BT_Personal_Product_Recommendations__dll` | 8,240 | `accountid__c` = `P-000001…`. Input-shaped, with no `recommended_product` column |

Fixes:
1. Replace the `B-/P-` keys with real `001am…` Account Ids. Business recs go to business
   accounts, personal recs to person accounts. Keep the synthetic key as a separate
   `source_customer_id` column if the model pipeline needs it.
2. Produce a **personal output** table (`recommended_product`, score, rank) like the
   business one.
3. DC side (not Snowflake): both business streams currently map into the INPUT DMO
   `BUSINESS_PRODUCT_RECOMMENDATION_INPU__dlm`. Map the output stream to its own output DMO.

## 2. Attrition, CSAT prediction and enrollments: backfill to the full population

`Attrition_Inputs_Snowflake`, `CSAT_Prediction_Input` and `Enrollments` cover only
**159 local accounts** (741 rows total). The rest of the keys are other-org Ids or UUID-like.

Fixes:
- Regenerate each table for all ~36,222 local accounts, keyed on `accountid` = `001am…` 18-char.
- Re-score so the output DMOs (`Attrition_Prediction__dlm`, `Predicted_CSAT_Output__dlm`)
  get one current row per account.
- Add a `scored_at` / snapshot date so the UI can pin the latest run.
- `Attrition_Inputs_Snowflake` stream is in **FAILURE**. Fix it before the backfill lands.

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

## 4. Financial trades: land the latest data

- Stream `BT_Financial_Trades` is INCREMENTAL. Its **last run was a FAILURE**; last refresh was 2026-10-01.
- DLO `MAX(trade_date__c)` = **2026-09-01** (min 2024-06-03), so DC is a month-plus behind Snowflake.
- Some keys are junk (`TRD-001…`, `TRD-004…` prefixes in the account column).

Fixes:
1. Repair the incremental stream so the newest Snowflake trade dates land. Check the
   watermark column and any schema drift.
2. Null out or remap non-Account keys.

App side: any trade widget (W5) anchors its window on `MAX(trade_date)`, not `CURRENT_DATE`. No home page reads trades yet.

## 5. D&B business credit (`BT_DNB_Business_Credit`)

Monthly May–Oct 2026, ~11.4K rows/month, 10,798 local accounts keyed. The cockpit now
reads it. Recommendations:

1. **Document the score directions.** They're mixed:
   - `failure_risk_score__c`: higher = safer. Low tier averages ~83–89; Severe ~25.
   - `delinquency_predictor_score__c`: higher = safer.
   - `composite_risk_score__c` (1–4): higher = riskier.

   Either rename (e.g. `*_safety_score`) or add a column comment. The old app query
   ranked delinquency DESC, which was wrong because of this.
2. **Widen PAYDEX.** The minimum is 55, so there are no severely late payers (<50). Real
   distributions reach 1–20 for chronic late payers. Seed a tail of 30–50.
3. **Tier and risk-level consistency.** `supplier_risk_level = 'High'` includes the
   strongest ratings (1A/2A). Derive risk level from rating, PAYDEX and failure score.
4. **Severe tier is tiny** (50 rows). For a usable watchlist, seed ~1–2% Severe.
5. **Corporate families.** `ultimate_parent_duns` is null on 10,536 rows, while 946
   rows report family size > 1. Populate parent DUNS where family size > 1.
6. **Dedupe.** October has 11,482 rows for 11,481 distinct accounts. Enforce one row per
   `(account_id, profile_month)`.
7. **Verification status**: 2,350 Probable and 446 Unverified. That's fine, but add the
   match-confidence code if available.
8. Days-beyond-terms tops out at 42 org-wide, and the 30+ band is empty in Jose's book. Real late payers run 30–90+, so seed a realistic tail.

Owner gap (CRM side, not Snowflake): 684 D&B-keyed accounts have a null `OwnerId` in
`ssot__Account`, so they appear in no banker's book.

## 6. Plaid held-away (`BT_Plaid_Held_Away`)

Monthly snapshots, the same 25,381 accounts every month (~55K rows/month; 4,377 inactive).
The Wealth cockpit reads active Brokerage + Robo-Advisor rows with positive balances.

1. **Add an asset/liability category.** Liabilities are stored as negative balances
   under institution_type Bank/Credit Union:
   - Credit Card: 4,547 Bank + 1,621 CU.
   - Mortgage: 3,335.
   - Auto Loan: 2,250 Bank + 1,321 CU.

   Add `balance_category` (`asset` / `liability`), and store balances as positive amounts with the category.
2. **Type consistency.** `account_type = 'Brokerage'` appears under institution_type
   Robo-Advisor. Constrain account_type per institution_type.
3. **Nulls by design.** `investment_risk_tier` is null on non-investment rows, and
   `interest_rate` is null on investment/checking rows. That's fine, but make it explicit
   (or `N/A`) so consumers don't treat it as missing data.
4. **Distribution realism.** Each institution has ~2.8K rows (perfectly uniform). Skew
   toward the big custodians (Fidelity, Schwab, Vanguard).
5. **Coverage is persons only.** Business held-away (treasury and operating accounts at
   other banks) would power a Commercial deposit-capture signal. Add it if desired.
6. Sanity checks pass: there are no future dates, and the max balance is $7.18M (401k).

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

- `Marketing_Engagements` feed is thin: 16 events in 30 days, Personal only.
- `BT_Gong_Call_Sentiment.last_call_date__c` is null on sampled rows. Populate it.
- Offer model `Offer_Eligibility_Model__dlm`: `SFID__c` is a `1Xh…` Id, not an Account Id.
  The join key is `MDM_ID__c = 'GEN-' + AccountId`. Consider adding a plain `account_id` column.
