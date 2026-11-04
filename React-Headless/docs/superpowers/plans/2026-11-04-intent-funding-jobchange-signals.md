# Intent, Funding & Job-Change Queue Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Demandbase intent / competitor research, Harmonic funding, and UserGems champion departures as their own Priority Queue items in ReactCommercial, and UserGems liquidity events in ReactWealth. One of the 8 queue slots is reserved for the strongest of them.

**Architecture:** Three new `_shared/src/data/*Signals.ts` modules follow the existing signal-module pattern:
- a `fetchX(ownerId)` built on `queryDataCloudForBook`, returning `{ rows, counts…, scope }`
- an `xQueueItems(res, nameById, opts)` returning `QueueSignalItem[]`

Each bundle's `homeDataReal.ts` fetches the new feeds, dedupes them against `callList`, and caps and appends them to `transactionSignals`. Each bundle also adds alerts-rail entries and an AI-brief sentence. `buildPriorityQueue` gains a one-slot reservation for items flagged `reserveSlot`. Who-to-Call is untouched.

**Tech Stack:** React 19 + TypeScript + Vite 7 UI Bundles. Data Cloud ANSI SQL goes through `DcBridgeRest` (`queryDataCloud`). The `@shared` alias inlines `_shared` into each bundle.

**Spec:** `React-Headless/docs/superpowers/specs/2026-11-04-intent-funding-jobchange-signals-design.md` (commit `21f27e76d`)

## Global Constraints

- **Who-to-Call stays as is:** no edits to `commercialWhoToCall.ts` / `wealthWhoToCall.ts`. Weights stay credit 30 / Gong 25 / fees 20 / offer 15 / outlook 10.
- **No Retail changes.** ReactRetail never sets `reserveSlot`, so its queue must behave exactly as before.
- **No new Apex and no Data Cloud metadata.** Reads go through the existing `queryDataCloud` / `queryDataCloudForBook` only.
- **Fields:** DMO fields are the lowercase Snowflake column + `__c`. Every account join key is `account_id__c` → `ssot__Account__dlm.ssot__Id__c`.
- **No joins to `ssot__Account__dlm` for names or counts.** It has 633 duplicate `ssot__Id__c`. Names come from the bundle's GraphQL `nameById` pass. Book filters stay `IN (SELECT …)` semi-joins (what `queryDataCloudForBook` already produces). Counts use `COUNT(DISTINCT …)`.
- **Every new fetch is additive.** Wrap it in `.catch(() => <empty result>)` like the neighbouring feeds, so a failed query never blanks the page.
- **Per-feed queue caps** (applied after `dropCovered(…, callList)`):
  - `INTENT_SURGE_ROWS = 2`
  - `COMPETITOR_ROWS = 2`
  - `FUNDING_ROWS = 2`
  - `CHAMPION_ROWS = 2`
  - `LIQUIDITY_ROWS = 3`
- **Segment labels:** `'Commercial'` for the Commercial feeds and `'Wealth'` for liquidity, matching the neighbouring feeds in each file.
- **Delivery (project rule):**
  - no vitest or Apex suites
  - verify with `tsc -b && vite build` plus live SQL plus the live browser
  - commit `dist/` together with `src/`
  - code goes through a PR, not straight to main
  - `git add` named files only
  - never stage `../.gitignore` or `ReactCommercial/node_modules`
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Branch:** `feat/queue-intent-funding-jobchange` off `main`.

## Review Focus

1. **A book with zero rows for a feed.** `queryDataCloudForBook` falls back to org scope, so the banker still sees org rows, with a ` · org-wide` source suffix. Task 2 verifies this with a fake owner id.
2. **A future Harmonic `last_funding_date__c`.** 4 accounts have dates as late as 2026-11-19. They must produce `dueDate = today + 14`, not a date past that. Task 3 checks this.
3. **A client already on Who-to-Call.** It must not appear again as a new-signal row, and the reservation must not bring it back in either. `dropCovered` runs before the items reach `transactionSignals`. Task 5 checks this.
4. **Retail queue unchanged.** No item there carries `reserveSlot`, so its 8 rows are identical before and after. Task 1 checks this.
5. **An account that is both surging and researching a competitor.** It shows once, as `competitor`. Task 2 checks this.

---

### Task 1: Reserved slot in `buildPriorityQueue`

**Files:**
- Modify: `force-app/main/default/uiBundles/_shared/src/data/priorityQueue.ts` (`QueueSignalItem` interface; tail of `buildPriorityQueue`)

**Interfaces:**
- Produces: `QueueSignalItem.reserveSlot?: boolean`. When at least one input item has it set, `buildPriorityQueue` guarantees the returned list contains one.

- [ ] **Step 1: Add `reserveSlot?: boolean` to `QueueSignalItem`.** Doc comment: "Reserve one queue slot for the strongest flagged item (new intent / funding / job-change signals)."
- [ ] **Step 2: Implement the reservation at the end of `buildPriorityQueue`.** Replace the final `return deduped.slice(0, limit)…` with this algorithm, keeping the existing id-renumber map:

  ```ts
  const top = deduped.slice(0, limit);
  if (!top.some(it => it.reserveSlot)) {
    const best = deduped.find(it => it.reserveSlot); // deduped is already sorted
    if (best && top.length === limit) top[limit - 1] = best;
    else if (best) top.push(best);
  }
  top.sort(/* same comparator as above */);
  ```

  Hoist the existing comparator into a `const byPriority = (a, b) => …` so both sorts share it.
- [ ] **Step 3: Type-check all three bundles.** Run `npx tsc -b` in each of `ReactRetail/`, `ReactCommercial/`, `ReactWealth/` under `force-app/main/default/uiBundles/`. Expected: exit 0, no errors.
- [ ] **Step 4: Commit.**

  ```bash
  git add force-app/main/default/uiBundles/_shared/src/data/priorityQueue.ts
  git commit -m "feat(shared): reserve one priority-queue slot for flagged signals"
  ```

### Task 2: Demandbase intent / competitor feed

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/data/intentSignals.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/data/transactionSignals.ts` (export the existing `dueFrom`)
- Modify: `force-app/main/default/uiBundles/_shared/src/data/index.ts` (exports)

**Interfaces:**
- Consumes: `queryDataCloud`, `queryDataCloudForBook`, `BookScope` from `./dataCloudClient`; `QueueSignalItem` from `./priorityQueue` (with Task 1's `reserveSlot`); `dueFrom(iso: string, slaDays: number, now: Date): string` from `./transactionSignals`.
- Produces:

  ```ts
  export const INTENT_SURGE_ROWS = 2;
  export const COMPETITOR_ROWS = 2;
  export interface IntentSignalRow {
    accountId: string; kind: 'surge' | 'competitor'; topic: string; stage: string;
    intentScore: number; researchers: number; competitor: string | null; signalDate: string; // YYYY-MM-DD
  }
  export interface IntentSignalResult { rows: IntentSignalRow[]; surging: number; competitor: number; scope: BookScope }
  export async function fetchIntentSignals(ownerId: string | null | undefined): Promise<IntentSignalResult>;
  export function intentQueueItems(res: IntentSignalResult, nameById: Record<string, string>, opts: { segment: string; now?: Date }): QueueSignalItem[];
  ```

- [ ] **Step 1: Export `dueFrom` from `transactionSignals.ts`.** Change only the `function` to `export function`.
- [ ] **Step 2: Write `intentSignals.ts`.** Add a module header comment in the house style: source DMO, the slice, and the live 2026-11-04 numbers from the spec. Use this rows SQL; `filter` is the `queryDataCloudForBook` account filter, and the CTEs are reused by the summary:

  ```sql
  WITH w AS (
    SELECT account_id__c AS acct, intent_topic__c AS topic, journey_stage__c AS stage,
           intent_score__c AS score, unique_researchers__c AS researchers,
           researching_competitor__c AS competitor, last_signal_date__c AS signal_date,
           surge_flag__c AS surge,
           CASE journey_stage__c WHEN 'Purchase' THEN 3 WHEN 'Decision' THEN 2 WHEN 'Consideration' THEN 1 ELSE 0 END AS stage_rank
    FROM BT_Demandbase_Intent_Signals__dlm
    WHERE profile_week__c = (SELECT MAX(profile_week__c) FROM BT_Demandbase_Intent_Signals__dlm)
      AND account_id__c ${filter}
  ),
  a AS (  -- one row per account: its strongest topic; competitor wins over surge
    SELECT *, CASE WHEN MAX(CASE WHEN competitor IS NOT NULL AND stage_rank >= 1 THEN 1 ELSE 0 END) OVER (PARTITION BY acct) = 1
                   THEN 'competitor' ELSE 'surge' END AS kind,
           ROW_NUMBER() OVER (PARTITION BY acct ORDER BY (competitor IS NOT NULL AND stage_rank >= 1) DESC, score DESC) AS rn
    FROM w WHERE (competitor IS NOT NULL AND stage_rank >= 1) OR surge
  )
  SELECT account_id, kind, topic, stage, score, researchers, competitor, signal_date FROM (
    SELECT acct AS account_id, kind, topic, stage, score, researchers, competitor, signal_date,
           ROW_NUMBER() OVER (PARTITION BY kind ORDER BY stage_rank DESC, score DESC, researchers DESC) AS kn
    FROM a WHERE rn = 1
  ) x WHERE kn <= 6
  ORDER BY kind, kn
  ```

  `kn <= 6` fetches spares so the `dropCovered` + cap in Task 5 still fills 2 per kind. Run it through `queryDataCloudForBook(…, ownerId, 12)`.

  The summary SQL reuses the same CTEs. It returns `COUNT(DISTINCT CASE WHEN kind='surge' THEN acct END) AS surging` and `COUNT(DISTINCT CASE WHEN kind='competitor' THEN acct END) AS competitor` over `a WHERE rn = 1`, run through `queryDataCloud(summarySql(res.accountFilter), 1)` with a `.catch` to `{}`, as `fetchLeadershipChanges` does. Slice date strings to 10 chars.
- [ ] **Step 3: Implement `intentQueueItems`.** Pinned values:

  | Field | `surge` | `competitor` |
  |---|---|---|
  | `id` | `` `di${i}` `` | `` `di${i}` `` |
  | `reason` | `` `Surging on ${topic} · ${stage} stage · ${researchers} researchers` `` | `` `Researching ${competitor} · ${stage} · ${topic}` `` |
  | `action` | `'Get ahead of the evaluation'` | `'Defend the relationship'` |
  | `score` | `Math.min(0.8, 0.5 + intentScore / 400)` | `Math.min(0.85, 0.55 + intentScore / 400)` |
  | `severity` | `'high'` when stage is `Purchase`, else `'medium'` | `'high'` when stage is `Decision` or `Purchase`, else `'medium'` |

  Shared fields:
  - `source`: `` `Demandbase intent${scope === 'org' ? ' · org-wide' : ''}` ``
  - `dueDate`: `dueFrom(signalDate, 7, now)`
  - `relationshipValue: 0`
  - `reserveSlot: true`
  - `clientId: accountId`
  - `clientName: nameById[accountId] || accountId`
- [ ] **Step 4: Add exports to `index.ts`** in one `export { … } from './intentSignals';` line, alongside the `marketSignals` line.
- [ ] **Step 5: Verify the SQL live.** Run the rows SQL through the `datacloud` MCP `query_data_cloud`, with `filter` = `LIKE '001am%'`.
  - Expected: up to 6 `surge` and 6 `competitor` rows.
  - No `account_id` appears under both kinds.
  - Every row is stage Consideration, Decision or Purchase.

  Then run it with `filter` = `IN (SELECT ssot__Id__c FROM ssot__Account__dlm WHERE ssot__OwnerId__c = '005000000000000AAA')`. Expected: 0 rows, which proves the empty-book case that falls back to org scope.
- [ ] **Step 6: Type-check** `ReactCommercial` with `npx tsc -b`. Expected: exit 0.
- [ ] **Step 7: Commit.**

  ```bash
  git add force-app/main/default/uiBundles/_shared/src/data/intentSignals.ts force-app/main/default/uiBundles/_shared/src/data/transactionSignals.ts force-app/main/default/uiBundles/_shared/src/data/index.ts
  git commit -m "feat(shared): Demandbase intent + competitor-research queue feed"
  ```

### Task 3: Harmonic funding feed

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/data/fundingSignals.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/data/index.ts`

**Interfaces:**
- Consumes: as in Task 2.
- Produces:

  ```ts
  export const FUNDING_ROWS = 2;
  export interface FundingSignalRow {
    accountId: string; stage: string; status: string; roundUsd: number | null;
    runwayMonths: number | null; leadInvestor: string | null; fundingDate: string; // YYYY-MM-DD
  }
  export interface FundingSignalResult { rows: FundingSignalRow[]; funded: number; scope: BookScope }
  export async function fetchFundingSignals(ownerId: string | null | undefined): Promise<FundingSignalResult>;
  export function fundingQueueItems(res: FundingSignalResult, nameById: Record<string, string>, opts: { segment: string; now?: Date }): QueueSignalItem[];
  ```

- [ ] **Step 1: Write `fundingSignals.ts`.** Rows SQL:
  - selects `account_id__c, last_funding_stage__c, funding_status__c, last_round_usd__c, est_runway_months__c, lead_investor__c, last_funding_date__c`
  - from `BT_Harmonic_Company_Signals__dlm`
  - where `profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Harmonic_Company_Signals__dlm) AND recently_funded_flag__c = true AND account_id__c ${filter}`
  - `ORDER BY last_round_usd__c DESC NULLS LAST LIMIT 6`

  The summary is `COUNT(DISTINCT account_id__c) AS funded` with the same WHERE clause.
- [ ] **Step 2: Implement `fundingQueueItems`.** Pinned values:
  - `id`: `` `hf${i}` ``
  - Series A+ = stage in `['Series A','Series B','Series C','Growth']`
  - `reason`: `` `Raised ${money(roundUsd)} ${stage}${runwayMonths != null ? ` · ${Math.round(runwayMonths)} mo runway` : ''}${leadInvestor ? ` · led by ${leadInvestor}` : ''}` ``. Copy the compact-USD `money` helper locally, as `transactionSignals.ts` does.
  - `action`: `'Excess-cash / treasury conversation'`
  - `score`: Series A+ `0.8`, else `0.6`
  - `severity`: Series A+ `'high'`, else `'medium'`
  - `source`: `` `Harmonic funding${scope === 'org' ? ' · org-wide' : ''}` ``
  - `relationshipValue`: `roundUsd ?? 0`
  - `reserveSlot: true`
  - `dueDate`: `dueFrom(fundingDate > todayIso ? todayIso : fundingDate, 14, now)`, where `todayIso` is `now` as local `YYYY-MM-DD`. A future funding date counts as today.
- [ ] **Step 3: Add exports to `index.ts`.**
- [ ] **Step 4: Verify the SQL live** with the MCP and the org filter. Expected: 6 rows, the first a Growth round of about $287M; the summary returns `funded = 16`.
- [ ] **Step 5: Check the future-date rule by hand.** For a row with `last_funding_date__c` 2026-11-19 and `now` = 2026-11-04, the computed `dueDate` must be `2026-11-18` (today + 14), not `2026-12-03`. Confirm by reading the expression against `dueFrom`.
- [ ] **Step 6: Type-check** `ReactCommercial`. Expected: exit 0.
- [ ] **Step 7: Commit** (`feat(shared): Harmonic recently-funded queue feed`), adding the two files by name.

### Task 4: UserGems champion-departure + liquidity feeds

**Files:**
- Create: `force-app/main/default/uiBundles/_shared/src/data/jobChangeSignals.ts`
- Modify: `force-app/main/default/uiBundles/_shared/src/data/index.ts`

**Interfaces:**
- Consumes: as in Task 2.
- Produces:

  ```ts
  export const CHAMPION_ROWS = 2;
  export const LIQUIDITY_ROWS = 3;
  export interface JobChangeRow {
    accountId: string;            // the employer account (Commercial) or the person account (Wealth)
    employerId: string;           // account_id__c
    newEmployerId: string | null; // new_account_id__c
    newEmployerName: string | null;
    contactName: string; title: string; persona: string;
    wasChampion: boolean; riskScore: number | null; opportunityScore: number | null;
    detectedDate: string; // YYYY-MM-DD
  }
  export interface JobChangeResult { rows: JobChangeRow[]; total: number; scope: BookScope }
  export async function fetchChampionDepartures(ownerId: string | null | undefined): Promise<JobChangeResult>;
  export async function fetchLiquidityEvents(ownerId: string | null | undefined): Promise<JobChangeResult>;
  export function championQueueItems(res: JobChangeResult, nameById: Record<string, string>, opts: { segment: string; now?: Date }): QueueSignalItem[];
  export function liquidityQueueItems(res: JobChangeResult, nameById: Record<string, string>, opts: { segment: string; now?: Date }): QueueSignalItem[];
  ```

- [ ] **Step 1: Write the two fetches.** Both read `BT_UserGems_Job_Changes__dlm` with `event_type__c = 'Departed'`.

  | | Champion (Commercial) | Liquidity (Wealth) |
  |---|---|---|
  | Filter | `(was_champion__c = true OR was_primary_contact__c = true) AND detected_date__c >= current_date - INTERVAL '30' DAY AND account_id__c ${filter}` | `liquidity_event_flag__c = true AND person_account_id__c IS NOT NULL AND detected_date__c >= current_date - INTERVAL '180' DAY AND person_account_id__c ${filter}` |
  | Order | `relationship_risk_score__c DESC` | `opportunity_score__c DESC, detected_date__c DESC` |
  | Limit | 6 | 8 |
  | `accountId` | `account_id__c` | `person_account_id__c` |

  Each summary is `COUNT(*) AS total` with the same WHERE clause. Map `old_title__c` → `title`, `contact_persona__c` → `persona`, and `new_employer_name__c` → `newEmployerName`.
- [ ] **Step 2: Implement `championQueueItems`.** Pinned values:
  - `id`: `` `ug${i}` ``
  - `reason`: `` `${wasChampion ? 'Champion' : 'Primary contact'} ${contactName} (${title}) left${newEmployer ? ` · now at ${newEmployer}` : ''}` ``, where `newEmployer = (newEmployerId && nameById[newEmployerId]) || newEmployerName`
  - `action`: `'Re-establish the relationship'`
  - `score`: `Math.min(0.85, 0.5 + (riskScore ?? 0) / 300)`
  - `severity`: `'high'` when `riskScore >= 70`, else `'medium'`
  - `source`: `` `UserGems job change${scope === 'org' ? ' · org-wide' : ''}` ``
  - `dueDate`: `dueFrom(detectedDate, 7, now)`
  - `relationshipValue: 0`
  - `reserveSlot: true`
- [ ] **Step 3: Implement `liquidityQueueItems`.** Pinned values:
  - `id`: `` `ul${i}` ``
  - `clientId`: `accountId` (the person account)
  - `reason`: `` `${contactName} left ${nameById[employerId] || 'their employer'}${newEmployer ? ` for ${newEmployer}` : ''} · liquidity event` ``
  - `action`: `'Liquidity conversation — rollover / equity proceeds'`
  - `score`: `Math.min(0.85, 0.5 + (opportunityScore ?? 0) / 300)`
  - `severity`: `'high'` when `opportunityScore >= 70`, else `'medium'`
  - `source`: `` `UserGems liquidity${scope === 'org' ? ' · org-wide' : ''}` ``
  - `dueDate`: `dueFrom(detectedDate, 7, now)`
  - `reserveSlot: true`
- [ ] **Step 4: Add exports to `index.ts`.**
- [ ] **Step 5: Verify both SQLs live** with the org filter.
  - Champion: up to 6 rows, all `detected_date__c` within 30 days. The summary total should be at least 27, since it includes primary contacts; the 30-day primary-contact count alone is 40.
  - Liquidity: up to 8 rows, total = 34.
- [ ] **Step 6: Type-check** `ReactCommercial` and `ReactWealth`. Expected: exit 0.
- [ ] **Step 7: Commit** (`feat(shared): UserGems champion-departure + liquidity queue feeds`).

### Task 5: Wire ReactCommercial

**Files:**
- Modify: `force-app/main/default/uiBundles/ReactCommercial/src/home/homeDataReal.ts`:
  - `@shared` import (line ~49)
  - the `Promise.all` destructure and array (~279–330)
  - the `ids` list (~347)
  - `transactionSignals` (~385)
  - `aiBrief` (~679)
  - `alerts` (~708)

**Interfaces:**
- Consumes: from Tasks 2–4, `fetchIntentSignals`, `intentQueueItems`, `INTENT_SURGE_ROWS`, `COMPETITOR_ROWS`, `fetchFundingSignals`, `fundingQueueItems`, `FUNDING_ROWS`, `fetchChampionDepartures`, `championQueueItems`, `CHAMPION_ROWS`, and the result types.
- Produces: no new `HomeDashboard` fields. The items ride in `transactionSignals` and `alerts`, so `HomePage.tsx` and the mock data need no change.

- [ ] **Step 1: Fetch the three feeds** by appending `intent, funding, champions` to the destructure and three entries to the `Promise.all` array. Each is `userP.then(u => fetchX(u?.userId)).catch((): XResult => ({ rows: [], …zeros, scope: 'org' }))`, under a `// Plans 14–16 — Demandbase intent, Harmonic funding, UserGems job changes — additive.` comment.
- [ ] **Step 2: Add the account ids to the `ids` list:**
  - `...intent.rows.map(r => r.accountId)`
  - `...funding.rows.map(r => r.accountId)`
  - `...champions.rows.flatMap(r => [r.accountId, r.newEmployerId ?? ''])`
- [ ] **Step 3: Build the capped queue lists after `callList`:**

  ```ts
  const intentItems = dropCovered(intentQueueItems(intent, nameById, { segment: 'Commercial' }), callList);
  const intentQueue = [
    ...intentItems.filter(i => i.action === 'Defend the relationship').slice(0, COMPETITOR_ROWS),
    ...intentItems.filter(i => i.action !== 'Defend the relationship').slice(0, INTENT_SURGE_ROWS),
  ];
  const fundingQueue = dropCovered(fundingQueueItems(funding, nameById, { segment: 'Commercial' }), callList).slice(0, FUNDING_ROWS);
  const championQueue = dropCovered(championQueueItems(champions, nameById, { segment: 'Commercial' }), callList).slice(0, CHAMPION_ROWS);
  ```

  Append `...intentQueue, ...fundingQueue, ...championQueue` to the end of `transactionSignals`.
- [ ] **Step 4: Add four alert groups** before the `callList` "Call first" entries, each `.slice(0, 2)`:
  - **Competitor research:** `id` `` `adc${i}` ``; title `` `Researching a competitor — ${c.clientName}` ``; `tone: 'risk'`; `when: 'this week'`.
  - **Intent surge:** `` `adi${i}` ``; `` `Intent surge — ${c.clientName}` ``; `'opportunity'`; `'this week'`.
  - **Funding:** `` `ahf${i}` ``; `` `New funding — ${c.clientName}` ``; `'opportunity'`; `when: 'this month'`.
  - **Champion departure:** `` `aug${i}` ``; `` `Champion left — ${c.clientName}` ``; `'risk'`; `when: 'last 30d'`.

  All four use `detail: `${c.reason} · ${c.action}``, and `severity` follows `c.severity`, mirroring the `amlSignals` entry.
- [ ] **Step 5: Append the AI-brief sentence** to the end of `aiBrief`:

  ```ts
  `${intent.surging + intent.competitor + funding.funded + champions.total ? ` Market signals: ${intent.surging.toLocaleString('en-US')} accounts surging on intent, ${intent.competitor.toLocaleString('en-US')} researching a competitor, ${funding.funded.toLocaleString('en-US')} just raised a round, and ${champions.total.toLocaleString('en-US')} lost a champion or primary contact in the last 30 days.` : ''}`
  ```

- [ ] **Step 6: Build** with `cd force-app/main/default/uiBundles/ReactCommercial && npm run build`. Expected: `tsc -b` clean and `vite build` writes `dist/`.
- [ ] **Step 7: Commit** `src/home/homeDataReal.ts` and `dist/` (`feat(commercial): intent, funding and champion-departure queue items`).

### Task 6: Wire ReactWealth

**Files:**
- Modify: `force-app/main/default/uiBundles/ReactWealth/src/home/homeDataReal.ts`:
  - `@shared` import (line ~45)
  - `Promise.all` (~255)
  - the `ids` list
  - `transactionSignals` (~362)
  - `aiBrief` (~645)
  - `alerts` (~683)

**Interfaces:**
- Consumes: `fetchLiquidityEvents`, `liquidityQueueItems`, `LIQUIDITY_ROWS`, `JobChangeResult` (Task 4).

- [ ] **Step 1: Fetch `liquidity`** as an additive `Promise.all` entry with a `.catch` to `{ rows: [], total: 0, scope: 'org' }`.
- [ ] **Step 2: Add names to the `ids` list:** `...liquidity.rows.flatMap(r => [r.accountId, r.employerId, r.newEmployerId ?? ''])`. The person account names the client; the employer ids feed the reason text.
- [ ] **Step 3: Build and append the queue list.** `const liquidityQueue = dropCovered(liquidityQueueItems(liquidity, nameById, { segment: 'Wealth' }), callList).slice(0, LIQUIDITY_ROWS);` goes at the end of `transactionSignals`.
- [ ] **Step 4: Add the alerts.** `...liquidityQueue.slice(0, 2)` produces entries with:
  - `id`: `` `aul${i}` ``
  - title: `` `Liquidity event — ${c.clientName}` ``
  - `detail`: `` `${c.reason} · ${c.action}` ``
  - `tone: 'opportunity'`
  - `severity` from `c.severity`
  - `when: 'last 180d'`

  Place them next to the existing campaign alerts.
- [ ] **Step 5: Append the AI-brief sentence:** `` `${liquidity.total ? ` ${liquidity.total.toLocaleString('en-US')} ${liquidity.scope === 'book' ? 'clients in your book' : 'clients'} left an employer with a liquidity event in the last 180 days: a rollover / equity-proceeds conversation.` : ''}` ``
- [ ] **Step 6: Build** with `cd force-app/main/default/uiBundles/ReactWealth && npm run build`. Expected: clean build and fresh `dist/`.
- [ ] **Step 7: Commit** `src/home/homeDataReal.ts` and `dist/` (`feat(wealth): UserGems liquidity-event queue items`).

### Task 7: Rebuild Retail, deploy, verify live, open PR

**Files:**
- Rebuild: `force-app/main/default/uiBundles/ReactRetail/dist/` (Retail inlines `_shared/priorityQueue.ts`)

- [ ] **Step 1: Rebuild Retail** with `cd force-app/main/default/uiBundles/ReactRetail && npm run build`. Expected: clean build. Commit `dist/` (`build(retail): rebuild for shared priority-queue change`).
- [ ] **Step 2: Deploy each bundle** from the SFDX root, using the exact git-tracked casing:

  ```bash
  sf project deploy start --source-dir force-app/main/default/uiBundles/ReactCommercial -o jdo-oe0sdd --json
  sf project deploy start --source-dir force-app/main/default/uiBundles/ReactWealth -o jdo-oe0sdd --json
  sf project deploy start --source-dir force-app/main/default/uiBundles/ReactRetail -o jdo-oe0sdd --json
  ```

  Expected: each `result.status == "Succeeded"` and `numberComponentErrors == 0`. Read the JSON; don't trust the exit code.
- [ ] **Step 3: Check ReactCommercial live** in a new Playwright page, not the user's tab, at the App Domain URL `/app/c__ReactCommercial`:
  - The Priority Queue shows at least one row whose source reads Demandbase intent, Harmonic funding or UserGems job change.
  - The alerts rail shows the new titles.
  - The AI brief contains "Market signals:".
  - No client appears both as a Who-to-Call row and as a new-signal row.
- [ ] **Step 4: Check ReactWealth live:**
  - The queue contains a "UserGems liquidity" row. It's reserved if nothing else outranks it.
  - The alerts rail shows a "Liquidity event —" entry.
- [ ] **Step 5: Check ReactRetail live.** The Priority Queue still renders 8 rows with no error.
- [ ] **Step 6: Push and open the PR.** Run `git push -u origin feat/queue-intent-funding-jobchange`. If the push returns 403, run `gh auth switch --user josers18` and retry. Then open the PR with `gh pr create --base main`. The body summarizes:
  - the five new item kinds
  - the reserved slot
  - the live verification

  It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
