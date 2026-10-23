# Advisor Home Pages — Data Cloud Opportunities

Source: `dc-inventory-output/data_stream_inventory.html` (org `jdo-oe0sdd`, 434 streams).
**Suppressed streams omitted** — 187 unsuppressed streams considered. Every DMO named
below was probed live through `DcBridgeRest` on 2026-10-20; row counts / aggregates
quoted are real (latest snapshot period).

Scope: **book-level home pages only** (KPIs, priority queue, alerts, recommendations,
AI brief). Record-page (single-client) ideas are deliberately left out.

## Persona → app rule

| Inventory persona | Retail | Wealth | Commercial |
|---|:-:|:-:|:-:|
| `Personal` | ✅ | ✅ | — |
| `Business` | — | — | ✅ |
| `Personal; Business` / `Business; Personal` | ✅ | ✅ | ✅ |
| `All` (core CRM, FSC, marketing) | ✅ | ✅ | ✅ |

Within a both-persona DMO, filter by the account's `IsPersonAccount`: books are cleanly
split. Justin Chen and Sarah Smith own ~10.5K person accounts each, while Allen Carter
and Jose Sifontes own ~5K business accounts each.

## Book scoping (new pattern, verified)

Today every DC query filters `accountid LIKE '001am%'`, so the whole org is the "book".
Books are ~5–11K accounts, which is far too many for an `IN (...)` list, but a DC-side
join works:

```sql
SELECT COUNT(DISTINCT p.account_id__c) accts, SUM(p.balance_usd__c) bal
FROM BT_Plaid_Held_Away__dlm p
JOIN ssot__Account__dlm a ON a.ssot__Id__c = p.account_id__c
WHERE a.ssot__OwnerId__c = :currentUserId
  AND p.profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
```

Sarah Smith → 5,710 accounts / $3.21B held away at brokerages and robo-advisors. Apply this
join to every suggestion below so the numbers are *my* book's numbers. All `BT_` DMOs
are monthly/weekly snapshots, so always pin to `MAX(profile_*)` or the totals multiply.

---

## "View as" banker picker (shipped 2026-10-22)

The cockpit header on all three apps carries a **View as** pill (`ViewAsPicker` +
`_shared/src/data/viewAs.ts`). It lists users who own 100+ local accounts (largest book
first); choosing one is session-scoped (`sessionStorage`) and refetches the home data:

- **Data Cloud signals** book-scope to the chosen banker (`fetchEffectiveUser()` replaces
  `fetchCurrentUser()` as the owner Id passed to `queryDataCloudForBook`).
- **CRM GraphQL roots** get an owner filter (`ownerScopedQuery`): `OwnerId` on tasks,
  events, opportunities, leads and goals; the *account's* owner on `Case`,
  `PersonLifeEvent` (via `PrimaryPerson.Account`) and `CustomerGoal` (via
  `FinancialPlan.Account`), since those records are data-loaded, not banker-owned.
- It's a **preview, not a login-as**: GraphQL still runs with the logged-in user's
  sharing, and writes from the page are still made as them. For an exact permission
  replica use Setup → Users → Login.

## 0. Fix first — currently broken on the live home pages

| App | Problem | Fix |
|---|---|---|
| **Wealth** | `HELD_AWAY_SQL` reads `CumulusPlaidHeldAway__dlm`, which no longer exists (query fails, so the card is empty) | `BT_Plaid_Held_Away__dlm` (331,590 rows), snake_case fields: `account_id__c`, `balance_usd__c`, `institution_name__c`, `institution_type__c`, `monthly_net_flow_usd__c`, `is_active__c` |
| **Commercial** | `CREDIT_RISK_SQL` reads `CumulusDnBBusinessCredit__dlm` with camelCase fields (doesn't exist) | `BT_DNB_Business_Credit__dlm` (68,442 rows): `paydex_score__c`, `composite_risk_score__c`, `delinquency_predictor_score__c`, `dnb_rating__c`, `average_days_beyond_terms__c` |
| **Commercial** | `DELINQUENCY_SQL` reads `Loan_Delinquencies__dlm`, which doesn't exist (stream unmapped, last run FAILURE). The `.catch` hides it, so Delinquency Watch is always empty | Re-source the Delinquency Watch to D&B: book aggregate of `delinquency_predictor_score__c` / `average_days_beyond_terms__c` bands. Or drop the card |
| **All** | DC queries not book-scoped | Join pattern above |

✅ All four shipped 2026-10-20 (`queryDataCloudForBook` in `_shared`; it falls back to org-wide when a book has no rows).

---

## 1. Shared across all three (persona = `All` or `Personal; Business`)

| # | Data point | Source DMO (verified) | Home slot | Notes |
|---|---|---|---|---|
| S1 | **Relationship tone this week**: count of clients whose call sentiment is *Negative/Very Negative and Declining* | `BT_Gong_Call_Sentiment__dlm` (latest week: 282 Very-Neg/Neg declining, avg deal risk 45–69) | Priority Queue driver + Health KPI | Strong "who to call" signal that's distinct from CSAT. `rm_last_logged_note_date__c` vs `next_scheduled_call_date__c` gives a **"call coming up, notes stale"** prep flag. ✅ Shipped 2026-10-22 to all three queues + alerts (latest `profile_week__c`; 14–80 per book). "Call Tone Sliding" KPI with an 8-week trend shipped too (Retail Health strip + classic KPI grid in all three) |
| S2 | **Screening changes since last run**: AML/PEP/adverse-media rating changed | `BT_WorldCheck_AML__dlm` (latest: 99 High *Changed*, 177 Medium *Changed*, 344 Severe/High) | Alerts band (risk tone) | Only surface `change_since_last_run__c='Changed'`; the steady state belongs on the record page. ✅ Shipped 2026-10-22 to all three queues + alerts: daily `profile_date__c` snapshot, escalations only (rating up vs the previous run, or a first screening), with sanctions / PEP / adverse-media hits and the case ref |
| S3 | **Next-best-offer pipeline**: top action per client with conversion % and expected uplift $ | `Offer_Eligibility_Model__dlm` (279K rows; rank-1 leaders: MTG-30 $4.29M EV, AUTO-ACQ $3.43M, BIZ-CHK $1.42M) | Recommendations + Growth KPI "Modeled uplift in book" | Key is `MDM_ID__c = ssot__Account__dlm.External_ID_c__c` (MDM party key, 25,424 accounts; the `GEN-<AccountId>` form covers only 7 rows). Filter action codes per app (`BIZ-*` → Commercial; `WM-*`, `IRA-*` → Wealth; mortgage/auto/card/checking/savings → Retail). `Recommended_Channels__c` + EM/CC probabilities drive the CTA. ✅ Recommendations shipped 2026-10-22 to all three: each client's best-ranked eligible offer, then the top client per product (up to 3 cards, ahead of the CRM-derived ones). Person books get 3 Retail / 2 Wealth cards; business books get 1 (BIZ-CHK is the only business code). "Modeled Uplift" Growth KPI shipped 2026-10-22 to all three KPI grids (+ Retail's Growth-mode strip): each client's best-offer EV summed over the book, so it follows View as. Live: Sarah $4.57M Retail / $909K Wealth; business books are near-empty ($450 for Jose, since the model barely scores business accounts) |
| S4 | **Warm intros**: referral edges into accounts you don't own yet | `BT_Synth_Relationship_Graph__dlm` (42,690 `REFERRAL` edges, 3,010 `BUSINESS_OWNER`) | Leads & Referrals card | `confidence_pct__c >= 70` and `edge_discovered_date__c` within 30d gives "new connections this month". `BUSINESS_OWNER` is the bridge between Retail/Wealth and Commercial (see C6/W6). ✅ Shipped 2026-10-22 to all three Leads & Referrals cards: REFERRAL edges from my clients into accounts outside my book, deduped per prospect, ranked by confidence. ⚠ REFERRAL confidence tops out at ~65% (so `>= 70` matches nothing) and the newest edge is 2026-09-18, so the window is the 60 days before the latest edge, not before today. Many intros are cross-LOB. Row click opens the Lead modal in create mode, prefilled (Source = Referral) |
| S5 | **Transaction-derived moments**: large inbound credits (bonus, payroll change, tax refund) in the last 7d | `ssot__FinancialAccountTransaction__dlm` (21,186 rows, current through 2026-10-20) | Right Now / AI brief | Fresh, joinable via `SFAccountID__c`. "Bonus deposit $12.7K, idle cash" is a classic home-page nudge. ✅ Shipped 2026-10-22 in Retail + Wealth (queue, alerts, AI brief). Commercial slice shipped too: each client's largest $10K+ `ACH CREDIT <payer>` receipt in 7d → queue (excess-cash / sweep conversation), opportunity alerts, AI brief |
| S6 | **Campaign touches on my clients** (opened, not converted) | `Marketing_Engagements__dlm` has `personal_business__c` built in | Activity feed / follow-up queue | ⚠ Live hourly feed is thin (16 events / 30d, Personal only). ✅ Shipped 2026-10-22 to all three queues + alerts: clients who clicked a campaign (persona-filtered, unsubscribers excluded) in the 30 days before the book's latest click. The batch history ends mid-Sept, hence the anchor. The feed has no conversion event, so "not converted" isn't checked. Today each book's window holds one campaign (Sarah: Rewards Credit Card; Jose: Merchant Services Spotlight) |
| S7 | **Open service drag**: ServiceNow + CRM cases rolled together | `Service_Now` stream to `ssot__Case__dlm` (4,009) + `Case` | Cases KPI | Commercial-tagged (`All; Business`); include ServiceNow volume in Commercial's case count. ✅ Shipped 2026-10-22 to all three Cases KPIs: CRM open + the book's open ServiceNow cases (`open`/`in_progress`), with a "30d+" aged count (uiapi `CreatedDate lt range last_n_days 30`). ⚠ ServiceNow is keyed by synthetic `account_id_<n>` ids: only 6 rows (one account, Jose Sifontes' book) match a local Account, and the newest case is 2025-02-13. So it adds ~0 until re-keyed, and it never widens to org-wide |
| S8 | **Data freshness chip**: "Data as of …" per source in the hero | `generated_at__c` / `profile_month__c` on each `BT_` DMO | Hero `dataSourceCount` / confidence | Replaces the hardcoded confidence. BT snapshots range Jun–Oct 2026, so advisors should see it. ✅ Shipped 2026-10-22 to all three heroes (`DataFreshnessMeter`): latest date per source in one UNION query. Each source has a cadence allowance (daily 3d, weekly 10d, monthly 45d, batch 120d; CRM live). The meter = share current, stale sources are named inline and every as-of date is in the tooltip. Today ~67%: marketing, ServiceNow and CSAT read stale |

## 2. ReactRetail (Personal + shared)

| # | Data point | Source | Slot | Notes |
|---|---|---|---|---|
| R1 | **Home-equity opportunities**: HELOC score ≥ 70 with equity $ | `BT_Corelogic_Property__dlm` (latest Q: 10,375 / 25,424 ≥ 70) | Growth tab KPI + queue | `equity_usd__c`, `loan_to_value_pct__c`, `mortgage_rate_pct__c` (refi angle when rate is high). ✅ Shipped 2026-10-22: "Home Equity" KPI (Growth strip + classic grid) = equity of book owners scoring 70+ on the latest `profile_quarter__c`. The queue gets four HELOC leads (mostly free and clear) interleaved with four refi leads (mortgaged at ≥ 6.5%). Follows View as. Live: Sarah 3,689 owners / $2.20B / 218 refi |
| R2 | **Property-risk exposure**: clients in flood zone A/AE/V/VE or wildfire ≥ 70 | Same (4,535 flood, 3,390 wildfire) | Health tab / Alerts | Insurance cross-sell + proactive outreach after weather events. ✅ Shipped 2026-10-22: a "Property risk exposure" card on Retail's Health tab (under the pulse strip) shows Flood zone / Wildfire 70+ / Both counts, total home value + mortgage, and the six most exposed homes (both hazards first, then by value) opening quickview. The top two are also Risk alerts (`ap*`). Book-only owners, latest quarter. Follows View as. Live: Sarah 2,019 homes (1,210 flood, 887 wildfire, 78 both), $1.49B value / $537M mortgage |
| R3 | **Financial-stress watchlist**: `financial_stress_indicator__c='High'` | `BT_Claritas_Demographics__dlm` (3,519 high-stress across life stages) | Health tab | Pair with S5 (balance drops) for retention outreach, framed as hardship support  ✅ Shipped 2026-10-22: Health-tab "Financial-stress watchlist" card (`_shared/src/data/financialStress.ts`). The monthly flag churns (of Sarah's current High, only 289 were High the month before), so ≥ 4 of the last 6 months High counts as "persistent"; rows rank persistent + overdraft first, then any other overdraft client (so the 5 rows fill with fee evidence), then fee-less by months High; corroborated with `Overdraft Fee` debits on `ssot__FinancialAccountTransaction__dlm` (fee data spans only the last ~30 days). No balance-drop signal exists, so S5 pairing is via overdrafts instead. Sarah 1,751 High → 84 persistent / 41 with overdrafts / 3 both; Justin 1,763 → 76 / 36 / 2. Up to 5 "Hardship check-in" queue items (persistent, or 3+ months High with overdraft fees) + 2 alerts; persistent count on the At-Risk KPI note. |
| R4 | **Life-stage mix of my book** (donut) + mortgage/investment propensity | Claritas `life_stage__c`, `mortgage_propensity_score__c`, `investment_propensity_score__c` | Growth tab chart | "Young Families: 5,319, low wealth, high mortgage propensity" is how a banker plans the month  ✅ Shipped 2026-10-22: Growth-tab "Life-stage mix" card in both views (`_shared/src/data/lifeStageMix.ts`) — donut of the book by `life_stage__c` (latest month) + per-stage avg mortgage / investment / wealth propensity, each stage's strongest "lean", and 70+ ready counts. Sarah 10,541 profiled: Established Families 2,794, Young Families 2,536 (mortgage 80, all 2,536 70+), Empty Nesters 2,441 (investment 45); 2,976 mortgage-ready, 142 invest-ready. Vince West 1,316, Empty-Nester heavy at investment 93 / wealth 77. Young Families mortgage 70+ → 3 "Mortgage lead" queue items (also listed on the card: name → quick view, angle tag; one of each tenure — renter, free-and-clear, mortgaged — when the book has them, open slots filled renters first), placed on CoreLogic tenure: renters first (first-home pre-approval), then free-and-clear owners (move-up), then mortgaged owners (move-up / rate review). Sarah 2,536 → 903 renters / 475 free-and-clear / 1,158 mortgaged, so the queue is all renters at propensity ~90. |
| R5 | **Money leaving to other banks**: held-away *Bank / Credit Union* accounts with positive net flow | `BT_Plaid_Held_Away__dlm` (22K bank, 8K CU rows) | Priority Queue "deposit attrition" | Retail flavor of held-away = deposit capture, not AUM. ⚠ Bank-type balances sum **negative** (-$2.6B), so likely credit-card liabilities mixed in. Filter `account_type__c` ✅ Shipped 2026-10-22 in Retail: confirmed — the same Bank / CU institutions carry Credit Card, Mortgage and Auto Loan rows as negative balances, so deposits = `account_type__c IN ('Checking','Savings')` only. Latest month, active, positive `monthly_net_flow_usd__c` = money moving out. Health-tab card (held-away total, clients leaving, $/mo; top 5 by outflow with the institution taking the most), $5K+/mo → "Deposit retention" queue items (top 3, $10K+ medium) + alerts; card rows open a prefilled retention Task. Sarah Smith 4,885 clients / $165M held away, 3,204 leaving ($8.9M/mo), 216 at $5K+; Justin Chen 5,065 / $172M / 3,276 ($9.2M/mo) |
| R6 | **Digital-engagement surges**: recognized clients browsing product pages this week | `CumulusWeb_Engagements__dlm` (live, 36 events / 7d) + `ssot__WebsiteEngagement__dlm` | Right Now | Join via `UnifiedLinkssotAccountAcc__dlm` (see memory: deviceId join). "Visited mortgage calculator 3× today" is a top-of-page moment ✅ Shipped 2026-10-22 in Retail (`_shared/src/data/webEngagement.ts`): product-page views (`/products/<line>/<slug>`) UNIONed from the RTOM site (`ssot__WebsiteEngagement__dlm.ssot__LinkURL__c`) and the bank site (`CumulusWeb_Engagements__dlm.webInteractions_sourceUrl__c` — its unified-DMO rows carry no URL), device → Account via `UnifiedLinkssotAccountAcc__dlm` (same `UnifiedRecordId__c`, `001…` source), de-duplicated by event id. Recognized traffic is sparse, so the window is the 7 days up to the book's latest product view. Growth-tab "Browsing product pages" card (both views; name → quick view, row → prefilled follow-up Task on 5+ views within 14 days); those clients → "Follow up on <product> interest" queue items (top 3, medium if seen in the last 2 days), and a visit in the last 2 days takes over Right Now. Jose Sifontes: 1 client, Cash Rewards ×12 today; Sarah / Justin last browsed 2026-08-18 (Cash Rewards ×15, Travel Points ×10, CDs, 30-year fixed — card only, too old for the queue). ⚠ A household device links to every member account, so members show identical browsing; anonymous scanner traffic is excluded by recognition |
| R7 | **Replace CSAT-only Who-to-Call** with a blended score (CSAT + Gong S1 + stress R3 + offer S3) | existing `priorityQueue.ts` blend | Priority Queue | Already the pattern on PR #25; add these as drivers with labeled `source` |

## 3. ReactWealth (Personal + shared)

| # | Data point | Source | Slot | Notes |
|---|---|---|---|---|
| W1 | **Held-away AUM capture** (after fix #0): total brokerage + robo held away in book, top 8 by balance with institution | `BT_Plaid_Held_Away__dlm` (latest: $10.4B brokerage, $3.55B robo; Sarah's book $3.21B) | Hero KPI "Held-away opportunity" + queue | The single biggest wealth number in the org. `monthly_net_flow_usd__c > 0` = money actively going elsewhere, so it ranks higher. ✅ Shipped 2026-10-22: "Held-Away Opportunity" KPI (total balance, client count) is now the first cockpit vital (it replaces Active Goals in the 4-up row). Clicking it opens the queue / at-risk explorer. Queue rows with positive net flow get up to +0.15 score and a "+$X/mo still flowing out" reason suffix (org: 14,767 of 17,786 active brokerage/robo accounts are net-positive, up to ~$2.5K/mo). Follows View as |
| W2 | **Plans at risk**: Monte Carlo success < 70% | `BT_MoneyGuidePro_Financial_Plans__dlm` (21,274 / 36,912 below 70%) | Health KPI + queue | Rank by `total_goal_amount_usd__c`. Add "below 50%" as the today tier. ✅ Shipped 2026-10-22 (`_shared/data/planSignals.ts`): "Plans at Risk" KPI (risk-styled; note shows below-50%, reviews due, stale). Six queue rows ranked critical-first then goal $, with below 50% due today and below 70% in five days. The top two critical plans are also Risk alerts. Active + Stale plans only (Draft excluded). Follows View as. Live: Sarah 5,274 / 9,212 plans below 70% (154 below 50%), $9.0B of goals |
| W3 | **Reviews due / plans stale**: `next_review_date__c` ≤ 30d; `plan_last_updated_date__c` > 12 mo | Same (1,347 due in 30d; 4,550 stale) | Schedule / Prep | Feeds the "What meetings need prep?" chip directly. ✅ Shipped 2026-10-22: six dated queue rows ("Plan review due Oct 31 · success 62% · …", `dueDate` = the review date). The upcoming reviews lead the prep chip's AI context and its offline fallback. Stale = status Stale or not updated in 12 months (on the W2 KPI note). Live: Sarah 362 reviews due in 30d (none in 7d, none overdue), 1,344 stale |
| W4 | **Crypto & robo leakage**: clients with crypto-exchange or robo-advisor held-away balances | Plaid `institution_type__c` (5,559 crypto rows, $198M) | Growth insight card | Conversation starter for digital-asset / managed-account offers. ✅ Shipped 2026-10-22 (`_shared/data/digitalLeakage.ts`): a "Crypto & robo leakage" card under the cockpit's queue/actions row (and under the KPI grid in classic view). It shows crypto vs robo client counts + balances, the monthly money still flowing in, and the top three clients per kind by balance with institution (rows open quickview). Active, positive-balance accounts on the latest month. Follows View as. Live: Sarah crypto 1,897 clients / $58.7M (+$462K/mo), robo 1,856 / $780M (+$2.09M/mo) |
| W5 | **Trading activity pulse**: buys vs sells over the latest 7d of data | `Financial_Trades__dlm` (5.25M rows; balanced ~$6.8B each way) | Supporting band sparkline | ⚠ Stream is `BT_Financial_Trades` **FAILURE** and latest trade date is 2026-09-01, so data is stale until the stream recovers. Present as "as of" ✅ Shipped 2026-10-22: `_shared/src/data/tradingPulse.ts` → Wealth "Trading activity pulse" card (buys/sells sparklines over 8 trade weeks, "As of" chip, latest-week net sellers) + net-seller reinvest queue items (`ts*`) + `trades` freshness source. Confirmed USD trades only (mixed currencies, no FX). Trades land as weekly batches; latest 2026-08-31. Sarah Smith: ~$680–700M each way per week, top net seller $550K. |
| W6 | **Business-owner clients**: wealth clients who own a business (liquidity-event, 401k, succession angle) | `BT_Synth_Relationship_Graph__dlm` `BUSINESS_OWNER` edges (3,010) | Growth card | Pairs with C6 (same edge, opposite side) ✅ Shipped 2026-10-22: `_shared/src/data/businessOwners.ts` `fetchBusinessOwners` → Wealth "Business-owner clients" card + `bizOwners` KPI. One row per owner (largest business, $50M+ first) with ZoomInfo band → angle (liquidity event for $50M+, 401(k) for 51+ staff, else succession). ⚠ Owners sit only in Vince West / Kim Johnson / Adam Watson's books (207–234 each); Sarah/Justin fall back org-wide (662 owners, 2,644 businesses). Every edge's metadata is `ownership_pct: majority`. |
| W7 | **Wealth-propensity upgrades**: Claritas `wealth_propensity_score__c` ≥ 80 or `estimated_net_worth_band__c` ≥ $1M on clients not yet in a Wealth segment | `BT_Claritas_Demographics__dlm` | Leads / Growth | Prospecting from inside the existing book. ✅ Shipped 2026-10-22: "Wealth upgrade prospects" card + Upgrade Prospects KPI + `wu*` queue rows (`_shared/src/data/wealthUpgrades.ts`). "Wealth segment" = Account `FinServ_ClientCategory_c__c = 'Wealth Management'`. Sarah 312 / Justin 326 candidates, all $1M–$5M — nobody in those books reaches propensity ≥ 80 or $5M+ |
| W8 | **ESG-sensitive portfolios**: holdings in issuers with recent MSCI downgrades | `BT_MSCI_ESG_Scores__dlm` (805 downgrades latest month) | Alerts | Business-persona DMO used as an issuer lens; skip unless the holding→issuer join is available (`SecuritiesHolding_Home`). ⛔ Skipped 2026-10-22 — no join exists: `SecuritiesHolding_Home__dlm` isn't in the org; holdings live in `ssot__FinancialHolding__dlm` (1,291 rows, ~50 public tickers/ETFs like AMZN, MSFT, VTI) while MSCI rows key only on synthetic business `account_id__c` (no ticker/issuer field), and no MSCI-scored account carries a holding's issuer name. Trade `InstrumentName__c` ↔ account name matches 1 instrument. Revisit if MSCI lands a ticker column. ✅ Replaced 2026-10-22 with a **holdings concentration-risk** card: `ssot__FinancialHolding__dlm` (FinServ source only — `SecuritiesHolding` mirrors it), client concentrated when one single stock ≥ 20% of holdings (14 fund/ETF/money-market tickers excluded by name) → "Concentration risk" card + Concentrated Positions risk KPI + `hc*` diversification queue rows (`_shared/src/data/holdingsConcentration.ts`). Kim Johnson 5 of 10 clients, Adam Watson 4 of 5, org-wide 21 of 60 ($87M); Sarah/Justin hold none → org-wide |

## 4. ReactCommercial (Business + shared)

| # | Data point | Source | Slot | Notes |
|---|---|---|---|---|
| C1 | **Credit-risk Who-to-Call** (after fix #0): lowest PAYDEX + highest delinquency predictor | `BT_DNB_Business_Credit__dlm` (latest: 50 Severe, 6,310 High supplier-risk) | Priority Queue | ⚠ `failure_risk_score__c` looks **inverse** (Low-risk tier averages 85.7, Severe 25.1), so higher means safer. Don't rank DESC. ✅ Shipped 2026-10-22, direction confirmed: failure score, PAYDEX **and the delinquency predictor** are all higher = safer (the "highest delinquency predictor" above is backwards — delinquency averages 63 on Severe vs 76 on Low); `supplier_risk_level__c` is a straight band of the failure score (Severe 15–29 / High 30–59 / Moderate 60–79 / Low 80–99); `composite_risk_score__c` runs the other way (1–4, higher = riskier). Queue now ranks by a blended index `0.5·(100−failure) + 0.3·(100−PAYDEX) + 0.2·(100−delinquency)`; Credit Watch KPI counts the whole book (Severe or PAYDEX < 60) instead of the top 8. Allen Carter 180 on watch (48 Severe, 138 PAYDEX < 60) of 5,626; Jose Sifontes 0 — his weakest are 2,967 High-tier |
| C2 | **Rating-outlook changes**: Moody's Negative/Watch | `BT_Moodys_Market_Context__dlm` (946 Negative, 349 Watch) | Alerts (risk) | `outlook_last_changed_date__c` within 90d gives "new this quarter". ✅ Shipped 2026-10-22 (`_shared/data/marketSignals.ts`): "Outlook Neg / Watch" Health KPI + two risk alerts (Watch first, then flag count, then revenue). ⚠ No outlook changed in 2026: every `outlook_last_changed_date__c` is ≤ 2025-12-31, and the daily snapshots match between Jul 24 and Oct 22. So the alerts read "outlook Negative since <date>", and the 90-day "new" cut is not used. Live: Jose 425 Negative + 161 Watch |
| C3 | **Leadership change**: exec-turnover flag | `BT_Boardex__dlm` (2,172 flagged; 75 also Weak governance) | Alerts (opportunity/risk) | New CFO = treasury-management conversation; pair with Weak governance as risk. ✅ Shipped 2026-10-22: "Leadership Changes" Health KPI. Two opportunity alerts (turnover + `recent_governance_event_date__c` in 90d → treasury intro) and one risk alert (turnover on Weak governance → credit committee). Key-director names are HTML-decoded. Live: Jose 1,015 turnover, ~330 with a board event in 90d, 40 Weak |
| C4 | **ESG movers**: MSCI rating up/downgrades + controversy flags | `BT_MSCI_ESG_Scores__dlm` (874 up / 805 down) | Alerts / sustainability-lending opportunity | Upgrades suit green-loan pitches; downgrades are a credit-committee heads-up. ✅ Shipped 2026-10-22 (`fetchEsgMovers` in `_shared/data/marketSignals.ts`): "ESG Movers" Health KPI (up / down / with controversies). Two upgrade opportunity alerts (highest ESG score → sustainability-linked / green-loan pitch) and two downgrade risk alerts (most controversy flags + top category → credit committee). ⚠ Synthetic data: `last_rating_change_direction__c` often disagrees with the actual Sep→Oct rating diff (7,741 "Unchanged" rows changed rating), so the flag drives selection and only the current rating is shown. Live: Jose 402 up / 356 down |
| C5 | **Firmographic growth tier mix**: revenue-band and employee-band distribution of my book; upmarket clients ($50M+) highlighted | `BT_Zoominfo_Firmographics__dlm` (229 $50M–$200M, 38 $200M–$1B, 20 $1B+) | Growth chart | `tech_stack_flags__c` gives integration-ready treasury pitches (e.g., "uses NetSuite → ERP-connected payments") ✅ Shipped 2026-10-22: `_shared/src/data/firmographics.ts` → Commercial "Growth-tier mix" card (revenue-band bars with $50M+ highlighted, employee-band line, top five upmarket clients with a tech-stack pitch) + `upmarket` KPI + `zoominfo` freshness source. No ERP/NetSuite flags exist; pitches map Workday→payroll, Salesforce/HubSpot→receivables, Snowflake/AWS→API cash reporting, Tableau→data feed, Okta→SSO. Allen Carter: 215/22/6 upmarket of ~5.6K; Jose Sifontes' book is ~all <$1M (card says so). DC SQL rejects simple `CASE col WHEN` — use searched CASE. |
| C6 | **Owner-wealth handoff**: business owners on my book with personal wealth potential | Graph `BUSINESS_OWNER` + Claritas on the owner's person account | Leads | Cross-LOB referral to Wealth, the counterpart of W6 ✅ Shipped 2026-10-22: `fetchOwnerWealthHandoffs` + `ownerHandoffLeads` → Commercial Leads rows ("Owner of {business} · refer to Wealth", click opens LeadModal in create mode), interleaved with S4 intros, plus top-2 `aoh*` opportunity alerts. Ranked by Claritas net-worth band, then wealth propensity (often saturates at 100), then edge confidence. Allen Carter: 576 owners, 515 with $1M+ est. net worth. |
| C7 | **Branch / market footprint** (if the book is geo-assigned): wealth index and foot traffic around clients' branches | `BT_ESRI_GEO_Footprint__dlm` (11,700 Optimize / 1,627 Consolidate) | Health card | Lower priority; more useful for a market-manager view than an RM. ✅ Shipped 2026-10-22: "Branch & market footprint" card + Consolidate-Branch Clients risk KPI + `afp*` alerts (`_shared/src/data/marketFootprint.ts`). ESRI has no account id, so clients are placed by `BillingPostalCode` = `branch_zip__c` (partial coverage). Allen 1,788 clients / 1,051 ZIPs (227 Consolidate); Jose 998 / 343 (114) |
| C8 | **Biz-checking / treasury offers** from the offer model (`BIZ-CHK` 3,030 rank-1, $1.42M EV) | `Offer_Eligibility_Model__dlm` | Recommendations | Commercial-filtered S3. ✅ Shipped with S3 2026-10-22 |
| C9 | **Cash-flow stress** from business transactions (Business Services / Fees & Charges spikes) | `ssot__FinancialAccountTransaction__dlm` | Health / Right Now | Business slice of S5. ✅ Shipped 2026-10-22: 3+ NSF / overdraft / late fees in 30d (queue, alerts, AI brief) |

---

## 5. Data caveats found while probing

Source-side fixes are written up for the Snowflake agent in
[`SNOWFLAKE_DATA_FIXES.md`](SNOWFLAKE_DATA_FIXES.md). Summary:

- **Training data is training-only.** `Churn_Training_Data`, `ML_Attrition_Training_Data` and
  `CSAT_Prediction_Training` are never read by the UI. Only input and scoring/output DMOs are read.
- **Product recommendations need re-keying in Snowflake.** The source carries `B-000001`/`P-000001`
  instead of Account Ids. Also, both business streams map into the *input* DMO. Not usable
  until fixed.
- **Attrition / CSAT-prediction input / Enrollments need a backfill.** They cover 159 local accounts
  today; they need all ~36K. Wire them once the backfill lands.
- **Heroku Deposits / Loans / Lines / Investments: ✅ backfilled 2026-10-20.** 31,916 FinServ accounts now have 12 monthly
  snapshots through 2026-10-01, keyed `<PRODUCT>-<FinServ Id>`. This enables home signals like deposit
  outflows, loan paydown/maturity and line utilization.
- **Transactions: ✅ keyed to FinServ accounts 2026-10-22.**
  - 1.66M rows over 90 days cover all 31,905 open FinServ accounts.
  - `ssot__FinancialAccountID__c` is now mapped and joins `ssot__FinancialAccount__dlm`.
  - The daily generator keeps them current from its account master. Details in §7 of the fixes doc.
  - This unblocks S5 and C9.
- **Trades anchor on the latest Snowflake date.** Windows key on `MAX(trade_date)`. The
  `BT_Financial_Trades` stream is failing (DC max 2026-09-01) and needs repair to land newer data.
- **Failing streams (inventory `FAILURE`):** `BT_Financial_Trades`, `Loan_Delinquencies`,
  `Financial_Transactions_Snow/_XL/_GCP`, `GCP_Transactions`, `Attrition_Inputs_Snowflake`.
- `BT_Gong_Call_Sentiment.last_call_date__c` is null on sampled rows. Use `profile_week__c` + `call_count_last_7d__c`.
- **ServiceNow cases need re-keying.** `ssot__Case__dlm` rows from `Service_Now` (4,009) carry `account_id_<n>` instead of Salesforce Account Ids, and stop at 2025-02-13. The S7 Cases KPI is ready and fills in once the source maps to `001am…` ids.
- `SEC_Filings__dlm` has only 11 rows of section text. It's record-page RAG material, not a home-page metric.

## 6. Suggested order

1. **Fix #0** (Wealth held-away, Commercial credit + delinquency) plus book-scoping join. This is small and restores what's already designed.
2. One high-signal tile per app: **W1** held-away AUM, **R1** HELOC equity, **C2/C3** outlook + leadership alerts.
3. Shared signals into the blended Priority Queue: **S1** Gong, **S2** AML changes, **S3** offer model.
4. Growth/Health tab charts: **R4**, **C5**, **W2/W3**.
