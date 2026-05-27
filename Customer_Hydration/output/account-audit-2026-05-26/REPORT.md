# Account Object Audit — `jdo-uqj0jr`

_Run date: 2026-05-26 — total records: **36,222** (25,424 person + 10,798 business)._

_Schema scanned: 538 fields total, 451 measurable via `COUNT(field)`, 30 measurable via row-count, 15 long-text fields measured via 200-row sample._

## 1. TL;DR — what is missing

**Headline gaps (by financial dimension):**

| Dimension | Most populated field | Coverage | Big sparse field | Coverage |
|---|---|---|---|---|
| Income — retail | `FinServ__AnnualIncome__pc` | 99.7% of person accts | `FINS_Retail_Annual_Income__c` | 0.1% |
| Income — biz/SMB | `AnnualRevenue` | 100% of Business RT only | `FINS_Retail_Other_Income__c` | 0.0% |
| Net worth | `FinServ__AUM__c` (rollup) | 100% all RTs | `FINS_Retail_Net_Worth__c` | already 100% |
| **Credit scores** | `FinServ__CreditRating__c` (picklist) | 0.5% non-test | `FinServ__CreditScore__c` (numeric) | **0.1%** |
| Bureau scores (B2B) | none | <0.5% | `Equifax_Credit_Risk_Score__c`, `Experian_Intelliscore__c`, `DNB_PAYDEX_Score__c` | 0.4–0.5% |
| Risk profile | `FinServ__RiskTolerance__c` | 15.5% person | `FinServ__TimeHorizon__c` | 0.1% |
| KYC | `FinServ__ClientCategory__c` | 99.7% all RTs | `FinServ__KYCStatus__c` | 0.2% |
| Relationship | `FinServ__LastInteraction__c` | 81.2% | `FinServ__RelationshipStartDate__c` | **0%** |
| Demographics | `FinServ__MaritalStatus__pc`, `Occupation__pc` | 99.6% person | `FinServ__TaxBracket__pc`, `LastFourDigitSSN__pc` | 0% |
| Employment | `FinServ__CurrentEmployer__pc` | 99.6% person | `FinServ__EmployedSince__pc` | 0% |

**The pattern:** the legacy `FINS_Retail_*` schema is essentially empty — the hydration pipeline writes to the `FinServ__*pc` schema instead. Several high-signal fields (`CreditScore`, `KYCStatus`, `RelationshipStartDate`, bureau scores, `TimeHorizon`) are populated only on a tiny "demo seed" of ~67 records (the `Account` record-type cohort).

## 2. Record-type denominators

| RecordType | Count | Person? |
|---|---:|---|
| FSC Person Accounts | 25,379 | Yes |
| Business | 5,618 | No |
| Household | 5,095 | No |
| Account | 67 | No |
| Person Accounts | 37 | Yes |
| Entity | 11 | No |
| Person Account | 8 | Yes |
| Partner | 5 | No |
| (none) | 2 | No |

## 3. Domain summary

| Domain | Fields | Avg pop. | <10% sparse | ≥90% dense |
|---|---:|---:|---:|---:|
| analytics/ai-summary | 3 | 0.2% | 3 | 0 |
| contact/preferences | 2 | 0.0% | 2 | 0 |
| credit/risk-scores | 19 | 16.5% | 15 | 3 |
| demographics/personal | 35 | 22.0% | 27 | 7 |
| engagement/marketing | 43 | 0.0% | 43 | 0 |
| income/employment | 12 | 33.3% | 8 | 4 |
| kyc/compliance | 19 | 15.9% | 16 | 3 |
| other | 233 | 21.6% | 168 | 34 |
| relationship/lifecycle | 15 | 6.9% | 13 | 0 |
| sales-demo/SDO | 54 | 37.0% | 34 | 20 |
| wealth/balances | 31 | 61.7% | 11 | 19 |

## 4. Priority financial fields — populated %

| Field | Type | Population (denom) | Pop % | Notes |
|---|---|---:|---:|---|
| `FINS_Retail_Annual_Income__c` | currency | 49 / 36,222 | 0.1% | ⚠ legacy retail schema — abandoned |
| `FINS_Retail_Other_Income__c` | currency | 0 / 36,222 | 0.0% | ⚠ legacy retail schema — abandoned |
| `FINS_Retail_Liabilities__c` | currency | 43 / 36,222 | 0.1% | ⚠ legacy retail schema — abandoned |
| `FINS_Retail_Personal_Assets__c` | currency | 48 / 36,222 | 0.1% | ⚠ legacy retail schema — abandoned |
| `FINS_Retail_Net_Worth__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (looks formula/default) |
| `FinServ__AnnualIncome__pc` | currency | 25,368 / 25,424 | 99.8% | OK — 99.7% person (live source-of-truth) |
| `FinServ__NetWorth__c` | currency | 135 / 36,222 | 0.4% | ⚠ flat zero (rolled up from `FinServ__Total*`) |
| `FinServ__CreditScore__c` | double | 44 / 36,222 | 0.1% | ⚠ critical FSC numeric; only 44 demo rows |
| `FinServ__CreditRating__c` | picklist | 135 / 36,222 | 0.4% | ⚠ paired picklist; sparse |
| `FinServ__RiskTolerance__c` | picklist | 4,055 / 36,222 | 11.2% | wealth-only (15.5% person) |
| `FinServ__InvestmentExperience__c` | picklist | 4,055 / 36,222 | 11.2% | wealth-only (15.5% person) |
| `FinServ__TimeHorizon__c` | picklist | 135 / 36,222 | 0.4% | ⚠ flat zero |
| `FinServ__AUM__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (rollup) |
| `FinServ__TotalBankDeposits__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (rollup) |
| `FinServ__TotalLiabilities__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (rollup) |
| `FinServ__TotalInvestments__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (rollup) |
| `FinServ__TotalInsurance__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (rollup) |
| `FinServ__TotalOutstandingCredit__c` | currency | 36,222 / 36,222 | 100.0% | OK — 100% (rollup) |
| `FinServ__KYCStatus__c` | picklist | 135 / 36,222 | 0.4% | ⚠ flat zero except demo seed |
| `FinServ__KYCDate__c` | date | 4 / 36,222 | 0.0% | ⚠ flat zero |
| `FinServ__CustomerType__c` | picklist | 135 / 36,222 | 0.4% | ⚠ flat zero (paired with ClientCategory) |
| `FinServ__ClientCategory__c` | picklist | 36,179 / 36,222 | 99.9% | OK — 99.7% (the live discriminator) |
| `FinServ__Status__c` | picklist | 136 / 36,222 | 0.4% | ⚠ flat zero |
| `FinServ__ServiceModel__c` | picklist | 135 / 36,222 | 0.4% | ⚠ flat zero |
| `FinServ__RelationshipStartDate__c` | date | 0 / 36,222 | 0.0% | ⚠ flat zero — easy backfill from CreatedDate |
| `AnnualRevenue` | currency | 5,717 / 36,222 | 15.8% | Business RT only (5,618 / 5,618 = 100% within Biz) |
| `CreditLimit__c` | currency | 0 / 36,222 | 0.0% | ⚠ flat zero |
| `Credit_Balance__c` | currency | 36,127 / 36,222 | 99.7% | OK — 100% all RTs |
| `DNB_PAYDEX_Score__c` | double | 111 / 36,222 | 0.3% | ⚠ B2B bureau — almost empty |
| `Equifax_Credit_Risk_Score__c` | double | 111 / 36,222 | 0.3% | ⚠ B2B bureau — almost empty |
| `Experian_Intelliscore__c` | double | 111 / 36,222 | 0.3% | ⚠ B2B bureau — almost empty |
| `FINS_AnnualExpenses__c` | picklist | 0 / 36,222 | 0.0% | ⚠ flat zero |
| `FINS_Assets_Under_Management__c` | currency | 12 / 36,222 | 0.0% | ⚠ flat zero (FinServ__AUM__c is the live one) |
| `FinServ__CurrentEmployer__pc` | string | 25,323 / 25,424 | 99.6% | OK — 99.6% person |
| `FinServ__Occupation__pc` | string | 25,364 / 25,424 | 99.8% | OK — 99.6% person |
| `FinServ__EmployedSince__pc` | date | 2 / 25,424 | 0.0% | ⚠ flat zero |
| `FinServ__MaritalStatus__pc` | picklist | 25,366 / 25,424 | 99.8% | OK — 99.6% person |
| `FinServ__NumberOfDependents__pc` | double | 25,363 / 25,424 | 99.8% | OK — 99.6% person |
| `FinServ__HomeOwnership__pc` | picklist | 43 / 25,424 | 0.2% | ⚠ flat zero |
| `FinServ__TaxBracket__pc` | picklist | 0 / 25,424 | 0.0% | ⚠ flat zero |
| `FinServ__TaxId__pc` | string | 4 / 25,424 | 0.0% | ⚠ flat zero except 4 records |
| `FinServ__LastFourDigitSSN__pc` | string | 4 / 25,424 | 0.0% | ⚠ flat zero |
| `INS_FEIN_Tax_ID__c` | string | 1 / 36,222 | 0.0% | ⚠ Business needs FEIN — 0/10,798 |
| `Tier__c` | picklist | 135 / 36,222 | 0.4% | ⚠ flat zero (Account-level tier) |
| `FinServ__BorrowingHistory__c` | picklist | 135 / 36,222 | 0.4% | ⚠ flat zero |
| `FinServ__LifetimeValue__c` | currency | 135 / 36,222 | 0.4% | ⚠ flat zero |
| `FinServ__WalletShare__c` | percent | 36,222 / 36,222 | 100.0% | OK — 100% |
| `FinServ__LastInteraction__c` | date | 29,346 / 36,222 | 81.0% | OK — 81% overall |
| `FinServ__NextInteraction__c` | date | 3 / 36,222 | 0.0% | ⚠ flat zero |
| `FinServ__LastReview__c` | date | 1 / 36,222 | 0.0% | ⚠ flat zero |
| `DNB_Delinquency_Score__c` | double | 111 / 36,222 | 0.3% | ⚠ B2B bureau — almost empty |
| `DNB_Failure_Score__c` | double | 111 / 36,222 | 0.3% | ⚠ B2B bureau — almost empty |

## 5. Backfill priorities

Rank by **business signal × ease of backfill**.

### P0 — high-signal, mechanically derivable from existing data

1. **`FinServ__RelationshipStartDate__c`** — 0% populated. Just copy `CreatedDate` (or the FA earliest open date) into it. One-off Apex/SOQL script.
2. **`FinServ__CreditScore__c`** + `FinServ__CreditRating__c` — 0.1% populated. Generator already exists for retail in `customer_hydration/generators/retail.py`; extend hydration to fill on every retail/wealth Account, not just the demo seed of 67. Synthetic FICO band (300–850) keyed off seed for determinism.
3. **`FinServ__KYCStatus__c`** + `FinServ__KYCDate__c` — 0.2% / 0% populated. Pick from {`Approved`, `Pending`, `Expired`} weighted 90/8/2; KYCDate uniform between RelationshipStart and today.
4. **`FinServ__NetWorth__c`** — flat zero. The summed `FinServ__Total*` rollups all show 100%, so net worth = `TotalAssets - TotalLiabilities`. Derive in Apex (or Flow) or a one-shot CLI.
5. **`Tier__c`** + `FinServ__CustomerType__c` + `FinServ__Status__c` + `FinServ__ServiceModel__c` — 0%. These are the persona discriminators; assign by RecordType + AnnualIncome quintile.

### P1 — high-signal, needs a synthesizer

6. **B2B bureau scores** (`DNB_PAYDEX_Score__c`, `Equifax_Credit_Risk_Score__c`, `Experian_Intelliscore__c`, `DNB_Delinquency_Score__c`, `DNB_Failure_Score__c`) — < 0.5% on the 10,798 Business/Household/Entity records. Add a `commercial_credit.py` generator producing correlated scores keyed off `AnnualRevenue` band.
7. **`INS_FEIN_Tax_ID__c`** — 0/10,798 Business records. Synthesize 9-digit IDs deterministically per Account.
8. **`FinServ__LifetimeValue__c`**, **`FinServ__WalletShare__c`** — already 100% but `LifetimeValue` is 0; derive `LifetimeValue = AnnualIncome × tenureYears × 0.05` style.
9. **`FinServ__TimeHorizon__c`** + `FinServ__BorrowingHistory__c` — paired with risk tolerance. Currently match the 67-row demo seed only.
10. **Demographics**: `FinServ__HomeOwnership__pc` (0%), `FinServ__EmployedSince__pc` (0%), `FinServ__TaxBracket__pc` (0%), `FinServ__LastFourDigitSSN__pc` (0%), `FinServ__TaxId__pc` (0%) — synth-generate, but check for re-identification risk in the demo data.

### P2 — engagement / marketing / SDO sandbox fields (likely intentional)

11. The `pi__*` (Pardot/Account-Engagement), `xDO_MDC_Cust360_*`, `SDO_Maps_*`, `SDO_Cust360_*`, and `SDO_Sales_*` fields are mostly 0%. These come from connected products that are not active in this org. Either populate via mock event publishing or flag as "out of scope for hydration."
12. **AI-summary long-text** (`KYC_Summary__c`, `Engagement_Summary__c`, `Transaction_Summary__c`, `FINS_Summary_of_*`, `FINS_Client_Profile_Summary__c`, `FINS_ClientSummaryRich__c`) — 0% in 200-row sample except `FINS_Client_Profile_Summary__c` (3%). These are *meant* to be generated by Agentforce — leave empty until the Agentforce pipeline runs, or seed a few to demo the surface.

### P3 — leave empty

- Legacy `FINS_Retail_*` (Income/Other_Income/Liabilities/Personal_Assets) — superseded by `FinServ__*pc` and `FinServ__Total*`. Recommendation: do NOT backfill; tag as deprecated in `docs/foundational_streams.md` to prevent confusion.
- `Quip_URL__c`, `Relationship_Plan__c` — managed-package URL fields, irrelevant to the customer model.
- Sandbox-only `SDO_*` fields with no source system — keep null.

## 6. Suggested next step

Add **Phase 4** to Customer_Hydration: a `backfill-account-fields` CLI that runs the P0 list above as a single idempotent pass over existing accounts (no new rows). Mirrors the Phase 3c `mirror-life-events` design — read in chunks, derive, upsert via Bulk 2.0, log to `output/`.

## 7. Artifacts

- `output/account-audit-2026-05-26/account_fields_enriched.json` — schema dump (538 fields)
- `output/account-audit-2026-05-26/populated_counts.json` — per-field populated count (451 aggregatable)
- `output/account-audit-2026-05-26/non_agg_counts.json` — per-field count for textareas/multipicklists (30)
- `output/account-audit-2026-05-26/segment_breakdown.json` — populated × RecordType matrix (51 priority fields)
- `output/account-audit-2026-05-26/ranked_fields.json` — every field ranked by null %
- `output/account-audit-2026-05-26/bucketed.json` — same, grouped by domain
