/**
 * HOME app — REAL data implementation for the Wealth "Advisory Desk".
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal) → GraphQL
 *   · Data Cloud held-away capture (BT_Plaid_Held_Away__dlm) → DcBridgeRest,
 *     scoped to the signed-in advisor's book (falls back to org-wide when empty)
 *   · S5 bonus / tax-refund inflows (ssot__FinancialAccountTransaction__dlm),
 *     same book scoping — fresh cash = an investable-assets conversation
 *   · S1 Gong call sentiment (BT_Gong_Call_Sentiment__dlm), latest week,
 *     negative + declining → queue + alerts, same book scoping
 *   · S2 World-Check AML / PEP screening (BT_WorldCheck_AML__dlm), latest
 *     run, ratings that escalated since the previous run → queue + alerts
 *   · S3 next-best offers (Offer_Eligibility_Model__dlm), this app's product
 *     family, one card per product → top of Recommendations
 *   · S4 warm intros (BT_Synth_Relationship_Graph__dlm), referrals from my
 *     clients into accounts outside my book → Leads & Referrals
 *   · S3 Growth KPI "Modeled uplift" — each client's best-offer EV, summed
 *   · S6 campaign touches (Marketing_Engagements__dlm), clicked-through clients
 *     → queue + alerts
 *   · S7 open service drag: CRM + ServiceNow open cases (book-only) → Cases KPI
 *   · S8 data freshness per source → hero meter (replaces static confidence)
 *   · W1 held-away opportunity: total brokerage + robo balance → lead vital KPI;
 *     clients still contributing to the external account rank higher in the queue
 *   · W2 plans at risk (BT_MoneyGuidePro_Financial_Plans__dlm): Monte Carlo < 70%
 *     → Health KPI + queue (< 50% due today) + alerts
 *   · W3 plan reviews due in 30d (same DMO) → dated queue items + the
 *     "What meetings need prep?" chip; stale plans counted on the KPI note
 *   · W4 crypto & robo leakage (Plaid held-away, Crypto Exchange / Robo-Advisor)
 *     → digital-assets insight card under the queue
 *   · W5 trading pulse (Financial_Trades__dlm, confirmed USD): eight weeks of
 *     buys vs sells "as of" the latest trade → card; net sellers → reinvest queue
 *   · W6 business-owner clients (relationship graph BUSINESS_OWNER + ZoomInfo on
 *     the business): liquidity-event / 401(k) / succession angle → growth card + KPI
 *   · W7 wealth-propensity upgrades (BT_Claritas_Demographics__dlm): $1M+ net worth
 *     or propensity ≥ 80, not yet in the Wealth Management category → card, KPI, queue
 *   · W8 holdings concentration (ssot__FinancialHolding__dlm, FinServ source): a
 *     single stock ≥ 20% of a client's holdings → card, risk KPI, diversification queue
 *
 *   · W9 blended Who-to-Call: held-away + outflow, W2 plans, Gong, W8 concentration
 *     → one weighted score per client, driver tags on each row
 *
 * The persona signal is HELD-AWAY: it anchors the vital KPI and is the
 * opportunity driver in the blended "who to call" score. Field names + DMO columns verified live against jdo-oe0sdd
 * (2026-10-20) via uiapi + DcBridgeRest probes.
 */
import { executeGraphQL, queryDataCloud, queryDataCloudForBook, fetchEffectiveUser, getViewAs, ownerScopedQuery, fetchLargeInflows, inflowQueueItems, type TxSignalResult, type LargeInflow, fetchCallSentiment, callSentimentQueueItems, type CallSentimentResult, fetchAmlChanges, amlChangeQueueItems, type AmlChange, fetchNextBestOffers, offerRecommendations, type NextBestOfferResult, fetchWarmIntros, warmIntroLeads, interleave, type WarmIntroResult, fetchModeledUplift, type ModeledUplift, fetchCampaignTouches, campaignTouchQueueItems, type CampaignTouchResult, fetchServiceNowDrag, type ServiceNowDrag, fetchDataFreshness, type DataFreshness, fetchPlanHealth, planRiskQueueItems, planReviewQueueItems, type PlanHealthResult, fetchDigitalLeakage, type DigitalLeakageResult, fetchTradingPulse, netSellerQueueItems, type TradingPulseResult, fetchBusinessOwners, type BusinessOwnersResult, fetchWealthUpgrades, wealthUpgradeQueueItems, type WealthUpgradeResult, fetchHoldingsConcentration, concentrationQueueItems, type HoldingsConcentrationResult, fetchWealthWhoToCall, wealthWhoToCallItems, dropCovered } from '@shared';
import type { HomeDashboard, CallItem, CaseItem, CustomerGoal, ScheduleItem, BankerGoal, LeadReferral, PipelineItem, Recommendation, RightNowItem, LifeEventSignal, ActivityItem, PipelineMovement } from './homeTypes';

/** Deterministic pseudo-trend for a sparkline (no Math.random — it breaks
 *  SSR/replay). Wobbles around `end` using the seed's char codes. */
function seedTrend(seed: string, end: number, n = 8): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const wobble = ((h % 1000) / 1000 - 0.5) * 0.25; // ±12.5%
    const ramp = 0.8 + (0.2 * i) / (n - 1); // trend upward into `end`
    out.push(Math.max(0, Math.round(end * ramp * (1 + wobble))));
  }
  out[n - 1] = end;
  return out;
}

/* ── Life-event signals ───────────────────────────────────────────
   Now LIVE against the org's native PersonLifeEvent object (see the
   PersonLifeEvent block in HOME_CORE_QUERY). The banker's book carries
   thousands of these; we window to the 200 most-recent by EventDate and map
   each to a signal row. EventType drives a per-type icon + a suggested
   next-best-action ("opportunity"); the primary person's Account name is the
   client. recordId/contactId power the edit modal. */

/** PersonLifeEvent.EventType → display icon. Falls back to a generic marker. */
const LIFE_EVENT_ICONS: Record<string, string> = {
  Birth: '👶', Baby: '👶', Graduation: '🎓', Job: '💼', Marriage: '💍',
  Relocation: '📦', Home: '🏡', Car: '🚗', Diagnosis: '🩺', Retirement: '🌅',
};
const lifeEventIcon = (type: string): string => LIFE_EVENT_ICONS[type] ?? '📌';

/** PersonLifeEvent.EventType → a banker's suggested next-best-action line. */
const LIFE_EVENT_PLAYS: Record<string, string> = {
  Birth: 'Review education savings (529) & guardianship coverage.',
  Baby: 'Review education savings (529) & guardianship coverage.',
  Graduation: 'Coordinate 529 final distribution & next steps.',
  Job: 'Align income transition & benefits rollover.',
  Marriage: 'Revisit joint accounts, beneficiaries & coverage.',
  Relocation: 'Reassess mortgage, local banking & insurance.',
  Home: 'Explore mortgage, HELOC & homeowner coverage.',
  Car: 'Review financing options & insurance.',
  Diagnosis: 'Check emergency reserves & protection coverage.',
  Retirement: 'Build the income-drawdown & rollover plan.',
};
const lifeEventPlay = (type: string): string =>
  LIFE_EVENT_PLAYS[type] ?? 'Reach out to discuss what this means for their plan.';

/** Datetime 'YYYY-MM-DDThh:mm:ss…' or date-only → 'YYYY-MM-DD' for the modal. */
const dateOnly = (dt: string): string => (dt ? dt.slice(0, 10) : '');

/** Short human date for the row's "when", e.g. "Nov 16". '' → '—'. */
const shortWhen = (dt: string): string => {
  const d = dateOnly(dt);
  if (!d) return '—';
  const parsed = new Date(`${d}T00:00:00`);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* ── Core/FSC via GraphQL (verified fields) ────────────────── */
const HOME_CORE_QUERY = /* GraphQL */ `
  query WealthBook {
    uiapi {
      query {
        Opportunity(first: 200, where: { IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
          totalCount
          edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } CloseDate @optional { value } Probability @optional { value } Account @optional { Name @optional { value } } } }
        }
        Case(first: 8, where: { IsClosed: { eq: false } }, orderBy: { CreatedDate: { order: DESC } }) {
          totalCount
          edges { node { Id CaseNumber @optional { value } Subject @optional { value } Priority @optional { value } Status @optional { value } CreatedDate @optional { value } AccountId @optional { value } Account @optional { Name @optional { value } } } }
        }
        CaseAged: Case(first: 1, where: { IsClosed: { eq: false }, CreatedDate: { lt: { range: { last_n_days: 30 } } } }) {
          totalCount
        }
        TaskOverdue: Task(first: 15, where: { IsClosed: { eq: false }, ActivityDate: { lt: { literal: TODAY } } }, orderBy: { ActivityDate: { order: DESC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } Status @optional { value } Priority @optional { value } Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value } } }
        }
        TaskUpcoming: Task(first: 25, where: { IsClosed: { eq: false }, ActivityDate: { gte: { literal: TODAY } } }, orderBy: { ActivityDate: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDate @optional { value } Status @optional { value } Priority @optional { value } Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value } } }
        }
        Event(first: 15, where: { ActivityDateTime: { gte: { literal: TODAY } } }, orderBy: { ActivityDateTime: { order: ASC } }) {
          edges { node { Id Subject @optional { value } ActivityDateTime @optional { value } Type @optional { value } Description @optional { value } WhatId @optional { value } OwnerId @optional { value } Location @optional { value } ShowAs @optional { value } CreatedBy @optional { Name @optional { value } } CreatedDate @optional { value } LastModifiedBy @optional { Name @optional { value } } LastModifiedDate @optional { value } } }
        }
        FinancialGoal(first: 6) {
          edges { node { Id Name @optional { value } TargetAmount @optional { value } ActualAmount @optional { value } } }
        }
        CustomerGoal: FinancialGoal(first: 8, where: { and: [ { TargetDate: { gte: { literal: TODAY } } }, { Status: { ne: "COMPLETED" } }, { FinancialPlanId: { ne: null } } ] }, orderBy: { TargetDate: { order: ASC } }) {
          edges { node { Id Name @optional { value } Status @optional { value } Priority @optional { value } Type @optional { value } Description @optional { value } TargetDate @optional { value } TargetAmount @optional { value } ActualAmount @optional { value } FinancialPlan @optional { Name @optional { value } AccountId @optional { value } Account @optional { Name @optional { value } } } } }
        }
        Lead(first: 6, where: { IsConverted: { eq: false } }) {
          edges { node { Id Name @optional { value } FirstName @optional { value } LastName @optional { value } Company @optional { value } Status @optional { value } LeadSource @optional { value } AnnualRevenue @optional { value } Email @optional { value } } }
        }
        PersonLifeEvent(first: 200, orderBy: { EventDate: { order: DESC } }) {
          edges { node { Id Name @optional { value } EventType @optional { value } EventDate @optional { value } PrimaryPersonId @optional { value } PrimaryPerson @optional { Name @optional { value } Account @optional { Name @optional { value } } } } }
        }
      }
    }
  }
`;

/* ── Account name lookup (IDs → names). Id is a PLAIN string on nodes;
   Name is wrapped in { value }. IDs are org-generated alphanumerics (safe). */
function accountNamesQuery(ids: string[]): string {
  const list = ids.map(id => `"${id.replace(/[^A-Za-z0-9]/g, '')}"`).join(', ');
  return `query AccountNames {
    uiapi {
      query {
        Account(first: 50, where: { Id: { in: [${list}] } }) {
          edges { node { Id Name @optional { value } } }
        }
      }
    }
  }`;
}

/** Batch User-name lookup for Owner Ids → "Assigned To". Same inline-literal
 *  approach as accountNamesQuery (SDK list-variable forwarding is unreliable). */
function userNamesQuery(ids: string[]): string {
  const list = ids.map(id => `"${id.replace(/[^A-Za-z0-9]/g, '')}"`).join(', ');
  return `query UserNames {
    uiapi {
      query {
        User(first: 50, where: { Id: { in: [${list}] } }) {
          edges { node { Id Name @optional { value } } }
        }
      }
    }
  }`;
}

/* ── Data Cloud: largest held-away investable assets = "who to call" ──
   BT_Plaid_Held_Away__dlm is a monthly snapshot (one row per external account
   per profile_month) — pin to the latest month or balances multiply. Liability
   types (Credit Card / Mortgage / Auto Loan) are stored as negative balances
   and Bank / Credit Union / Crypto aren't AUM, so only Brokerage + Robo-Advisor
   assets count. One row per client: their total, plus their largest holding. */
const heldAwaySql = (accountFilter: string) => `
  SELECT account_id, balance, institution, acct_type, net_flow, holdings FROM (
    SELECT account_id__c AS account_id,
           SUM(balance_usd__c) OVER (PARTITION BY account_id__c) AS balance,
           SUM(monthly_net_flow_usd__c) OVER (PARTITION BY account_id__c) AS net_flow,
           COUNT(*) OVER (PARTITION BY account_id__c) AS holdings,
           institution_name__c AS institution, account_type__c AS acct_type,
           ROW_NUMBER() OVER (PARTITION BY account_id__c ORDER BY balance_usd__c DESC) AS rn
    FROM BT_Plaid_Held_Away__dlm
    WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
      AND is_active__c = true AND balance_usd__c > 0
      AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
      AND account_id__c ${accountFilter}
  ) t
  WHERE rn = 1
  ORDER BY balance DESC
  LIMIT 8
`;

/** Book total behind the top-8 list, over the same slice (same filter). */
const heldAwayTotalSql = (accountFilter: string) => `
  SELECT COUNT(DISTINCT account_id__c) AS clients, SUM(balance_usd__c) AS balance
  FROM BT_Plaid_Held_Away__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_Plaid_Held_Away__dlm)
    AND is_active__c = true AND balance_usd__c > 0
    AND institution_type__c IN ('Brokerage', 'Robo-Advisor')
    AND account_id__c ${accountFilter}
`;

interface HeldAwayRow { account_id: string; balance: number; institution: string; acct_type: string; net_flow: number; holdings: number; }
interface HeldAwayTotalRow { clients: number; balance: number; }
type Node = Record<string, { value?: unknown } | undefined>;
const v = (n: Node, k: string) => (n[k] as { value?: unknown } | undefined)?.value;
const s = (n: Node, k: string) => String(v(n, k) ?? '');
const num = (n: Node, k: string) => Number(v(n, k) ?? 0);
/** Decode the HTML entities uiapi returns in string values (e.g. "Olivia&#39;s
 *  College" → "Olivia's College"). Handles the numeric + named entities that
 *  appear in free-text FSC fields; leaves plain text untouched. */
const decodeHtml = (str: string): string =>
  str.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
/** String field, HTML-decoded — for human-facing free text. */
const sd = (n: Node, k: string) => decodeHtml(s(n, k));
/** Extract a relationship's Name.value (CreatedBy/LastModifiedBy) — '' if absent. */
const relName = (n: Node, k: string): string =>
  String((n as Record<string, { Name?: { value?: unknown } } | undefined>)[k]?.Name?.value ?? '');

interface CoreShape {
  uiapi?: { query?: {
    Opportunity?: { totalCount?: number; edges?: { node: Node & { Account?: { Name?: { value?: string } } } }[] };
    CaseAged?: { totalCount?: number };
    Case?: { totalCount?: number; edges?: { node: Node & { Account?: { Name?: { value?: string } } } }[] };
    TaskOverdue?: { edges?: { node: Node }[] };
    TaskUpcoming?: { edges?: { node: Node }[] };
    Event?: { edges?: { node: Node }[] };
    FinancialGoal?: { edges?: { node: Node }[] };
    CustomerGoal?: { edges?: { node: Node & { FinancialPlan?: { Name?: { value?: string }; AccountId?: { value?: string }; Account?: { Name?: { value?: string } } } } }[] };
    Lead?: { edges?: { node: Node }[] };
    PersonLifeEvent?: { edges?: { node: Node & { PrimaryPerson?: { Name?: { value?: string }; Account?: { Name?: { value?: string } } } } }[] };
  } };
}

export async function fetchHomeDashboardReal(): Promise<HomeDashboard> {
  // The held-away query needs the advisor's user Id to scope to their book;
  // GraphQL runs in parallel with that chain.
  // "View as" swaps in another banker: their Id drives every DC book filter
  // and the CRM roots below get an owner filter (none for your own book).
  const userP = fetchEffectiveUser();
  const [core, held, who, currentUser, inflows, gong, aml, offers, intros, uplift, touches, serviceNow, freshness, plans, leakage, trades, owners, upgrades, concentration] = await Promise.all([
    executeGraphQL<CoreShape>(ownerScopedQuery(HOME_CORE_QUERY, getViewAs()?.userId)),
    userP.then(u => queryDataCloudForBook<HeldAwayRow>(heldAwaySql, u?.userId, 8)),
    userP.then(u => fetchWealthWhoToCall(u?.userId)),
    userP,
    // S5 is additive — a failed transaction query must not blank the page.
    userP.then(u => fetchLargeInflows(u?.userId))
      .catch((): TxSignalResult<LargeInflow> => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchCallSentiment(u?.userId))
      .catch((): CallSentimentResult => ({ rows: [], scope: 'org', weekly: [] })),
    userP.then(u => fetchAmlChanges(u?.userId))
      .catch((): TxSignalResult<AmlChange> => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchNextBestOffers(u?.userId, 'wealth'))
      .catch((): NextBestOfferResult => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchWarmIntros(u?.userId))
      .catch((): WarmIntroResult => ({ rows: [], scope: 'org' })),
    // S3 Growth KPI + S6 campaign touches — additive, like the other DC signals.
    userP.then(u => fetchModeledUplift(u?.userId, 'wealth'))
      .catch((): ModeledUplift => ({ total: 0, clients: 0, byOffer: [], scope: 'org' })),
    userP.then(u => fetchCampaignTouches(u?.userId, 'Personal'))
      .catch((): CampaignTouchResult => ({ rows: [], scope: 'org' })),
    // S7 ServiceNow open cases (book-only) + S8 per-source freshness.
    userP.then(u => fetchServiceNowDrag(u?.userId))
      .catch((): ServiceNowDrag => ({ open: 0, aged: 0, scope: 'org' })),
    fetchDataFreshness(['transactions', 'worldCheck', 'marketing', 'serviceNow', 'gong', 'graph', 'offers', 'plaid', 'moneyGuidePro', 'trades', 'claritas'])
      .catch((): DataFreshness | undefined => undefined),
    // W2 / W3 MoneyGuidePro plan health — additive.
    userP.then(u => fetchPlanHealth(u?.userId))
      .catch((): PlanHealthResult => ({ atRiskRows: [], reviewRows: [], plans: 0, atRisk: 0, critical: 0, atRiskGoalUsd: 0, due30: 0, stale: 0, scope: 'org' })),
    // W4 crypto + robo held-away — additive.
    userP.then(u => fetchDigitalLeakage(u?.userId))
      .catch((): DigitalLeakageResult => ({ rows: [], crypto: { clients: 0, balance: 0, inflow: 0 }, robo: { clients: 0, balance: 0, inflow: 0 }, scope: 'org' })),
    // W5 trading pulse — additive; the stream is stale, so the card shows its as-of.
    userP.then(u => fetchTradingPulse(u?.userId))
      .catch((): TradingPulseResult => ({ weeks: [], asOf: '', buys: 0, sells: 0, net: 0, sellers: [], scope: 'org' })),
    // W6 business-owner clients — additive.
    userP.then(u => fetchBusinessOwners(u?.userId))
      .catch((): BusinessOwnersResult => ({ rows: [], owners: 0, businesses: 0, upmarket: 0, scope: 'org' })),
    // W7 Claritas wealth-propensity upgrades — additive.
    userP.then(u => fetchWealthUpgrades(u?.userId))
      .catch((): WealthUpgradeResult => ({ rows: [], candidates: 0, fiveM: 0, highPropensity: 0, scope: 'org' })),
    // W8 single-stock concentration — additive.
    userP.then(u => fetchHoldingsConcentration(u?.userId))
      .catch((): HoldingsConcentrationResult => ({ rows: [], exposures: [], clients: 0, concentrated: 0, aum: 0, singleStockShare: 0, scope: 'org' })),
  ]);
  const heldTotal = await queryDataCloud<HeldAwayTotalRow>(heldAwayTotalSql(held.accountFilter), 1)
    .then(r => r.rows[0])
    .catch(() => undefined);
  const scopeNote = held.scope === 'org' ? ' · org-wide' : '';
  // Greet the logged-in banker by first name; fall back to full name, then a
  // demo default if the identity call is unavailable (e.g. mock/offline).
  const bankerName = currentUser?.firstName || currentUser?.name || 'Alex';
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  // resolve held-away + inflow account IDs → names
  const ids = [...new Set([...who.rows.map(r => r.accountId), ...inflows.rows.map(r => r.accountId), ...gong.rows.map(r => r.accountId), ...aml.rows.map(r => r.accountId), ...offers.rows.map(r => r.accountId), ...intros.rows.map(r => r.referrerId), ...touches.rows.map(r => r.accountId), ...plans.atRiskRows.map(r => r.accountId), ...plans.reviewRows.map(r => r.accountId), ...leakage.rows.map(r => r.accountId), ...trades.sellers.map(r => r.accountId), ...owners.rows.map(r => r.accountId), ...upgrades.rows.map(r => r.accountId), ...concentration.rows.map(r => r.accountId)].filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (ids.length) {
    try {
      const names = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(accountNamesQuery(ids));
      for (const e of names.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) nameById[id] = s(e.node, 'Name');
      }
    } catch { /* names best-effort; fall back to raw ID */ }
  }

  // S1 — clients whose recorded-call sentiment is negative and sliding.
  // S2 — screening ratings that escalated on the latest World-Check run.
  const amlSignals: CallItem[] = amlChangeQueueItems(aml, nameById, { segment: 'Wealth' });
  const gongSignals: CallItem[] = callSentimentQueueItems(gong, nameById, { segment: 'Wealth' });
  // S5 — fresh bonus / tax-refund cash that could be put to work.
  const txSignals: CallItem[] = inflowQueueItems(inflows, nameById, {
    segment: 'Wealth', action: 'Invest new cash — portfolio top-up',
  });
  // S6 — clients who clicked through a campaign: a warm follow-up.
  const campaignSignals: CallItem[] = campaignTouchQueueItems(touches, nameById, { segment: 'Wealth' });
  // W2 — plans below 70% Monte Carlo success; W3 — plan reviews coming due.
  const planRiskSignals: CallItem[] = planRiskQueueItems(plans, nameById, { segment: 'Wealth' });
  const reviewSignals: CallItem[] = planReviewQueueItems(plans, nameById, { segment: 'Wealth' });
  // W5 — net sellers in the latest trade week: cash raised, ready to reinvest.
  const sellerSignals: CallItem[] = netSellerQueueItems(trades, nameById, { segment: 'Wealth' });
  // W7 — clients who look like Wealth clients but are still categorised Retail.
  const upgradeSignals: CallItem[] = wealthUpgradeQueueItems(upgrades, nameById, { segment: 'Wealth' });
  // W8 — a single stock ≥ 20% of the client's holdings: diversification review.
  const concentrationSignals: CallItem[] = concentrationQueueItems(concentration, nameById, { segment: 'Wealth' });
  // S1 Health KPI — book count of negative + declining clients, with the real
  // 8-week series behind the sparkline and a week-over-week delta.
  const toneSeries = gong.weekly.map(w => w.count);
  const toneNow = toneSeries.length ? toneSeries[toneSeries.length - 1] : gong.rows.length;
  const tonePrev = toneSeries.length > 1 ? toneSeries[toneSeries.length - 2] : 0;
  const inflowTotal = inflows.rows.reduce((sum, r) => sum + r.amount, 0);

  const totalHeldAway = Number(heldTotal?.balance ?? held.rows.reduce((sum, r) => sum + Number(r.balance || 0), 0));
  const heldAwayClients = Number(heldTotal?.clients ?? held.rows.length);
  const pipelineValue = (opp?.edges ?? []).reduce((sum, e) => sum + num(e.node, 'Amount'), 0);

  // W9 — the blended Who-to-Call: held-away balance + outflow, plans at risk,
  // souring Gong calls and single-stock concentration, one score per client.
  const callList: CallItem[] = wealthWhoToCallItems(who, nameById, { segment: 'Private Wealth' });
  // Plan-risk / Gong / concentration clients already in the blended Who-to-Call don't repeat as their own item.
  const transactionSignals: CallItem[] = [...amlSignals, ...dropCovered(planRiskSignals, callList), ...dropCovered(gongSignals, callList), ...txSignals, ...campaignSignals, ...reviewSignals, ...sellerSignals, ...upgradeSignals, ...dropCovered(concentrationSignals, callList)];

  // Two Task windows (overdue DESC + today/future ASC) so a recent task isn't
  // buried under the thousands-deep overdue backlog a single ASC window returns.
  // Events are scoped to today-and-future (a past meeting isn't actionable).
  // bucketSchedule() on the page re-sorts the merged feed into Overdue/Today/Upcoming.
  // Resolve Owner Ids → "Assigned To" names in one batch lookup (best-effort).
  const ownerIds = [...new Set(
    [q?.TaskOverdue, q?.TaskUpcoming, q?.Event]
      .flatMap(feed => feed?.edges ?? [])
      .map(e => s(e.node, 'OwnerId'))
      .filter(Boolean),
  )];
  const ownerNameById: Record<string, string> = {};
  if (ownerIds.length) {
    try {
      const users = await executeGraphQL<{ uiapi?: { query?: { User?: { edges?: { node: Node }[] } } } }>(
        userNamesQuery(ownerIds),
      );
      for (const e of users.uiapi?.query?.User?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) ownerNameById[id] = s(e.node, 'Name');
      }
    } catch { /* names are best-effort; fall back to undefined */ }
  }

  // Resolve related Account WhatIds -> "Related To" customer names (Account
  // whats only, 001 prefix). The polymorphic What field can't expose Name in
  // uiapi, so a follow-up Account lookup ties each activity back to its customer.
  const whatAcctIds = [...new Set(
    [q?.TaskOverdue, q?.TaskUpcoming, q?.Event]
      .flatMap(feed => feed?.edges ?? [])
      .map(e => s(e.node, 'WhatId'))
      .filter(id => id.startsWith('001')),
  )];
  const whatNameById: Record<string, string> = {};
  if (whatAcctIds.length) {
    try {
      const accts = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(
        accountNamesQuery(whatAcctIds),
      );
      for (const e of accts.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) whatNameById[id] = s(e.node, 'Name');
      }
    } catch { /* related-to names are best-effort; leave blank on failure */ }
  }

  const schedule: ScheduleItem[] = [
    ...(q?.TaskOverdue?.edges ?? []).map((e, i) => ({
      id: `to${i}`, recordId: (e.node as { Id?: string }).Id ?? '', sobjectType: 'Task' as const,
      time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const,
      status: s(e.node, 'Status') || undefined, priority: s(e.node, 'Priority') || undefined,
      type: s(e.node, 'Type') || undefined, description: s(e.node, 'Description') || undefined,
      whatId: s(e.node, 'WhatId') || undefined, clientName: whatNameById[s(e.node, 'WhatId')] || undefined, ownerId: s(e.node, 'OwnerId') || undefined, ownerName: ownerNameById[s(e.node, 'OwnerId')] || undefined,
      createdByName: relName(e.node, 'CreatedBy') || undefined, createdDate: s(e.node, 'CreatedDate') || undefined,
      lastModifiedByName: relName(e.node, 'LastModifiedBy') || undefined, lastModifiedDate: s(e.node, 'LastModifiedDate') || undefined,
    })),
    ...(q?.TaskUpcoming?.edges ?? []).map((e, i) => ({
      id: `tu${i}`, recordId: (e.node as { Id?: string }).Id ?? '', sobjectType: 'Task' as const,
      time: s(e.node, 'ActivityDate') || '—', title: s(e.node, 'Subject') || 'Task', kind: 'task' as const,
      status: s(e.node, 'Status') || undefined, priority: s(e.node, 'Priority') || undefined,
      type: s(e.node, 'Type') || undefined, description: s(e.node, 'Description') || undefined,
      whatId: s(e.node, 'WhatId') || undefined, clientName: whatNameById[s(e.node, 'WhatId')] || undefined, ownerId: s(e.node, 'OwnerId') || undefined, ownerName: ownerNameById[s(e.node, 'OwnerId')] || undefined,
      createdByName: relName(e.node, 'CreatedBy') || undefined, createdDate: s(e.node, 'CreatedDate') || undefined,
      lastModifiedByName: relName(e.node, 'LastModifiedBy') || undefined, lastModifiedDate: s(e.node, 'LastModifiedDate') || undefined,
    })),
    ...(q?.Event?.edges ?? []).map((e, i) => ({
      id: `e${i}`, recordId: (e.node as { Id?: string }).Id ?? '', sobjectType: 'Event' as const,
      time: (s(e.node, 'ActivityDateTime') || '').slice(0, 10) || '—', startDateTime: s(e.node, 'ActivityDateTime') || undefined, title: s(e.node, 'Subject') || 'Event', kind: 'meeting' as const,
      type: s(e.node, 'Type') || undefined, description: s(e.node, 'Description') || undefined,
      whatId: s(e.node, 'WhatId') || undefined, clientName: whatNameById[s(e.node, 'WhatId')] || undefined, location: s(e.node, 'Location') || undefined,
      showAs: s(e.node, 'ShowAs') || undefined, ownerId: s(e.node, 'OwnerId') || undefined, ownerName: ownerNameById[s(e.node, 'OwnerId')] || undefined,
      createdByName: relName(e.node, 'CreatedBy') || undefined, createdDate: s(e.node, 'CreatedDate') || undefined,
      lastModifiedByName: relName(e.node, 'LastModifiedBy') || undefined, lastModifiedDate: s(e.node, 'LastModifiedDate') || undefined,
    })),
  ];

  const bankerGoals: BankerGoal[] = (q?.FinancialGoal?.edges ?? []).map((e, i) => ({
    id: `g${i}`, name: s(e.node, 'Name') || 'Goal',
    current: num(e.node, 'ActualAmount'), target: num(e.node, 'TargetAmount') || 1,
    format: 'currencyCompact' as const,
  }));

  // Upcoming customer goals → the supporting-band Customer Goals card + explorer.
  // Plan-linked only (FinancialPlanId ≠ null), TargetDate ≥ TODAY, not COMPLETED,
  // soonest first. Attribution: clientName from FinancialPlan → Account when the
  // plan has an account; planName (FinancialPlan.Name, e.g. "Rachel Morris - Home
  // Ownership Plan") always carries the household. recordId powers the edit modal.
  const customerGoals: CustomerGoal[] = (q?.CustomerGoal?.edges ?? []).map((e, i) => {
    const targetDate = s(e.node, 'TargetDate');
    const daysUntil = targetDate
      ? Math.round((new Date(targetDate).getTime() - Date.now()) / 86_400_000)
      : null;
    const fp = e.node.FinancialPlan;
    return {
      id: `cg${i}`,
      recordId: (e.node as { Id?: string }).Id || undefined,
      name: sd(e.node, 'Name') || 'Goal',
      clientName: decodeHtml(fp?.Account?.Name?.value ?? ''),
      clientId: fp?.AccountId?.value || undefined,
      planName: decodeHtml(fp?.Name?.value ?? '') || undefined,
      status: s(e.node, 'Status'),
      priority: s(e.node, 'Priority') || undefined,
      type: s(e.node, 'Type') || undefined,
      description: sd(e.node, 'Description') || undefined,
      targetDate,
      daysUntil,
      target: num(e.node, 'TargetAmount'),
      current: num(e.node, 'ActualAmount'),
    };
  });

  // Live life events → the supporting-band Life Events panel + explorer. The
  // primary person is a Contact; for person accounts its Account.Name is the
  // client. EventType drives icon + next-best-action. recordId/contactId let
  // the modal edit the record; eventType/eventDate seed its fields.
  const seenLifeEvents = new Set<string>();
  const lifeEvents: LifeEventSignal[] = (q?.PersonLifeEvent?.edges ?? []).map((e, i) => {
    const type = s(e.node, 'EventType');
    const pp = e.node.PrimaryPerson;
    const clientName = decodeHtml(pp?.Account?.Name?.value ?? pp?.Name?.value ?? '');
    const rawDate = s(e.node, 'EventDate');
    return {
      id: `le${i}`,
      clientId: s(e.node, 'PrimaryPersonId'),
      clientName: clientName || 'Client',
      event: type || 'Life event',
      when: shortWhen(rawDate),
      opportunity: lifeEventPlay(type),
      icon: lifeEventIcon(type),
      recordId: (e.node as { Id?: string }).Id || undefined,
      eventType: type || undefined,
      eventDate: dateOnly(rawDate) || undefined,
      contactId: s(e.node, 'PrimaryPersonId') || undefined,
    };
  }).filter(le => {
    // Dedupe repeated PersonLifeEvent rows (same person + type + date) that the
    // book query can surface more than once — one card per real milestone.
    const key = `${le.clientId}|${le.eventType ?? ''}|${le.eventDate ?? ''}`;
    if (seenLifeEvents.has(key)) return false;
    seenLifeEvents.add(key);
    return true;
  });

  const leads: LeadReferral[] = (q?.Lead?.edges ?? []).map((e, i) => ({
    id: `l${i}`, name: s(e.node, 'Name') || s(e.node, 'Company') || 'Lead',
    source: s(e.node, 'LeadSource') || '—', status: s(e.node, 'Status') || 'New',
    value: num(e.node, 'AnnualRevenue'),
    email: s(e.node, 'Email'),
    recordId: s(e.node, 'Id') || undefined,
    firstName: s(e.node, 'FirstName') || undefined,
    lastName: s(e.node, 'LastName') || undefined,
    company: s(e.node, 'Company') || undefined,
  }));

  const pipeline: PipelineItem[] = (opp?.edges ?? []).slice(0, 8).map((e, i) => ({
    id: `o${i}`,
    clientName: e.node.Account?.Name?.value ?? '—',
    name: s(e.node, 'Name'), stage: s(e.node, 'StageName'),
    amount: num(e.node, 'Amount'), closeDate: s(e.node, 'CloseDate'),
    propensity: Math.min(1, num(e.node, 'Probability') / 100) || 0.5,
  }));

  // Open service cases → the supporting-band Cases card + explorer. CaseNumber,
  // Subject, Priority, Status are standard Case fields (present in every org);
  // age is whole days since CreatedDate. Account name rides along via the
  // Case → Account relationship (falls back to '' when the case has no account).
  const cases: CaseItem[] = (q?.Case?.edges ?? []).map((e, i) => {
    const created = s(e.node, 'CreatedDate');
    const ageDays = created ? Math.max(0, Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000)) : 0;
    return {
      id: (e.node as { Id?: string }).Id ?? `cs${i}`,
      caseNumber: s(e.node, 'CaseNumber') || '—',
      subject: s(e.node, 'Subject') || 'Case',
      priority: s(e.node, 'Priority') || '',
      status: s(e.node, 'Status') || '',
      clientName: e.node.Account?.Name?.value ?? '',
      clientId: s(e.node, 'AccountId') || undefined,
      ageDays,
    };
  });

  const highValue = held.rows.filter(r => Number(r.balance || 0) >= 5_000_000).length;
  const highRisk = callList.filter(c => c.severity === 'high').length;

  // ── Recommendations — derived defensively (never throws). Sources:
  //   open Task · top Opportunity · highest-value Account · largest held-away.
  const recommendations: Recommendation[] = [];
  const firstTask = q?.TaskOverdue?.edges?.[0]?.node;
  if (firstTask) {
    const subj = s(firstTask, 'Subject') || 'Follow-up task';
    const due = s(firstTask, 'ActivityDate');
    recommendations.push({
      id: 'rec-task', kind: 'task', objectLabel: 'Task', clientName: subj, clientId: '',
      title: `Complete open task: ${subj}`,
      body: `This planning task${due ? ` (due ${due})` : ''} is still open. Close the loop with the client and confirm the next review step.`,
      evidence: `Open Task${due ? ` with ActivityDate ${due}` : ''} — from your overdue advisory queue`,
    });
  }
  const topOpp = opp?.edges?.[0]?.node;
  if (topOpp) {
    const oppName = s(topOpp, 'Name') || 'Opportunity';
    const acct = topOpp.Account?.Name?.value ?? oppName;
    recommendations.push({
      id: 'rec-call', kind: 'call', objectLabel: 'Opportunity', clientName: acct, clientId: '',
      title: `Advance ${acct} toward close`,
      body: `Your largest open opportunity (${oppName}, ${num(topOpp, 'Amount').toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}) needs a next step. Schedule a planning call to confirm scope and lock a date.`,
      evidence: `Highest-value open opportunity at ${Math.round(num(topOpp, 'Probability'))}% probability`,
    });
  }
  const topAcct = (opp?.edges ?? []).find(e => e.node.Account?.Name?.value)?.node.Account?.Name?.value;
  if (topAcct) {
    recommendations.push({
      id: 'rec-email', kind: 'email', objectLabel: 'Account', clientName: topAcct, clientId: '',
      title: `Re-engage ${topAcct} on their plan`,
      body: 'A top relationship has limited recent activity. Reach out to schedule a portfolio review and explore held-away consolidation.',
      evidence: 'High-value household with sparse recent engagement history',
    });
  }
  const topHeldAway = callList.find(c => c.action === 'Held-away consolidation review');
  if (topHeldAway) {
    recommendations.push({
      id: 'rec-case', kind: 'case', objectLabel: 'Case', clientName: topHeldAway.clientName, clientId: topHeldAway.clientId,
      title: `Open a consolidation case for ${topHeldAway.clientName}`,
      body: 'A top-ranked held-away balance in your book is a live consolidation opportunity. Log a case to track the outreach and required paperwork.',
      evidence: topHeldAway.reason,
    });
  }

  // ── Right Now — the single first move, from the top-priority call item.
  const top = callList[0];
  const rightNow: RightNowItem | undefined = top
    ? {
        clientId: top.clientId,
        clientName: top.clientName,
        headline: `Reach out to ${top.clientName} — ${top.action.toLowerCase()}.`,
        detail: top.reason,
        taskSubject: top.action,
      }
    : undefined;

  // ── Recent activity — derived from the merged schedule feed (most recent
  //    real Task/Event touches), tinted by kind. Empty book → graceful empty note.
  const ACT_ICON: Record<string, ActivityItem['icon']> = { task: 'task', meeting: 'event', call: 'call', event: 'event' };
  const activity: ActivityItem[] = schedule.slice(0, 6).map((it, i) => ({
    id: `act${i}`,
    clientName: it.clientName || it.title,
    clientId: it.whatId,
    title: it.title,
    when: it.time,
    icon: ACT_ICON[it.kind] ?? 'task',
    tone: 'neutral' as const,
  }));

  // ── Pipeline movement — group open opportunities by stage, summing amount.
  //    A real, live-derived roll-up (deltaPct is a flat placeholder — no
  //    historical snapshot is wired yet).
  const byStage = new Map<string, number>();
  for (const e of opp?.edges ?? []) {
    const stage = s(e.node, 'StageName') || 'Other';
    byStage.set(stage, (byStage.get(stage) ?? 0) + num(e.node, 'Amount'));
  }
  const pipelineMovement: PipelineMovement[] = [...byStage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, amount], i) => ({
      id: `pm${i}`,
      label,
      amount,
      deltaPct: 0.06,
      trend: seedTrend(label, amount),
    }));

  // S7 — open service drag: CRM open cases + the book's open ServiceNow cases.
  const crmOpen = q?.Case?.totalCount ?? 0;
  const openCases = crmOpen + serviceNow.open;
  const agedCases = (q?.CaseAged?.totalCount ?? 0) + serviceNow.aged;

  return {
    bankerName,
    dateLabel: 'Today',
    aiBriefHeadline: 'held-away assets within reach',
    aiBrief: `${heldAwayClients.toLocaleString('en-US')} ${held.scope === 'book' ? 'clients in your book' : 'clients'} hold external investment assets totalling ${totalHeldAway.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}; ${highValue} are $5M+ consolidation opportunities. ${who.clients.toLocaleString('en-US')} clients scored for who to call (held away, plans, Gong, concentration), ${who.multiSignal.toLocaleString('en-US')} with two or more risk signals; ${highRisk} of the top ${callList.length} high-risk. ${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.${inflows.rows.length ? ` ${inflows.rows.length} clients received a bonus or tax refund this week (${inflowTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}) that could be invested.` : ''}`,
    // S8 — freshness replaces the static confidence (kept as the fallback).
    confidencePct: freshness?.pct ?? 89,
    dataSourceCount: freshness?.sources.length ?? 26,
    dataFreshness: freshness,
    // W3 — feeds the "What meetings need prep?" chip.
    planReviews: plans.reviewRows.map(r => ({
      clientId: r.accountId, clientName: nameById[r.accountId] || r.accountId,
      date: r.nextReview, successPct: r.successPct, goalUsd: r.goalUsd, stale: r.stale,
    })),
    planReviewsDue: plans.due30,
    holdingsConcentration: { ...concentration, rows: concentration.rows.map(r => ({ ...r, clientName: nameById[r.accountId] || 'Client' })) },
    wealthUpgrades: { ...upgrades, rows: upgrades.rows.map(r => ({ ...r, clientName: nameById[r.accountId] || 'Client' })) },
    businessOwners: { ...owners, rows: owners.rows.map(r => ({ ...r, clientName: nameById[r.accountId] || 'Client' })) },
    tradingPulse: { ...trades, sellers: trades.sellers.map(r => ({ ...r, clientName: nameById[r.accountId] || 'Client' })) },
    digitalLeakage: { ...leakage, rows: leakage.rows.map(r => ({ ...r, clientName: nameById[r.accountId] || 'Client' })) },
    kpis: [
      { key: 'heldAway', label: 'Held-Away Opportunity', value: totalHeldAway, format: 'currencyCompact', trend: seedTrend('heldAway', Math.max(1, Math.round(totalHeldAway / 1e7))), note: heldAwayClients ? `${heldAwayClients.toLocaleString('en-US')} clients · brokerage + robo${scopeNote}` : 'No held-away assets in book' },
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact', trend: seedTrend('pipeline', Math.round(pipelineValue / 1e6)), deltaPct: 0.061, note: `${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities` },
      { key: 'openOpps', label: 'Opportunities', value: opp?.totalCount ?? 0, format: 'number', trend: seedTrend('opps', opp?.totalCount ?? 0), deltaPct: 0.03, note: 'In progress' },
      { key: 'leads', label: 'Leads & Referrals', value: leads.length, format: 'number', trend: seedTrend('leads', Math.max(1, leads.length)), deltaPct: 0.08, note: 'Open leads' },
      { key: 'openCases', label: 'Open Cases', value: openCases, format: 'number', trend: seedTrend('cases', openCases), note: `${crmOpen.toLocaleString('en-US')} CRM · ${serviceNow.open.toLocaleString('en-US')} ServiceNow${agedCases ? ` · ${agedCases.toLocaleString('en-US')} open 30d+` : ''}` },
      { key: 'atRisk', label: '$5M+ Targets', value: highValue, format: 'number', trend: seedTrend('targets', Math.max(1, highValue)), deltaPct: 0.11, note: 'Consolidation' },
      { key: 'callTone', label: 'Call Tone Sliding', value: toneNow, format: 'number', trend: toneSeries.length > 1 ? toneSeries : seedTrend('calltone', Math.max(1, toneNow)), deltaPct: tonePrev ? (toneNow - tonePrev) / tonePrev : undefined, note: `Negative & declining on Gong${gong.scope === 'org' ? ' · org-wide' : ''}` },
      { key: 'uplift', label: 'Modeled Uplift', value: uplift.total, format: 'currencyCompact', trend: seedTrend('uplift', Math.max(1, Math.round(uplift.total / 1e4))), note: uplift.clients ? `${uplift.clients.toLocaleString('en-US')} clients with an eligible offer${uplift.byOffer[0] ? ` · top: ${uplift.byOffer[0].offer}` : ''}${uplift.scope === 'org' ? ' · org-wide' : ''}` : 'No eligible offers in book' },
      { key: 'plansAtRisk', label: 'Plans at Risk', value: plans.atRisk, format: 'number', trend: seedTrend('plansAtRisk', Math.max(1, plans.atRisk)), note: plans.plans ? `< 70% success · ${plans.critical.toLocaleString('en-US')} below 50% · ${plans.due30.toLocaleString('en-US')} reviews due 30d · ${plans.stale.toLocaleString('en-US')} stale${plans.scope === 'org' ? ' · org-wide' : ''}` : 'No MoneyGuidePro plans in book' },
      { key: 'bizOwners', label: 'Business Owners', value: owners.owners, format: 'number', trend: seedTrend('bizOwners', Math.max(1, owners.owners)), note: owners.owners ? `${owners.businesses.toLocaleString('en-US')} businesses · ${owners.upmarket.toLocaleString('en-US')} at $50M+ · relationship graph${owners.scope === 'org' ? ' · org-wide' : ''}` : 'No business owners in book' },
      { key: 'upgrades', label: 'Upgrade Prospects', value: upgrades.candidates, format: 'number', trend: seedTrend('upgrades', Math.max(1, upgrades.candidates)), note: upgrades.candidates ? `$1M+ est. net worth, not in Wealth · ${upgrades.fiveM.toLocaleString('en-US')} at $5M+ · Claritas${upgrades.scope === 'org' ? ' · org-wide' : ''}` : 'No upgrade prospects in book' },
      { key: 'concentrated', label: 'Concentrated Positions', value: concentration.concentrated, format: 'number', trend: seedTrend('concentrated', Math.max(1, concentration.concentrated)), note: concentration.clients ? `of ${concentration.clients.toLocaleString('en-US')} clients with holdings · one stock ≥ 20% · ${Math.round(concentration.singleStockShare * 100)}% of ${concentration.aum.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in single stocks${concentration.scope === 'org' ? ' · org-wide' : ''}` : 'No CRM holdings in book' },
      { key: 'goals', label: 'Active Goals', value: bankerGoals.length, format: 'number', trend: seedTrend('goals', Math.max(1, bankerGoals.length)), deltaPct: 0.02, note: 'On track' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents,
    schedule,
    transactionSignals,
    // Plan-risk / Gong alerts skip clients the blended Who-to-Call already carries.
    alerts: [
      ...dropCovered(planRiskSignals, callList).filter(p => p.severity === 'high').slice(0, 2).map((p, i) => ({
        id: `ap${i}`, title: `Plan at risk — ${p.clientName}`, detail: `${p.reason} · ${p.action}`,
        tone: 'risk' as const, severity: 'High' as const, when: 'latest plan run',
      })),
      ...campaignSignals.slice(0, 2).map((t, i) => ({
        id: `am${i}`, title: `Campaign interest — ${t.clientName}`, detail: `${t.reason} · ${t.action}`,
        tone: 'opportunity' as const, severity: t.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'last touch',
      })),
      ...amlSignals.slice(0, 2).map((w, i) => ({
        id: `aw${i}`, title: `Screening escalated — ${w.clientName}`, detail: `${w.reason} · ${w.action}`,
        tone: 'risk' as const, severity: w.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'today',
      })),
      ...callList.slice(0, 4).map((c, i) => ({
        id: `a${i}`, title: `Call first — ${c.clientName}`, detail: `${c.reason} · ${c.action}`,
        tone: c.drivers?.[0]?.tone ?? 'risk' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
      })),
      ...dropCovered(gongSignals, callList).slice(0, 2).map((g, i) => ({
        id: `ag${i}`, title: `Call tone sliding — ${g.clientName}`, detail: `${g.reason} · ${g.action}`,
        tone: 'risk' as const, severity: g.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'this week',
      })),
      ...txSignals.slice(0, 3).map((t, i) => ({
        id: `ax${i}`, title: `New cash — ${t.clientName}`, detail: `${t.reason} · ${t.action}`,
        tone: 'opportunity' as const, severity: t.severity === 'high' ? 'High' as const : t.severity === 'medium' ? 'Medium' as const : 'Low' as const, when: 'this week',
      })),
    ],
    // S4 warm intros alternate with CRM leads; the KPI above still counts Leads only.
    leads: interleave(leads, warmIntroLeads(intros, nameById)),
    // S3 model offers lead so they survive the cockpit's reveal cap.
    recommendations: [...offerRecommendations(offers, nameById), ...recommendations],
    activity,
    pipelineMovement,
    cases,
    customerGoals,
    rightNow,
  };
}
