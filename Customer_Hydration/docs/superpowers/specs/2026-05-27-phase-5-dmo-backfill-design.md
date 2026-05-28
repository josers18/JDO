# Phase 5 — Account DMO Backfill (Comprehensive)

> **Status:** Draft v2.0, 2026-05-27. Supersedes the v1.0 17-field draft committed earlier today (which under-scoped the gap list).
> **Scope:** close real gaps on `ssot__Account__dlm` for the 36,044 HYDRATE-* rows. Six sub-phases covering ~50 distinct fields. Per the FSC unification rule (`Account` is one row per customer regardless of subtype), business rows need values for fields previously treated as person-only, and vice versa, except where a field is genuinely subtype-specific (`PersonBirthdate`, `AnnualRevenue`, bureau scores).
> **Audit:** `output/account-dmo-audit-2026-05-27/REPORT.md` is the source of truth — 64 fields audited, 56 with gaps, 8 already OK.

## 1. Problem statement

Per the comprehensive cohort-aware audit, the Account DMO has 6 distinct gap classes — not the 3 the earlier audit identified. The deltas v1.0 missed:

1. **5 multipicklists are 100% empty:** `InvestmentObjectives`, `PersonalInterests`, `CustomerSegment`, `MarketingSegment`, `FinancialInterests`. v1.0's `COUNT(field)` test couldn't measure multipicklists; they slipped through.
2. **3 standard CRM picklists are person-NULL:** `Rating`, `Type`, `AccountSource`. Phase 4 treated them as B2B-only; per FSC unification, persons need them.
3. **Phase 4 missed 50 person rows** on 6 person-coherent fields (`MaritalStatus`, `CurrentEmployer`, `Occupation`, `TaxBracket`, `AnnualIncome`, `LifetimeValue`). A real regression — same 50 IDs (suspected) across all 6 fields, suggesting one batch failed silently.
4. **`FinServ_Category__pc`, `FinServ_Contact_Status__pc`, `FinServ__IndividualType__pc`** all exist on Account in this org (the prior audit's typo had me query `FinServ__Category__pc` — double underscore — which doesn't exist). All three are 100% empty on both cohorts; need backfill, not mapping repoint.
5. **20 person-only fields are biz-NULL** (e.g. `CountryOfBirth`, `RiskTolerance`, `ServiceModel`, `BorrowingHistory`, `TimeHorizon`, `NetWorth`, `CreditRating`, `Tier`, `ContactPreference`, `InvestmentExperience`). Per FSC unification, ~14 of these need biz-cohort values too.
6. **15 biz-only fields are person-NULL** (e.g. `Rating`, `Type`, `BillingStreet/City/State/PostalCode/Country` × 5, `ShippingStreet/City/State/PostalCode/Country` × 5). Per FSC unification, ~12 of these need person-cohort values (mostly addresses, mirrored from `PersonMailing*`).
7. **3 partial-biz fields are person-NULL** (`AccountSource`, `Phone`, `Website`). Both cohorts need work.

## 2. Goals

- **Bucket 1 (`ALL_NULL`)** — 11 fields populated to ≥99% on the HYDRATE cohort.
- **Bucket 2 (`PERSON_50_REGRESSION_BIZ_NULL`)** — 6 fields' missing 50 person rows recovered (target person 25,370 / 25,370 = 100%) AND business cohort populated to ≥95% where the field has business meaning.
- **Bucket 3 (`PERSON_COMPLETE_BIZ_NULL`)** — 14 of 20 fields populated on businesses to ≥95%; the other 6 (e.g. `EmployedSince`, `HomeOwnership`, person-only addresses, person demographics) leave biz cohort intentionally NULL.
- **Bucket 4 (`BIZ_COMPLETE_PERSON_NULL`)** — 12 of 15 fields populated on persons (Rating, Type, mirrored Billing/Shipping addresses); the other 3 (bureau scores, FEIN, AnnualRevenue, NumberOfEmployees) leave persons NULL by design.
- **Bucket 5 (`BIZ_PARTIAL_PERSON_NULL`)** — `AccountSource`, `Phone`, `Website` populated on both cohorts.
- **Bucket 6 (`PERSON_COMPLETE_BIZ_PARTIAL`)** — `FinServ__IndividualType__c` populated on the 5,610 missing pure-Business RT rows.
- **DC stream refresh** (`Account_Home`) re-runs once after CRM writes complete, propagating to `ssot__Account__dlm`.
- **Verification:** comprehensive cohort-aware audit re-run shows all 6 buckets resolved per the targets above.

## 3. Non-goals

- 80 unmapped DMO fields (no DLO mapping → require mapping creation, not backfill).
- 9 missing FSC FA fields not deployed in this org (`BankingType`, `OccupationCode__pc`, `AcquisitionDate`, `BusinessType`, `BankingPreference`, `OtherInformation`, `SourceofFunds`, `SourceofWealth`, `InvestorRiskProfile`).
- PII synthesis (SSN, TaxId).
- Legacy `FINS_Retail_*` schema.
- New DLO/DMO definitions; new mappings.
- Activations, Calculated Insights, Identity Resolution rulesets.

## 4. Architecture

Six sub-phases. Each one independently testable. They ship in one branch with separate commits and verification gates per sub-phase.

### 4.1 Sub-phase 5a — Branch backfill (2 fields × 36,044 rows)

Unchanged from v1.0. Pull from the existing `BranchUnit` SObject (26 rows). State-weighted assignment via `BillingState` (or `PersonMailingState` after 5d mirror runs first). Probe whether `BranchUnitCustomer` already links Accounts to BranchUnits — if yes, inherit canonical assignment.

### 4.2 Sub-phase 5b — Universal field backfill (~31 fields × 36,044 rows)

The biggest sub-phase. Covers all `ALL_NULL` Bucket 1 fields plus the cross-cohort parity gaps (Buckets 3, 4, 5, 6 where the gap is *real* per the per-field disposition table in the audit).

**By field group:**

| Group | Fields | Source / derivation |
|---|---|---|
| Multipicklists (Bucket 1) | `InvestmentObjectives`, `PersonalInterests`, `CustomerSegment`, `MarketingSegment`, `FinancialInterests` | Persona-coherent template grid in `config/multipicklist_templates.yaml`. Same shape as the v1.0 InvestmentObjectives proposal but expanded to all 5. |
| FSC `__pc` shadows (Bucket 1) | `FinServ_Category__pc`, `FinServ_Contact_Status__pc`, `FinServ__IndividualType__pc` | `FinServ_Category__pc` mirrors `FinServ__ClientCategory__c`. `FinServ_Contact_Status__pc` derived from `LastInteraction` recency (Active/Inactive/Dormant/At Risk). `FinServ__IndividualType__pc` mirrors `FinServ__IndividualType__c` (which is fully populated for persons). |
| Branch + PrimaryContact (Bucket 1) | `BranchCode`, `BranchName`, `PrimaryContact` | Covered by 5a + Bucket-1-aware merge. PrimaryContact: persons → PersonContactId; biz with ACR → ACR.ContactId; biz no ACR → synthesise. |
| Person→biz parity (Bucket 3) | `CountryOfBirth__pc` (biz: country of incorporation), `CountryOfResidence__pc` (biz: HQ country), `InvestmentExperience__c`, `RiskTolerance__c`, `ServiceModel__c`, `BorrowingHistory__c`, `TimeHorizon__c`, `NetWorth__c`, `CreditRating__c`, `Tier__c`, `ContactPreference__pc`, `EmployedSince__pc` *(skip biz)*, `HomeOwnership__pc` *(skip biz)*, `TaxBracket__pc` *(skip biz; same logic as employment)* | Per-field deriver. Some fields land entirely in 5b (one-shot biz fill); others (e.g. `Tier__c`) need persona-coherent biz mapping. |
| Biz→person parity (Bucket 4) | `Rating`, `Type` | Derived from persona (Wealth=Hot/Customer; Commercial=Hot/Customer; SMB=Warm/Prospect; Retail=Cold/Customer). |
| Standards both cohorts (Bucket 5) | `AccountSource`, `Phone`, `Website` | `AccountSource`: persona-coherent distribution (Web/Phone Inquiry/Referral/Branch). `Phone`: persons mirror PersonMobile (or HomePhone fallback); biz keep what they have, fill missing 5,064. `Website`: biz only (persons leave NULL); fill missing 5,064 biz with synthetic URL. |
| Bucket 6 | `FinServ__IndividualType__c` | Pure-Business RT (5,610 rows) populate with `Organization` or analogue. |

**Implementation pattern:** one deriver per logical field group. All registered in `customer_hydration/backfill/backfill_accounts.py` for Phase 5. Existing Phase 4 v1.1 infrastructure (writability preflight, picklist drift translator, value translator, numeric constraints, production guard) is reused unchanged.

**Multipicklist write semantics:** Salesforce's bulk API accepts multipicklist values as `;`-delimited strings. Translator builds them per-row from the persona template config.

### 4.3 Sub-phase 5c — Phase 4 50-row regression fix (6 fields × 50 rows)

Single batch: query the 50 missing person IDs via `SELECT Id, External_ID__c FROM Account WHERE IsPersonAccount = true AND External_ID__c LIKE 'HYDRATE-%' AND FinServ__MaritalStatus__pc = NULL`. Re-run all six derivers (`marital_status`, `current_employer`, `occupation`, `tax_bracket`, `annual_income`, `lifetime_value`) on just those 50 rows. If the same 50 IDs appear in all 6 missing lists, it confirms a single-batch failure. Otherwise it's transient errors.

**Coverage rule:** post-write, verify person populated count == 25,370 for all 6 fields.

### 4.4 Sub-phase 5d — Person Account address mirror (10 fields × 25,370 person rows)

Unchanged from v1.0. Copy `PersonMailing*` → `Billing*` and `Shipping*` for the 25,370 person rows. Pre-write probe to detect FSC auto-sync (5-row dry-update). Generator + augment-phase3 fixes for forward-runs.

### 4.5 Sub-phase 5e — DLO→DMO mapping repoint (3 mappings)

**Adjusted from v1.0** — `FinServ_Category__pc` mapping target field is now correctly identified (single-underscore name; field exists). The "GAP_FIELD_NONEXISTENT" classification was a typo. Three actions:

| Mapping action | DMO field | What changes | Why |
|---|---|---|---|
| **No-op** | `FinServ_Category_pc__c` | Mapping correct as-is; just needs the source CRM field populated by 5b. | Earlier audit got this wrong. |
| **No-op** | `FinServ_Contact_Status_pc__c` | Same — mapping correct, source backfilled in 5b. | Same. |
| **Drop** (or no-op) | `FinServ_ShippingAddress_pc__c` | Compound shadow; redundant once discrete `Shipping*` fields are populated by 5d's mirror. | Discrete fields cover the data. |

**Net 5e action:** verify the 2 "no-op" mappings produce values in the DMO after 5b runs (via DC SQL sample); decide on the 1 drop based on whether any LWC/segment reads the compound field.

### 4.6 Sub-phase 5f — DC stream refresh + comprehensive verification

Trigger `Account_Home` stream refresh; wait for completion. Re-run the comprehensive audit; diff against `comprehensive_audit.json` baseline. Acceptance: bucket counts reduce per the §2 goals.

## 5. Data flow

```
                        ┌──────────────────────────────────────────────┐
                        │  Phase 5 backfill_accounts runner            │
                        │  reuses Phase 4 v1.1 infrastructure          │
                        │  + adds N new derivers per sub-phase         │
                        └──────────────────────────┬───────────────────┘
                                                   │
        5a Branch ───┐                             │
        5b Universal ──┐                           │
        5c 50-row     ───┼─→ Bulk API 2.0 upsert  │
        5d PA mirror   ──┘                         │
                                                   ▼
                                       ┌────────────────────┐
                                       │  CRM Account rows  │
                                       └─────────┬──────────┘
                                                 │
         ╭───── 5e mapping verify (DC API sample) ─╯
         │
         ▼  (3 mappings; mostly no-op, possibly 1 drop)
   ┌──────────────────────────┐
   │  Account_Home stream     │ ← 5f.1 trigger refresh
   └─────────┬────────────────┘
             ▼
   ┌──────────────────────────┐
   │  ssot__Account__dlm      │ ← 5f.2 re-run comprehensive audit
   └──────────────────────────┘
```

## 6. Error handling + idempotency

Phase 4 v1.1's exit-code matrix unchanged. Per-deriver coverage rules: every Phase 5 deriver registers `<field>_assigned` or `<field>_populated` rules. Re-runs are no-ops via External_ID upsert.

**5c special-case:** `--phase 5c --rerun-failed-rows` flag scopes the deriver to a stored list of row IDs from `output/phase5/regression_50_ids.json`.

## 7. Testing strategy

| Layer | Test | Count |
|---|---|---:|
| Unit — multipicklist templates | persona × risk → expected values; deterministic-by-external-id | 8 |
| Unit — `__pc` shadow derivers | Category mirrors ClientCategory; Contact_Status from LastInteraction recency; IndividualType__pc mirrors __c | 6 |
| Unit — biz parity derivers (CountryOfBirth, RiskTolerance, ServiceModel, BorrowingHistory, etc.) | persona-coherent value selection; deterministic | 12 |
| Unit — person parity derivers (Rating, Type, AccountSource) | persona-coherent distribution; respects existing biz values (no overwrite) | 6 |
| Unit — branch + PrimaryContact (5a) | per v1.0; unchanged | 11 |
| Unit — PA mirror (5d) | per v1.0; unchanged | 5 |
| Unit — Phase 4 regression replay (5c) | takes a row-id list, re-runs the 6 derivers on just those rows, idempotent | 4 |
| Integration — runner orchestration | all 5b derivers run in correct order; coverage tracked | 4 |
| Integration — comprehensive audit re-run | 56 gap fields move to populated within their cohort targets | 3 |
| E2E — live | 5-row dry-update probes (PA sync, BranchUnitCustomer); stream refresh; mapping verify | 4 |
| **Total new tests** | | **63** |

Suite expected: 786 (Phase 4 v1.1 baseline) → 849 PASS + 5 SKIPPED.

## 8. Open questions (resolved before implementation)

1. **`BranchUnitCustomer` rows existing?** Probe at 5a.1.
2. **PA address auto-sync?** Probe at 5d.1.
3. **The 50 missing person rows — same IDs across all 6 fields?** Probe at 5c.1.
4. **`FinServ__CreditScore__c` DMO 70.4% vs CRM 100% mystery** — investigate at 5f.1 once stream re-runs. If discrepancy persists, file as a separate finding for a Phase 6 stream-debug effort.
5. **What's the org's `Industry` picklist vocabulary?** Persons are at 100% Industry — verify the values are reasonable for persons before treating as OK.
6. **`FinServ__CustomerSegment__c` and `FinServ__MarketingSegment__c` — are they used by any segments or LWCs today?** If yes, populate; if no, defer to Phase 6.

## 9. Verification (post-Phase 5)

Re-run the comprehensive audit and check the bucket-count diff:

| Bucket | Pre-Phase-5 | Target post-Phase-5 |
|---|---:|---:|
| OK_FULL | 8 | ≥48 |
| ALL_NULL | 11 | 0 |
| PERSON_COMPLETE_BIZ_NULL | 20 | ≤6 (only the genuinely-subtype-specific fields) |
| BIZ_COMPLETE_PERSON_NULL | 15 | ≤3 (only AnnualRevenue/NumberOfEmployees + bureau scores cohort) |
| PERSON_50_REGRESSION_BIZ_NULL | 6 | 0 |
| BIZ_PARTIAL_PERSON_NULL | 3 | 0 |
| PERSON_COMPLETE_BIZ_PARTIAL | 1 | 0 |

If post-Phase-5 still shows non-target counts, branch-execute remediation patches before merging.

## 10. Status

This is the design spec. Implementation plan ships at `docs/superpowers/plans/2026-05-27-phase-5-dmo-backfill.md`. Approval gate before implementation runs against `jdo-uqj0jr`.
