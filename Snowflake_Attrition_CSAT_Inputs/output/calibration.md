# Calibration record

Aggregate-only. Anything holding account ids is gitignored (`output/*pool*.json`). Live results are filled
in after the first real run; entries marked `TBD-live` are not measured yet.

## Feed map

| Profile field | Source | Window / rule | Fallback (stable_rng salt `attrcsat-<field>`) |
|---|---|---|---|
| NPS category, detractor count | `CSAT_NPS_DATA` (latest `SCORE_DATE < month start`, tie-break `ROWID DESC`; detractors = score <= 6 in last 12 months, the CSAT_NPS pipeline's own Detractor band 0-6) | `NPS_DESCRIPTION` prefix, else score (>=9 Promoter, >=7 Passive, else Detractor); source `Passives` maps to `Passive` (R3) | `nps`: 35% Promoter, 40% Passive, 25% Detractor |
| Holdings, balance, tenure, direct deposit, promo | `FINANCIAL_TRANSACTION_ACCOUNTS` (active only) | read unbounded (current state). Products = count of distinct financial accounts (all kinds). `TOTAL_BALANCE` = sum of `BALANCE` over deposit + investment accounts only (`PRODUCT_KIND IN ('deposit', 'investment')`; loans and lines are liabilities); 0 when the customer holds none | `n_products` 1-3 (deposit always), `tenure` 12-240 months, `direct_deposit` p=0.55 person / 0.20 other, `promo` p=0.30, `balance` income x 0.25 x lognormal(0, 0.5) |
| Avg balance, balance drop, transactions, savings rate | `ACCOUNT_DAILY_BALANCE` (6 months before month start; early vs late 3 months). Rows exist only on transacting days | per deposit/investment account: AVG(`CLOSING_BALANCE`) over the window, early half and late half; then summed per customer (early/late only over accounts present in both halves). `drop = (early - late) / early` when late < early. Monthly txn = SUM(`TRANSACTION_COUNT`, all products) / window length in days x 30. Savings rate = (credits - debits) / credits over deposit/investment accounts | `balance_drop`: 30% of accounts draw U(0, 0.15); `monthly_txn` U(2, 30) (or 30-day `FINANCIAL_TRANSACTIONS` count); `savings_rate` U(0.02, 0.12) |
| Calls, last interaction, complaints, escalations | `GONG_CALL_SENTIMENT` (12 weeks; sentiment labels `Negative`, `Very Negative`) | calls / weeks x 4.33 | `monthly_calls` U(0.3, 2.0); `days_since` 20-90 |
| Risk | `WORLD_CHECK_AML` (latest `PROFILE_DATE < month start`; tie-break `LAST_SCREENED_AT DESC, GENERATED_AT DESC, ORG_ID`) | any sanctions/PEP/adverse hit or High/Severe = REVIEW; Medium = WATCH; else CLEAN | CLEAN |
| Kind, age, income, credit | `V_ACCOUNT_ANCHORS` | kind from `CLIENT_CATEGORY` first: Household = HOUSEHOLD; SmallBusiness, CommercialBanking, Corporate, Commercial, Business = BUSINESS; Retail, WealthManagement, Gold, Silver, Bronze, Platinum = PERSON; any other or empty category falls back to `ACCOUNT_TYPE_FLAG`. Person age from `BIRTHDATE` at month start (persons without a birthdate use the seeded age); business income = revenue first | age 25-78 person / 30-72 other; income U(40k,160k) person, U(90k,400k) household, U(300k,8M) business; credit U(640,820) (+ up to 25 by revenue for business) |

## Derivation rules

- **Complaints** = detractor scores in the last 12 months + (negative Gong weeks // 4). **Escalations** = very-negative Gong weeks.
- **Cross-sell** = clamp(0.7 x breadth + 0.25 x min(products, 8) / 8 + U(-0.02, 0.02), 0, 1), where breadth is the sum of kind weights held (deposit 0.20, loan 0.25, investment 0.30, line 0.25). Attrition: `1 + round(6 x x)`; CSAT: `round(100 x x)`; enrollment: `1 + round(9 x x)`.
- **Digital affinity** = logistic(-0.06 x (age - 50) + 0.02 x (monthly_txn - 15)), +0.6 logit for business, -0.5 for household.
- **Attrition**: segment Preferred if category in (WealthManagement, Gold, Platinum) or balance >= 250k; Premium if category in (CommercialBanking, Silver) or balance >= 75k; else Regular. `CHURNED_C` is always `No`. `SINGLE_PRODUCT_CUSTOMER_C` = 1 product. Online/mobile banking copy the enrollment flags.
- **CSAT**: segment Corporate/Commercial (business by category), WealthManagement (person in wealth categories), else Banking (R2 spelling). `DIGITAL_ENGAGEMENT` = 40 + 59 x (digital affinity + share of the six boolean flags set) / 2. `TENURE_YEARS` = tenure months / 12.
- All numeric outputs are clamped to `RANGES` in `vocab.py`.

## Enrollment flags

Base value per flag: sticky draw from `stable_rng(account_id, "attrcsat-enr-<flag>")` against the target
rate below. **Drift is a one-time persistent change**: per (account, flag) a change month is drawn once from
`stable_rng(account_id, "attrcsat-chg-<flag>")` as a geometric draw counted from 2026-01, with monthly hazard
0.4% for enrolment (False -> True) and 0.15% for un-enrolment (True -> False). From the change month on the flag
is the base value inverted, so no flag ever reverts. The hazards sit below the 0.5-1% first suggested so that the
share of customers changing any flag month over month stays <= 2% (about 1.0-1.7% on the test book).

Ordering rules that keep the drift consistent and monotone:
- Digital (online or mobile) never goes from on to off: when both channels are on only the one with the earlier
  change month may un-enrol; a sole channel never un-enrols.
- MFA implies digital every month. With digital on at base MFA drifts either way; with digital off at base MFA may
  only switch on, and only once digital is on.
- Paperless and alerts thresholds use the base digital state; with digital off at base they may only switch on, and
  only once digital is on.
- Wire never drifts on for cohorts whose base rate is below 0.10.

| Flag | Target rate |
|---|---|
| `ONLINE_ENROLLED` | clamp(0.55 + 0.35 x affinity + 0.10 if business, 0, 1) |
| `MOBILE_ENROLLED` | clamp(0.15 + 0.75 x affinity, 0, 1) |
| `MFA_STATUS` | 0.85 and (online or mobile) |
| `PAPERLESS_ENROLLED` | 0.60 if digital else 0.05 |
| `ALERT_ENROLLED` | 0.65 if digital else 0.05 |
| `WIRE_ENABLED` | business 0.60 (+0.10 when balance >= 250k); household 0.15 (+0.10); WealthManagement person 0.35 (+0.10); other person 0.03, 0.05 when balance >= 250k. **0 for a person aged < 25 who is not WealthManagement with balance < 250k** |
| `KYC_STATUS` | REVIEW: Under Review/Pending 50/50. WATCH: Current 0.7, Pending 0.3. CLEAN: Current 0.95, Expired 0.05 |
| `AML_STATUS` | REVIEW: Under Review/Pending 50/50. WATCH: Cleared 0.6, Pending 0.4. CLEAN: Cleared 0.97, None 0.03 |
| `SAVINGS_RATE` | profile savings rate, clamped 0 to 0.40 |

`enrollment_problems` fails the run on any young-retail wire (rule above) and when the book-level wire rate of
`CLIENT_CATEGORY = 'Retail'` persons exceeds **6%** (checked only when the book has at least 1,000 Retail persons,
so small test books are not judged on sampling noise). Other-person wire probabilities are at most 0.05, so the cap
holds by construction.

## Pre-DML gates

Besides the per-row, enrollment and cross-table gates: every `ENROLLMENTS.SNAPSHOT_DATE` must equal the run
month's first day, and no model-input column of `ATTRITION_INPUTS` or `CSAT_ATTRITION_INPUTS` may hold one value
across the whole book (`CHURNED_C`, always `No`, and the key columns are exempt). The SP return string reports
`grounded=<n>`: accounts with real `FINANCIAL_TRANSACTION_ACCOUNTS` holdings (the rest use seeded fallbacks).

## Cross-table correlation weights

`cross_table_problems` fails the run when: online/mobile flags disagree between attrition and enrollments; attrition cross-sell (normalized) differs from enrollment cross-sell by more than 0.17; CSAT cross-sell differs from enrollment cross-sell by more than 0.12.

## Accepted notes

- Tenure caps differ by table contract: attrition `TENURE_IN_MONTHS_C` <= 74, CSAT `TENURE_YEARS` <= 34.
- The SQL anchor `CURRENT_DATE()` uses the session timezone while `run_ts` is UTC. This is safe because the cron runs on day 2 at 05:00 ET, far from a month boundary.
- `FINANCIAL_TRANSACTION_ACCOUNTS` holdings are read unbounded (current state), not windowed.

## Live run

| Check | Result |
|---|---|
| ATTRITION_INPUTS rows / NULL cells / duplicate keys | TBD-live |
| CSAT_ATTRITION_INPUTS rows / NULL cells / duplicate keys | TBD-live |
| ENROLLMENTS rows / NULL cells / duplicate keys | TBD-live |
| Feed coverage (`grounded=` in the SP return string vs `accounts=`) | TBD-live |
| Enrollment flag rates | TBD-live |
| Cross-table gate | TBD-live |
