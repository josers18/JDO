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
| C1 | **No fresh activity** — 0 Events in last 90 days, 0 Events >3 years old; all 1,469 Events sit in a fixed historical window. | `SELECT COUNT() FROM Event WHERE ActivityDate > LAST_N_DAYS:90` → 0 | Any "this week's meetings" / "today's calendar" demo collapses. |
| C2 | **All 1,065 Interaction Summaries created by a single user in one batch.** | `GROUP BY CreatedById` → all under `005am000003PbCLAA0`. | "Reps capturing meeting notes over time" looks fake; the audit trail betrays bulk import. |
| C3 | **0 Financial Account Transactions** despite 925 financial accounts. | `SELECT COUNT() FROM FinancialAccountTransaction` → 0 | "Recent activity" / "transaction history" tabs are empty everywhere. |
| C4 | **Parallel FA models with no bridging** — 496 legacy + 429 standard FAs, side by side. | Both objects populated; standard `FinancialAccountRole` not present. | Reports/widgets see ~50% of the book depending on which model they read. |
| C5 | **35/110 (32%) Investment FAs have no Holdings.** | `WHERE Id NOT IN (SELECT FA FROM Holdings)` → 35 | One-third of investment-account drilldowns will show empty position lists. |
| C6 | **ContactPointEmail / ContactPointPhone are empty (0 records).** | Direct counts. | Data Cloud / Marketing Cloud unified-profile demos cannot resolve any email/phone — kills the cross-channel story. |
| C7 | **Person Account record-type fragmentation** — 54 person records spread across `Person Accounts` (37), `FSC Person Accounts` (9), `Person Account` (8). | `GROUP BY RecordType.Name`. | List views, page layouts, and assignment rules behave inconsistently per record type. |

### 4.2 ⚠️ High — meaningful authenticity & quality gaps

| # | Finding | Evidence | Impact |
|---|---|---|---|
| H1 | **7/54 (13%) Person Accounts are not in any Household.** | Anti-join on ACR → 7. | RBL household rollups under-count; "household 360" demos cherry-pick. |
| H2 | **Parallel Goals models** — 277 legacy + 110 standard. | Both populated. | Same fragmentation as FA: half the goals invisible per model. |
| H3 | **Goal `Type` picklist is contaminated** — mixes customer goals (Retirement, Education, Home Purchase) with sales pipeline values (New Customer Acquisition, New Business Acquisition, New Services). | `GROUP BY FinServ__Type__c`. | Goal-based reports and prompts return nonsense rows. |
| H4 | **Industry picklist split** — `Healthcare` (1) vs `Healthcare & Life Sciences` (13) coexist on B2B accounts. | `GROUP BY Industry`. | Industry-based segmentation undercounts. |
| H5 | **Status picklist hygiene** — legacy FAs include 1 record with status literally `"Whitespace"` and 11 nulls. | `GROUP BY FinServ__Status__c`. | Picklist looks unprofessional in a status filter. |
| H6 | **Person Account Status is 19% null** (10/54), and only 2 are "Dormant" / 0 are "Inactive". | `GROUP BY FinServ__Status__c`. | No data to demo lifecycle / churn segmentation. |
| H7 | **Loans average $337M, max $9.7B on `FinServ__FinancialAccount__c`.** | Aggregate stats. | Either commercial-banking data is conflated with retail wealth, or values were mis-imported. Distorts every household total chart. |
| H8 | **51/54 Person Accounts have null `PersonHomePhone`.** | Direct count. | Phone column on customer cards is mostly empty. |
| H9 | **`InteractionSummary` and `Interaction` record types not profiled** — likely all share one type/source pattern. | (Schema check pending.) | "Multi-channel" interaction story may be single-channel. |

### 4.3 🧹 Medium — bloat to remove

| # | Finding | Evidence | Action |
|---|---|---|---|
| B1 | **262 Obsolete flow versions + 7 Invalid Draft flows.** | `Flow` tooling query. | Hard-delete obsolete versions; fix or delete invalid drafts. |
| B2 | **129/140 active users haven't logged in in 12+ months.** | `WHERE LastLoginDate < LAST_N_MONTHS:12`. | Audit & deactivate; many `ESW_*` profiles are orphan Embedded Service service users from old deployments. |
| B3 | **30/171 accounts have no LastActivityDate or no activity in 2+ years.** | Direct count. | Candidates for deletion or re-dating. |
| B4 | **~80 managed packages installed** — many likely unused (e.g., legacy `EngageReports`, `b2bmaIntegration`, `Lightning Lead Inbox`, `B2B LE Mood Board`, several `B2B LE *` commerce packages). | `sf package installed list`. | Inventory each, confirm not referenced by any active demo flow, uninstall in waves. |
| B5 | **Multiple Person Account record types and the redundant `FSC Person Accounts` / `Person Account` (singular) RTs.** | `GROUP BY RecordType.Name`. | Pick one canonical Person Account RT, migrate the other 17 records, delete spare RTs. |
| B6 | **Empty FSC objects:** `PartyProfile` (0), `FinServ__BusinessMilestone__c` (legacy custom — invalid type, not present), `Producer` (0), `InsurancePolicy` (0), `ComplaintCase` (0), `FinancialAccountTransaction` (0). | Counts above. | **Insurance trio (`Producer`, `InsurancePolicy`, `ComplaintCase`) reclassified per §6.1 D2** — keep UI visible, seed in Phase B12 instead of removing. `FinancialAccountTransaction` covered by Phase B2 (generation). `PartyProfile` and missing legacy custom — leave as-is unless a future demo needs them. |

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
| A8 | **Enable `FinancialAccountRole` in Setup** (hard precondition for parity batch). | Low | S |
| A9 | **Add `IsParitySync__c` recursion-guard field** on standard FA, FinancialAccountRole, Card, CardAgreement, ResidentialLoanApplication. | Low | S |
| A10 | **Build `FscFinancialAccountParityBatch`** (Batchable + Schedulable) — reads recently-modified legacy FAs, upserts standard parents and dependents, synthesizes Card / CardAgreement / ResidentialLoanApplication for type-specific rows. Idempotent, recursion-guarded, on-demand-runnable. | Med | L |
| A11 | **Schedule the parity batch hourly** via `System.schedule(...)`; document on-demand override for demo prep. | Low | S |
| A12 | **Test class `FscFinancialAccountParityBatchTest`** ≥85% coverage; covers deposit/credit-card/mortgage paths, idempotency, recursion guard. | Low | M |
| A13 | **Loan FA rebalance** (per §6.1 D3) — `FscLoanRebalanceOnce.cls` snapshots and re-distributes the 101 loan FAs into retail/SMB/mid-market ranges. Run **before** A10 mortgage parity and **before** Phase B7 RBL recompute. Resolves §4.2 H7. | Low | S |
| A2 | Same decision for `FinancialGoal` — keep legacy `FinServ__FinancialGoal__c` until migration. | Low | S |
| A3 | Consolidate Person Account record types — standardize on `Person Accounts` (37). Migrate the 9 `FSC Person Accounts` and 8 `Person Account` records. Delete the spare RTs. | Medium | M |
| A4 | Clean up Flow surface — delete the 262 Obsolete versions; investigate & fix-or-delete the 7 Invalid Draft flows. | Low | S |
| A5 | Deactivate stale users — review the 129 users with no logins in 12+ months; deactivate the `ESW_*` and other auto-generated profiles in particular. | Low | S |
| A6 | Picklist hygiene — fix `"Whitespace"` value on FA Status; merge `Healthcare`/`Healthcare & Life Sciences`; remove sales-pipeline values from Goal `Type`. | Low | S |
| A7 | Decide which managed packages are still used — uninstall obvious legacy (e.g., old B2B LE commerce demos if not in current decks, `EngageReports`, `b2bmaIntegration`, `PardotEngagementHistoryDemo` if duplicated). | Medium | L |

### Phase B — Authenticity Enrichment

**Goal:** make the data *feel* like a real customer base running today.

| Step | Action | Risk | Effort |
|---|---|---|---|
| B1 | **Re-date Events and Tasks** — shift the historical window forward so the most-recent 200–300 records land in the last 30 days. Use a deterministic offset Apex script or NXDO Data Tool. | Low | M |
| B2 | **Generate `FinancialAccountTransaction` records** — 30–90 days of plausible transactions per Deposits/Credit Cards FA (paychecks, recurring bills, card swipes, P2P). Aim for ~10–30 transactions per active FA → ~5–10K records. | Low | L |
| B3 | **Backfill Holdings on the 35 empty Investment FAs** — assign 5–15 plausible securities each from existing `FinServ__Securities__c` (28 records) — extend the securities catalog if needed. | Low | M |
| B4 | **Place 7 unhoused Person Accounts into Households** — either join existing households (siblings, partners) or create solo households. | Low | S |
| B5 | **Spread `InteractionSummary` and `Interaction` createdBy across multiple advisor users** — re-author records under different rep IDs (within data factory's privileges) so the audit trail looks organic. | Medium | M |
| B6 | **Populate ContactPointEmail / ContactPointPhone** for all 54 Person Accounts (and the contact-bearing B2B accounts) so Data Cloud unified-profile demos work. | Low | M |
| B7 | **Verify RBL household rollups** — run a recompute, sample-check 5 households, ensure totals match member-level FAs after Phase A consolidation. | Low | S |
| B8 | **Reconcile commercial vs retail Loans on the FA object** — split the 101 Loan-type FAs: commercial loans should attach to B2B Accounts, mortgages to households. The $9.7B max value is almost certainly a commercial record. | Medium | M |
| B9 | **Backfill `PersonHomePhone`** on the 51 missing records (or move to ContactPointPhone in step B6 and stop populating the Person Account field). | Low | S |
| B10 | **Add light Banking story coverage** — 5–10 `ResidentialLoanApplication` records, plus standard `Card` / `CardAgreement` data if those objects are enabled. | Medium | M |

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

**Parity scope (decided 2026-05-11):**

| Standard object | Source | Parity? | Notes |
|---|---|---|---|
| `FinancialAccount` (parent) | `FinServ__FinancialAccount__c` | ✅ Yes | Root of the parity story. Upsert by external key derived from legacy Id. |
| `FinancialAccountRole` | `FinServ__FinancialAccountRole__c` (564 rows) | ✅ Yes | **Precondition: enable in Setup before first batch run.** Without this, parity for "who owns this account" demos breaks. |
| `Card`, `CardAgreement` | Legacy FAs where `FinServ__FinancialAccountType__c = 'Credit Cards'` (32 rows) | ✅ Yes | Synthesize one `Card` + `CardAgreement` per legacy Credit Cards FA. Unlocks Phase B10 banking story. |
| `ResidentialLoanApplication` | Legacy FAs where `FinServ__FinancialAccountType__c IN ('Loan','Mortgage')` (subset of 101 Loan-type rows) | ✅ Yes | Filter to retail/residential — not commercial. Will need the §7 Q3 commercial-vs-retail split (still open) before this can run cleanly. |
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
                                                ssot__FinancialAccount__dlm                   FinancialAccount
                                                ssot__DepositAccount__dlm                          │
                                                ssot__LoanAccount__dlm                             ├─→ FinancialAccountRole
                                                ssot__InvestmentAccount__dlm                       ├─→ Card + CardAgreement (Credit Cards)
                                                ssot__CardAccount__dlm                             └─→ ResidentialLoanApplication (Mortgages)
                                                ssot__InsurancePolicy__dlm
                                                ssot__FinancialAccountFee__dlm
                                                ssot__FinancialAccountInterestRate__dlm

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
| `FinancialAccountRole` is not enabled in the org (§3.2) — sync will fail until it is | **Phase A precondition: enable `FinancialAccountRole` before first batch run.** Add as Phase A8. |
| Recursive sync: a future trigger or flow on standard FinancialAccount writes back into legacy and creates a loop | Parity batch must read from legacy only and write to standard only. Add an `IsParitySync__c` boolean on standard FA records (or use `setOptions` recursion guard) to mark records as machine-written; future triggers should ignore those. |
| Mortgages parity step depends on §7 Q3 (commercial vs retail loan split) being resolved | Mark `ResidentialLoanApplication` parity as **blocked by Q3** in Phase B; ship the rest of the batch first. |
| Holdings stay legacy-only — any standard-model consumer that expects holdings will see none | Document explicitly. Future-proof: if/when Salesforce ships a standard `FinancialHolding`, extend the parity batch. |
| `Deposits_Latest__dll` is a second source feeding `ssot__FinancialAccount__dlm` — may produce duplicates / version skew on the DMO | Out of scope for Phase A. Track as new finding **H10** (below) and verify during Phase B7 RBL recompute. |

**New finding raised by this audit (add to §4.2):**

- **H10 — `ssot__FinancialAccount__dlm` has two unrelated source mappings** (`FinServ_FinancialAccount_c_Home__dll` + `Deposits_Latest__dll`). Without a confirmed identity-resolution / dedup strategy on the DMO, the same banking account can land twice with different keys. Verify during Phase B7 RBL recompute; if duplicates exist, design a unification rule on `CustomerID__c`.

**Action items implied:**

- **Phase A1** ✏️ — rewritten: legacy is canonical; standard FA + selected dependents are maintained in parity via scheduled Apex batch (no longer "suppress standard").
- **Phase A8** (new) — **enable `FinancialAccountRole` in Setup** before any parity batch run. This is a hard precondition; without it, the role-sync step throws.
- **Phase A9** (new) — **add an `IsParitySync__c` boolean** (or equivalent recursion-guard mechanism) on standard `FinancialAccount`, `FinancialAccountRole`, `Card`, `CardAgreement`, and `ResidentialLoanApplication` so that any future trigger on those objects can detect and skip machine-written rows.
- **Phase A10** (new) — **build `FscFinancialAccountParityBatch`** (`Database.Batchable<sObject>` + `Schedulable`):
   - reads `FinServ__FinancialAccount__c WHERE SystemModstamp > :LAST_RUN_AT`
   - upserts standard `FinancialAccount` keyed by external ID (a custom `LegacyId__c` on standard FA)
   - upserts `FinancialAccountRole` from `FinServ__FinancialAccountRole__c`
   - synthesizes `Card` + `CardAgreement` for Credit Cards, `ResidentialLoanApplication` for retail mortgages (gated on Q3)
   - sets `IsParitySync__c = TRUE` on every write
   - exposes a `runOnDemand()` AuraEnabled method for demo prep
- **Phase A11** (new) — **schedule the batch hourly** via `System.schedule('FscFinancialAccountParityHourly', '0 0 * * * ?', new FscFinancialAccountParityBatch.Scheduler())`. Document override procedure for demo-day forcing.
- **Phase A12** (new) — **test class** `FscFinancialAccountParityBatchTest` covering: deposit FA → standard FA, role mirror, credit-card → Card+CardAgreement synthesis, mortgage → RLA synthesis, idempotency (re-running with no changes does no work), recursion guard (a write to standard FA does not loop). Target ≥85% coverage on the batch class.
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
