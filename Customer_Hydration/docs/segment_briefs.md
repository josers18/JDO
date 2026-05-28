# Phase 2 Segment Briefs — Cumulus Bank Demo Audiences

21 Data Cloud segments published to `jdo-uqj0jr` against `Account_demo__dlm`. Every segment is filtered to `External_ID_c__c contains "HYDRATE-"` (auto-injected at load time) so it never matches the org's pre-existing seed accounts — only Phase 1-hydrated demo customers.

> **Phase 2.1 hot-fix (2026-05-22):** Persona-tier filter values were corrected to match the live `FinServ_ClientCategory_c__c` strings: `"Wealth"` → `"Wealth Management"`, `"Commercial"` → `"Commercial Banking"`. A new `HouseholdAll__seg` was added for the Household tier (3,424 hydrated rows that were uncaptured). Pre-fix, `WealthAll__seg` and `CommercialAll__seg` were matching 0 rows.
>
> **Phase 2.2 update (2026-05-22):** `WealthPreRetiree__seg` now uses an `age_in_range` rule that emits `ExactlyRelativeDateComparison` clauses (`PersonBirthdate__c` BEFORE `(now − 55y)` AND AFTER `(now − 65y)`). DC re-evaluates the relative dates at every publish, so the segment is self-correcting as the calendar advances — no annual YAML maintenance. The previous frozen anchors `1961-01-01 / 1971-01-01` are gone.
>
> **Phase 2.3 update (2026-05-22):** YAML schema gained `all_of` / `any_of` compound rules for arbitrary AND/OR nesting. `WealthPreRetiree__seg` now combines `FinServ_ClientCategory_c__c matches "Wealth Management"` AND the 55-65 age window — narrowed from "any tier aged 55-65" to "Wealth Management aged 55-65."
>
> **Phase 2.4 update (2026-05-24):** All 21 segments retargeted from `Account_demo__dlm` to the FSC-canonical `ssot__Account__dlm`. 5 custom fields (`External_ID_c__c`, `FinServ_ClientCategory_c__c`, `PersonBirthdate__c`, `FinServ_AnnualIncome_pc__c`, `FinServ_CreditScore_c__c`) were PATCH-added to `ssot__Account__dlm` and field-mapped from `Account_Home__dll`. Live populations match the previous run exactly.
>
> **Phase 2.6 update (2026-05-25):** `WealthPreRetiree__seg` reverted from `age_in_range` (relative-date) back to `date_in_range` (frozen anchors `1961-01-01 / 1971-01-01` for ages 55-65 in 2026). Live probe found `ExactlyRelativeDateComparison` is broken on Profile DMOs in v62.0 — both `before -55y` and `after -55y` returned identical 410-row counts (operator effectively ignored). The frozen-anchor approach requires an annual January YAML bump but produces correct membership today. The `age_*` rule translators are retained in `segments.py` for the day the underlying API works.
>
> **Phase 2.7 update (2026-05-25):** `Account_demo__dlm` decommissioned. The DMO + its DLO mapping (`Account_Home_map_Account_demo_1768840659722`) + its two segment-membership tables (`Account_demo_SM_*__dlm`, `Account_demo_SMH_*__dlm`) + the foreign `Demo_WT` UI segment that targeted it were all deleted. Only `ssot__Account__dlm` remains as the Account DMO for hydrated rows. Decommission order matters: foreign segments → membership tables → DMO (not the mapping — DC rejects mapping-delete when it's the DMO's only one). The DMO DELETE returned HTTP 500 client-side but completed server-side; verify with a follow-up GET (returns 404 on success).
>
> **Phase 3d update (2026-05-27):** The 5 placeholder lifecycle segments + 10 campaign-aligned segments below were rewritten to use real cross-DMO clauses. New `related_to` rule type in `customer_hydration/phase5/segments.py` emits a v62 `NumberAggregation` envelope (`count(related rows where filter) >= 1`, the API's idiom for SQL `EXISTS`). Cross-DMO joins resolve via `ssot__Account__dlm.ssot__Id__c` for Account-rooted DMOs (`ssot__FinancialAccount__dlm.CustomerID__c`) or via `ssot__IndividualId__c` for person-mediated DMOs (`ssot__CampaignMember__dlm`, `ssot__PersonLifeEvent__dlm`). v1.0 of this phase emitted `NestedAttribute`, which v62 rejected with `cannot determine model class of name`; live inspection of UI-built segments revealed the correct envelope (spec: `docs/superpowers/specs/2026-05-27-phase-3d-v1.2-numberaggregation-shape.md`). 15 segments DELETE-then-POST recreated via new `--recreate <pattern>` CLI flag (PATCH on Dynamic segments returns `ENTITY_SAVE_ERROR`). FinancialAccount has no Mortgage/HELOC/SBA/Treasury sub-type field — segments coarsen to the live `ssot__FinancialAccountType__c` enum (`Loans`, `Treasury Management`) with optional `text_contains ssot__Name__c` for name-based partitioning.
>
> **Phase 5 update (2026-05-27):** ~26 new field dimensions are now segment-eligible on `ssot__Account__dlm` after the cohort-aware DMO backfill. Notably: `FinServ__BranchCode__c` / `FinServ__BranchName__c` (joined to live BranchUnit via state-weighted assignment + canonical BranchUnitCustomer inheritance for ~144 accounts), 5 multipicklists (`InvestmentObjectives`, `PersonalInterests`, `CustomerSegment`, `MarketingSegment`, `FinancialInterests` — all now 100% populated), `Rating` / `Type` standard CRM fields populated on persons (was biz-only), `BillingStreet/City/State/PostalCode/Country` mirrored from `PersonMailing*` for the 25,370 person rows, and 8 person→biz parity fields (`InvestmentExperience`, `RiskTolerance`, `ServiceModel`, `BorrowingHistory`, `TimeHorizon`, etc.). Future segments can target any of these; current 21 segments are unaffected by the new fields. Audit + spec: `output/account-dmo-audit-2026-05-27/REPORT.md`, `docs/superpowers/specs/2026-05-27-phase-5-dmo-backfill-design.md`.

For per-segment **live member counts and last-publish timestamps**, run:
```bash
python hydrate.py dc-status --target-org jdo-uqj0jr
```
The Segments section of that output is the source of truth. The briefs below describe *intent and shape*; the org tells you the current state.

## How segments are organized

- **Persona base (5)** — broad audience pools, one per Cumulus client tier (Retail, Wealth Management, Small Business, Commercial Banking, Household). The foundation for any Cumulus campaign.
- **Lifecycle / sub-segments (6)** — narrower behavioral or stage-of-life cuts. Some are scoped tighter than the persona base; others are placeholders that will tighten as we hydrate Mortgage / HELOC / LifeEvent / etc. DMOs.
- **Campaign-aligned (10)** — pre-built audiences for ten in-flight Cumulus marketing programs. Each links to a `HYDRATE-CMP-NNN` Campaign record and currently scopes to its target persona; will tighten to CampaignMember-driven once that DMO is hydrated.

## Reading a brief

Each brief has two parts:

- **Marketing brief** — Persona, use case, target audience, suggested activation channels, refresh cadence.
- **Technical implementation** — `apiName`, target DMO, parsed filter expression, `linked_campaign` (where set), and notes on placeholders or join paths still to come.

Two universal facts apply to all 20:

- **Target DMO:** `Account_demo__dlm` (FSC + Person Accounts org — a single Account row represents each customer)
- **`segmentType`:** `Dynamic`
- **`publishSchedule`:** `NoRefresh` (Dynamic segments don't accept other values via REST; the YAML's `publish_schedule` field is informational only)

Filter expressions below are **rendered for humans** — the live-API DSL uses `LogicalComparison.and` wrapping the HYDRATE clause and the user clause(s).

---

## Persona Base (5)

### `RetailAll__seg` — Retail Customers

**Marketing brief**
- **Persona:** Retail (consumer banking)
- **Use case:** The "all hydrated retail customers" foundation. Use as a parent audience for any retail-only campaign, or as a denominator for retail-share metrics.
- **Target:** Every Person Account customer flagged `FinServ__ClientCategory__c = "Retail"` in CRM.
- **Suggested channels:** Email, SMS, Mobile push, Marketing Cloud journeys, Paid social via activation targets.
- **Refresh cadence:** Hourly (intended; technically NoRefresh on Dynamic segments — see "How to refresh" below).

**Technical implementation**
- `apiName`: `RetailAll__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"`
- DSL operator: `text_equals` → `TextComparison "matches"`

---

### `WealthAll__seg` — Wealth Management Clients

**Marketing brief**
- **Persona:** Wealth (private banking, advised investing)
- **Use case:** Foundation audience for all wealth-segment messaging — RM-led outreach, advisor newsletters, white-glove digital experiences.
- **Target:** Every Person Account customer flagged `FinServ__ClientCategory__c = "Wealth"` in CRM.
- **Suggested channels:** RM-curated email, LinkedIn, in-app messaging, white-glove direct mail.
- **Refresh cadence:** Hourly (intended).

**Technical implementation**
- `apiName`: `WealthAll__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"`

---

### `SmbAll__seg` — Small Business Clients

**Marketing brief**
- **Persona:** Small / Medium Business (owner-operator banking)
- **Use case:** Reach all hydrated SMB business Accounts for products like SBA loans, business checking, merchant services, payroll.
- **Target:** Every Account flagged `FinServ__ClientCategory__c = "Small Business"`.
- **Suggested channels:** Email, LinkedIn, paid search retargeting, branch outreach via account team.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `SmbAll__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Small Business"`

---

### `CommercialAll__seg` — Commercial Banking Clients

**Marketing brief**
- **Persona:** Commercial / Mid-market (RM-managed, complex banking)
- **Use case:** Foundation audience for commercial banking outreach — treasury services, capital markets, ABL, syndicated lending.
- **Target:** Every Account flagged `FinServ__ClientCategory__c = "Commercial Banking"`.
- **Suggested channels:** RM-curated outreach, conference invites, executive briefings, gated thought-leadership content.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `CommercialAll__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"`

---

### `HouseholdAll__seg` — Household Customers

**Marketing brief**
- **Persona:** Household (multi-product retail relationships — joint accounts, shared mortgages, family-tier banking)
- **Use case:** Foundation audience for household-tier programs that target the relationship rather than the individual — joint financial planning, family bundles, household-level retention.
- **Target:** Every Person Account flagged `FinServ__ClientCategory__c = "Household"`.
- **Suggested channels:** Email, mobile in-app, RM cadence for top-tier households, direct mail with household-relevant offers.
- **Refresh cadence:** Hourly (intended).

**Technical implementation**
- `apiName`: `HouseholdAll__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Household"`

---

## Lifecycle / Sub-segments (6)

### `WealthPreRetiree__seg` — Wealth Pre-Retirees (55-65)

**Marketing brief**
- **Persona:** Wealth Management clients in the pre-retirement window
- **Use case:** Retirement readiness conversations — Social Security optimization, distribution planning, rollover consolidation, healthcare cost modeling. The highest-engagement segment for Wealth retention and AUM growth.
- **Target:** Wealth Management Person Accounts born between 1961-01-01 and 1971-01-01 (ages 55-65 during demo year 2026).
- **Suggested channels:** Personalized RM outreach, retirement-planning webinars, in-branch consultation invitations, premium content.
- **Refresh cadence:** Daily (intended). **Annual maintenance required:** bump the date anchors by one year each January as the demo year advances.

**Technical implementation**
- `apiName`: `WealthPreRetiree__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND (`FinServ_ClientCategory_c__c matches "Wealth Management"` AND (`PersonBirthdate__c after "1961-01-01"` AND `PersonBirthdate__c before "1971-01-01"`))
- DSL: `all_of` → `LogicalComparison.and` of [`text_equals "Wealth Management"`, `date_in_range 1961-01-01..1971-01-01`]. `date_in_range` nests two `DateComparison` clauses.
- **Why frozen dates instead of `age_in_range`:** `ExactlyRelativeDateComparison` was attempted in Phase 2.2/2.3 for self-correcting age math. Live probing (Phase 2.6, 2026-05-25) showed both `before -55y` and `after -55y` operators returned identical 410-row counts on `ssot__Account__dlm` — the operator was effectively ignored. Reverted to frozen anchors as the working alternative. The `age_in_range` translator code is still in `segments.py` for the day the API works correctly. See `dc-connect-api` skill "Known endpoint quirks → Segments → ExactlyRelativeDateComparison" for details.

---

### `RetailFamilyWithMortgage__seg` — Retail Family-Building with Mortgage

**Marketing brief**
- **Persona:** Retail — life-stage cut for family-formation households with at least one Loan-type account
- **Use case:** Cross-sell opportunities — HELOC pre-approval, life insurance, 529 college savings, refinance offers. High intent for life-event-tied financial products.
- **Target:** Retail customers with at least one `ssot__FinancialAccount__dlm` row whose `ssot__FinancialAccountType__c = "Loans"`. Coarsens "Mortgage" to the live `Loans` bucket — the org has no Mortgage sub-type field.
- **Suggested channels:** Email, mobile in-app, direct mail with personalized offer.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `RetailFamilyWithMortgage__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` AND `EXISTS(ssot__FinancialAccount__dlm.CustomerID__c = ssot__Account__dlm.ssot__Id__c WHERE ssot__FinancialAccountType__c = "Loans")`
- DSL: `all_of` of `text_equals` + `related_to` (Phase 3d v1.2 — emits `NumberAggregation count(related) >= 1`)
- **Coarsening note:** A future phase could add `text_contains ssot__Name__c "Mortgage"` if loan names disambiguate; for v1.2 the segment captures all 8,099 live `Loans`-bucket FinancialAccount rows.

---

### `RetailHelocDrawn__seg` — Retail HELOC Drawn 50%+

**Marketing brief**
- **Persona:** Retail — refi prospects with a HELOC-named loan
- **Use case:** Refinance / consolidation campaigns. HELOC customers are prime targets for term-loan conversion or rate-lock products.
- **Target:** Retail customers with at least one Loan-type FinancialAccount whose `ssot__Name__c` contains "HELOC". The drawn-ratio dimension was dropped — the live DMO has no `Drawn_Ratio` field.
- **Suggested channels:** Email, RM-led phone outreach, in-app banner offer.
- **Refresh cadence:** Daily (intended). Linked to Campaign `HYDRATE-CMP-001` (HELOC Refi Outreach Q2).

**Technical implementation**
- `apiName`: `RetailHelocDrawn__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` AND `EXISTS(FinancialAccount.CustomerID = Account.ssot__Id WHERE Type = "Loans" AND Name contains "HELOC")`
- `linked_campaign`: `HYDRATE-CMP-001`
- DSL: nested `all_of` inside `related_to.where:` — proves the `_annotate_inner_filter` recursion through `LogicalComparison`.
- **Note:** If `ssot__Name__c contains "HELOC"` returns 0 rows, fall back to the same shape as `RetailFamilyWithMortgage__seg` (Loans bucket only). Verify post-recreate count vs. baseline ~25K Retail.

---

### `SmbWithSba__seg` — SMB Owners with SBA Loan

**Marketing brief**
- **Persona:** Small Business — narrowed to clients with an SBA-named loan
- **Use case:** Cross-sell merchant services, payroll, business credit cards, treasury sweeps to a captive small-business population.
- **Target:** SMB clients with at least one Loan-type FinancialAccount whose `ssot__Name__c` contains "SBA".
- **Suggested channels:** Email, LinkedIn, RM cadence, branch invitations.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `SmbWithSba__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Small Business"` AND `EXISTS(FinancialAccount.CustomerID = Account.ssot__Id WHERE Type = "Loans" AND Name contains "SBA")`
- DSL: same nested `all_of` shape as `RetailHelocDrawn__seg`.

---

### `CommercialWithTreasury__seg` — Commercial with Treasury Services

**Marketing brief**
- **Persona:** Commercial — already-engaged customers using Treasury Services
- **Use case:** Upsell to international payments, FX hedging, working capital optimization, or RM-led syndicated lending conversations. Lowest CAC commercial cross-sell.
- **Target:** Commercial clients with at least one `ssot__FinancialAccount__dlm` row whose `ssot__FinancialAccountType__c = "Treasury Management"` (243 live rows org-wide).
- **Suggested channels:** Direct RM, executive briefings, conference invites.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `CommercialWithTreasury__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"` AND `EXISTS(FinancialAccount.CustomerID = Account.ssot__Id WHERE Type = "Treasury Management")`
- DSL: `all_of` of `text_equals` + atomic `related_to`. Cleanest of the FinancialAccount segments — `Treasury Management` is a real enum value, no name-string fallback needed.

---

### `WealthRecentLifeEvent__seg` — Wealth with Recent Life Event (90d)

**Marketing brief**
- **Persona:** Wealth — clients who triggered a major life event in the last 90 days
- **Use case:** Highest-intent Wealth audience — life events (marriage, birth, inheritance, retirement, divorce) drive the largest near-term planning conversations and AUM movements.
- **Target:** Wealth clients with at least one `ssot__PersonLifeEvent__dlm` row dated within the last 90 days, joined via `IndividualId`.
- **Suggested channels:** Personalized RM outreach (highest priority), life-event-themed content, white-glove follow-up.
- **Refresh cadence:** Daily (intended) — life-event freshness is the whole point of this segment.

**Technical implementation**
- `apiName`: `WealthRecentLifeEvent__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"` AND `EXISTS(PersonLifeEvent.ssot__IndividualId__c = Account.ssot__IndividualId__c WHERE ssot__PersonLifeEventDateTime__c after <90d-ago>)`
- DSL: `all_of` + `related_to` with `via: ssot__IndividualId__c` AND `via_root: ssot__IndividualId__c` (both sides of the cross-DMO key are Individual, not Account.Id). Inner rule is `relative_date_after_days field=ssot__PersonLifeEventDateTime__c days=90`.
- **Probe-gated:** v62 `ExactlyRelativeDateComparison` was broken on Profile DMOs in Phase 2.6; the live probe (`output/phase3d/probe_latest.json`) re-tests this each weekly run. Translator emits relative-date when verdict = `RELATIVE_DATES_OK`, frozen `<today − 90d>` ISO anchor otherwise. Frozen-anchor mode requires weekly probe re-runs to stay current.

---

## Campaign-Aligned (10)

Each segment links to a `HYDRATE-CMP-NNN` campaign in CRM and AND-joins the persona filter with a real `EXISTS` clause on `ssot__CampaignMember__dlm` (Phase 3d v1.2 — `CampaignMember` is now hydrated and queryable).

**Resolved Campaign 18-char IDs** — the `linked_campaign` external IDs map to live SF Campaign IDs in this org:

| External ID | Live Campaign Id |
|---|---|
| `HYDRATE-CMP-001` | `701am00002A9aDaAAJ` |
| `HYDRATE-CMP-002` | `701am00002A9aDbAAJ` |
| `HYDRATE-CMP-003` | `701am00002A9aDcAAJ` |
| `HYDRATE-CMP-004` | `701am00002A9aDdAAJ` |
| `HYDRATE-CMP-005` | `701am00002A9aDeAAJ` |
| `HYDRATE-CMP-006` | `701am00002A9aDfAAJ` |
| `HYDRATE-CMP-007` | `701am00002A9aDgAAJ` |
| `HYDRATE-CMP-008` | `701am00002A9aDhAAJ` |
| `HYDRATE-CMP-009` | `701am00002A9aDiAAJ` |
| `HYDRATE-CMP-010` | `701am00002A9aDjAAJ` |

**Join path:** All 10 segments join `Account.ssot__IndividualId__c = CampaignMember.ssot__IndividualId__c`. v1.1 of this phase considered routing commercial campaigns through `BusinessAccountId__c` instead, but in `jdo-uqj0jr` commercial accounts are hydrated as Person Accounts (so Individual is the only common key) and `BusinessAccountId__c` proved non-queryable for these rows. The v1.2 commit collapses both paths to `IndividualId__c`, captured inline in the YAML descriptions.

### `CmpHelocRefiOutreach__seg` — HELOC Refi Outreach Q2

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-001` — Q2 HELOC refinance outreach
- **Persona:** Retail
- **Use case:** Q2 refi drive — targeted HELOC customers offered fixed-rate term loan at promotional spread. Companion to `RetailHelocDrawn__seg`.
- **Suggested channels:** Email (primary), in-app banner, mobile push.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `CmpHelocRefiOutreach__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` AND `EXISTS(CampaignMember.ssot__IndividualId__c = Account.ssot__IndividualId__c WHERE ssot__CampaignId__c = "701am00002A9aDaAAJ")`
- `linked_campaign`: `HYDRATE-CMP-001` → `701am00002A9aDaAAJ`

---

### `CmpAutoLoanRateDrop__seg` — Auto Loan Rate Drop Promo

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-002` — Auto-loan rate drop promotion
- **Persona:** Retail
- **Use case:** Refinance auto-loan campaign tied to Fed rate-cut cycle. Time-sensitive offer with promo APR for qualifying customers.
- **Suggested channels:** Email, mobile push, paid search retargeting.

**Technical implementation**
- `apiName`: `CmpAutoLoanRateDrop__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDbAAJ")`
- `linked_campaign`: `HYDRATE-CMP-002` → `701am00002A9aDbAAJ`

---

### `CmpPremierCheckingOnboarding__seg` — Premier Checking Onboarding

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-003` — Premier Checking onboarding cohort
- **Persona:** Retail
- **Use case:** Welcome / activation journey for newly-opened Premier Checking customers — drive direct deposit setup, mobile app install, debit card activation, first deposit.
- **Suggested channels:** Email drip (4-touch journey), in-app prompts, optional welcome call.

**Technical implementation**
- `apiName`: `CmpPremierCheckingOnboarding__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDcAAJ")`
- `linked_campaign`: `HYDRATE-CMP-003` → `701am00002A9aDcAAJ`

---

### `CmpWealthTaxStrategyWebinar__seg` — Wealth Tax Strategy Webinar 2026

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-004` — 2026 tax strategy webinar invitation
- **Persona:** Wealth
- **Use case:** RM-curated invite list for an exclusive tax-planning webinar. High-touch, expected to seed Q1 advisor conversations.
- **Suggested channels:** RM-co-branded email, calendar attachment, post-event follow-up sequence.

**Technical implementation**
- `apiName`: `CmpWealthTaxStrategyWebinar__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDdAAJ")`
- `linked_campaign`: `HYDRATE-CMP-004` → `701am00002A9aDdAAJ`

---

### `CmpWealthEstatePlanningRoundtable__seg` — Wealth Estate Planning Roundtable

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-005` — Estate-planning roundtable invitation
- **Persona:** Wealth
- **Use case:** In-person or hybrid roundtable for high-net-worth clients with estate-planning expert panel. RM-led nomination model.
- **Suggested channels:** Personalized RM email, printed invitation, follow-up with attorney referral list.

**Technical implementation**
- `apiName`: `CmpWealthEstatePlanningRoundtable__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDeAAJ")`
- `linked_campaign`: `HYDRATE-CMP-005` → `701am00002A9aDeAAJ`

---

### `CmpSbaAwareness__seg` — SBA Awareness Q1 2026

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-006` — Q1 SBA loan awareness campaign
- **Persona:** Small Business
- **Use case:** Top-of-funnel SBA awareness — educate small-business clients about loan eligibility, application process, partner referrals.
- **Suggested channels:** Email, LinkedIn (paid + organic), business-podcast sponsorship retargeting.

**Technical implementation**
- `apiName`: `CmpSbaAwareness__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Small Business"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDfAAJ")`
- `linked_campaign`: `HYDRATE-CMP-006` → `701am00002A9aDfAAJ` — SMB hydration writes Person Accounts in this org, so the IndividualId path catches the SMB owners.

---

### `CmpTreasuryModernizationBrief__seg` — Treasury Modernization Brief

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-007` — Treasury modernization white paper
- **Persona:** Commercial
- **Use case:** Gated white paper offering for commercial CFOs / treasurers — outlines automation, FX hedging, fraud-prevention tooling. Lead-scoring follow-up for sales conversations.
- **Suggested channels:** Email, LinkedIn InMail, executive-briefing program enrollment.

**Technical implementation**
- `apiName`: `CmpTreasuryModernizationBrief__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDgAAJ")`
- `linked_campaign`: `HYDRATE-CMP-007` → `701am00002A9aDgAAJ` — commercial accounts are hydrated as Person Accounts here, so IndividualId is the operative join path (BusinessAccountId path was tried in v1.1 and proved non-queryable).

---

### `CmpCommercialRmRoundtable__seg` — Commercial RM Roundtable

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-008` — Commercial RM-curated roundtable
- **Persona:** Commercial
- **Use case:** Invite-only roundtable for top commercial accounts — peer networking, panel with industry analysts, RM relationship-deepening.
- **Suggested channels:** Personalized RM email, calendar holds, dedicated event microsite.

**Technical implementation**
- `apiName`: `CmpCommercialRmRoundtable__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDhAAJ")`
- `linked_campaign`: `HYDRATE-CMP-008` → `701am00002A9aDhAAJ` — same IndividualId path as `CmpTreasuryModernizationBrief__seg`.

---

### `CmpMultiPersonaSpringNewsletter__seg` — Multi-Persona Spring Newsletter

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-009` — Spring quarterly newsletter
- **Persona:** Mixed (all-hydrated audience)
- **Use case:** Quarterly brand newsletter covering market commentary, product updates, community impact. Broadest reach in the campaign suite.
- **Suggested channels:** Email (primary), web hub, optional print mailer for Wealth/Commercial top-tier subset.
- **Refresh cadence:** Weekly (intended) — broadcast newsletter.

**Technical implementation**
- `apiName`: `CmpMultiPersonaSpringNewsletter__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDiAAJ")`
- DSL: bare top-level `related_to` (no persona `text_equals` wrapper — any persona qualifies). One of two segments in the codebase that doesn't `all_of`-wrap a persona filter.
- `linked_campaign`: `HYDRATE-CMP-009` → `701am00002A9aDiAAJ`
- **Note:** Phase 3d v1.1 originally proposed `any_of` of two `related_to` clauses (IndividualId + BusinessAccountId paths). v1.2 collapsed to the IndividualId path only because the BusinessAccountId join proved non-queryable in this org's CampaignMember rows.

---

### `CmpMobileBankingAdoption__seg` — Mobile Banking Adoption

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-010` — Mobile banking adoption push
- **Persona:** Retail
- **Use case:** Drive mobile-app installs and login frequency. Companion to checking onboarding but targeted at retail customers who haven't yet adopted mobile.
- **Suggested channels:** Email, SMS, in-branch staff prompt, ATM screen takeover.

**Technical implementation**
- `apiName`: `CmpMobileBankingAdoption__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` AND `EXISTS(CampaignMember via IndividualId WHERE ssot__CampaignId__c = "701am00002A9aDjAAJ")`
- `linked_campaign`: `HYDRATE-CMP-010` → `701am00002A9aDjAAJ`

---

## Roadmap — what tightens as more DMOs hydrate

Phase 3d (2026-05-27) closed all 16 cross-DMO entries below. Remaining roadmap is product-driven, not DMO-driven:

| Future hydration… | Could tighten… |
|---|---|
| `FinancialAccount` Mortgage / HELOC / SBA sub-type fields | `RetailFamilyWithMortgage`, `RetailHelocDrawn`, `SmbWithSba` (currently coarsen to `Loans` bucket + name-string fallback) |
| `Drawn_Ratio` / utilization Calculated Insight on FinancialAccount | `RetailHelocDrawn` (currently has no drawn-ratio dimension) |
| `BusinessAccountId__c` made query-eligible on CampaignMember | `CmpTreasuryModernizationBrief`, `CmpCommercialRmRoundtable`, `CmpMultiPersonaSpringNewsletter` (currently use IndividualId-only join) |

To migrate a segment after editing `config/segments.yaml`, run:

```bash
python hydrate.py create-segments --target-org jdo-uqj0jr --recreate '<glob>'
```

The `--recreate` flag (Phase 3d v1.0 Task 5) DELETEs the live segment then POSTs the new definition, since PATCH on Dynamic segments returns `ENTITY_SAVE_ERROR`. 404 on DELETE is treated as idempotent success.

## How to refresh segment membership

Dynamic segments accept `publishSchedule: "NoRefresh"` only via REST. Two ways to get a fresh membership count:

1. **Auto-publish on data change** — Dynamic segments publish when their source DMO changes. Trigger a Full Refresh on the foundational SalesforceDotCom_Home streams (see `docs/foundational_streams.md` and the `dc-stream-full-refresh-via-ui` Claude skill) so the Account_demo DMO sees the latest hydrated rows. Segments will recompute on next publish window.
2. **Manual publish in DC UI** — Open the segment in Data Cloud, click "Publish" / "Activate". Bypasses the REST policy via the Aura controller.

Verify post-refresh:
```bash
python hydrate.py dc-status --target-org jdo-uqj0jr
```

## See also

- `config/segments.yaml` — canonical YAML inventory and rule DSL
- `docs/foundational_streams.md` — 30 streams to Full-Refresh after Phase 1 hydration
- `customer_hydration/phase5/segments.py` — DSL translator and idempotent orchestrator
- `customer_hydration/phase5/data_cloud.py` — REST methods for segment CRUD + status
- `docs/superpowers/specs/2026-05-22-phase-2-streams-and-segments-design.md` — Phase 2 spec
