# Intent, funding and job-change signals in the cockpit queues — design

**Date:** 2026-11-04
**Status:** Approved 2026-11-04
**Bundles touched:** `_shared`, `ReactCommercial`, `ReactWealth` (Retail: none)

## Intent

Three new BT_ Data Cloud DMOs went live on 2026-11-04. They're Snowflake zero-copy streams, Plans 14–16:

| DMO | What it says about an account |
|---|---|
| `BT_Demandbase_Intent_Signals__dlm` | Weekly B2B intent: which topics an account is researching, whether it's surging, its journey stage, and whether it's researching a competitor |
| `BT_Harmonic_Company_Signals__dlm` | Monthly company signals: funding status, last round, runway, headcount growth |
| `BT_UserGems_Job_Changes__dlm` | Contact job changes (Departed / Joined / Promoted), whether the contact was the champion or primary contact, and, for some departures, a link to a person account with a liquidity event |

**The demo moment (user's words).** A commercial banker opens ReactCommercial and sees, folded into the Priority Queue, which accounts:

- are surging on intent or researching a competitor
- just raised a round
- lost their champion

The same feed also gives Wealth liquidity events.

This is the existing pattern. Every other BT_ signal (Gong, fee spikes, AML changes, inflows, BoardEx…) reaches the banker as a queue row with its own reason, action and date. These three should feel the same.

## Goals

1. **Four new Commercial queue item kinds**, each with its own reason text, action verb and due date taken from the signal:

   | Kind | Source | Action (wording is the builder's to polish) |
   |---|---|---|
   | Intent surge | Demandbase | Get ahead of the evaluation |
   | Competitor research | Demandbase | Defend the relationship |
   | New funding | Harmonic | Excess-cash / treasury conversation |
   | Champion departure | UserGems | Re-establish the relationship |

2. **One new Wealth queue item kind**, liquidity event, from UserGems departures that carry a `person_account_id` and `liquidity_event_flag`. Action: a wealth / liquidity conversation with the person.
3. **The new signals show up in the same supporting surfaces existing signals use:**
   - a sentence in Commercial's AI brief, and in Wealth's for liquidity
   - entries on the alerts rail, the way BoardEx leadership changes (`fetchLeadershipChanges`) appear
4. **Book-scoped like every other feed.** The banker sees their own book first, falling back to org scope when the book has no rows (`queryDataCloudForBook`).

## Non-goals

- **No change to the blended Who-to-Call score.** Its five drivers and weights stay exactly as they are (credit 30 / Gong 25 / fees 20 / offer 15 / outlook 10). *The user decided this explicitly.* The new signals sit beside Who-to-Call as separate queue items, like the AML / inflow / campaign items do today.
- No new Data Cloud work (streams, DMOs, mappings, relationships are done).
- No Retail changes.
- No new Apex. All reads go through the existing `DcBridgeRest` → `queryDataCloud`.
- No new pages, routes or cards. This is about the queue and its existing side surfaces.

## Anti-goals (failure even if it technically works)

- **Flooding the queue.** Demandbase alone has thousands of surging accounts org-wide. If the new kinds crowd out credit / Gong / fee items, the queue stops being a priority list. Each new kind needs a small per-feed cap, like `FEE_SPIKES` / `PLAN_RISK_ROWS`.
- **The demo moment never appearing.** On a busy book, credit / Gong / fee items can fill all 8 queue rows, so the new signals vanish from the queue entirely. *The user decided:* reserve **one** of the 8 slots for the strongest new-signal item (see "Reserved slot" below). Only one — not one per kind — so the queue stays a priority list.
- **Duplicate rows for a client already on Who-to-Call.** Use `dropCovered` against `callList`, same as Gong and fee spikes.
- **Due dates in the future or far past that make the sort look broken** (see the data facts below).
- **Wrong-persona leakage.** Funding, intent and champion items must not appear in Wealth. Liquidity items must not appear in Commercial.

## Data facts (profiled live 2026-11-04)

The cockpits' org `jdo-oe0sdd` is the same instance as the `jdo-gj9q5q` alias the streams were created under. All fields are lowercase Snowflake column + `__c`. All three DMOs join `ssot__Account__dlm.ssot__Id__c` via `account_id__c`.

**Demandbase** — latest `profile_week__c` = 2026-11-02, and `last_signal_date__c` there = 2026-11-02.

| Stage | Surging accounts | …of which researching a competitor | Avg intent score |
|---|---|---|---|
| Consideration | ~595 | 161 | ~77 |
| Decision | ~643 | 184 | ~81 |
| Purchase | ~136 | 41 | ~93 |

- Awareness rows never surge.
- `researching_competitor__c` is non-null on about 1,500 rows across all stages. Null means "not researching a competitor".
- The table has one row per account per topic, so an account appears several times per week. Collapse to one row per account, taking the strongest topic.

**Harmonic** — latest `profile_month__c` = 2026-11-01.

- `recently_funded_flag__c = true` on only **16** accounts org-wide: 9 Angel/Seed, 7 Venture (Series A–C, Growth). Rounds run from $0.35M to $287M.
- **4 of the 16 have `last_funding_date__c` after today** (latest 2026-11-19). That's synthetic-data drift. Clamp the due date: a future funding date counts as today.

**UserGems** — two years of history (2024-11 → 2026-11-03), so a recency window is required.

| Slice | Rows |
|---|---|
| Champion departures (`event_type__c='Departed' AND was_champion__c`), last 30 days | 27 |
| …same, last 60 days | 48 |
| Primary-contact departures, last 30 days | 40 |
| Liquidity events (`liquidity_event_flag__c`, all Departed with `person_account_id__c`), last 90 days | 15 |
| …same, last 180 days | 34 |

- `relationship_risk_score__c` runs 0–100 (avg ~34) and suits ranking.
- `new_account_id__c` (493 non-null) points to the departing contact's new employer when that employer is also a Cumulus account. The reason text can use it ("now at <new employer>").

## How it gets built — decided

- **Shape.** Follow the existing signal-module pattern exactly. For each feed, add a `_shared/src/data/*.ts` module that exports:
  - a `fetchX(ownerId)` that uses `queryDataCloudForBook` and returns rows plus summary counts and `scope`
  - an `xQueueItems(result, nameById, { segment })` that returns `QueueSignalItem[]`, like `callSentimentQueueItems` / `feeSpikeQueueItems`

  Export them through `_shared/src/data/index.ts` / `@shared`.
- **Commercial wiring** (`ReactCommercial/src/home/homeDataReal.ts`):
  - fetch the three feeds alongside the others
  - run `dropCovered(..., callList)` on each
  - append the capped results to `transactionSignals`

  The blender (`buildPriorityQueue`) already merges `callList + transactionSignals`, so `HomePage.tsx` needs no change for the queue itself.
- **Reserved slot (user decision 2026-11-04).** One of the queue's 8 rows is reserved for the strongest new-signal item:
  - `QueueSignalItem` gains an optional `reserveSlot?: boolean`. The new feeds' `…QueueItems` set it to `true` (Demandbase, Harmonic, UserGems in Commercial; UserGems liquidity in Wealth).
  - In `buildPriorityQueue`, after dedupe + sort, if none of the top `limit` items has `reserveSlot`, the highest-scoring `reserveSlot` item replaces the **last** row. Ties break by the existing severity rank.
  - When a flagged item already ranks on its own merit, nothing changes. More than one flagged item may appear if they earn it by score.
  - Items without the flag behave exactly as today, so ReactRetail (which never sets it) is unaffected. No `HomePage.tsx` change in any bundle.
- **Wealth wiring** (`ReactWealth/src/home/homeDataReal.ts`): the liquidity feed is scoped through the person account (`person_account_id__c`) and appended to `transactionSignals` the same way.
- **Due dates come from the signal**, which is what lets the blender interleave dated items:

  | Kind | Due date |
  |---|---|
  | Intent / competitor | `last_signal_date__c` |
  | Funding | `last_funding_date__c`, clamped to today when in the future |
  | Champion / liquidity | `detected_date__c` |

- **Who-to-Call untouched.** No edits to `commercialWhoToCall.ts` or `wealthWhoToCall.ts`.
- **Delivery** (project rule):
  - build each touched bundle
  - commit `dist/` with `src/`
  - deploy only the bundles' dist; no Apex deploy is needed
  - no vitest suite run
  - verify in the live browser
  - code goes through a PR

## Left to the builder (my calls, not the user's)

These are defaults I picked. The user hasn't weighed in on them.

- **Thresholds and windows:**
  - Intent surge = latest week, `surge_flag__c` true, stage in Decision/Purchase first, then Consideration.
  - Competitor research = latest week, non-null `researching_competitor__c`, stage ≥ Consideration.
  - Champion departure = last 30 days. Widen to 60 if a book comes up empty and org fallback is also thin.
  - Liquidity = last 180 days. 90 days is only 15 rows org-wide, too sparse for a book.
  - Funding = `recently_funded_flag__c` true on the latest month.
- **Severity:**
  - Purchase-stage surge, competitor research at Decision/Purchase, champion departure with `relationship_risk_score__c` ≥ 70, and any Series A+ round → **high**.
  - Everything else → medium.
  - Scores sit roughly 0.5–0.85 so they interleave with, rather than outrank, credit and Gong items.
- **Per-feed caps:** 2 rows each for intent, competitor, funding and champion. 3 for liquidity.
- **Intent vs competitor on the same account:** competitor research wins (it's the sharper action), so one row per account.
- **Reason text examples:**
  - "Surging on Treasury Management · Decision stage · 4 researchers"
  - "Researching <competitor> · Consideration"
  - "Raised $25.8M Series B · 18 mo runway"
  - "Champion <name> (CFO) left · now at <new employer>"
  - "<name> left <employer> · liquidity event"
- **Alerts-rail / AI-brief copy and counts:** mirror how leadership changes and fee spikes are phrased today. Counts come from each feed's summary query. Use `COUNT(DISTINCT account_id__c)`, because `ssot__Account__dlm` has 633 duplicate `ssot__Id__c` and joins fan out.
- **Segment label:** `'Commercial'` / `'Private Wealth'`, matching neighbouring feeds.
- **Mock mode:** add small mock fixtures in each bundle's mock home data so `dataSource` mock mode still renders. Wealth/Commercial home is real today, but the mock path must keep compiling.

- **Wealth liquidity scoping and identity** (verified live):
  - All 137 liquidity rows have a `person_account_id__c` that is a `001am…` Account. Every one is present in `ssot__Account__dlm`, and they're spread across 3 owners.
  - Book-scope on `person_account_id__c`, so the org fallback (`LIKE '001am%'`) works.
  - Set `clientId` to the person account, so `dropCovered` dedupes against Wealth's call list.
  - Add `person_account_id__c` values to the ids that build Wealth's `nameById`.
- **Employer names:** "now at <new employer>" and "left <employer>" come from the existing GraphQL `nameById` pass. Add `new_account_id__c` / employer `account_id__c` to the hand-maintained id list in each bundle. Don't join `ssot__Account__dlm` for names, because joins fan out. Book filters stay semi-joins (`IN (SELECT …)`), which don't fan out.
- **Due-date rule for dated-in-the-past signals:**
  - Champion and liquidity items are due `detected_date__c + 7 days`, clamped to today when that has passed. The banker should act within a week of the change, so it reads as "due now" rather than months overdue.
  - Intent/competitor items are due `last_signal_date__c + 7 days`, same clamp.
  - Funding is due `last_funding_date__c + 14 days`, same clamp, with future funding dates treated as today.
  - These rules sit in each feed's `…QueueItems`. `buildPriorityQueue`'s date handling is unchanged (its only change is the reserved slot).
- **Demandbase is one fetch, not two:**
  - A single `fetchIntentSignals` collapses the latest week to one row per account. It takes the strongest topic by `intent_score__c`, and its kind is `competitor` when `researching_competitor__c` is non-null at Consideration or later, otherwise `surge`.
  - The query returns the top N of each kind with `ROW_NUMBER() OVER (PARTITION BY kind ORDER BY stage rank DESC, intent_score DESC, unique_researchers DESC)`. That way an account can't appear twice and each kind fills its own cap.
- **Alerts rail:**
  - Commercial gets one entry per feed: competitor research and champion departure in the **risk** tone, funding and intent surge in **opportunity**. Each uses `dropCovered(…, callList).slice(0, 2)`, like leadership changes.
  - Wealth gets one liquidity entry in the opportunity tone, plus the AI-brief sentence.
- **Display:** check whether any chip, icon or filter in `HomePage.tsx`, `PriorityQueueRow` or `PriorityQueueCard` is keyed on `segment` or `source`. Add mappings for the new source labels where it is. Otherwise `HomePage.tsx` stays unchanged.

## Open questions

None pending from the user.
