# FSC Master Demo Org Audit — Cumulus Financial Services

**Org alias:** `jdo-fw51xz`
**Org name:** Cumulus Financial Services
**Org ID:** `00Dam00000Uo32qEAB`
**Instance:** USA844 (Production, Enterprise Edition)
**Audit date:** 2026-05-09
**Auditor:** Claude (Opus 4.7) at user direction

---

## 1. Executive Summary

Cumulus is a curated, layered FSC demo org running the latest FSC v260 (Spring 2026) on top of OmniStudio, Data Cloud for FSC, and the FSC service-process accelerators for Wealth Management and Retail Banking. Person Account demographics, Goals, Life Events, Business Milestones, and balance distributions look authentic — name diversity, plausible cities, realistic balance bucketing across Deposits / Investments / Credit Cards.

The main authenticity problems are **structural, not content-level**:

1. **Date staleness** — every Event sits >90 days old; Interaction Summaries were all bulk-loaded by one user in one batch. There is no "today" engagement footprint.
2. **Parallel object models** — the org maintains both legacy `FinServ__FinancialAccount__c` (496) and standard `FinancialAccount` (429) with no bridging. Every dashboard sees only half the data.
3. **Person Account record-type fragmentation** — 54 Person Accounts split across 3 record types (`Person Accounts`, `FSC Person Accounts`, `Person Account`).
4. **Investment FAs missing positions** — 35/110 (32%) have zero holdings.
5. **Household coverage gap** — 7/54 Person Accounts (13%) belong to no household.
6. **Picklist contamination** — Goal `Type` mixes customer-facing values (Retirement, Education) with sales pipeline values (New Customer Acquisition, New Business Acquisition).
7. **Bloat** — 262 Obsolete flows, 7 Invalid Draft flows, 129 stale active users, ~80 managed packages many of which are unused.

**Recommendation:** A two-phase plan — **Phase A: Cleanup & Consolidation** (mechanical, low-risk), then **Phase B: Authenticity Enrichment** (re-date activity, fill holdings, generate transactions, populate ContactPoint family, prune users).

> **Decisions resolved 2026-05-11:** §6.1 D1 settles the FA model question — keep legacy `FinServ__FinancialAccount__c` as canonical for writes; **maintain standard `FinancialAccount` and selected dependents (`FinancialAccountRole`, `Card`, `CardAgreement`, `ResidentialLoanApplication`) in parity via a scheduled Apex batch** (the new Phase A8–A12 work); Data Cloud's `ssot__FinancialAccount__dlm` continues as the harmonized cross-source read layer. See §6 for the full dependency audit and the parity-batch architecture.

---

## 2. Org Snapshot

### 2.1 Edition & FSC Stack

| Item | Value |
|---|---|
| Edition | Enterprise |
| FSC version | `FinServ` v260.0.0.1 (Spring 2026) |
| FSC Wealth Service Processes | Spring '24 (v248) |
| FSC Retail Banking Service Processes | Winter '24 (v246) |
| OmniStudio | Spring 2026 (v260.10) |
| Data Cloud for FSC | Summer 2024 (v250) |
| Salesforce Standard Data Model (`ssot`) | v1.130 |
| Agent Creator | v2.13 |
| Service Agent Script | v1.5 |
| MuleSoft Composer, CPQ, Billing, Field Service, Pardot, Marketing Cloud Connect, Salesforce Maps, Slack | All installed |

### 2.2 Demo Tooling Detected

These confirm the org was provisioned via the demo factory toolchain:

- **XDO Automation** ("Demo Boost Tabs Renamed") — XDO seeds and re-skins demo experiences
- **qbranch (QLabs Utilities)** — internal Salesforce demo factory utilities
- **NXDO Data Tool** — bulk data import/management for demo orgs
- **NBA, Org Customizer, Demo Boost** — demo-specific accelerators
- **Pardot Engagement History Demo, FSL Spring 2025** — preconfigured demo packages

### 2.3 Apex / Flow Surface

| Asset | Active | Draft | Invalid Draft | Obsolete |
|---|---:|---:|---:|---:|
| Flows (all definitions) | 599 | 127 | **7** | **262** |
| Apex Triggers (admin namespace) | a few | — | — | — |
| Apex Classes | 45 namespaces represented; majority from managed packages | | | |

> The 7 Invalid Draft flows and 262 Obsolete flow versions are Phase A cleanup targets — Invalid Drafts can break automation visibility, Obsolete versions can be hard-deleted.

---

## 3. Data Inventory

### 3.1 Party / Client Graph

| Object | Count | Notes |
|---|---:|---|
| Account (total) | 171 | |
| Account — Person | 54 | Split across 3 record types ⚠️ |
| Account — B2B | 117 | |
| Account RT: `Account` | 67 | Generic — may be untyped legacy |
| Account RT: `Person Accounts` | 37 | Primary RT |
| Account RT: `Household` | 24 | |
| Account RT: `Entity` | 11 | |
| Account RT: `FSC Person Accounts` | 9 | **Duplicate Person Account RT** ⚠️ |
| Account RT: `Business` | 8 | |
| Account RT: `Person Account` | 8 | **Duplicate Person Account RT** ⚠️ |
| Account RT: `Partner` | 5 | |
| Account RT: (none) | 2 | Untyped |
| Contact | 358 | |
| AccountContactRelation | 373 | |
| Lead | 637 | |
| Opportunity | 852 | |
| Case | 797 | |

### 3.2 Financial Accounts & Holdings

| Object | Count | Notes |
|---|---:|---|
| `FinServ__FinancialAccount__c` (legacy custom) | 496 | Primary book |
| `FinancialAccount` (standard) | 429 | Parallel duplicate ⚠️ |
| `FinServ__FinancialAccountRole__c` (legacy) | 564 | Roles for legacy FAs |
| `FinancialAccountRole` (standard) | **Object not present** | Standard FAs are role-less ⚠️ |
| `FinServ__FinancialHolding__c` | 428 | |
| `FinancialAccountTransaction` (standard) | **0** | 🚨 No transactions for any FA |
| `FinServ__Securities__c` | 28 | Instrument master |
| `FinServ__AssetsAndLiabilities__c` | 229 | |

### 3.3 Goals, Events, Engagement

| Object | Count | Notes |
|---|---:|---|
| `FinServ__FinancialGoal__c` (legacy) | 277 | |
| `FinancialGoal` (standard) | 110 | Parallel duplicate ⚠️ |
| `FinServ__LifeEvent__c` | 139 | |
| `LifeEvent` (standard) | not present | |
| `BusinessMilestone` (standard) | 286 | Strong commercial signal |
| `Interaction` | 474 | |
| `InteractionSummary` | 1,065 | All by one user, single batch ⚠️ |
| `RecordAlert` | 10 | Light |
| `ActionPlan` / Templates | 11 / 16 | |
| `FinServ__Employment__c` | 48 | |
| `FinServ__Education__c` | 105 | |
| `FinServ__Revenue__c` | 256 | |
| `FinServ__ReciprocalRole__c` | 35 | |

### 3.4 Banking & Lending

| Object | Count | Notes |
|---|---:|---|
| `ResidentialLoanApplication` | 1 | 🚨 Banking story has near-zero data |
| `LoanApplicant` | 1 | |
| `Card` (standard) | not present | |
| `CardAgreement` | not present | |
| `FinServ__FinancialAccount__c` of type "Loans" | 101 | But avg balance $337M, max $9.7B |
| `FinServ__FinancialAccount__c` of type "Credit Cards" | 32 | avg $3,991 — realistic |

### 3.5 Insurance

| Object | Count |
|---|---:|
| `InsurancePolicy` | 0 |
| `Producer` | 0 |
| `ComplaintCase` | 0 |

> Insurance cluster is empty. Per scoping conversation, insurance is **out of focus** for this audit.

### 3.6 Activity & Content Surface

| Object | Count | Notes |
|---|---:|---|
| Task | 1,022 | |
| Event | 1,469 | All >90 days old, none >3 years 🚨 |
| EmailMessage | 12,917 | |
| ContentDocument | 1,399 | |
| User (active) | 140 | 129 stale (>12 months no login) ⚠️ |
| User (inactive) | 3 | |
| ContactPointAddress | 14 | Sparse |
| ContactPointEmail | **0** | 🚨 |
| ContactPointPhone | **0** | 🚨 |

### 3.7 FSC Plumbing

| Asset | Count |
|---|---:|
| `FinServ__RollupByLookupConfig__c` | 52 |
| `FinServ__RollupByLookupFilterCriteria__c` | 47 |

> RBL is configured. Worth verifying that household rollups still resolve given the Person Account / Household membership gaps in §4.1.

---

## 4. Findings & Severity

### 4.1 🚨 Critical — fix before next major demo

| # | Finding | Evidence | Impact |
|---|---|---|---|
| C1 | ~~**No fresh activity** — 0 Events in last 90 days~~ **Resolved 2026-05-11 by Phase B1.** `FscEngagementSeed` generated 1,200 records (500 Events + 300 Tasks + 200 Interactions + 200 InteractionSummary stubs) distributed across the rolling 90-day window (60 past + 30 future). Owners rotate across 7 personas (Bill / Cindy / Ely / Valerie / Vanessa Sales + Brenda + Steven Service) with near-perfect 71–72 records per persona. ~50% of records dated within the last 14 days. Companion `FscEngagementShifter` Schedulable wrapper rotates dates +30 days monthly to keep the rolling window fresh without record-count growth. | `SELECT COUNT() FROM Event WHERE ActivityDate > LAST_N_DAYS:90` → 0 | Any "this week's meetings" / "today's calendar" demo collapses. |
| C2 | ~~**All 1,065 Interaction Summaries created by a single user in one batch.**~~ **Resolved 2026-05-11 by Phase B1 + B5.** Per §6.1 D4, the historical 1,065 stay untouched (Salesforce doesn't allow `CreatedById` change on existing records); demos surface a "fresh activity layer" of 500 advisor-authored IS that dominate the recent-activity window. B1 created 200 stub IS; B5 enriched all 200 (AccountId via PA round-robin, MeetingNotes/NextSteps content, Status, InteractionPurpose, canonical Name "Summary: [Channel] - [Account]") and added 300 net-new IS + 300 parent Interactions. Owner distribution: 70-72 records per persona across 7 advisors (Bill / Cindy / Ely / Valerie / Vanessa / Brenda / Steven). InteractionPurpose distributes evenly across 10 categories (50 each). Demos that filter to recent activity see a richly authored, multi-advisor pattern; demos that load all 1,565 IS still show the historical bulk-load signature in CreatedBy stats. Org IS total: 1,065 → 1,565. | `GROUP BY CreatedById` → all under `005am000003PbCLAA0`. | "Reps capturing meeting notes over time" looks fake; the audit trail betrays bulk import. |
| C3 | ~~**0 Financial Account Transactions** despite 925 financial accounts.~~ **Resolved by reframing 2026-05-11.** The audit was looking at the wrong store. Transaction data is fully alive in **Data Cloud**, not on the standard CRM `FinancialAccountTransaction` object: `Financial_Transactions_AWSRedshift__dlm` has 2,188 banking/card transactions; `Transactions__dlm` has 578; `ssot__FinancialAccountTransaction__dlm` (the SSOT harmonized layer) has 17,890; `Financial_Trades__dlm` has 1,610,388 investment trades. Cumulus's widgets / LWCs read from DC via Named Credential (verified during Phase A repo audit). The standard CRM `FinancialAccountTransaction` object stays empty intentionally — generating CRM-side transactions would create a parallel store nobody reads (same anti-pattern D1 was created to avoid). | `SELECT COUNT() FROM FinancialAccountTransaction` → 0 | "Recent activity" / "transaction history" tabs are empty everywhere. |
| C4 | ~~**Parallel FA models with no bridging**~~ **Resolved 2026-05-11 by Phase A10.** Standard `FinancialAccount` now mirrors all 496 legacy rows (`IsParitySync__c = TRUE`, upserted by `LegacyId__c`). | Both objects populated; standard `FinancialAccountRole` not present. | Reports/widgets see ~50% of the book depending on which model they read. |
| C5 | ~~**35/110 (32%) Investment FAs have no Holdings.**~~ **Resolved 2026-05-11 by Phase B3.** `FscHoldingsBackfill` generated 362 holdings (8-12 per FA) across the 35 empty FAs, then a follow-up top-up pass added 70 more (1 Cash + 1 Alt per FA) to ensure all 4 asset classes are represented. Final seeded: 285 Equities / 77 Fixed Income / 35 Cash Equivalents / 35 Alternative Investments = 432 holdings. Each holding has coherent Shares × Price = MarketValue and PurchasePrice / GainLoss / PercentChange math; ~61% gains / 39% losses. Owner + Household flow through from parent FA. Org-wide holding count: 428 → 860. | `WHERE Id NOT IN (SELECT FA FROM Holdings)` → 35 | One-third of investment-account drilldowns will show empty position lists. |
| C6 | ~~**ContactPointEmail / ContactPointPhone are empty (0 records).**~~ **Resolved 2026-05-11 by Phase B6.** `FscContactPointSeed` generated 357 ContactPointEmail + 357 ContactPointPhone records (54 from Person Accounts via PersonEmail/PersonMobilePhone with UsageType=Home; 303 from B2B Contacts via Email/MobilePhone/Phone with UsageType=Work). Discovered during deploy that this org's `ContactPointEmail.ParentId` only accepts `Account` or `Individual` — not `Contact`. Updated B2B path to parent the channel records to the Contact's `AccountId` instead. PA records have `IsPrimary=true PreferenceRank=1`; B2B records have `IsPrimary=false PreferenceRank=2` so the multi-channel-per-account shape ranks naturally. | Direct counts. | Data Cloud / Marketing Cloud unified-profile demos cannot resolve any email/phone — kills the cross-channel story. |
| C7 | ⚠️ **Person Account record-type fragmentation** — 54 person records spread across `Person Accounts` (37), `FSC Person Accounts` (9), `Person Account` (8). **Mitigated 2026-05-11 by investigation:** all 3 RTs use the same page layout, same field set, same automation. The "fragmentation" is cosmetic in this org — programmatic access (widgets, SOQL, dashboards) is RT-agnostic. **Consolidation deferred** per A3: FSC AccountTrigger blocks programmatic RT changes. | `GROUP BY RecordType.Name`. | ~~Page layouts behave inconsistently per record type.~~ Confirmed identical across all 3 RTs. List views are still split by RT name. |
| C8 | ~~**Card-store fragmentation across 4 stores**~~ **Resolved 2026-05-11 by Phase A10 Step 2.** All 185 `FinServ__Card__c` rows now have a corresponding `IssuedCard` mirror with `FinancialAccountId` resolved via the standard FA `LegacyId__c` lookup. Legacy/standard cards now in lockstep. | Tooling: `EntityDefinition` + counts on each. | Demos surfacing card data through any single store see only a fraction of the truth. |
| C9 | **FA → Household lookup unset on 90% of FAs; programmatic write blocked by FSC trigger** (added 2026-05-12 by Phase B7 verification). Only 48 of 496 `FinServ__FinancialAccount__c` records have `FinServ__Household__c` populated. Result: RBL household rollups (TotalAUM, TotalBankDeposits, TotalInvestments, TotalLiabilities, etc.) read $0 on most households even when the customer is clearly an ACR member of one. Sampled 5 households post-Phase-A: only 1 of 5 (Morris) had populated rollups; Bennett had partial; Smith / Brooks / Garcia all $0 despite Mark Smith having $2.3M across 5 FAs. **`FscHouseholdLookupBackfill` deployed but blocked at runtime** — `Database.update` reports 209 successes but writes don't persist (suspected FSC managed-package `FinServ__FinancialAccount__c` trigger silently rolling back household-lookup changes). Apex/Test/permset entries remain deployed for a future unblocking pass. | Compare household member FA balances vs `FinServ__TotalAUMPrimaryOwner__c`. | Every household-360 demo shows zeroes for 90% of households; full household net-worth story collapses. **Resolution path:** investigate FSC `FinServ` namespace methods that set household lookup (HouseholdServices, RollupByLookup APIs), or set `Account.FinServ__Household__c` on the Person Account first and let auto-population fire on FA save. Alternatively, do the link via the UI's "Update Household" action which uses the trigger's blessed path. |

### 4.2 ⚠️ High — meaningful authenticity & quality gaps

| # | Finding | Evidence | Impact |
|---|---|---|---|
| H1 | ~~**7/54 (13%) Person Accounts are not in any Household.**~~ **Resolved 2026-05-11 by Phase B4.** Created 7 new Household Accounts (Brooks, Chen, Garcia, Nakamura, Patel, Rodriguez, Venkatesh) and 7 ACR records linking each PA's PersonContactId with role `Client`. Investigation surfaced that "Unknown Customer" was actually an in-use demo persona (4 FAs / 17 Events / 3 Cases / 10 InteractionSummaries referenced it); renamed to "Alex Garcia" before placing in a household. Org-wide household count: 24 → 31. | Anti-join on ACR → 7. | RBL household rollups under-count; "household 360" demos cherry-pick. |
| H2 | ~~**Parallel Goals models** — 277 legacy + 110 standard.~~ **Resolved 2026-05-11 by Phase A10 Step 4.** All 277 legacy goals now mirrored to standard `FinancialGoal`. | Both populated. | Same fragmentation as FA: half the goals invisible per model. |
| H3 | ~~**Goal `Type` picklist is contaminated**~~ **Fully resolved 2026-05-11.** Standard side cleaned by A10 Step 4 translation map. Legacy side cleaned by A6c heuristic reclassification: 175 records (Investment / New Services / New Customer Acquisition / New Business Acquisition / Large Purchase) bucketed into customer-goal types via Name + Description keyword matching. Legacy `FinServ__Type__c` distribution now: 213 Other / 22 Retirement / 20 Home Purchase / 12 Vacation / 5 Education / 2 Vehicle / 1 Estate Planning / 1 Wedding/Honeymoon / 1 Real Estate Investment. | `GROUP BY FinServ__Type__c`. | Goal-based reports and prompts return nonsense rows. |
| H4 | ~~**Industry picklist split**~~ **Resolved 2026-05-11 by A6b.** All Healthcare records (now 25) consolidated under `Healthcare & Life Sciences`. | `GROUP BY Industry`. | Industry-based segmentation undercounts. |
| H5 | ~~**Status picklist hygiene**~~ **Resolved 2026-05-11 by A6a.** 4 outlier records (1 `Whitespace` + 3 `Active`) normalized to `Open`. The 11 nulls remain (separate finding for future cleanup). | `GROUP BY FinServ__Status__c`. | Picklist looks unprofessional in a status filter. |
| H6 | **Person Account Status is 19% null** (10/54), and only 2 are "Dormant" / 0 are "Inactive". | `GROUP BY FinServ__Status__c`. | No data to demo lifecycle / churn segmentation. |
| H7 | ~~**Loans average $337M, max $9.7B on `FinServ__FinancialAccount__c`.**~~ **Resolved 2026-05-11 by Phase A13.** Pre: 101 records, total $34.1B, avg $337.6M, **max $9.71B**. Post: 101 records, total $251M, avg $2.49M, **max $46.99M** (under $50M cap). Distribution: 71 Retail Mortgage / 25 Small Business / 5 Mid-Market Commercial. Audit trail in `RebalanceLog__c`. Run `707am00002rPi5T`. | Aggregate stats. | Either commercial-banking data is conflated with retail wealth, or values were mis-imported. Distorts every household total chart. |
| H8 | ~~**51/54 Person Accounts have null `PersonHomePhone`.**~~ **Resolved 2026-05-12 by Phase B9.** Copied PersonMobilePhone → PersonHomePhone on all 51 nulls (realistic since most modern customers have only one phone). All 54 PAs now have both fields populated; PA record pages render Home Phone field. PersonHomePhone tested first to confirm no FSC trigger rollback (the C9 issue affecting `FinServ__Household__c` doesn't extend to PersonHomePhone). | Direct count. | Phone column on customer cards is mostly empty. |
| H9 | **`InteractionSummary` and `Interaction` record types not profiled** — likely all share one type/source pattern. | (Schema check pending.) | "Multi-channel" interaction story may be single-channel. |
| H11 | **Stale Flow Orchestrator backlog** (added 2026-05-11). 36 `FlowOrchestrationInstance` records in `InProgress` status since 2024-07-16, all created in a single batch at 10:27 AM. Each holds a paused `FlowInterview` open, which in turn blocks the deletion of 11 obsolete flow versions during A4 cleanup. Likely a demo-factory toolchain kicked off 49 orchestrations and 36 of them paused awaiting a step that never resolves. | `SELECT Status, COUNT(Id) FROM FlowOrchestrationInstance GROUP BY Status` → 36 InProgress, 13 Completed. | Old orchestrations clog the Setup → Process Automation UI; their child interviews block flow-version cleanup. | **Resolution path:** cancel the 36 orchestrations (`Status='Canceled'`), then delete the 36 child FlowInterviews, then delete the remaining 11 obsolete flow versions. ~7 minutes. Deferred from A4 to a future hygiene pass; A4 closed at 96% (251/262 obsolete versions deleted). |
| H12 | ✅ **Closed by acceptance 2026-05-12.** Re-checked: GCP DMO still unreachable (now an unexpected error 20 instead of the prior 400; federated source still down). Confirmed that no Cumulus demo arc currently joins or unions on `GCP_Transactions__dlm` — all live transaction stories read from `Financial_Transactions_AWSRedshift__dlm`, `ssot__FinancialAccountTransaction__dlm`, or `Financial_Trades__dlm`. Blast radius effectively zero. Removing the DLO/DMO without source-system context risks losing metadata that a future GCP-source repair would need; leaving in place is cheaper and safer. **Reopen if:** a demo arc requires GCP-sourced transactions (then either repair the connector at Setup → Data Cloud Connectors, or remove the DLO/DMO if GCP is permanently retired). |

### 4.3 🧹 Medium — bloat to remove

| # | Finding | Evidence | Action |
|---|---|---|---|
| B1 | **262 Obsolete flow versions + 7 Invalid Draft flows.** | `Flow` tooling query. | Hard-delete obsolete versions; fix or delete invalid drafts. |
| B2 | ⚠️ **129/140 active users haven't logged in in 12+ months.** **Deferred 2026-05-11** per A5 — user direction was to preserve all accounts (demo personas + packaged-product dependencies). Finding remains open for a future hygiene pass. | `WHERE LastLoginDate < LAST_N_MONTHS:12`. | Audit & deactivate; many `ESW_*` profiles are orphan Embedded Service service users from old deployments. |
| B3 | **30/171 accounts have no LastActivityDate or no activity in 2+ years.** | Direct count. | Candidates for deletion or re-dating. |
| B4 | **100 managed packages installed** (audit said ~80; actual count 2026-05-11 is 100). Inventory + categorization complete in [`audits/cumulus-package-inventory.md`](cumulus-package-inventory.md). ~13 high-confidence uninstall candidates identified (SalesforceIQ × 2, Quip × 2, B2B LE × 5, EngageReports, MarketingCloudConnectedApp, MarketingExternalAction, PardotEngagementHistoryDemo). Uninstalls deferred to a future hygiene pass; per-package dependency check required for the 21 UTILITY and 29 UNCLASSIFIED packages. | `sf package installed list`. | Inventory each, confirm not referenced by any active demo flow, uninstall in waves. |
| B5 | **Multiple Person Account record types and the redundant `FSC Person Accounts` / `Person Account` (singular) RTs.** | `GROUP BY RecordType.Name`. | Pick one canonical Person Account RT, migrate the other 17 records, delete spare RTs. |
| B6 | ~~**Empty FSC objects:** `PartyProfile` (0), `FinServ__BusinessMilestone__c` (not present), `Producer` (0), `InsurancePolicy` (0), `ComplaintCase` (0), `FinancialAccountTransaction` (0).~~ **Mostly resolved 2026-05-12.** Insurance trio: `Producer` 0→2 + `InsurancePolicy` 0→8 (Phase B12). `FinancialAccountTransaction` reframed to live in Data Cloud (Phase B2). `ComplaintCase` deferred (3-record-chain disproportionate for 1-2 records; tracked as B12 sub-deferral). `PartyProfile` left as-is. | Counts above. | Phase B12 insurance seed closes the most-impactful empty objects in this finding. |

### 4.4 ✅ What's already working well

- **Person Account name & demographic diversity is excellent** — first names like Nigel, Heath, Duncan, Kari, Niki, Gabe; varied US cities; plausible birth-year distribution.
- **0 obvious test/dummy/sample names** in Account.
- **Goal categories (Retirement, Education, Home Purchase, Estate Planning)** and **Life Events (New Job, New Home, New Baby, College, Retirement)** look authentic.
- **Business Milestones** (286 records: New Funding, M&A, Executive Change, Award, Product Launch) are demo-ready for commercial banking.
- **B2B Industry distribution** is realistic across Healthcare, Manufacturing, Communications, Retail, Insurance, Banking.
- **Person Account → Email completeness is 100%, Mailing State is 100%.**
- **Customer segmentation tier (`FinServ__ClientCategory__c`) populated with Bronze/Silver/Gold/Platinum** — strong demo material; only 11 nulls.
- **52 RBL configs** indicate the household-rollup engine is wired up.

---

## 5. Recommendations (Prioritized Plan)

### Phase A — Cleanup & Consolidation (low-risk, mechanical)

**Goal:** make the org structurally honest before adding more data.

| Step | Action | Risk | Effort |
|---|---|---|---|
| A1 | Canonical FA model per §6.1 D1: **legacy `FinServ__FinancialAccount__c`** is canonical for writes; standard `FinancialAccount` + dependents (`FinancialAccountRole`, `Card`, `CardAgreement`, `ResidentialLoanApplication`) are maintained in parity by scheduled Apex batch. Data Cloud's `ssot__FinancialAccount__dlm` remains the harmonized cross-source read layer. See Phase A8–A12 for the parity infrastructure work. | Med | M |
| ~~A8~~ | ~~Enable `FinancialAccountRole` in Setup~~ — **dropped 2026-05-11**: standard `FinancialAccountRole` does not exist in this org. Legacy stays canonical with no mirror. | — | — |
| A9 | ✅ **Done 2026-05-11** — `LegacyId__c` (External Id, Unique) + `IsParitySync__c` (Checkbox) added on all 5 standard parity targets via `FSC_Audit_Utilities`. | Low | S |
| A10 | ✅ **Done 2026-05-11** — `FscParityBatch` Queueable chain shipped. Live run wrote 1,175 mirror rows: 496 FA + 185 IssuedCard + 78 RLA + 277 FinancialGoal + 139 PersonLifeEvent. Closes §4.1 C4, C8, §4.2 H2 (and partially H3). Translation maps for FinancialGoal.Type/Status handle restricted-picklist contamination. | Med | L |
| A11 | ✅ **Done 2026-05-11** — `FscParityScheduler` Schedulable class shipped. Activate with `System.schedule('FscParityHourly', '0 0 * * * ?', new FscParityScheduler())`. | Low | S |
| A12 | ✅ **Done 2026-05-11** — `FscParityBatchTest` 5/5 tests passing (Step enum coverage, dispatch logic, runOnDemand, explicit-step enqueue). Production data paths verified by direct execution against jdo-fw51xz, not by unit test (FSC managed-package limitations). | Low | M |
| A13 | ✅ **Done 2026-05-11** — Loan FA rebalance per §6.1 D3. Deployed via `FSC_Audit_Utilities/`. Run `707am00002rPi5T` rebalanced 101/101 records into 71/25/5 (retail/SMB/mid-market). Max balance now $46.99M (was $9.71B). H7 resolved. | Low | S |
| ~~A2~~ | ~~Same decision for `FinancialGoal`~~ — **Resolved 2026-05-11 by §6.1 D1 / Phase A10 Step 4.** Legacy `FinServ__FinancialGoal__c` (277 rows) stays canonical; mirror to standard `FinancialGoal` is part of the parity batch. The "until migration" caveat is now structural (D1's exit criterion at §C: re-run the DC mapping check; if standard FA ever gets DC mapping, parity direction is re-evaluated). | — | — |
| A3 | ⚠️ **Deferred 2026-05-11 — blocked by FSC AccountTrigger.** Investigation: all 3 Person Account RTs (`SDO_PersonAccounts` 37, `FSC_Person_Accounts` 9, `PersonAccount` 8) **use the same page layout (`00ham0000050HysAAE`)** across all profile assignments — no field-shape difference, no demo-data risk to migration. However, the FSC managed-package `AccountTrigger` enforces a generic *"This record type can't be changed"* error on any RT update, blocking both Apex and Bulk API paths. The 2 inactive validation rules (`NotAllowingConversionToIndividual` / `NotAllowingConversionFromIndividual`) have similar messages but the actual error came from the trigger. **Workaround:** per-record UI "Change Record Type" action (17 manual clicks) bypasses trigger context. **Demo impact assessment:** zero — same layout, same fields, same widgets read same data by API name. Cosmetic only (RT name in admin Setup picker). | Medium | M |
| A4 | ✅ **Done 2026-05-12.** Part 1: 251/262 obsolete flow versions deleted (5 are managed-package, can't be deleted; 11 are blocked by paused FlowInterviews held by 36 stuck orchestrations — see §4.2 H11). Part 2 closed by acceptance: confirmed all 7 Invalid Drafts are personal Data Cloud / prompt-flow experiments authored by Jose Sifontes (`DC_10QSnowflake`, `DC_Set_Unified_Record` ×2, `DC Consolidated Cases`, `DC_MarketNews`, `JEL - Testing System Context`, `DC_CustomerProfile_Widget`, dates 2024-08 → 2026-04). All InvalidDraft (cannot execute, blocking nothing). No cleanup value vs effort. **Reopen if:** any of the 7 transitions to Active/Draft and starts doing real work, or if a future Setup-UI hygiene pass wants a zero-Invalid-Draft baseline. | Low | S |
| A5 | ⚠️ **Deferred 2026-05-11 — keep all users.** Investigation confirmed 129 stale active users (matches audit). Of those, 21 fell into "safe" orphan buckets (5 Acme Community Plus, 6 SDO Community Plus, 4 ESW guest, 3 integration users, 1 Customer Community User, plus 2 demo personas Julie Morris / Lauren Bailey). Deferred per user direction — no deactivations performed. Demo personas, ESW guest users tied to active chat deployments, and packaged-product integration users carry latent dependency risk that outweighs the cleanup benefit on a demo org. | Low | S |
| A6 | ✅ **Done 2026-05-11** — All three sub-fixes shipped: (a) 4 FA Status outliers (`Whitespace` + 3 `Active`) normalized to `Open`. (b) 3 `Healthcare` Account records merged into `Healthcare & Life Sciences` (now 25 total). (c) 175 contaminated legacy Goal records reclassified via Name/Description heuristic — distribution: 148 Other + 12 Vacation + 11 Home Purchase + 2 Vehicle + 2 Education. Standard `FinancialGoal` re-mirrored via FscParityBatch Step 4 with extended `GOAL_TYPE_MAP` (added Vacation, Vehicle direct-pass values). Closes §4.2 H4, H5; finishes §4.2 H3 on legacy side. | Low | S |
| A7 | ✅ **Inventory done 2026-05-11; uninstalls deferred.** All 100 installed packages categorized in [`audits/cumulus-package-inventory.md`](cumulus-package-inventory.md). Breakdown: 30 CORE (keep), 7 DEMO_FACTORY (keep), 4 SUNSET + 6 OLD_DEMO + 3 MKTG_LEGACY (high-confidence uninstall candidates, ~13 packages), 21 UTILITY (per-package review needed), 29 UNCLASSIFIED (research needed). No packages uninstalled today — uninstall action sequenced in the inventory doc for a future hygiene pass. The audit's original "~80" was actually 100. | Medium | L |

### Phase B — Authenticity Enrichment

**Goal:** make the data *feel* like a real customer base running today.

| Step | Action | Risk | Effort |
|---|---|---|---|
| B1 | ✅ **Done 2026-05-11** — Replaced "shift" with "generate-once + monthly-shift" hybrid per user direction. `FscEngagementSeed` created 1,200 records (500 Events + 300 Tasks + 200 Interactions + 200 InteractionSummary stubs) with ~50% in last 14 days. Owners rotate 7-way across Sales+Service personas. `FscEngagementShifter` Schedulable shifts +30 days monthly. `Activity.IsSeededEngagement__c` (parent for Event/Task) + `Interaction.IsSeededEngagement__c` + `InteractionSummary.IsSeededEngagement__c` mark generated records. Activate scheduler with `System.schedule('FscEngagementShiftMonthly', '0 0 4 1 * ?', new FscEngagementShifter())`. Closes §4.1 C1. | Low | M |
| B2 | ✅ **Closed by reframing 2026-05-11.** Investigation surfaced that Cumulus's transaction story lives entirely in Data Cloud, not on the standard CRM `FinancialAccountTransaction` object. DC inventory: `Financial_Transactions_AWSRedshift__dlm` 2,188 records; `Transactions__dlm` 578; `ssot__FinancialAccountTransaction__dlm` 17,890; `Financial_Trades__dlm` 1,610,388. CRM-side generation would create a parallel store nobody reads (anti-pattern per §6.1 D1). Closes §4.1 C3. New finding §4.2 H12 raised: `GCP_Transactions__dlm` federated source is unreachable. | Low | L |
| B3 | ✅ **Done 2026-05-11** — `FscHoldingsBackfill` + cash/alt top-up filled all 35 empty Investment FAs with 12-13 holdings each (432 total). 28-security catalog had enough variety; no extension needed. Final allocation 66% Equities / 18% Fixed Income / 8% Cash / 8% Alt. ~61% gains / 39% losses. Closes §4.1 C5. | Low | M |
| B4 | ✅ **Done 2026-05-11** — Created 7 solo Household Accounts + 7 ACR linkages (Roles=`Client`) for the previously-unhoused PAs: Brooks, Chen, Garcia, Nakamura, Patel, Rodriguez, Venkatesh. The 7th was originally "Unknown Customer" — investigation showed 4 FAs / 17 Events / 3 Cases / 10 InteractionSummaries actively referenced it, so renamed to "Alex Garcia" rather than skip. Closes §4.2 H1. Resolver-by-Id-prefix avoids dual-RT trap (org has 2 Household RTs; only `012am000001mrZpAAI` is user-accessible). | Low | S |
| B5 | ✅ **Done 2026-05-11** (per §6.1 D4 rewrite — generate net-new rather than re-author existing). `FscIsEnrichAndExpand` enriched B1's 200 stubs (AccountId via 54 Person Account round-robin + MeetingNotes + NextSteps + Status + InteractionPurpose + canonical "Summary: [Channel] - [Account]" naming) and added 300 net-new IS + 300 parent Interactions. Owner rotation 7-way (70-72 records per persona); InteractionPurpose evenly across 10 categories (50 each). Used AccountId IS NULL as idempotency gate after discovering MeetingNotes (LongTextArea) can't be filtered. Total seeded IS now 500; org IS total 1,065 → 1,565. Closes §4.1 C2. | Medium | M |
| B6 | ✅ **Done 2026-05-11** — `FscContactPointSeed` generated 357 ContactPointEmail + 357 ContactPointPhone records. PA half (54+54) parented to Account directly; B2B half (303+303) parented to Contact's AccountId because this org's `ContactPointEmail.ParentId` only accepts `Account`/`Individual` (Contact rejected as parent type). Multiple ContactPoints per B2B Account is the correct FSC shape. Closes §4.1 C6. | Low | M |
| B7 | ✅ **Verification done 2026-05-12; rollup fix deferred.** Inventoried the 52 RBL configs (30 active) — all target Account-side household rollup fields (`FinServ__TotalAUMPrimaryOwner__c` and siblings; the configs name them without the FinServ namespace because the package resolves them at runtime). Sampled 5 households (Smith, Morris, Bennett, Brooks, Garcia). Only 1 of 5 (Morris) had populated rollups; Mark Smith's $2.3M across 5 FAs rolled up as $0. Root cause: only 48/496 FAs have `FinServ__Household__c` set. Built `FscHouseholdLookupBackfill` Apex utility to backfill via PrimaryOwner→ACR walk. Deployed and ran successfully (209 OK, 0 errors) BUT writes don't persist — suspect FSC managed-package trigger rolling back household lookup changes silently. Captured as new finding §4.1 C9; B7 closes with verification result documented. | Low | S |
| B8 | ✅ **Closed by reframing 2026-05-12.** Investigation found the audit's concern (commercial loans mis-attributed to Person Accounts) doesn't exist in this org. All 30 commercial-tier loans (5 Mid-Market + 25 Small Business per A13's RebalanceLog tiers) are already owned by B2B Accounts (Plasmosis Inc, Levin Insurance Agency, San Francisco School Board, etc.). Retail mortgages (71 records) are on Person Accounts. The $9.7B max balance was a B2B-owned loan all along; A13 fixed the dollar amount, not the routing. **No re-routing needed.** | Medium | M |
| B9 | ✅ **Done 2026-05-12** — Copied PersonMobilePhone → PersonHomePhone on all 51 nulls via anonymous Apex. Tested 1-record write first (Larry Baxter) to confirm no FSC trigger rollback. Bulk run: 50 ok / 0 failed. All 54 PAs now have both phone fields populated. Closes §4.2 H8. (B6's ContactPointPhone coverage handled the Data Cloud cross-channel story; B9 closes the PA-record-page display gap.) | Low | S |
| B10 | ✅ **Closed by reframing 2026-05-12.** Both asks satisfied by Phase A items that ran earlier: (a) **78 ResidentialLoanApplication records** synthesized by A10 Step 3 from retail-tier loan FAs (audit asked for 5–10 — exceeded by 8x); (b) **`Card` / `CardAgreement` standard objects don't exist in this org's schema** per Phase A investigation, but `IssuedCard` (185 records, mirrored from `FinServ__Card__c` by A10 Step 2) is the analogous standard banking-card object. No additional work needed. | Medium | M |
| B12 | ✅ **Done 2026-05-12** — `FscInsuranceSeed` created 2 Producers (Linda Carter Captive Agent + Premier Insurance Brokers Partner Agent) + 8 InsurancePolicies linked to Gold/Platinum-tier Person Accounts. Mix: 3 Auto + 2 Home + 1 Life + 1 General Liability (Lapsed) + 1 Disability. Premium amounts $450–$3,000 (realistic ranges). 7 In Force, 1 Lapsed (for re-engagement demos). ComplaintCase deferred — the 3-record chain (Case + PublicComplaint + ComplaintCase) for 1-2 records is disproportionate; tracked as B12 sub-item. Closes §6.1 D2 commitment + insurance-trio portion of §4.3 B6. | Medium | M |
| B11 | ℹ️ **Informational — architectural rule (not an executable item).** Per §6.1 D1: any new component that needs FA data in a packaged-friendly shape should prefer **SOQL on standard `FinancialAccount`** for CRM-local single-source needs (no callout, fast), or **Named Credential callout to `ssot__FinancialAccount__dlm`** for cross-source / harmonized needs. Both paths are supported by Phase A's parity batch + Data Cloud mappings. Documented in `FSC_Audit_Utilities/CLAUDE.md` for future LLM sessions. | — | — |
| B13 | ✅ **Done 2026-05-12 (forward-create only; source preserved).** `FscGoalMigrate` classified all 213 `FinServ__FinancialGoal__c` records with `Type='Other'` and forward-created records on architecturally-correct targets without modifying the source goals. Result: **56 ActionPlans** (advisor goals → standard `FinancialGoal` mirror via `LegacyId__c`; commercial-PA goals → `Account`) + **94 BusinessMilestones** (commercial B2B-account goals) + **34 Opportunities** (sales-pipeline goals) = 184 migrated; 29 stayed as true-Other (no keyword match or owner missing). Discoveries during execution: (1) ATV templates have a `TargetEntityType` whitelist — "Financial Goal Funding & Execution" requires standard `FinancialGoal`, "Commercial - Annual Client Plan" requires `Account`; legacy `FinServ__FinancialGoal__c` is rejected. (2) `BusinessMilestone.MilestoneDescription` is the field name (not `EventDescription`). (3) ActionPlan inserts materialize the full template hierarchy and are CPU-heavy under sync Apex limits — utility now chunks ActionPlan inserts at 10/batch and bails at 85% CPU floor, idempotent re-runs resume via `OriginalLegacyGoalId__c` external-id-unique. Idempotency markers + traceback Ids on all 3 targets (`IsSeededMigration__c` + `OriginalLegacyGoalId__c`). Closes §4 finding: non-consumer goals routed to correct architectural homes. | Medium | L |

### Phase C — Ongoing hygiene (after A & B)

- **Run this audit monthly** (per §6.1 D5) — first refresh 2026-06-10, then on or near the 10th of each month. Off-cycle re-audits triggered by FSC upgrades, data reseeds, or imminent major demos. Today's `audits/fsc-master-org-audit.md` is the baseline.
- Each monthly refresh: re-run §8 SOQL fingerprints, re-run `mcp__datacloud__list_dlo_dmo_mappings(sourceObjectName='FinancialAccount')` to verify D1 still holds, verify the parity batch's last 24-hour success rate.
- Add a "demo health" dashboard in the org — record-type counts, picklist null rates, staleness markers — refreshed by a scheduled flow.
- Document the canonical-model decisions (A1, A2, A3) in CLAUDE.md / AGENTS.md so future contributors don't re-introduce parallel objects.

---

## 6. Decisions & Risks

### 6.1 Decision Log

#### D1 — FA Model: Legacy canonical for writes; standard CRM model maintained in parity via scheduled Apex batch

**Decided:** 2026-05-10 (initial); **Revised:** 2026-05-11 (parity scope expanded)
**Status:** Resolved (was Open Question Q1)
**Decision:** Treat legacy `FinServ__FinancialAccount__c` as the canonical operational store on the CRM side — all existing controllers, LWCs, and Data Cloud DLO mappings continue writing to and reading from it. **In addition, build infrastructure that keeps standard `FinancialAccount` and selected dependent objects in lockstep with legacy** via a scheduled Apex batch. Standard objects act as a **maintained read shape** for any consumer (packaged components, future FSC accelerators, AI agents) that assumes the standard model. Data Cloud's `ssot__FinancialAccount__dlm` DMO continues to function as the unified, harmonized read layer for cross-source consumers (Person Profile widget today, anything new tomorrow).

**Why this — not "migrate fully", not "suppress standard as orphan":**

A repo + Data Cloud dependency audit (2026-05-10) showed an asymmetry: every existing reader in this repo points at legacy or at Data Cloud, and standard `FinancialAccount` has zero readers and zero DC mappings. Two architecturally clean responses to that finding existed:

1. **Suppress standard as orphan** — hide it from the UI, accept that it's dead data. Lowest cost; loses forward-compat with anything that ever tries to read standard FA.
2. **Maintain parity** — keep legacy canonical for *writes*, and treat standard FA + selected dependents as a *maintained mirror* fed by a scheduled job. Higher cost; preserves forward-compat with packaged components, FSC accelerators, and AI / agent surfaces that assume the standard data model.

This audit picks (2). The reasoning is that Cumulus is a demo org, and the cost of *future* component breakage when a new accelerator or agent hits standard FA and finds 429 stale records is higher than the cost of running a nightly batch.

**Core repo dependencies (this monorepo's `force-app`):**

| Component | Reads | Pattern | DML to FA? |
|---|---|---|---|
| `Financial_KPI_Widget/FinancialOverviewController.cls` | Legacy `FinServ__FinancialAccount__c` | 3 direct SOQL aggregates | No |
| `DC_BusinessProfileWidget/BusinessProfileWidgetController.cls` | Legacy `FinServ__FinancialAccount__c` | Dynamic describe-then-SOQL (graceful if absent) | No |
| `DC_PersonProfileWidget/CustomerProfileWidgetController.cls` | **Data Cloud HTTP API** via `callout:DataCloud` (Named Credential) | Consumes `financialAccounts` JSON returned by Data Cloud | No |
| Standard `FinancialAccount` references | None (0 occurrences across all .cls/.js/.html/.xml) | — | — |

> **Implication:** Every line of code that mentions FA today points at legacy or at a Data Cloud Named Credential. Zero code points at standard `FinancialAccount`. Migrating would mean rewriting every controller. Zero DML, zero triggers, zero flows write to FA — there is **nothing to fight a one-way sync**, but also nothing requiring one.

**Data Cloud dependencies (`mcp__datacloud__list_dlo_dmo_mappings`):**

| DMO | Mapping source(s) | Status |
|---|---|---|
| `ssot__FinancialAccount__dlm` | (a) `FinServ_FinancialAccount_c_Home__dll` (from legacy `FinServ__FinancialAccount__c`), (b) `Deposits_Latest__dll` (banking-core snapshot DLO with native `account_number__c`, `current_balance__c`, `customerid__c`) | Both ACTIVE |
| `ssot__DepositAccount__dlm` | `FinServ__FinancialAccount__c` (`Id` → `ssot__FinancialAccountID__c`) | Active |
| `ssot__LoanAccount__dlm` | `FinServ__FinancialAccount__c` (loan-specific fields) | Active |
| `ssot__InvestmentAccount__dlm` | `FinServ__FinancialAccount__c` (model portfolio, APY, time horizon) | Active |
| `ssot__CardAccount__dlm` | `FinServ__FinancialAccount__c` | Active |
| `ssot__InsurancePolicy__dlm` | `FinServ__FinancialAccount__c` (renewal date, premium) | Active |
| `ssot__FinancialAccountFee__dlm` | `FinServ__FinancialAccount__c` | Active |
| `ssot__FinancialAccountInterestRate__dlm` | `FinServ__FinancialAccount__c` (interest rate) | Active |
| Mappings sourced from standard `FinancialAccount` | **None** — `list_dlo_dmo_mappings(sourceObjectName='FinancialAccount')` returns `{ objectSourceTargetMaps: [] }` | — |

> **Implication:** `ssot__FinancialAccount__dlm` is already a unified, standard-shaped representation. Its **inputs** are legacy FSC + a banking-core feed; its **shape** is the SSOT (standard) model. CRM-side standard `FinancialAccount` is bypassed in both directions — nothing maps *to* it from Data Cloud, nothing reads *from* it in Apex. Building a CRM-side legacy→standard sync would create a third, redundant pipeline.

**Sync mechanism (decided 2026-05-11):**

Scheduled Apex batch (`FscFinancialAccountParityBatch`, run hourly via `System.scheduleBatch`). Reads recently-modified legacy rows (`SystemModstamp > LAST_RUN`), upserts into standard parents and dependents using legacy `Id` as a stable external key.

Selected for: governor-safety at scale (handles 496+ legacy FAs and 564+ roles in chunks), retry-friendly (idempotent upsert by external ID), simple test coverage, suitable for demo data freshness needs (sub-hour lag is acceptable). Rejected: real-time Queueable (recursive trigger guarding overhead), Flow (Phase A4 already targets 262 obsolete flow versions — adding a critical dependency on Flow is the wrong direction for an org we're trying to clean up), DC reverse-ETL/Activation (unusual pattern, ties demo health to DC pipeline health).

**Parity scope (decided 2026-05-11; revised same day after schema investigation):**

| Standard object | Source | Parity? | Notes |
|---|---|---|---|
| `FinancialAccount` (parent) | `FinServ__FinancialAccount__c` (496 rows) | ✅ Yes | Root of the parity story. Upsert by external key derived from legacy Id. |
| `IssuedCard` | `FinServ__Card__c` (185 rows) | ✅ Yes | **Cascade step.** After FA parity writes complete, mirror legacy cards to `IssuedCard` with `FinancialAccountId` resolved by external-ID lookup on the just-mirrored standard FA. Naturally closes the 4-row drift in §4.1 C8. |
| `ResidentialLoanApplication` | Legacy FAs of type `Loans` rebalanced into the **Retail Mortgage** tier by §6.1 D3 (~71 records after A13) | ✅ Yes | Synthesize from the post-A13 retail-tier subset only. The SMB and mid-market tiers stay as legacy FAs; only the retail tier feeds RLA. |
| `FinancialGoal` | `FinServ__FinancialGoal__c` (277 rows; standard has 110, audit H2 fragmentation) | ✅ Yes | Two-way parity, same shape as FA. Legacy canonical for writes; mirror to standard via external-ID upsert. Closes audit finding H2. |
| `PersonLifeEvent` (standard) | `FinServ__LifeEvent__c` (139 rows; standard `PersonLifeEvent` has 112) | ✅ Yes | Map `FinServ__LifeEvent__c.PrimaryOwner` (Person Account) → `PersonLifeEvent.PrimaryPersonId` via PersonContactId lookup. Note Salesforce renamed `LifeEvent` → `PersonLifeEvent`; the audit's §3.3 "LifeEvent not present" was actually a missed rename. |
| `BusinessMilestone` | — | ⚠️ Already canonical | 286 standard records exist; no legacy `FinServ__BusinessMilestone__c` is present in this org. Standard is already the source of truth, parity is a no-op. Documented for completeness. |
| `FinancialAccountRole` | `FinServ__FinancialAccountRole__c` (564 rows) | ❌ Not in parity | **Standard `FinancialAccountRole` does not exist in this org's schema.** Confirmed via Tooling API EntityDefinition query 2026-05-11. Legacy stays canonical. Same pattern as holdings below. |
| `Card`, `CardAgreement` (standard banking) | — | ❌ Replaced by `IssuedCard` | Investigation 2026-05-11: standard `Card` and `CardAgreement` are not present in the org's schema, but `IssuedCard` (banking) is and is already populated. `IssuedCard` is the right standard target for the cards story; `Card`/`CardAgreement` removed from scope. |
| `FinancialAccountTransaction` | — | ❌ Not via parity batch | Legacy has 0 transactions to mirror. Phase B2 generates transactions directly into the standard model. |
| `FinancialHolding` (standard) | — | ❌ Not in parity | No standard `FinancialHolding` core object exists; legacy `FinServ__FinancialHolding__c` (428 rows) stays as the holdings store, surfaced via `ssot__FinancialHolding__dlm` for DC consumers. |

**Architecture pattern that follows from this:**

```
Writes (today, unchanged):    LWC / Flow / Apex → FinServ__FinancialAccount__c (canonical)
                                                              │
                                                              ├─────────────────────────────────────┐
                                                              │                                      │
                                                  Data Cloud DLO ingest                    Scheduled Apex batch
                                                  (legacy + Deposits_Latest)              FscFinancialAccountParityBatch
                                                              │                                      │
                                                              ▼                                      ▼
                                                ssot__FinancialAccount__dlm                   FinancialAccount (parent mirror, from FinServ__FinancialAccount__c)
                                                ssot__DepositAccount__dlm                          │
                                                ssot__LoanAccount__dlm                             ├─→ IssuedCard               (cascade from FinServ__Card__c, 185 rows)
                                                ssot__InvestmentAccount__dlm                       └─→ ResidentialLoanApplication (synthesize from Retail Mortgage tier, ~71 rows post-A13)
                                                ssot__CardAccount__dlm
                                                ssot__InsurancePolicy__dlm                   FinancialGoal     (mirror, from FinServ__FinancialGoal__c, 277 rows)
                                                ssot__FinancialAccountFee__dlm               PersonLifeEvent   (mirror, from FinServ__LifeEvent__c, 139 rows; PrimaryOwner→PersonContactId)
                                                ssot__FinancialAccountInterestRate__dlm
                                                                                             Skipped (no standard target in this org's schema):
                                                                                                - FinServ__FinancialAccountRole__c (564) — legacy-only
                                                                                                - FinServ__FinancialHolding__c     (428) — legacy-only
                                                                                             Skipped (already canonical on standard side):
                                                                                                - BusinessMilestone (286) — no legacy FinServ source exists

Reads (CRM-direct, today):    FinancialOverviewController, BusinessProfileWidgetController
                                  → SOQL on FinServ__FinancialAccount__c (unchanged)

Reads (DC-mediated, today):   CustomerProfileWidgetController
                                  → Named Credential callout → ssot__FinancialAccount__dlm

Reads (any NEW code that      Two equivalent, supported paths:
wants the standard model):    (a) SOQL on standard FinancialAccount + dependents (CRM-local, fast)
                              (b) Named Credential callout to DC DMO (cross-source, harmonized)

Standard FinancialAccount     Maintained mirror — populated and refreshed every hour
on CRM:                       by FscFinancialAccountParityBatch. Page layouts and reports
                              MAY surface it (no longer suppressed).
```

**Risks accepted by this decision:**

| Risk | Mitigation |
|---|---|
| Two CRM-side stores (legacy + standard) means double the storage and double the apex governor budget | Acceptable for a demo org; quarterly audit re-verifies storage cost trend. |
| Sync lag (up to 1 hour) means standard FA can briefly disagree with legacy after edits | Document this in the readme of the parity batch. If a demo needs sub-hour freshness, run the batch on demand from Setup. |
| ~~`FinancialAccountRole` is not enabled in the org~~ | **Resolved via scope reduction (2026-05-11).** Standard `FinancialAccountRole` does not exist in this org's schema. Removed from parity scope; legacy stays canonical. Phase A8 dropped. |
| Recursive sync: a future trigger or flow on standard FinancialAccount writes back into legacy and creates a loop | Parity batch must read from legacy only and write to standard only. Add an `IsParitySync__c` boolean on standard FA records (or use `setOptions` recursion guard) to mark records as machine-written; future triggers should ignore those. |
| ~~Mortgages parity step depends on §7 Q3~~ | **Resolved 2026-05-11 by §6.1 D3 + Phase A13.** The 101 loan FAs are now distributed into Retail/SMB/Mid-Market tiers. Only the retail tier feeds `ResidentialLoanApplication`. |
| Holdings stay legacy-only — any standard-model consumer that expects holdings will see none | Document explicitly. Future-proof: if/when Salesforce ships a standard `FinancialHolding`, extend the parity batch. |
| `Deposits_Latest__dll` is a second source feeding `ssot__FinancialAccount__dlm` — may produce duplicates / version skew on the DMO | Out of scope for Phase A. Track as new finding **H10** (below) and verify during Phase B7 RBL recompute. |

**New finding raised by this audit (add to §4.2):**

- **H10 — `ssot__FinancialAccount__dlm` has two unrelated source mappings** (`FinServ_FinancialAccount_c_Home__dll` + `Deposits_Latest__dll`). Without a confirmed identity-resolution / dedup strategy on the DMO, the same banking account can land twice with different keys. Verify during Phase B7 RBL recompute; if duplicates exist, design a unification rule on `CustomerID__c`.

**Action items implied:**

- **Phase A1** ✏️ — rewritten: legacy is canonical; standard FA + selected dependents are maintained in parity via scheduled Apex batch (no longer "suppress standard").
- ~~**Phase A8**~~ **dropped 2026-05-11.** Standard `FinancialAccountRole` does not exist in the org's schema; legacy `FinServ__FinancialAccountRole__c` stays canonical with no mirror.
- **Phase A9** — **add an `IsParitySync__c` boolean** (or equivalent recursion-guard mechanism) on every standard parity target: `FinancialAccount`, `IssuedCard`, `ResidentialLoanApplication`, `FinancialGoal`, `PersonLifeEvent`. Future triggers on those objects must detect and skip machine-written rows.
- **Phase A10** — **build `FscParityBatch`** (`Database.Batchable<sObject>` + `Schedulable`):
   - **Step 1** — Mirror `FinServ__FinancialAccount__c` → `FinancialAccount` (upsert by external ID `LegacyId__c`).
   - **Step 2** — Cascade `FinServ__Card__c` → `IssuedCard` (upsert by external ID, resolve `FinancialAccountId` via standard FA lookup; closes §4.1 C8).
   - **Step 3** — Synthesize `ResidentialLoanApplication` from Retail Mortgage-tier FAs only (post-A13 rebalanced subset, `FinServ__Balance__c < $5M`).
   - **Step 4** — Mirror `FinServ__FinancialGoal__c` → `FinancialGoal` (closes §4.2 H2).
   - **Step 5** — Mirror `FinServ__LifeEvent__c` → `PersonLifeEvent` (resolve `PrimaryOwner` Person Account → `PrimaryPersonId` via PersonContactId lookup).
   - Reads use `WHERE SystemModstamp > :LAST_RUN_AT` for incremental delta.
   - Sets `IsParitySync__c = TRUE` on every write.
   - Exposes a `runOnDemand()` AuraEnabled method for demo prep.
- **Phase A11** — **schedule the batch hourly** via `System.schedule('FscParityHourly', '0 0 * * * ?', new FscParityBatch.Scheduler())`. Document override procedure for demo-day forcing.
- **Phase A12** — **test class** `FscParityBatchTest` covering each of the 5 steps + idempotency + recursion guard + the retail-tier-only filter on RLA synthesis + Person Account → Contact resolution on PersonLifeEvent. Target ≥85% coverage on the batch class.
- **Phase B11** (new) — for any new component that needs FA data in a packaged-friendly shape, prefer SOQL on standard `FinancialAccount` (CRM-local, no callout) for single-source needs, or Named Credential callout to `ssot__FinancialAccount__dlm` for cross-source/harmonized needs. Both paths are now supported.
- **Phase C** — quarterly audit must (a) re-run `mcp__datacloud__list_dlo_dmo_mappings(sourceObjectName='FinancialAccount')`; if it ever returns non-empty, parity sync direction needs review, and (b) verify parity batch's last 24 hr success rate.

---

#### D2 — Insurance UI: keep visible, populate in a future Phase B pass

**Decided:** 2026-05-11
**Status:** Resolved (was Open Question Q2)
**Decision:** Leave the FSC Insurance UI surface (`InsurancePolicy`, `Producer`, `ComplaintCase` objects, plus their associated page layouts, app pages, and app navigation entries) **visible and unchanged** in Cumulus. The 0-record state stays for now. Insurance is not removed from scope — it's deferred. Plan to seed minimal insurance data (carriers, a handful of policies, a producer or two, sample complaint cases) in a future Phase B pass once the Phase A cleanup and parity infrastructure are in place.

**Why not "suppress UI only" or "full removal":**

- **Full removal** was rejected because `ssot__InsurancePolicy__dlm` is wired to the legacy FA cascade (the parity-batch dependency tree in D1) — deleting it breaks the legacy → DMO mapping cascade.
- **Suppress UI only** was rejected because it costs reversibility: page layouts and app pages would have to be re-added when insurance comes back into scope, including any FSC accelerator-installed layouts that may have been overridden. The work to suppress is roughly the same as the work to seed; better to do the productive version.
- **Keep UI, populate later** preserves the demo posture (Insurance tab exists but is empty today) and converts a "remove and re-add" cycle into a single forward step (seed data when ready).

**Implication for demos:**

Until insurance data is seeded, presenters should **avoid clicking the Insurance tab on stage** — empty list views look unfinished. The recommendation in §4.4 ("what's already working well") doesn't extend to insurance; treat insurance as a known empty cell on the demo grid.

**Action items implied:**

- No Phase A action — leave existing UI intact.
- Phase B (new step **B12**) — seed insurance data:
   - 5–10 `InsurancePolicy` records linked to existing Person Accounts (Auto, Home, Term Life mix)
   - 2–3 `Producer` records (one in-house advisor, one external broker)
   - 1–2 `ComplaintCase` records (for the FSC compliance-handling demo arc)
   - Re-verify the legacy `FinServ__FinancialAccount__c` → `ssot__InsurancePolicy__dlm` cascade still resolves cleanly with non-empty insurance data.
- Phase C — quarterly audit re-checks insurance counts; if still 0 after two quarters, re-open Q2.

---

#### D3 — Loan FA amounts: data-quality bug; re-distribute to realistic retail/SMB/commercial ranges in place

**Decided:** 2026-05-11
**Status:** Resolved (was Open Question Q3)
**Decision:** Treat the 101 legacy loan FAs (avg $337M, max $9.7B per §3.4 / finding H7) as a **data-quality bug from a prior bulk import**, not as intentional commercial-vs-retail conflation. All 101 records stay in `FinServ__FinancialAccount__c`. A **one-time Phase A Apex script** re-distributes their balance fields into three realistic ranges, weighted to favor retail. After the re-distribution, the mortgage subset of the parity batch (D1 / Phase A10) can synthesize `ResidentialLoanApplication` rows from records with `FinServ__Balance__c < $5M` without producing absurd demo numbers.

**Why this — not "split out commercial" or "leave as-is":**

- The bug interpretation is the most consistent with the rest of the audit's findings: every other FA type has realistic distributions (Credit Cards avg $3,991 — correct retail; Investment holdings are 32% gap-filled but plausibly sized when present; Person Account demographics are excellent per §4.4). A $9.7B max on a single retail-coded loan is an order-of-magnitude outlier that points at import error, not architectural intent.
- "Split commercial subset" was rejected because it doubles the workstream (re-distribute *and* re-route) and the re-routing target is unclear — there is no commercial-loan-specific object enabled in the org, and B2B Accounts have only 8 records of `Business` record type. Without a clear commercial destination, splitting creates orphans.
- "Leave as-is, gate parity on threshold" was rejected because demo viewers see the loan totals on the Person Profile widget today (§4.1 widgets read directly from legacy FA). A $9.7B mortgage on a Person Account is visible *now* — gating only the parity batch fixes the standard-model surface but leaves the legacy demo embarrassed.

**Re-distribution plan (Phase A13):**

| Tier | Range | Record count target | Notes |
|---|---|---:|---|
| Retail mortgage / HELOC | $50K – $2M | ~70 (69%) | Bulk of the rebalanced set; feeds Phase A10 mortgage parity into `ResidentialLoanApplication`. |
| Small business loan | $250K – $5M | ~25 (25%) | Stays in legacy FA. Linked to Person Accounts who have an associated B2B household. Does not feed `ResidentialLoanApplication`. |
| Mid-market commercial | $5M – $50M | ~6 (6%) | Stays in legacy FA. Distributed across the 8 `Business` record type Accounts. Does not feed `ResidentialLoanApplication`. |
| **None above $50M** | — | 0 | Cap is intentional; $9.7B was the trigger for this decision. |

Re-distribution is deterministic (seeded random with stable order by `CreatedDate`) so it's idempotent and reproducible across re-runs.

**Risks accepted by this decision:**

| Risk | Mitigation |
|---|---|
| Re-distribution destroys the original (possibly intentional) loan amounts | Snapshot the 101 records' pre-fix `FinServ__Balance__c` and `FinServ__LoanAmount__c` to a custom field (`OriginalBalance__c` text) before write. Reversible. |
| Downstream RBL household rollups change after re-distribution (totals shift) | Phase B7 RBL recompute already covers this. Run Phase A13 *before* Phase B7. |
| Some loan FAs may be linked to demo flows that hardcode specific dollar amounts | Low likelihood given the audit found no Apex/LWC referencing specific loan IDs or amounts; verified via code search 2026-05-10. |

**Action items implied:**

- **Phase A13** (new) — write `FscLoanRebalanceOnce.cls` (one-time Apex utility, not Schedulable). Snapshots originals, re-distributes per the table above, logs all changes to a custom `RebalanceLog__c` object for audit trail. Run once, then disabled.
- **Phase A10** (D1) — mortgage parity step is **unblocked by D3**: the parity batch can now safely process `WHERE FinServ__FinancialAccountType__c IN ('Loan','Mortgage') AND FinServ__Balance__c < 5000000` to feed `ResidentialLoanApplication`.
- **§4.2 H7** — finding can be marked resolved after Phase A13 runs.

---

#### D4 — InteractionSummary authorship: generate net-new records under varied authors; leave historical 1,065 in place

**Decided:** 2026-05-11
**Status:** Resolved (was Open Question Q4)
**Decision:** Do **not** attempt to rewrite `CreatedById` on the existing 1,065 InteractionSummary records (Salesforce does not permit it on existing records via supported Apex paths). Instead, **generate ~300 net-new InteractionSummary records in Phase B**, dated in the last 30–60 days, authored by 5 plausible advisor users via Apex executed under those users' contexts. The historical 1,065 stay as they are. Combined with Phase B1 (re-date Events/Tasks), this produces a **believable current engagement footprint** that any "today / this week / this month" demo can drink from without ever needing to display the older bulk-loaded records.

**Why this — not "fix the 1,065" or "accept as-is":**

- Salesforce does not allow rewriting `CreatedById` on existing records via standard Apex. The only paths are (a) delete + reinsert under different running users (lossy — destroys record IDs that may be referenced elsewhere), or (b) accept the signature. Both have real costs.
- "Generate net-new" sidesteps the unfixable property entirely: new records inherit the running user as `CreatedById` *naturally* when inserted via Apex executed in a user-level context (e.g., scheduled job impersonation, `runAs` in test, anonymous Apex login-as).
- It also stacks productively with Phase B1 — "re-date Events" and "generate fresh InteractionSummaries" are the same project: build a 30-day window of plausible activity. Doing them together is one workstream.

**Generation plan (Phase B5 — replaces existing B5 placeholder):**

| Element | Approach |
|---|---|
| **Author rotation** | 5 advisor users (real `User` records picked from the 11 `non-stale active` advisors after Phase A5 cleanup): round-robin assignment, weighted ~30/25/20/15/10 to look organic, not uniform. |
| **Volume** | ~300 net-new InteractionSummaries (≈10× the 30-day current rate at a typical mid-size FSC org). |
| **Date distribution** | Last 60 days, with ~70% in the last 30 days, ~50% in the last 14 days, ~10–15 records dated "today" or "yesterday" so list views always show fresh records. |
| **Topic mix** | Pull from realistic FSC interaction types: portfolio review, life event check-in (link to existing `FinServ__LifeEvent__c` rows), goal review, household refresh, complaint follow-up, product cross-sell, transactional service. |
| **Linkage** | Each record links to a Person Account (preferring high-tier `FinServ__ClientCategory__c` Gold/Platinum) and a parent `Interaction` record. Don't orphan. |
| **Channel mix** | Address the §4.2 H9 finding: distribute new records across channels (in-person meeting, video call, phone, email) so the multi-channel story is real. |

**Risks accepted by this decision:**

| Risk | Mitigation |
|---|---|
| If a viewer sorts the IS list view by Created By, the historical 1,065-by-one-user pattern is still visible | Document in the demo runbook: "Default the IS list view sort to `LastModifiedDate DESC` so fresh records lead." Most demo flows surface IS via timeline components, which sort by date naturally. |
| Generated content quality matters — bland boilerplate looks worse than uniform authorship | Use a small library of realistic interaction-summary templates with placeholder substitution (client name, product, life event reference). Aim for variety, not perfection. |
| The 5 chosen advisor users may not have full FSC permission sets to be valid `OwnerId` for IS records | Verify permission set assignments **before** Phase B5; assign FSC standard advisor permset if missing. |
| Phase A5 (deactivate stale users) might deactivate one of the chosen advisors | Sequence: choose advisors **after** Phase A5 completes, not before. |

**Action items implied:**

- **Phase B5** (rewrites existing B5) — `FscEngagementSeed.cls` Apex utility: takes a target volume + advisor list, generates InteractionSummary records under each advisor's user context. Run once per demo prep cycle.
- **§4.1 C2** — finding's *"all by one user"* portion is not removed by this decision (the historical 1,065 stay), but the *practical* impact is mitigated when fresh records dominate the recent window. Update C2 to reflect the partial mitigation.
- **§4.2 H9** — partial resolution: generated IS records explicitly cover multiple channels, addressing the "multi-channel story may be single-channel" concern.
- **Demo runbook (new) — `audits/demo-runbook.md`** (future task, not part of this audit): document the recommended IS list-view sort and any other demo presentation defaults that mitigate residual issues.

---

#### D5 — Audit cadence: monthly

**Decided:** 2026-05-11
**Status:** Resolved (was Open Question Q5)
**Decision:** Run this audit **monthly** rather than quarterly. First refresh: **2026-06-10**. Subsequent refreshes on or near the 10th of each month. The §5 Phase C wording is updated accordingly.

**Why monthly (not quarterly, not event-triggered, not pre-demo-only):**

- Drift in this org is high. Demo data gets reseeded by NXDO / qbranch tooling at unpredictable intervals; FSC ships major releases ~3× per year; managed packages can be added or upgraded by other teams without notice; and the parity batch (D1) will be writing fresh records hourly. A quarterly cadence will routinely be 60–80 days stale by the time it runs.
- Monthly is the cheapest cadence that catches all the typical drift sources. A typical re-audit (using the §8 SOQL fingerprints) takes ~30 minutes if no major findings change, ~half a day if they do.
- "Pre-major-demo only" was rejected because it ties hygiene to demo schedule; weeks can pass with no demo while the org silently degrades, and the next demo prep then absorbs all the cleanup cost.
- "Quarterly + event-triggered" was a near-miss alternative; it's effectively the same idea with less calendar discipline. Monthly is simpler to operationalize and gives a predictable rhythm.

**Cadence ground rules:**

| Rule | Detail |
|---|---|
| Schedule | Monthly, on or near the 10th. First refresh: 2026-06-10. |
| Output | New file: `audits/fsc-master-org-audit-YYYY-MM.md` (or update this file's `Audit date` and append a `Changelog` section — TBD on first refresh). |
| Comparison | Each refresh includes a brief delta vs the prior month's audit: which findings resolved, which findings appeared, which counts shifted. |
| Triggers for off-cycle refresh | (a) FSC major version upgrade, (b) any NXDO/qbranch data reseed, (c) major external demo within 7 days. Off-cycle refreshes append to the same file rather than starting a new one. |
| Authorship | Same auditor + tooling chain (Claude + datacloud MCP + repo grep). Hand-tuned analysis still required — this is not yet automatable end-to-end. |

**Action items implied:**

- **§5 Phase C** ✏️ — update the cadence line from "quarterly" to "monthly".
- **Phase C reminder** — add a calendar entry / scheduled `gh issue` for the 10th of each month so the audit doesn't get forgotten.
- **First refresh — 2026-06-10** — at minimum, re-verify D1's parity batch (Phase A10) is running successfully, D3's loan rebalance (Phase A13) ran cleanly, and the Phase B1/B5 engagement seed has produced fresh activity.

---

## 7. Open Questions for User

1. ~~**FA model decision**~~ — **Resolved 2026-05-10. See §6.1 D1.**
2. ~~**Insurance scope**~~ — **Resolved 2026-05-11. See §6.1 D2.**
3. ~~**Commercial Loans**~~ — **Resolved 2026-05-11. See §6.1 D3.**
4. ~~**Bulk-author rewrite for Interaction Summaries**~~ — **Resolved 2026-05-11. See §6.1 D4.**
5. ~~**Audit deliverable cadence**~~ — **Resolved 2026-05-11. See §6.1 D5.**

---

## 8. Appendix — Key SOQL Fingerprints

For reproducibility, these are the load-bearing queries for re-audits:

```sql
-- Person vs B2B count
SELECT IsPersonAccount, COUNT(Id) FROM Account GROUP BY IsPersonAccount

-- Record type fragmentation
SELECT RecordType.Name, COUNT(Id) FROM Account GROUP BY RecordType.Name

-- Parallel FA models
SELECT COUNT() FROM FinServ__FinancialAccount__c
SELECT COUNT() FROM FinancialAccount

-- Investment FAs without holdings (32% gap)
SELECT COUNT(Id) FROM FinServ__FinancialAccount__c
WHERE FinServ__FinancialAccountType__c = 'Investments'
  AND Id NOT IN (SELECT FinServ__FinancialAccount__c FROM FinServ__FinancialHolding__c)

-- Person accounts missing household
SELECT COUNT(Id) FROM Account
WHERE IsPersonAccount = true
  AND PersonContactId NOT IN (
    SELECT ContactId FROM AccountContactRelation
    WHERE Account.RecordType.Name = 'Household'
  )

-- Stale Events (the date-realism alarm)
SELECT COUNT() FROM Event WHERE ActivityDate > LAST_N_DAYS:90
SELECT COUNT() FROM Event WHERE ActivityDate < LAST_N_YEARS:3

-- Picklist contamination on Goals
SELECT FinServ__Type__c, COUNT(Id) FROM FinServ__FinancialGoal__c
GROUP BY FinServ__Type__c ORDER BY COUNT(Id) DESC

-- Flow bloat
SELECT Status, COUNT(Id) FROM Flow GROUP BY Status   -- Tooling API

-- User staleness
SELECT COUNT(Id) FROM User
WHERE IsActive = true AND (LastLoginDate < LAST_N_MONTHS:12 OR LastLoginDate = NULL)
```

---

*End of audit. Next step: discuss Phase A scope and approve the canonical-model decisions before any data changes.*
