# Live calibration (Task 8, 2026-10-23)

Read-only: every Snowflake call was a SELECT / DESCRIBE (`snow sql -c SFDC_DC_TECH_ARCH --warehouse MAIN_WH_XS`,
role SYSADMIN). Nothing was written to Snowflake and nothing was deployed. The raw pool is cached in the
gitignored `output/calibration_pool.json`; this file carries aggregate counts only.

Reproduce: `.venv/bin/python scripts/calibrate.py` (cached) or `--refresh` (re-pull).

## Live checks

| Check | Result |
|---|---|
| Feature SQL (`BUSINESS_FEATURES_SQL`, `PERSONAL_FEATURES_SQL`) | Both compiled and ran as-is. `MAX(IS_OWNER)` works on the live column. **No SQL fixes.** |
| FINANCIAL_TRANSACTION_ACCOUNTS columns | DESCRIBE TABLE confirms PRODUCT_KIND VARCHAR(20), BALANCE NUMBER(18,2), OPEN_DATE DATE, FINANCIAL_ACCOUNT_TYPE VARCHAR(80), ACTIVE BOOLEAN, DIRECT_DEPOSIT_AMOUNT NUMBER(18,2). |
| Duplicate anchors | V_ACCOUNT_ANCHORS has 0 duplicate ACCOUNT_IDs in either audience (business 5,725 rows / 5,725 distinct; personal 25,424 / 25,424). No tiebreak column needed; QUALIFY ORDER BY left unchanged. |
| INVESTMENT_PROPENSITY_SCORE range | min 8.75, max 100.00, mean 45.24 -> 0-100 scale confirmed; `/100` is correct. |
| Audience counts vs plan | business 5,725 (plan 5,725), personal 25,424 (plan 25,424), overlap 0. |

### Feed coverage (accounts with a non-null value)

| Side | Field | Coverage |
|---|---|---|
| business | ANNUAL_REVENUE anchor | 5,724 / 5,725 |
| business | EMPLOYEE_COUNT anchor | 5,707 / 5,725 |
| business | FTA (PRODUCT_COUNT / DEPOSIT_BALANCE) | 1,917 / 1,909 |
| business | FT MONTHLY_CREDITS / MONTHLY_NET | 1,917 |
| business | FT volatility (SD with >= 2 months) | 1,915 |
| business | ZoomInfo FOUNDED_YEAR | 5,708 |
| personal | ANNUAL_INCOME / CREDIT_SCORE / BIRTHDATE anchors | 25,424 each |
| personal | CoreLogic IS_OWNER | 25,424 |
| personal | Claritas INVESTMENT_PROPENSITY / LIFE_STAGE | 25,424 |
| personal | FTA DEPOSIT_BALANCE / DIRECT_DEPOSIT | 15,919 / 15,918 |
| personal | FT MONTHLY_CREDITS | 15,921 |

Volatility denominator: of the 1,915 businesses whose volatility comes from the feed, 0 have MONTHLY_CREDITS
None/0, so the `max(credits, 1)` fallback never fires on live data.

## Constants changed

| Module | Constant | Old | New | Why |
|---|---|---|---|---|
| labels | `NOISE` | 0.2 | 0.35 | Rule-consistency on realized training labels was 0.853 / 0.862 (above 0.80). 0.35 lands 0.749 / 0.758. |
| labels | `_lbl_LOC_HIGH_VOL` | 1.0 | 0.95 | After the volatility re-cut (more High), Line_of_Credit argmax hit 38.6% on input; 0.95 brings it to 26.9% (0.85 over-corrected because it ties below Savings' 0.9). |
| labels | `_lbl_P_AUTO_NO_LOAN_W` | 0.5 | 0.3 | Auto_Loans was 52.7% of input argmax / 46.3% of training (gate: <= 40%). |
| labels | `_lbl_P_SAVE_RATE` | 15.0 | 12.0 | Live savings-rate median 8.7 so the Savings rule rarely fired (2.8% input vs 25% in today's training); now 6.2% / 8.0%. |
| labels | `_lbl_P_PL_DTI` | 0.4 | 0.33 | Live DTI median 0.24, max 0.57, so the high-DTI Personal_Loans term almost never fired (4.5% vs 22% today); now 16.0% / 13.8%. |
| business | `VOL_LOW_MAX` | 0.15 | 0.12 | Feed cv p18 = 0.123, p50 = 0.238: re-cut so feed-derived volatility follows the 50/32/18 training mix. Input mix moved from 41.9/39.1/19.0 to 52.5/30.9/16.5 (max deviation 8.1 -> 2.5 pts). |
| business | `VOL_MED_MAX` | 0.40 | 0.24 | Same as above. |
| business | `BIZ_GEN_DEPOSIT_FRACTION` (new name for the inline `uniform(0.6, 1.1)`) | (0.6, 1.1) | (0.45, 0.8) | Today's training has deposits*12/revenue median 0.59; generated median was 0.85. Input deposit median 77,038 -> 61,775. |
| business | `BIZ_GEN_BALANCE_FRACTION` (new name for the inline `uniform(0.08, 0.2)`) | (0.08, 0.2) | (0.06, 0.45) | Today's training has balance/revenue median 0.18, p90 1.09; generated balance never exceeded 0.2 x revenue, so the idle-balance Money_Market / CDs rules never fired (input argmax MM 1 row, CDs 0; training 32 / 38 rows). Now MM 95 / CDs 39 on input, 110 / 100 in training. |

The two `BIZ_GEN_*` constants promote inline literals to side-prefixed names (no logic change). No
`floors` override was needed (R5 unused): every class reaches 100 rows in both training sets, and the
gates also pass at run_ts 2026-11-02 and 2026-12-02 (business CDs / Money_Market stay at >= 100,
rule-consistency 0.740-0.764).

Test updates: `test_draw_label_noise_rate` still draws at noise=0.2 explicitly; its `NOISE == 0.2` pin
now reads `NOISE == 0.35`. `test_volatility_from_feed_and_flags_from_holdings` derives its Low / Medium
example SDs from `VOL_LOW_MAX` / `VOL_MED_MAX` instead of the old literal 5,000 / 25,000.

## Gates (final)

| Gate | Business | Personal |
|---|---|---|
| Training mix: max share <= 40%, >= 8 classes, each >= 100 | 22.1% max, 12 classes, min 100 (CDs) | 25.1% max, 11 classes, min 116 (Brokerage_Advisory) |
| Input argmax mix: max share <= 40%, >= 8 classes | 27.7% max, 12 classes | 29.6% max, 11 classes |
| Rule-consistency in [0.70, 0.80] | 0.749 | 0.758 |
| Volatility within +-10 pts of 50/32/18 | 52.5/30.9/16.5 (2.5 pts) | n/a |
| Feed fallback < 25% | credits 6.8%, balance 1.7%, net 3.7% | balance 0.0%, deposit 0.1% |

## Known distribution gaps (not gated; anchored real values, recorded not forced)

- Business YEARS_IN_BUSINESS median 36 (training today 5): comes from real ZoomInfo FOUNDED_YEAR (5,708 accounts).
- Business NUMBER_OF_EMPLOYEES median 5 (today 10) and revenue median 944.5K (today 531K): both anchored
  (EMPLOYEE_COUNT on 5,707, ANNUAL_REVENUE on 5,724), so REVENUE_PER_EMPLOYEE has no effect.
- Business Credit_Cards argmax is 2.6% (today 24%): the young-business rule rarely fires on old real firms.
- Personal Student 0.6% (today 8.8%): live ages run 21-80 (median 50), and Student is zeroed above 35 by
  unnamed literals in `_per_employment_weights`; left unchanged (outside named-constant authority). Retired is
  10.8%, matching today's training.
- Personal MONTHLY_DEPOSIT_AMOUNT min 713 (today 100): every live income is >= 35,000, so the
  income-relative generated deposit can't go lower; income-0 anchors don't occur live.
- Personal AVG_TRANSACTION_AMOUNT keeps its absolute 2,817 cap (training-only column).

## Final printout

```
pool pulled_at 2026-10-23T14:25:44; run_ts 2026-10-23 14:29
business rows 5725, personal rows 25424, overlap 0

=== BUSINESS ===
input rows: 5725 (distinct ids 5725)
training rows: 3500
training class mix (12 classes): Line_of_Credit 775 (22.1%), Merchant_Services 735 (21.0%), Savings 441 (12.6%), Commercial_Loans 412 (11.8%), Brokerage_Advisory 226 (6.5%), Credit_Cards 206 (5.9%), Deposits 138 (3.9%), Business_Banking_Services 130 (3.7%), Wealth_Management 117 (3.3%), Treasury_Services 110 (3.1%), Money_Market 110 (3.1%), CDs 100 (2.9%)
input argmax mix (12 classes): Merchant_Services 1588 (27.7%), Line_of_Credit 1538 (26.9%), Savings 731 (12.8%), Commercial_Loans 696 (12.2%), Brokerage_Advisory 283 (4.9%), Wealth_Management 187 (3.3%), Treasury_Services 180 (3.1%), Business_Banking_Services 179 (3.1%), Credit_Cards 147 (2.6%), Money_Market 95 (1.7%), Deposits 62 (1.1%), CDs 39 (0.7%)
rule-consistency (training): 0.749
CASH_FLOW_VOLATILITY input: High 3008 (52.5%), Medium 1771 (30.9%), Low 946 (16.5%)
CASH_FLOW_VOLATILITY training: High 1805 (51.6%), Medium 1080 (30.9%), Low 615 (17.6%)
volatility from feed: 1915/5725; of which MONTHLY_CREDITS None/0: 0
feed cv quantiles p10/p18/p25/p50/p75/p90: 0.090 / 0.123 / 0.151 / 0.238 / 0.349 / 0.482
feed fallback (present -> rejected):
  MONTHLY_CREDITS: coverage 1917/5725, rejected 131 (6.8%)
  DEPOSIT_BALANCE: coverage 1909/5725, rejected 33 (1.7%)
  MONTHLY_NET: coverage 1917/5725, rejected 70 (3.7%)
numeric subset columns min / median / max  [input | new training | existing training]:
  EXISTING_PRODUCT_COUNT: 0.00 / 2.00 / 6.00 | 0.00 / 2.00 / 6.00 | 0.00 / 3.00 / 6.00
  PROFIT_MARGIN_PCT: -15.00 / 11.80 / 40.50 | -15.00 / 12.00 / 40.50 | -15.00 / 11.80 / 40.50
  ANNUAL_REVENUE: 40,000.00 / 944,500.00 / 57,244,000,000.00 | 40,000.00 / 934,500.00 / 57,244,000,000.00 | 50,000.00 / 531,211.00 / 50,000,000.00
  YEARS_IN_BUSINESS: 1.00 / 36.00 / 117.00 | 2.00 / 35.00 / 116.00 | 1.00 / 5.00 / 68.00
  NUMBER_OF_EMPLOYEES: 2.00 / 5.00 / 240,800.00 | 4.00 / 5.00 / 240,800.00 | 1.00 / 10.00 / 370.00
  OPERATING_ACCOUNT_BALANCE: 10,108.00 / 227,517.00 / 21,247,589,697.00 | 2,681.00 / 222,801.50 / 23,066,683,598.00 | 5,500.00 / 112,069.50 / 4,600,073.00
  MONTHLY_AVG_DEPOSITS: 1,599.00 / 61,775.00 / 3,820,210,760.00 | 1,831.00 / 59,317.00 / 3,781,656,380.00 | 2,000.00 / 31,525.00 / 1,524,169.00
  NET_MONTHLY_CASH_FLOW: -279,652,285.00 / 6,020.00 / 448,752,742.00 | -1,368,957.00 / 5,846.50 / 633,637,335.00 | -86,309.00 / 1,600.50 / 176,698.00
  YEARS_AS_CUSTOMER: 0.00 / 3.00 / 32.00 | 0.00 / 3.00 / 32.00 | 0.00 / 2.00 / 32.00
  NUMBER_OF_LOCATIONS: 1.00 / 1.00 / 8.00 | 1.00 / 1.00 / 8.00 | 1.00 / 1.00 / 8.00

=== PERSONAL ===
input rows: 25424 (distinct ids 25424)
training rows: 7500
training class mix (11 classes): Auto_Loans 1881 (25.1%), HELOC 1341 (17.9%), Personal_Loans 1036 (13.8%), Credit_Cards 842 (11.2%), Residential_Loans 696 (9.3%), Savings 599 (8.0%), Wealth_Management 516 (6.9%), Deposits 196 (2.6%), CDs 156 (2.1%), Money_Market 121 (1.6%), Brokerage_Advisory 116 (1.5%)
input argmax mix (11 classes): Auto_Loans 7513 (29.6%), HELOC 4737 (18.6%), Personal_Loans 4056 (16.0%), Credit_Cards 2623 (10.3%), Residential_Loans 2370 (9.3%), Savings 1571 (6.2%), Wealth_Management 1417 (5.6%), Deposits 438 (1.7%), Brokerage_Advisory 292 (1.1%), Money_Market 207 (0.8%), CDs 200 (0.8%)
rule-consistency (training): 0.758
HOME_OWNERSHIP input: Mortgage 10752 (42.3%), Rent 8505 (33.5%), Own 6167 (24.3%)
HOME_OWNERSHIP training: Mortgage 3226 (43.0%), Rent 2441 (32.5%), Own 1833 (24.4%)
EMPLOYMENT_STATUS input: Employed_FT 14612 (57.5%), Self_Employed 3616 (14.2%), Retired 2750 (10.8%), Unemployed 2592 (10.2%), Employed_PT 1706 (6.7%), Student 148 (0.6%)
feed fallback (present -> rejected):
  DEPOSIT_BALANCE: coverage 15919/25424, rejected 4 (0.0%)
  DIRECT_DEPOSIT|MONTHLY_CREDITS: coverage 15921/25424, rejected 9 (0.1%)
numeric subset columns min / median / max  [input | new training | existing training]:
  ANNUAL_INCOME: 35,000.00 / 73,100.00 / 8,604,405.00 | 35,000.00 / 72,000.00 / 1,231,300.00 | 15,000.00 / 42,157.00 / 750,000.00
  EXISTING_PRODUCT_COUNT: 0.00 / 2.00 / 6.00 | 0.00 / 2.00 / 6.00 | 0.00 / 3.00 / 6.00
  TOTAL_ACCOUNT_BALANCE: 501.00 / 8,723.50 / 4,687,500.00 | 502.00 / 8,891.50 / 2,641,110.00 | 624.00 / 17,846.50 / 431,445.00
  CREDIT_SCORE: 333.00 / 675.00 / 850.00 | 389.00 / 675.00 / 850.00 | 449.00 / 614.00 / 796.00
  AGE: 21.00 / 50.00 / 80.00 | 22.00 / 50.00 / 80.00 | 18.00 / 44.00 / 85.00
  DEBT_TO_INCOME_RATIO: 0.00 / 0.24 / 0.57 | 0.00 / 0.24 / 0.52 | 0.00 / 0.21 / 0.68
  MONTHLY_DEPOSIT_AMOUNT: 713.00 / 1,336.00 / 106,215.00 | 721.00 / 1,362.00 / 61,131.00 | 100.00 / 1,405.50 / 36,289.00
  SAVINGS_RATE_PCT: 0.10 / 8.70 / 36.10 | 0.10 / 8.60 / 35.80 | 0.10 / 10.50 / 36.10

=== GATES ===
  overlap 0: PASS
  business training mix: PASS
  business input argmax mix: PASS
  business rule-consistency 0.749: PASS
  business volatility max dev 2.5 pts: PASS
  business MONTHLY_CREDITS fallback 6.8%: PASS
  business DEPOSIT_BALANCE fallback 1.7%: PASS
  business MONTHLY_NET fallback 3.7%: PASS
  personal training mix: PASS
  personal input argmax mix: PASS
  personal rule-consistency 0.758: PASS
  personal DEPOSIT_BALANCE fallback 0.0%: PASS
  personal DIRECT_DEPOSIT|MONTHLY_CREDITS fallback 0.1%: PASS
```

## Re-measure after final-review fixes (dae0c2c3, 2026-10-23)

Feed window now ends at the start of the run month (exclusive) and age is computed at month start; training pool is sorted by ACCOUNT_ID before draws. Re-pulled live (read-only, `--refresh`). Business volatility moved to 57.0/28.6/14.4 (max dev 7.0 pts, within the 10-pt gate).

```
=== GATES ===
  overlap 0: PASS
  business training mix: PASS
  business input argmax mix: PASS
  business rule-consistency 0.741: PASS
  business volatility max dev 7.0 pts: PASS
  business MONTHLY_CREDITS fallback 5.9%: PASS
  business DEPOSIT_BALANCE fallback 1.7%: PASS
  business MONTHLY_NET fallback 1.8%: PASS
  personal training mix: PASS
  personal input argmax mix: PASS
  personal rule-consistency 0.760: PASS
  personal DEPOSIT_BALANCE fallback 0.0%: PASS
  personal DIRECT_DEPOSIT|MONTHLY_CREDITS fallback 0.1%: PASS
```
