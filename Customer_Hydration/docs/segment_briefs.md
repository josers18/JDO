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
- **Persona:** Retail — life-stage cut for family-formation households with active mortgages
- **Use case:** Cross-sell opportunities — HELOC pre-approval, life insurance, 529 college savings, refinance offers. High intent for life-event-tied financial products.
- **Target:** *Intended:* Retail customers with an active mortgage on `FinServ__FinancialAccount__c`. *Currently:* All Retail customers (placeholder).
- **Suggested channels:** Email, mobile in-app, direct mail with personalized offer.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `RetailFamilyWithMortgage__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` *(placeholder — see below)*
- **Placeholder note:** Will tighten once the Mortgage / FinancialAccount DMO is hydrated and joinable. Anticipated criteria: `FinancialAccount.Type = "Mortgage"` AND `Status = "Active"` joined via party model. Until then, all Retail accounts match.

---

### `RetailHelocDrawn__seg` — Retail HELOC Drawn 50%+

**Marketing brief**
- **Persona:** Retail — high-intent refi prospects with HELOC utilization above 50%
- **Use case:** Refinance / consolidation campaigns. High-utilization HELOC customers are prime targets for term-loan conversion or rate-lock products.
- **Target:** *Intended:* Retail customers whose HELOC balance / limit ratio ≥ 0.5. *Currently:* All Retail customers (placeholder).
- **Suggested channels:** Email, RM-led phone outreach, in-app banner offer.
- **Refresh cadence:** Daily (intended). Linked to Campaign `HYDRATE-CMP-001` (HELOC Refi Outreach Q2).

**Technical implementation**
- `apiName`: `RetailHelocDrawn__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"` *(placeholder)*
- `linked_campaign`: `HYDRATE-CMP-001`
- **Placeholder note:** Will tighten once HELOC `FinancialAccount` DMO is hydrated with balance + limit fields. Anticipated criteria: a Calculated Insight `HelocUtilization >= 0.5`.

---

### `SmbWithSba__seg` — SMB Owners with SBA Loan

**Marketing brief**
- **Persona:** Small Business — narrowed to existing SBA-loan customers
- **Use case:** Cross-sell merchant services, payroll, business credit cards, treasury sweeps to a captive small-business population.
- **Target:** *Intended:* SMB clients with a `FinancialAccount` of subtype "SBA Loan". *Currently:* All SMB clients (placeholder).
- **Suggested channels:** Email, LinkedIn, RM cadence, branch invitations.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `SmbWithSba__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Small Business"` *(placeholder)*
- **Placeholder note:** Will tighten once SBA-flagged FinancialAccount DMO is hydrated.

---

### `CommercialWithTreasury__seg` — Commercial with Treasury Services

**Marketing brief**
- **Persona:** Commercial — already-engaged customers using Treasury Services
- **Use case:** Upsell to international payments, FX hedging, working capital optimization, or RM-led syndicated lending conversations. Lowest CAC commercial cross-sell.
- **Target:** *Intended:* Commercial clients with a Treasury Services product flag. *Currently:* All Commercial clients (placeholder).
- **Suggested channels:** Direct RM, executive briefings, conference invites.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `CommercialWithTreasury__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"` *(placeholder)*
- **Placeholder note:** Will tighten once Treasury Services product DMO is hydrated.

---

### `WealthRecentLifeEvent__seg` — Wealth with Recent Life Event (90d)

**Marketing brief**
- **Persona:** Wealth — clients who triggered a major life event in the last 90 days
- **Use case:** Highest-intent Wealth audience — life events (marriage, birth, inheritance, retirement, divorce) drive the largest near-term planning conversations and AUM movements.
- **Target:** *Intended:* Wealth clients with a `PersonLifeEvent` record dated within the last 90 days. *Currently:* All Wealth clients (placeholder).
- **Suggested channels:** Personalized RM outreach (highest priority), life-event-themed content, white-glove follow-up.
- **Refresh cadence:** Daily (intended) — life-event freshness is the whole point of this segment.

**Technical implementation**
- `apiName`: `WealthRecentLifeEvent__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"` *(placeholder)*
- **Placeholder note:** Will tighten once `PersonLifeEvent_Home` stream + DMO are hydrated. Anticipated criteria: `LifeEventDate within last 90 days` joined via party model.

---

## Campaign-Aligned (10)

Each segment below scopes to the persona of its target audience and links to a `HYDRATE-CMP-NNN` campaign in CRM. Once the `CampaignMember` DMO is hydrated and joinable, these will tighten to "members of campaign X" rather than "all customers in persona Y." Until then, the persona filter is the operative scope.

### `CmpHelocRefiOutreach__seg` — HELOC Refi Outreach Q2

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-001` — Q2 HELOC refinance outreach
- **Persona:** Retail
- **Use case:** Q2 refi drive — targeted HELOC customers offered fixed-rate term loan at promotional spread. Companion to `RetailHelocDrawn__seg`.
- **Suggested channels:** Email (primary), in-app banner, mobile push.
- **Refresh cadence:** Daily (intended).

**Technical implementation**
- `apiName`: `CmpHelocRefiOutreach__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"`
- `linked_campaign`: `HYDRATE-CMP-001`

---

### `CmpAutoLoanRateDrop__seg` — Auto Loan Rate Drop Promo

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-002` — Auto-loan rate drop promotion
- **Persona:** Retail
- **Use case:** Refinance auto-loan campaign tied to Fed rate-cut cycle. Time-sensitive offer with promo APR for qualifying customers.
- **Suggested channels:** Email, mobile push, paid search retargeting.

**Technical implementation**
- `apiName`: `CmpAutoLoanRateDrop__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"`
- `linked_campaign`: `HYDRATE-CMP-002`

---

### `CmpPremierCheckingOnboarding__seg` — Premier Checking Onboarding

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-003` — Premier Checking onboarding cohort
- **Persona:** Retail
- **Use case:** Welcome / activation journey for newly-opened Premier Checking customers — drive direct deposit setup, mobile app install, debit card activation, first deposit.
- **Suggested channels:** Email drip (4-touch journey), in-app prompts, optional welcome call.

**Technical implementation**
- `apiName`: `CmpPremierCheckingOnboarding__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"`
- `linked_campaign`: `HYDRATE-CMP-003`

---

### `CmpWealthTaxStrategyWebinar__seg` — Wealth Tax Strategy Webinar 2026

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-004` — 2026 tax strategy webinar invitation
- **Persona:** Wealth
- **Use case:** RM-curated invite list for an exclusive tax-planning webinar. High-touch, expected to seed Q1 advisor conversations.
- **Suggested channels:** RM-co-branded email, calendar attachment, post-event follow-up sequence.

**Technical implementation**
- `apiName`: `CmpWealthTaxStrategyWebinar__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"`
- `linked_campaign`: `HYDRATE-CMP-004`

---

### `CmpWealthEstatePlanningRoundtable__seg` — Wealth Estate Planning Roundtable

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-005` — Estate-planning roundtable invitation
- **Persona:** Wealth
- **Use case:** In-person or hybrid roundtable for high-net-worth clients with estate-planning expert panel. RM-led nomination model.
- **Suggested channels:** Personalized RM email, printed invitation, follow-up with attorney referral list.

**Technical implementation**
- `apiName`: `CmpWealthEstatePlanningRoundtable__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Wealth Management"`
- `linked_campaign`: `HYDRATE-CMP-005`

---

### `CmpSbaAwareness__seg` — SBA Awareness Q1 2026

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-006` — Q1 SBA loan awareness campaign
- **Persona:** Small Business
- **Use case:** Top-of-funnel SBA awareness — educate small-business clients about loan eligibility, application process, partner referrals.
- **Suggested channels:** Email, LinkedIn (paid + organic), business-podcast sponsorship retargeting.

**Technical implementation**
- `apiName`: `CmpSbaAwareness__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Small Business"`
- `linked_campaign`: `HYDRATE-CMP-006`

---

### `CmpTreasuryModernizationBrief__seg` — Treasury Modernization Brief

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-007` — Treasury modernization white paper
- **Persona:** Commercial
- **Use case:** Gated white paper offering for commercial CFOs / treasurers — outlines automation, FX hedging, fraud-prevention tooling. Lead-scoring follow-up for sales conversations.
- **Suggested channels:** Email, LinkedIn InMail, executive-briefing program enrollment.

**Technical implementation**
- `apiName`: `CmpTreasuryModernizationBrief__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"`
- `linked_campaign`: `HYDRATE-CMP-007`

---

### `CmpCommercialRmRoundtable__seg` — Commercial RM Roundtable

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-008` — Commercial RM-curated roundtable
- **Persona:** Commercial
- **Use case:** Invite-only roundtable for top commercial accounts — peer networking, panel with industry analysts, RM relationship-deepening.
- **Suggested channels:** Personalized RM email, calendar holds, dedicated event microsite.

**Technical implementation**
- `apiName`: `CmpCommercialRmRoundtable__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Commercial Banking"`
- `linked_campaign`: `HYDRATE-CMP-008`

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
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `External_ID_c__c has value`
- DSL: `text_has_value` (presence check, no `values` array)
- `linked_campaign`: `HYDRATE-CMP-009`
- **Note:** Effectively matches every hydrated account — the `has value` op + the auto-injected HYDRATE clause are both presence checks on the same field, so this is "all hydrated rows."

---

### `CmpMobileBankingAdoption__seg` — Mobile Banking Adoption

**Marketing brief**
- **Campaign:** `HYDRATE-CMP-010` — Mobile banking adoption push
- **Persona:** Retail
- **Use case:** Drive mobile-app installs and login frequency. Companion to checking onboarding but targeted at retail customers who haven't yet adopted mobile.
- **Suggested channels:** Email, SMS, in-branch staff prompt, ATM screen takeover.

**Technical implementation**
- `apiName`: `CmpMobileBankingAdoption__seg`
- Filter: `External_ID_c__c contains "HYDRATE-"` AND `FinServ_ClientCategory_c__c matches "Retail"`
- `linked_campaign`: `HYDRATE-CMP-010`

---

## Roadmap — what tightens as more DMOs hydrate

| When this DMO is hydrated… | These segments tighten from "all persona X" to a real cut |
|---|---|
| `FinancialAccount` (Mortgage subtype) | `RetailFamilyWithMortgage` |
| `FinancialAccount` (HELOC subtype) + utilization CI | `RetailHelocDrawn`, `CmpHelocRefiOutreach` |
| `FinancialAccount` (SBA subtype) | `SmbWithSba`, `CmpSbaAwareness` |
| `FinancialAccount` (Treasury subtype) | `CommercialWithTreasury`, `CmpTreasuryModernizationBrief` |
| `PersonLifeEvent` | `WealthRecentLifeEvent` |
| `CampaignMember` | All 10 `Cmp*` segments — tighten from persona → campaign membership |

When those land, edit `config/segments.yaml`, re-run `python hydrate.py create-segments --target-org jdo-uqj0jr --allow-production`. Existing segments will be skipped (Dynamic segments can't be patched per DC API). To replace, manually delete in the DC UI first, then re-create.

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
