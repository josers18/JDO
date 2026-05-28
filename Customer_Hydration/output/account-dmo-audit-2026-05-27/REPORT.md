# Account DMO Audit (Comprehensive) — 2026-05-27

> **Org:** `jdo-uqj0jr`
> **DMO:** `ssot__Account__dlm`
> **Cohort:** `External_ID__c LIKE 'HYDRATE-%'` — n = 36,044 = 25,370 person + 10,674 business
> **Method:** every audited field measured per-cohort via `COUNT(field) GROUP BY IsPersonAccount` (or `COUNT(Id) WHERE field != null` for multipicklists / textareas). Disposition assigned per the **FSC unification rule**: where the user has stated a field "all need to be filled out", the cohort that's currently NULL is treated as a gap regardless of subtype.
> **Replaces:** the narrower 17-field audit committed earlier today, which mistakenly classified ~30 fields as `OK_PERSON_ONLY`/`OK_BUSINESS_ONLY` instead of as parity gaps.

## TL;DR

64 fields audited. 56 have gaps. Only 8 are populated on all 36,044 HYDRATE rows.

| # | Classification | Fields | Meaning |
|---:|---|---:|---|
| 1 | `OK_FULL` | 8 | Populated on all 36,044 rows. No Phase 5 action. |
| 2 | `ALL_NULL` | 11 | 100% empty on both cohorts. **Highest priority** — never written by Phase 1 or Phase 4. |
| 3 | `PERSON_COMPLETE_BIZ_NULL` | 20 | Persons 100%, businesses 0%. Per FSC unification, businesses need a value (or documented N/A). |
| 4 | `BIZ_COMPLETE_PERSON_NULL` | 15 | Businesses 100%, persons 0%. Persons need values (mirror or derive). |
| 5 | `PERSON_50_REGRESSION_BIZ_NULL` | 6 | Persons 25,320 / 25,370 (50 NULL) + businesses 0%. **Phase 4 regression** to fix + business parity gap. |
| 6 | `BIZ_PARTIAL_PERSON_NULL` | 3 | Businesses ~52.6%, persons 0%. Both cohorts incomplete. |
| 7 | `PERSON_COMPLETE_BIZ_PARTIAL` | 1 | Persons 100%, businesses partial (Household RT only, not pure Business). |

**Six findings I missed in the earlier audit:**

1. **5 multipicklists are 100% empty on both cohorts** — `InvestmentObjectives`, `PersonalInterests`, `CustomerSegment`, `MarketingSegment`, `FinancialInterests`. Phase 1 generators don't emit them; Phase 4 didn't backfill them; my earlier audit's `COUNT(field)` test missed them entirely.
2. **`Rating`, `Type`, `AccountSource`** are *standard* CRM fields treated as B2B-only by Phase 4. `Rating` and `Type` are 100% on businesses, 0% on persons. `AccountSource` is partial (52.6%) on businesses, 0% on persons. Per FSC unification rule, person rows need them too.
3. **Phase 4 missed 50 person rows** on `MaritalStatus`, `CurrentEmployer`, `Occupation`, `TaxBracket`, `AnnualIncome`, `LifetimeValue`. Persons should be 25,370; they're 25,320. **A real Phase 4 regression** worth surfacing.
4. **`FinServ_Category__pc`, `FinServ_Contact_Status__pc`, `FinServ__IndividualType__pc`** all exist on Account in this org (I previously claimed otherwise — typo in my SOQL was using `FinServ__Category__pc` with a double underscore; the correct name is `FinServ_Category__pc` with single). All three are 100% empty on both cohorts.
5. **`Phone`, `Website`** — businesses ~52.6%, persons 0%. Two more "biz-only" CRM standards needing person mirrors.
6. **`FinServ__BranchCode__c`, `FinServ__BranchName__c`, `FinServ__PrimaryContact__c`** — confirmed 100% empty on both cohorts. (Same as earlier audit; consistent.)

## 1. Top gaps by total NULL cells

| Rank | Field | Type | NULLs (of 36,044) | Person % | Business % | Class |
|---:|---|---|---:|---:|---:|---|
| 1 | `FinServ__InvestmentObjectives__c` | multipicklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 2 | `FinServ__PersonalInterests__c` | multipicklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 3 | `FinServ__CustomerSegment__c` | multipicklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 4 | `FinServ__MarketingSegment__c` | multipicklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 5 | `FinServ__FinancialInterests__c` | multipicklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 6 | `FinServ_Category__pc` | picklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 7 | `FinServ_Contact_Status__pc` | picklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 8 | `FinServ__IndividualType__pc` | picklist | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 9 | `FinServ__BranchCode__c` | string | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 10 | `FinServ__BranchName__c` | string | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 11 | `FinServ__PrimaryContact__c` | reference | 36,044 | 0.0 | 0.0 | ALL_NULL |
| 12 | `AccountSource` | picklist | 30,434 | 0.0 | 52.6 | BIZ_PARTIAL_PERSON_NULL |
| 13 | `Phone` | phone | 30,434 | 0.0 | 52.6 | BIZ_PARTIAL_PERSON_NULL |
| 14 | `Website` | url | 30,434 | 0.0 | 52.6 | BIZ_PARTIAL_PERSON_NULL |
| 15 | `Rating` | picklist | 25,370 | 0.0 | 100.0 | BIZ_COMPLETE_PERSON_NULL |
| 16 | `Type` | picklist | 25,370 | 0.0 | 100.0 | BIZ_COMPLETE_PERSON_NULL |
| 17 | `BillingStreet/City/State/PostalCode/Country` | mixed | 25,370 each | 0.0 | 100.0 | BIZ_COMPLETE_PERSON_NULL × 5 |
| 22 | `ShippingStreet/City/State/PostalCode/Country` | mixed | 25,370 each | 0.0 | 100.0 | BIZ_COMPLETE_PERSON_NULL × 5 |
| 27 | `Equifax_Credit_Risk_Score__c`, `Experian_Intelliscore__c`, `DNB_PAYDEX_Score__c`, `INS_FEIN_Tax_ID__c` | mixed | 25,370 each | 0.0 | 100.0 | BIZ_COMPLETE_PERSON_NULL × 4 (intentional — bureau scores don't apply to persons) |
| 31 | `AnnualRevenue`, `NumberOfEmployees` | mixed | 25,370 each | 0.0 | 100.0 | BIZ_COMPLETE_PERSON_NULL × 2 (intentional — businesses-only by definition) |
| 33 | `FinServ__CustomerType__c` ⊕ persons missing or full? | picklist | varies | varies | varies | depends on previous wave reseeding |
| ... and 18 more `PERSON_COMPLETE_BIZ_NULL` fields below |

Full ranked table is in `comprehensive_audit.json`.

## 2. Bucket #1 — `ALL_NULL` (11 fields)

100% empty on every HYDRATE row. **No Phase 1 generator emits them; no Phase 4 deriver writes them.** Both backfill paths bypass them entirely.

| Field | Type | Notes / proposed source |
|---|---|---|
| `FinServ__InvestmentObjectives__c` | multipicklist | Persona × risk × experience template (Wealth Conservative → "Capital Preservation"; Wealth Aggressive → "Growth + Income"; SMB → "Working Capital"; Commercial → "Treasury / M&A"; Retail → "Long-term Growth"). |
| `FinServ__PersonalInterests__c` | multipicklist | Persona-flavored set: Wealth → ["Travel","Art Collecting","Philanthropy"]; SMB → ["Networking","Industry Events"]; Retail family → ["Sports","Family Activities","Home Improvement"]. Probably 6–8 templates. |
| `FinServ__CustomerSegment__c` | multipicklist | This is the FSC equivalent of "SegmentType". Map from `ClientCategory` to a multipicklist combination, e.g. Wealth Management → ["High Net Worth","Wealth Management"]; Retail → ["Retail","Mass Market"]; Commercial → ["Commercial","Mid-Market"]. |
| `FinServ__MarketingSegment__c` | multipicklist | Marketing-ops slice. Persona × tier × age band. |
| `FinServ__FinancialInterests__c` | multipicklist | Wealth → ["Estate Planning","Tax Optimization","Retirement"]; SMB → ["Business Loans","Cash Management"]; Retail → ["Mortgage","Auto Loan","Savings"]. |
| `FinServ_Category__pc` | picklist | Per-org vocabulary; describe the picklist values to choose from. Likely mirrors `ClientCategory`. |
| `FinServ_Contact_Status__pc` | picklist | `Active`/`Inactive`/`Dormant`/`At Risk` derived from `LastInteraction` recency. |
| `FinServ__IndividualType__pc` | picklist | Person-account shadow. Likely mirrors `IndividualType__c` for persons. |
| `FinServ__BranchCode__c` | string | Pulled from `BranchUnit.BranchCode` (26 rows in org). State-weighted assignment. |
| `FinServ__BranchName__c` | string | Pulled from `BranchUnit.Name` paired with the BranchCode pick. |
| `FinServ__PrimaryContact__c` | reference (Contact) | Person → `PersonContactId`. Business with ACR → first ACR.ContactId. Business no ACR → synthesise. |

## 3. Bucket #2 — `PERSON_50_REGRESSION_BIZ_NULL` (6 fields, real Phase 4 bug)

Persons populated on **25,320 / 25,370 = 99.8%** (50 rows missing on each), businesses 0%. The 50-row gap is either (a) records with NULL persona that didn't match any deriver, or (b) write-failures Phase 4d's `0 bulk failures` glossed over.

| Field | Persons populated | Persons missing | Business populated |
|---|---:|---:|---:|
| `FinServ__MaritalStatus__pc` | 25,320 | 50 | 0 |
| `FinServ__CurrentEmployer__pc` | 25,320 | 50 | 0 |
| `FinServ__Occupation__pc` | 25,320 | 50 | 0 |
| `FinServ__TaxBracket__pc` | 25,320 | 50 | 0 |
| `FinServ__AnnualIncome__pc` | 25,320 | 50 | 0 |
| `FinServ__LifetimeValue__c` | 25,320 | 50 | 0 |

**Investigate:** `SELECT Id, External_ID__c, Persona__c FROM Account WHERE IsPersonAccount = true AND External_ID__c LIKE 'HYDRATE-%' AND FinServ__MaritalStatus__pc = NULL LIMIT 50` — confirm the same 50 IDs are missing across all 6 fields (suggests a single-batch failure) or 50 different IDs per field (suggests random transient errors). Phase 5b reruns them.

## 4. Bucket #3 — `PERSON_COMPLETE_BIZ_NULL` (20 fields)

Persons 100%, businesses 0%. Per the FSC unification rule, business rows need a value. Some are sensible to populate; others (e.g. `PersonBirthdate`, `PersonGender`) are nonsensical for businesses and should accept the cohort split as designed. Audit calls this out per-field below.

| Field | Person 100%? | Business gap is real? | Proposed disposition |
|---|---|---|---|
| `FinServ__CountryOfBirth__pc` | yes | semi — country of incorporation is a meaningful analogue | populate biz with country of incorporation |
| `FinServ__CountryOfResidence__pc` | yes | semi — country of HQ | populate biz with HQ country |
| `FinServ__InvestmentExperience__c` | yes | yes — businesses have investment experience too | persona-coherent value (commercial = experienced; SMB = beginner) |
| `FinServ__RiskTolerance__c` | yes | yes | derive from biz size / industry |
| `FinServ__ServiceModel__c` | yes | yes | populate from persona (Commercial → Premier; SMB → Standard) |
| `FinServ__BorrowingHistory__c` | yes | yes | populate from credit data |
| `FinServ__TimeHorizon__c` | yes | yes | populate from biz lifecycle |
| `FinServ__NetWorth__c` | yes | yes | for biz, mirror `AnnualRevenue × multiplier` or use `ssot__AnnualRevenueAmount__c` proxy |
| `FinServ__CreditRating__c` | yes | yes | for biz, derive from Equifax/Experian/PAYDEX bureau scores already present |
| `FinServ__CreditScore__c` | yes | partly — bureau scores cover this for biz | leave; bureau scores already populated on biz |
| `Tier__c` | yes | yes | persona-derived (commercial = A, SMB = B, etc.) |
| `FinServ__EmployedSince__pc` | yes | **no** | leave; businesses don't have employment date |
| `FinServ__HomeOwnership__pc` | yes | **no** | leave; businesses don't have home ownership |
| `FinServ__ContactPreference__pc` | yes | yes | populate biz with default preference |
| `FinServ__OtherAddress_pc__c` (compound) | yes | **no** | leave |
| `PersonBirthdate` | yes | **no** | leave |
| `PersonGender` | yes | **no** | leave |
| `PersonHomePhone` | yes | **no** | leave |
| `PersonMobilePhone` | yes | **no** | leave |
| `PersonEmail` | yes | **no** | leave |
| `PersonMailingStreet/City/...` (5) | yes | **no** | leave; business uses Billing/Shipping |

**Net new biz writes from this bucket: ~14 fields × 10,674 rows = 149,436 cells.**

## 5. Bucket #4 — `BIZ_COMPLETE_PERSON_NULL` (15 fields)

Businesses 100%, persons 0%. Same analysis: which need person mirrors?

| Field | Business 100%? | Person gap is real? | Proposed disposition |
|---|---|---|---|
| `Rating` (standard CRM) | yes | yes | persona-coherent picklist mapping (Wealth = Hot; Commercial = Hot; SMB = Warm; Retail = Cold) |
| `Type` (standard CRM) | yes | yes | persona → Customer/Prospect/Other |
| `BillingStreet/City/State/PostalCode/Country` | yes | yes | mirror `PersonMailing*` for persons (already in the prior audit's PA mirror sub-phase) |
| `ShippingStreet/City/State/PostalCode/Country` | yes | yes | mirror `PersonMailing*` (defaults to mailing for persons) |
| `Equifax_Credit_Risk_Score__c`, `Experian_Intelliscore__c`, `DNB_PAYDEX_Score__c` | yes | **no** | bureau scores don't apply to consumers |
| `INS_FEIN_Tax_ID__c` | yes | **no** | FEIN is a business-only ID |
| `AnnualRevenue` | yes | **no** | use `FinServ__AnnualIncome__pc` for persons; leave standard field NULL |
| `NumberOfEmployees` | yes | **no** | leave |

**Net new person writes from this bucket: ~12 fields × 25,370 rows = 304,440 cells (mostly the address mirror and Rating/Type).**

## 6. Bucket #5 — `BIZ_PARTIAL_PERSON_NULL` (3 fields)

Businesses ~52.6%, persons 0%. Both incomplete. Phase 4 didn't backfill any of them.

| Field | Business populated | Business gap | Person gap |
|---|---:|---:|---:|
| `AccountSource` (standard CRM) | 5,610 / 10,674 | 5,064 missing | all 25,370 missing |
| `Phone` (standard CRM) | 5,610 / 10,674 | 5,064 missing | all 25,370 missing |
| `Website` (standard CRM) | 5,610 / 10,674 | 5,064 missing | all 25,370 missing |

For `Phone` on persons, mirror `PersonHomePhone` or `PersonMobilePhone`. For `Website`, persons don't typically have one — leave or generate a synthetic per-customer URL stub. `AccountSource` is a CRM-standard picklist (Web/Phone Inquiry/Referral/etc.) — populate from a persona-coherent distribution.

## 7. Bucket #6 — `PERSON_COMPLETE_BIZ_PARTIAL` (1 field)

| Field | Persons 100% | Business pop | Notes |
|---|---:|---:|---|
| `FinServ__IndividualType__c` | 25,370 | 5,064 / 10,674 | Persons all have it; only Household RT (5,064 rows) gets it on the biz side. Pure Business RT (5,610 rows) is empty. |

Populate Business RT rows with a sensible value (e.g. `Other` or `Organization`).

## 8. Already OK (8 fields, no Phase 5 action)

`FinServ__ClientCategory__c`, `FinServ__Status__c`, `FinServ__CustomerType__c`, `FinServ__KYCStatus__c`, `FinServ__KYCDate__c`, `FinServ__RelationshipStartDate__c`, `FinServ__LastInteraction__c`, `Industry`. All populated on every HYDRATE row.

## 9. CRM ↔ DMO comparison

For every field with a 1:1 DMO mapping (per `dmo_mapping_digest.json`), CRM population = DMO population (post-stream-refresh). The `BillingStreet 70% NULL on the DMO` observation from the prior audit reduces to `BillingStreet 70% NULL on the CRM Account`. The DLO→DMO mapping is identity; the gap is genuinely source-side.

Two exceptions worth noting:

- `FinServ_Category_pc__c` and `FinServ_Contact_Status__pc` mappings exist but the source CRM fields **are also empty**, so the DMO emptiness is an upstream gap, not a mapping gap. The earlier audit incorrectly classified these as "GAP_FIELD_NONEXISTENT"; correction: the **fields exist, they're just empty**, so they're `ALL_NULL` like the multipicklists.
- `FinServ__CreditScore__c` populated 100% on persons in CRM but only 70.4% in the DMO sample I ran earlier. **Unexplained**. Could be: a stream refresh hasn't happened since Phase 4 v1.1 wave 5; or empty-string vs NULL handling in DLO→DMO transformation. Phase 5e (stream refresh) should re-converge this; if not, investigate as a separate finding.

## 10. Out of scope (still)

- 80 unmapped DMO fields (no DLO mapping → require new mapping definitions, not backfill).
- PII fields (`SSN`, `TaxId`).
- Legacy `FINS_Retail_*` schema (audit confirms abandoned).
- 9 missing FSC FA fields (`BankingType`, `OccupationCode__pc`, `AcquisitionDate`, `BusinessType`, `BankingPreference`, `OtherInformation`, `SourceofFunds`, `SourceofWealth`, `InvestorRiskProfile`) — not deployed in this org. Add to a future "FSC FA standard fields deploy" phase if needed.

## 11. Files

- `output/account-dmo-audit-2026-05-27/audit_field_inventory.json` — 76 existing + 9 missing field inventory
- `output/account-dmo-audit-2026-05-27/comprehensive_audit.json` — 64-field cohort-aware audit
- `output/account-dmo-audit-2026-05-27/dmo_mapping_digest.json` — 9 active DLO→DMO mappings
- `output/account-dmo-audit-2026-05-27/crm_account_fields.csv` — full 552-field Account inventory

## 12. Phase 5 implications

The earlier 17-field plan was wrong. The real Phase 5 covers ~50 distinct fields across 6 sub-phases:

- **5a** Branch backfill (2 fields × 36,044 rows)
- **5b** Multipicklist + person/biz parity backfill (5 multipicklists + 14 person→biz parity + 12 biz→person parity = ~31 fields × 36,044 rows)
- **5c** Phase 4 regression fix (6 fields × 50 missing person rows)
- **5d** Mapping repoint (3 mappings)
- **5e** Stream refresh
- **5f** Verification re-audit

Spec/plan rewrite at `docs/superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md` and `docs/superpowers/plans/2026-05-27-phase-5-dmo-backfill.md`.
