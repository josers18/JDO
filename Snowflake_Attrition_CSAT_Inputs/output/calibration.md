# Calibration record

Aggregate-only. Anything holding account ids is gitignored (`output/*pool*.json`). Live results are filled
in after the first real run; entries marked `TBD-live` are not measured yet.

## Feed map

| Profile field | Source | Window / rule | Fallback (stable_rng salt `attrcsat-<field>`) |
|---|---|---|---|
| NPS category, detractor count | `CSAT_NPS_DATA` (latest `SCORE_DATE < month start`; detractors = score <= 4 in last 12 months) | `NPS_DESCRIPTION` prefix, else score (>=9 Promoter, >=7 Passive, else Detractor); source `Passives` maps to `Passive` (R3) | `nps`: 35% Promoter, 40% Passive, 25% Detractor |
| Holdings, balance, tenure, direct deposit, promo | `FINANCIAL_TRANSACTION_ACCOUNTS` (active only) | read unbounded (current state) | `n_products` 1-3 (deposit always), `tenure` 12-240 months, `direct_deposit` p=0.55 person / 0.20 other, `promo` p=0.30, `balance` income x 0.25 x lognormal(0, 0.5) |
| Avg balance, balance drop, transactions, savings rate | `ACCOUNT_DAILY_BALANCE` (6 months before month start; early vs late 3 months) | `drop = (early - late) / early` when late < early | `balance_drop`: 30% of accounts draw U(0, 0.15); `monthly_txn` U(2, 30) (or 30-day `FINANCIAL_TRANSACTIONS` count); `savings_rate` U(0.02, 0.12) |
| Calls, last interaction, complaints, escalations | `GONG_CALL_SENTIMENT` (12 weeks) | calls / weeks x 4.33 | `monthly_calls` U(0.3, 2.0); `days_since` 20-90 |
| Risk | `WORLD_CHECK_AML` (latest `PROFILE_DATE`) | any sanctions/PEP/adverse hit or High/Severe = REVIEW; Medium = WATCH; else CLEAN | CLEAN |
| Age, income, credit | `V_ACCOUNT_ANCHORS` | person age from `BIRTHDATE` at month start; business income = revenue first | age 25-78 person / 30-72 other; income U(40k,160k) person, U(90k,400k) household, U(300k,8M) business; credit U(640,820) (+ up to 25 by revenue for business) |

## Derivation rules

- **Complaints** = detractor scores in the last 12 months + (negative Gong weeks // 4). **Escalations** = very-negative Gong weeks.
- **Cross-sell** = clamp(0.7 x breadth + 0.25 x min(products, 8) / 8 + U(-0.02, 0.02), 0, 1), where breadth is the sum of kind weights held (deposit 0.20, loan 0.25, investment 0.30, line 0.25). Attrition: `1 + round(6 x x)`; CSAT: `round(100 x x)`; enrollment: `1 + round(9 x x)`.
- **Digital affinity** = logistic(-0.06 x (age - 50) + 0.02 x (monthly_txn - 15)), +0.6 logit for business, -0.5 for household.
- **Attrition**: segment Preferred if category in (WealthManagement, Gold, Platinum) or balance >= 250k; Premium if category in (CommercialBanking, Silver) or balance >= 75k; else Regular. `CHURNED_C` is always `No`. `SINGLE_PRODUCT_CUSTOMER_C` = 1 product. Online/mobile banking copy the enrollment flags.
- **CSAT**: segment Corporate/Commercial (business by category), WealthManagement (person in wealth categories), else Banking (R2 spelling). `DIGITAL_ENGAGEMENT` = 40 + 59 x (digital affinity + share of the six boolean flags set) / 2. `TENURE_YEARS` = tenure months / 12.
- All numeric outputs are clamped to `RANGES` in `vocab.py`.

## Enrollment flags

Sticky draw per flag from `stable_rng(account_id, "attrcsat-enr-<flag>")`; per-month drift flips a flag with p = 0.02 (`month_rng`, salt `attrcsat-drift-<flag>`).

| Flag | Target rate |
|---|---|
| `ONLINE_ENROLLED` | clamp(0.55 + 0.35 x affinity + 0.10 if business, 0, 1) |
| `MOBILE_ENROLLED` | clamp(0.15 + 0.75 x affinity, 0, 1) |
| `MFA_STATUS` | 0.85 and (online or mobile) |
| `PAPERLESS_ENROLLED` | 0.60 if digital else 0.05 |
| `ALERT_ENROLLED` | 0.65 if digital else 0.05 |
| `WIRE_ENABLED` | business 0.60; household 0.15; wealth person 0.35; other person 0.03; +0.10 when balance >= 250k. Cohorts below 0.10 drift only toward off |
| `KYC_STATUS` | REVIEW: Under Review/Pending 50/50. WATCH: Current 0.7, Pending 0.3. CLEAN: Current 0.95, Expired 0.05 |
| `AML_STATUS` | REVIEW: Under Review/Pending 50/50. WATCH: Cleared 0.6, Pending 0.4. CLEAN: Cleared 0.97, None 0.03 |
| `SAVINGS_RATE` | profile savings rate, clamped 0 to 0.40 |

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
| Feed coverage (accounts with real feed data vs fallback) | TBD-live |
| Enrollment flag rates | TBD-live |
| Cross-table gate | TBD-live |
