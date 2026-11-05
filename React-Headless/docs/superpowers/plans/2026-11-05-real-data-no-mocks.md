# Real data, no mocks: inventory and plan

**Date:** 2026-11-05
**Rule (PRODUCT.md):** nothing on screen is mocked or hardcoded. If data is missing, source it from what we have or generate it into the org or Snowflake and query it. Never fake it in the UI. When a source is truly unavailable, show an honest empty or unavailable state.
**Scope:** ReactRetail, ReactWealth, ReactCommercial and `_shared`. The ReactHeadless harness is out of scope.

Every finding below was checked against the code on `main` at `e29c908c6`. "All 3" means the same code is copied into each bundle.

## Current state

All three bundles set `core`, `dataCloud` and `agentforce` to `real` in `src/data/dataSource.ts`, so no `resolve()` mock arm is live today. The fake content users actually see now comes from the **real** fetchers, in the form of seeded sparklines, typed-in deltas and `??` fallbacks, plus a few components that default to fixtures.

> Correction to the first-pass inventory: `useMockAssistant` has **no consumers** (dead code, not "always active"), and `series()` is used only inside the mock fixtures. The live sparklines come from `seedTrend()` in `homeDataReal.ts` instead.

---

## P0: fake content visible today

### 1. KPI sparklines and deltas are invented (all 3; highest visibility)

- `home/homeDataReal.ts`: `seedTrend(seed, end)` (Retail :48, Wealth :50, Commercial :54) builds an 8-point wobble from a string hash that ramps up into the real current value. It feeds **every** KPI tile except Call Tone (Retail 9 tiles, Wealth 13, Commercial 13) and all 4 Pipeline Movement cards.
- The `deltaPct` values are typed-in constants: pipeline 0.041 / 0.061 / 0.051, opps 0.03, leads 0.08, at-risk -0.02, $5M+ targets 0.11, goals 0.02, and pipeline movement `0.06 // flat positive placeholder`.
- The only honest series is **Call Tone Sliding**, which uses `gong.weekly` from real 8-week counts.

**Make it real:**
- **Data Cloud tiles** (held-away, uplift, home equity, plans at risk, business owners, upgrades, concentrated, credit watch, outlook, leadership, ESG, upmarket, branch risk, at-risk): the `BT_*` DMOs are monthly or weekly snapshots, so query the last 8 `profile_*` periods grouped by period. That gives a true series, and delta = last vs. prior. Follow the `gong.weekly` pattern already in the code.
- **CRM tiles** (pipeline, opps, leads, cases, goals) and **pipeline movement by stage**: there is no history in the org. **Generate it:** a new `Cockpit_KPI_Snapshot__c` (Owner/User, Persona, Metric Key, Value, Snapshot Date), a nightly `Schedulable` Apex that writes one row per banker per metric, and a one-time backfill of 8 weeks reconstructed from `CreatedDate` / `CloseDate` / `ClosedDate` / `OpportunityFieldHistory` for stage. The client reads the series through GraphQL.
- **Until a series has ≥2 real points**, render the tile with **no sparkline and no delta**, never a seeded one. Delete `seedTrend` from all 3 bundles.

> **Done 2026-11-05 (step 2).** `seedTrend` and every typed-in `deltaPct` are gone. `_shared/src/data/kpiTrend.ts` adds `perPeriodSql`, which lifts a tile's `profile_x__c = (SELECT MAX…)` pin into `GROUP BY` period with the newest 8 kept. The last point therefore always equals the tile's value. History is wired for Home Equity (3 quarters), Plans at Risk, Upgrade Prospects, Held-Away, Credit Watch, Outlook, Leadership, Upmarket and Consolidate-Branch. Each cockpit also gains a **Net Flow** tile, now in its vitals row: weekly credits − debits from Snowflake `FINANCIAL_TRANSACTIONS` (`Financial_Transactions_BT_Snow__dll`) across the book. Retail counts Personal accounts, Commercial counts Business accounts and Wealth counts both. It has no delta because the sign flips. `ACCOUNT_DAILY_BALANCE` is a running sum from $0 on 2026-07-24, so it measures net flow, not a held balance. CRM tiles, Pipeline Movement and Modeled Uplift show no sparkline or delta until step 4. ESG Movers has no period series.

### 2. Cross-sell white-space grid is entirely fixture data (Retail only)

- `_shared/src/components/home/CrossSellWhitespace.tsx:230`: `data = MOCK_DATA` default. Retail `HomePage.tsx:1775` renders it with **no `data` prop**, so users see invented clients (Sarah Chen, Marcus Webb, Priya Nair, David Okafor), scores, reasons and estimated values.

**Make it real:**
- **Rows:** the top-N clients in the book by cross-sell propensity (the Claritas `pc.xsell` source already used in C360 `customerDataReal.ts:269`).
- **Owned cells:** FSC `FinServ__FinancialAccount__c` by `FinancialAccountType` per account.
- **White-space score and estimated value:** the propensity and uplift-offer DMOs already behind the "Modeled Uplift" KPI.
- Add a `fetchWhitespace()` to Retail `homeDataReal`, remove the `MOCK_*` constants and make `data` required.
- **Verify in-org first** that FinancialAccount type coverage is broad enough. If it isn't, generate holdings for the book (Snowflake generator → DC, or FSC records).

### 3. Signed-in identity is hardcoded (all 3)

- `home/HomeLayout.tsx`: `RAIL_USER = { name: 'Jose Sifontes', sub: 'Retail|Wealth|Commercial · Cumulus FS' }` (Retail :166, Wealth :42, Commercial :43) is the rail footer for every user.
- `_shared/src/components/home/EmailModal.tsx:10`: `bankerSignOff = 'Best,\nJose Sifontes\nCumulus Financial Services'`.

**Make it real:** `homeDataReal` already returns `bankerName`. Add a small shared `fetchCurrentUser()` (GraphQL `User` by `SFDC_ENV` user id: Name, Title, plus the Organization name) and use it for the rail footer and the sign-off. The persona label stays static, because it names the app and isn't data.

### 4. Customer 360 health falls back to invented scores (all 3)

In `personas/customer/customerDataReal.ts` (Retail :94–154, Wealth/Commercial :99–161):

- `healthScore = csat ?? 78`
- Engagement `?? 60`
- Every sub-score trend is hardcoded (`'up'` / `'flat'`) or inferred from one tone.
- "Financial" is `(Deposits+Investments)/50000`, an arbitrary scale.
- The headline adjective ("strong and gaining momentum") comes from those values.

**Make it real:**
- When there's no CSAT, show "No survey data" instead of 78.
- Compute trends from CSAT/NPS history: the CSAT DMO holds multiple surveys per account, so compare the last two.
- Replace the Financial formula with percentile rank in the book, or drop the sub-score.
- Generate the headline from real deltas.

### 5. Home brief: labelled as AI but templated, with numeric fallbacks (all 3)

- `aiBriefHeadline: 'your book at a glance'` and `aiBrief` are string templates over real counts. The numbers are honest, but the UI presents the text as an AI brief.
- `confidencePct: freshness?.pct ?? 87` and `dataSourceCount: freshness?.sources.length ?? 24` invent a confidence score and a source count when freshness fails.

**Make it real:** generate the brief through `aiGenerateClient` → `AiGenerateRest`, grounded on the same facts object (model chosen in `/config`). If the model reports `source:'unavailable'`, show the templated facts **labelled "From live data"**, not as AI. When freshness fails, drop the confidence badge entirely.

### 6. Static claims in KPI notes (all 3)

- Goals `note: 'On track'` is a claim: compute it from FinancialGoal progress against the target date.
- Wealth "$5M+ Targets" `note: 'Consolidation'` and the generic `'In progress'` / `'Open leads'` / `'Require attention'` are labels, not data. They're fine as captions, but should be reviewed so none of them asserts a status.

### 7. Customer 360 "Agentforce" summaries are mostly templates (all 3)

`personas/customer/agentforceFlows.ts`: only `account` and `transaction` have live prompt flows. `trade`, `interaction`, `csat`, `opportunity`, `case` and `campaign` show locally composed text (`full360DataReal.ts:311`) inside an Agentforce card. The text is built from real values, but it's presented as AI.

**Make it real:**
- Build the 6 missing prompt templates and autolaunched flows (Account input → PromptResponse) and register them in `AGENTFORCE_FLOWS`.
- Or route those slots through `AiGenerateRest` with the slot's live rows as grounding, which is faster and needs no new flows.
- Until then, label the composed text "Summary from live data".

### 8. Prep sheet generic advice fallback (`_shared`)

`PrepModal.tsx:14–18`: `DEFAULT_RECAP`, `DEFAULT_TALK` ("Lead with the open service items to rebuild trust…") and `DEFAULT_NBA` show generic coaching as if it were tailored when generation fails.

**Make it real:** confirm that the live generation path covers every entry point. On failure, show an unavailable state with retry, and keep the real facts table.

### 9. Small gaps

- C360 financial accounts `opened: '—'` (`full360DataReal.ts:146`): map `FinServ__OpenDate__c`.
- `AppLauncher.ORG_APPS` and `AgentforceChat.CUMULUS_AGENTS` are static lists. This is configuration, not data, but they could be queried (AppMenuItem / BotDefinition) so new apps and agents appear without a redeploy. Low priority.

---

## P1: dead mock code (not reachable today; delete so it can't come back)

| All 3 bundles | What |
|---|---|
| `home/homeData.ts` | `DASH` fixture (Julie Morris brief, call list, alerts, the "Morning review / Morris rollover 2:30 / Bennett mortgage 3:15 / Prep Omega close 4:00" schedule) plus the mock arm of `fetchHomeDashboard` |
| `personas/customer/full360Data.ts` | `JULIE_FULL` fixture |
| `personas/customer/customerData.ts` | `JULIE`, `JULIE_DETAIL` fixtures |
| `personas/mock/` | `mockUtil.ts` (`mockResolve`, `series`), `useMockAssistant.ts` (no consumers) |
| `data/dataSource.ts` | `resolve(domain, mockFn, realFn)` and the mode switch: collapse to real-only calls |
| `_shared/.../CrossSellWhitespace.tsx` | `MOCK_PRODUCTS`, `MOCK_CLIENTS`, `MOCK_DATA` (after #2) |

> "Today's arc" in the rail is **already real**: `HomeLayout.deriveArc()` builds it from the live Task/Event schedule, with an honest "No meetings today" fallback. The Morris/Bennett/Omega items in older snapshots came from the `DASH` fixture before the bundles went live. Deleting `DASH` removes the last copy.

---

## Data to generate

| Need | Approach |
|---|---|
| CRM KPI history (#1) | `Cockpit_KPI_Snapshot__c` + nightly Schedulable Apex + 8-week backfill from record dates and history |
| Product holdings breadth (#2) | Check FinancialAccount type coverage per book; if thin, extend the Snowflake generators → DC, or seed FSC FinancialAccounts |
| CSAT history depth (#4) | Confirm ≥2 surveys per account in the CSAT DMO; extend the generator if not |

## Order of work

1. **#3 identity + #5 numeric fallbacks + #8 + #9 opened date:** small, `_shared`-heavy, one PR.
2. ✅ **#1 Data Cloud sparklines** (no new data needed) and drop `seedTrend`; **CRM tiles** render without sparklines until step 4.
3. **#2 cross-sell, real** (after the in-org coverage check).
4. **#1 CRM KPI snapshot object + scheduler + backfill**, then turn on the CRM sparklines.
5. **#4 C360 health, #6 notes, #7 AI slots, #5 generated brief.**
6. **P1 dead-code deletion** across all 3 bundles.

Per the project workflow, each step builds the affected bundles and deploys `dist/` (plus any new Apex/objects). The live browser check is the verification step.
