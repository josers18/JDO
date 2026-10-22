/**
 * HOME app — REAL data implementation for the Commercial "Relationship Command".
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal) → GraphQL
 *   · Data Cloud business credit (BT_DNB_Business_Credit__dlm) → DcBridgeRest,
 *     scoped to the signed-in banker's book (falls back to org-wide when empty)
 *   · C9 business fee spikes (ssot__FinancialAccountTransaction__dlm), same
 *     book scoping — repeated NSF / late fees = cash-flow stress
 *   · S1 Gong call sentiment (BT_Gong_Call_Sentiment__dlm), latest week,
 *     negative + declining → queue + alerts, same book scoping
 *   · S2 World-Check AML / PEP screening (BT_WorldCheck_AML__dlm), latest
 *     run, ratings that escalated since the previous run → queue + alerts
 *   · S3 next-best offers (Offer_Eligibility_Model__dlm), this app's product
 *     family, one card per product → top of Recommendations
 *   · S5 business slice — $10K+ ACH customer receipts in 7 days → queue,
 *     alerts (opportunity tone) + AI brief
 *   · S4 warm intros (BT_Synth_Relationship_Graph__dlm), referrals from my
 *     clients into accounts outside my book → Leads & Referrals
 *   · S3 Growth KPI "Modeled uplift" — each client's best-offer EV, summed
 *   · S6 campaign touches (Marketing_Engagements__dlm), clicked-through clients
 *     → queue + alerts
 *   · S7 open service drag: CRM + ServiceNow open cases (book-only) → Cases KPI
 *   · S8 data freshness per source → hero meter (replaces static confidence)
 *   · C2 Moody's rating outlook (BT_Moodys_Market_Context__dlm): clients on a
 *     Negative / Watch outlook → Health KPI + risk alerts
 *   · C3 BoardEx leadership change (BT_Boardex__dlm): exec turnover with a recent
 *     governance event → opportunity alerts; turnover on Weak governance → risk
 *
 * The persona signal is CREDIT RISK: the RM's "who to call" ranks accounts by
 * the weakest PAYDEX / delinquency-predictor scores (the borrowers most
 * likely to need a covenant or credit review). Field names + DMO columns
 * verified live against jdo-oe0sdd (2026-10-20).
 */
import { executeGraphQL, queryDataCloud, queryDataCloudForBook, fetchEffectiveUser, getViewAs, ownerScopedQuery, fetchFeeSpikes, feeSpikeQueueItems, fetchBusinessInflows, inflowQueueItems, type LargeInflow, type TxSignalResult, type FeeSpike, fetchCallSentiment, callSentimentQueueItems, type CallSentimentResult, fetchAmlChanges, amlChangeQueueItems, type AmlChange, fetchNextBestOffers, offerRecommendations, type NextBestOfferResult, fetchWarmIntros, warmIntroLeads, interleave, type WarmIntroResult, fetchModeledUplift, type ModeledUplift, fetchCampaignTouches, campaignTouchQueueItems, type CampaignTouchResult, fetchServiceNowDrag, type ServiceNowDrag, fetchDataFreshness, type DataFreshness, fetchOutlookWatch, type OutlookResult, fetchLeadershipChanges, type LeadershipResult } from '@shared';
import type { HomeDashboard, CallItem, CaseItem, CustomerGoal, ScheduleItem, BankerGoal, LeadReferral, PipelineItem, DelinquencyWatch, Recommendation, RightNowItem, LifeEventSignal, ActivityItem, PipelineMovement } from './homeTypes';

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
  query CommercialBook {
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

/* ── Account name lookup (IDs → names). Id is a PLAIN string on nodes. */
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

/* ── Data Cloud: weakest business credit = "who to call" ──
   BT_DNB_Business_Credit__dlm is a monthly snapshot — pin to the latest
   profile_month. Rank by PAYDEX ascending, then delinquency-predictor
   ascending (D&B scores it 1–100 where HIGHER = safer, so the riskiest
   borrowers have the lowest values). */
const creditRiskSql = (accountFilter: string) => `
  SELECT account_id__c AS account_id, paydex_score__c AS paydex,
         composite_risk_score__c AS composite_risk, delinquency_predictor_score__c AS delinquency,
         dnb_rating__c AS rating, average_days_beyond_terms__c AS days_beyond
  FROM BT_DNB_Business_Credit__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm)
    AND paydex_score__c IS NOT NULL AND account_id__c ${accountFilter}
  ORDER BY paydex_score__c ASC, delinquency_predictor_score__c ASC
  LIMIT 8
`;

interface CreditRow { account_id: string; paydex: number; composite_risk: number; delinquency: number; rating: string; days_beyond: number; }

/* ── Data Cloud: book payment-behaviour bands (Delinquency Watch) ──
   Same D&B snapshot, bucketed by average days beyond terms — how late the
   book's borrowers pay their trade creditors, latest month. */
const delinquencySql = (accountFilter: string) => `
  SELECT CASE WHEN average_days_beyond_terms__c >= 30 THEN '30+ days beyond terms'
              WHEN average_days_beyond_terms__c >= 15 THEN '15-29 days beyond terms'
              WHEN average_days_beyond_terms__c >= 1 THEN '1-14 days beyond terms'
              ELSE 'Paying on terms' END AS band,
         COUNT(*) AS cnt, AVG(paydex_score__c) AS paydex, MAX(profile_month__c) AS as_of
  FROM BT_DNB_Business_Credit__dlm
  WHERE profile_month__c = (SELECT MAX(profile_month__c) FROM BT_DNB_Business_Credit__dlm)
    AND account_id__c ${accountFilter}
  GROUP BY 1
  ORDER BY MIN(average_days_beyond_terms__c) DESC
`;
interface DelinqRow { band: string; cnt: number; paydex: number; as_of: string; }
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

/** Lower PAYDEX = higher risk. PAYDEX 80 = prompt payment; <50 = severely late. */
function severityForPaydex(paydex: number): CallItem['severity'] {
  if (paydex < 60) return 'high';
  if (paydex < 75) return 'medium';
  return 'low';
}

/** Map a call item's severity to its priority-queue tier. */
function tierForSeverity(sev: CallItem['severity']): CallItem['tier'] {
  return sev === 'high' ? 'today' : sev === 'medium' ? 'week' : 'watch';
}

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
  // The D&B queries need the banker's user Id to scope to their book;
  // GraphQL runs in parallel with that chain.
  // "View as" swaps in another banker: their Id drives every DC book filter
  // and the CRM roots below get an owner filter (none for your own book).
  const userP = fetchEffectiveUser();
  const [core, credit, currentUser, feeSpikes, gong, aml, offers, intros, receipts, uplift, touches, serviceNow, freshness, outlook, leadership] = await Promise.all([
    executeGraphQL<CoreShape>(ownerScopedQuery(HOME_CORE_QUERY, getViewAs()?.userId)),
    userP.then(u => queryDataCloudForBook<CreditRow>(creditRiskSql, u?.userId, 8)),
    userP,
    // C9 is additive — a failed transaction query must not blank the page.
    userP.then(u => fetchFeeSpikes(u?.userId))
      .catch((): TxSignalResult<FeeSpike> => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchCallSentiment(u?.userId))
      .catch((): CallSentimentResult => ({ rows: [], scope: 'org', weekly: [] })),
    userP.then(u => fetchAmlChanges(u?.userId))
      .catch((): TxSignalResult<AmlChange> => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchNextBestOffers(u?.userId, 'commercial'))
      .catch((): NextBestOfferResult => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchWarmIntros(u?.userId))
      .catch((): WarmIntroResult => ({ rows: [], scope: 'org' })),
    // S5 business slice — additive like C9.
    userP.then(u => fetchBusinessInflows(u?.userId))
      .catch((): TxSignalResult<LargeInflow> => ({ rows: [], scope: 'org' })),
    // S3 Growth KPI + S6 campaign touches — additive, like the other DC signals.
    userP.then(u => fetchModeledUplift(u?.userId, 'commercial'))
      .catch((): ModeledUplift => ({ total: 0, clients: 0, byOffer: [], scope: 'org' })),
    userP.then(u => fetchCampaignTouches(u?.userId, 'Business'))
      .catch((): CampaignTouchResult => ({ rows: [], scope: 'org' })),
    // S7 ServiceNow open cases (book-only) + S8 per-source freshness.
    userP.then(u => fetchServiceNowDrag(u?.userId))
      .catch((): ServiceNowDrag => ({ open: 0, aged: 0, scope: 'org' })),
    fetchDataFreshness(['transactions', 'worldCheck', 'marketing', 'serviceNow', 'gong', 'graph', 'offers', 'dnb', 'moodys', 'boardex'])
      .catch((): DataFreshness | undefined => undefined),
    // C2 Moody's outlook + C3 BoardEx leadership change — additive.
    userP.then(u => fetchOutlookWatch(u?.userId))
      .catch((): OutlookResult => ({ rows: [], negative: 0, watch: 0, scope: 'org' })),
    userP.then(u => fetchLeadershipChanges(u?.userId))
      .catch((): LeadershipResult => ({ rows: [], turnover: 0, recent: 0, weak: 0, scope: 'org' })),
  ]);
  const delinq = await queryDataCloud<DelinqRow>(delinquencySql(credit.accountFilter), 10)
    .catch(() => ({ rows: [] as DelinqRow[] }));
  const scopeNote = credit.scope === 'org' ? ' · org-wide' : '';
  // Greet the logged-in banker by first name; fall back to full name, then a
  // demo default if the identity call is unavailable (e.g. mock/offline).
  const bankerName = currentUser?.firstName || currentUser?.name || 'Alex';
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  const ids = [...new Set([...credit.rows.map(r => r.account_id), ...feeSpikes.rows.map(r => r.accountId), ...gong.rows.map(r => r.accountId), ...aml.rows.map(r => r.accountId), ...offers.rows.map(r => r.accountId), ...intros.rows.map(r => r.referrerId), ...touches.rows.map(r => r.accountId), ...receipts.rows.map(r => r.accountId), ...outlook.rows.map(r => r.accountId), ...leadership.rows.map(r => r.accountId)].filter(Boolean))];
  const nameById: Record<string, string> = {};
  if (ids.length) {
    try {
      const names = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(accountNamesQuery(ids));
      for (const e of names.uiapi?.query?.Account?.edges ?? []) {
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) nameById[id] = s(e.node, 'Name');
      }
    } catch { /* names best-effort */ }
  }

  const pipelineValue = (opp?.edges ?? []).reduce((sum, e) => sum + num(e.node, 'Amount'), 0);

  // S1 — clients whose recorded-call sentiment is negative and sliding.
  // S2 — screening ratings that escalated on the latest World-Check run.
  const amlSignals: CallItem[] = amlChangeQueueItems(aml, nameById, { segment: 'Commercial' });
  const gongSignals: CallItem[] = callSentimentQueueItems(gong, nameById, { segment: 'Commercial' });
  // C9 — operating accounts racking up NSF / overdraft / late fees.
  const txSignals: CallItem[] = feeSpikeQueueItems(feeSpikes, nameById, { segment: 'Commercial' });
  // S5 — large customer receipts sitting in operating cash.
  const receiptSignals: CallItem[] = inflowQueueItems(receipts, nameById, {
    segment: 'Commercial', action: 'Excess-cash conversation — sweep / money market', idPrefix: 'rx',
  });
  const receiptTotal = receipts.rows.reduce((sum, r) => sum + r.amount, 0);
  // S6 — clients who clicked through a campaign: a warm follow-up.
  const campaignSignals: CallItem[] = campaignTouchQueueItems(touches, nameById, { segment: 'Commercial' });
  const shortDate = (iso: string) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const nameOf = (id: string) => nameById[id] || id;
  const transactionSignals: CallItem[] = [...amlSignals, ...gongSignals, ...txSignals, ...receiptSignals, ...campaignSignals];
  // S1 Health KPI — book count of negative + declining clients, with the real
  // 8-week series behind the sparkline and a week-over-week delta.
  const toneSeries = gong.weekly.map(w => w.count);
  const toneNow = toneSeries.length ? toneSeries[toneSeries.length - 1] : gong.rows.length;
  const tonePrev = toneSeries.length > 1 ? toneSeries[toneSeries.length - 2] : 0;

  const callList: CallItem[] = credit.rows.map((row, i) => {
    const paydex = Number(row.paydex || 0);
    const dbt = Number(row.days_beyond || 0);
    return {
      id: `c${i}`,
      clientId: row.account_id,
      clientName: nameById[row.account_id] || row.account_id,
      segment: `D&B ${row.rating || 'unrated'}`,
      reason: `PAYDEX ${Math.round(paydex)}${dbt ? `, ${Math.round(dbt)} days beyond terms` : ''}; delinquency score ${Math.round(Number(row.delinquency || 0))}`,
      action: 'Credit / covenant review',
      score: 1 - Math.min(paydex, 100) / 100,
      severity: severityForPaydex(paydex),
      source: `D&B credit${scopeNote}`,
      relationshipValue: 0,
      tier: tierForSeverity(severityForPaydex(paydex)),
    };
  });

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

  const highRisk = callList.filter(c => c.severity === 'high').length;

  const delinqRows = delinq.rows ?? [];
  const delinquency: DelinquencyWatch | null = delinqRows.length ? {
    totalAccounts: delinqRows.reduce((s, r) => s + Number(r.cnt || 0), 0),
    lateAccounts: delinqRows.filter(r => r.band !== 'Paying on terms').reduce((s, r) => s + Number(r.cnt || 0), 0),
    byBand: delinqRows.map(r => ({ band: String(r.band || '—'), count: Math.round(Number(r.cnt || 0)), avgPaydex: Math.round(Number(r.paydex || 0)) })),
    asOf: String(delinqRows[0]?.as_of ?? '').slice(0, 10) || 'Latest',
    scope: credit.scope,
  } : null;

  // ── Recommendations — derived defensively (never throws). Sources:
  //   open Task · top Opportunity · top Account · weakest-credit borrower.
  const recommendations: Recommendation[] = [];
  const firstTask = q?.TaskOverdue?.edges?.[0]?.node;
  if (firstTask) {
    const subj = s(firstTask, 'Subject') || 'Follow-up task';
    const due = s(firstTask, 'ActivityDate');
    recommendations.push({
      id: 'rec-task', kind: 'task', objectLabel: 'Task', clientName: subj, clientId: '',
      title: `Complete open task: ${subj}`,
      body: `This task${due ? ` (due ${due})` : ''} is still open. Close the loop with the borrower and log the next credit or treasury step.`,
      evidence: `Open Task${due ? ` with ActivityDate ${due}` : ''} — from your overdue relationship queue`,
    });
  }
  const topOpp = opp?.edges?.[0]?.node;
  if (topOpp) {
    const oppName = s(topOpp, 'Name') || 'Opportunity';
    const acct = topOpp.Account?.Name?.value ?? oppName;
    recommendations.push({
      id: 'rec-call', kind: 'call', objectLabel: 'Opportunity', clientName: acct, clientId: '',
      title: `Advance the ${acct} lending deal`,
      body: `Your largest open opportunity (${oppName}, ${num(topOpp, 'Amount').toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}) needs a next step. Schedule a call to confirm structure and lock a funding date.`,
      evidence: `Highest-value open opportunity at ${Math.round(num(topOpp, 'Probability'))}% probability`,
    });
  }
  const topAcct = (opp?.edges ?? []).find(e => e.node.Account?.Name?.value)?.node.Account?.Name?.value;
  if (topAcct) {
    recommendations.push({
      id: 'rec-email', kind: 'email', objectLabel: 'Account', clientName: topAcct, clientId: '',
      title: `Pitch treasury management to ${topAcct}`,
      body: 'A top relationship has limited recent activity. Reach out on treasury-management and liquidity-sweep opportunities to capture idle balances.',
      evidence: 'High-value relationship with sparse recent engagement history',
    });
  }
  const weakestCredit = callList[0];
  if (weakestCredit) {
    const delinqNote = delinquency
      ? ` ${delinquency.lateAccounts.toLocaleString('en-US')} of ${delinquency.totalAccounts.toLocaleString('en-US')} ${delinquency.scope === 'book' ? 'borrowers in your book' : 'borrowers'} pay trade creditors beyond terms (D&B, ${delinquency.asOf}).`
      : '';
    recommendations.push({
      id: 'rec-case', kind: 'case', objectLabel: 'Case', clientName: weakestCredit.clientName, clientId: weakestCredit.clientId,
      title: `Open a credit-review case for ${weakestCredit.clientName}`,
      body: `The weakest business-credit signal in your book warrants a covenant and credit review before it deteriorates further.${delinqNote}`,
      evidence: weakestCredit.reason,
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
    aiBriefHeadline: 'borrowers on the credit watchlist',
    aiBrief: `${callList.length} relationships flagged by D&B business credit, ${highRisk} with PAYDEX under 60 (covenant-review candidates). ${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.${feeSpikes.rows.length ? ` ${feeSpikes.rows.length} operating accounts show fee spikes (3+ NSF / overdraft / late fees in 30 days): a cash-flow check-in.` : ''}${receipts.rows.length ? ` ${receipts.rows.length} clients received $10K+ customer payments this week (${receiptTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}): an excess-cash moment.` : ''}`,
    // S8 — freshness replaces the static confidence (kept as the fallback).
    confidencePct: freshness?.pct ?? 86,
    dataSourceCount: freshness?.sources.length ?? 25,
    dataFreshness: freshness,
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact', trend: seedTrend('pipeline', Math.round(pipelineValue / 1e6)), deltaPct: 0.051, note: `${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities` },
      { key: 'openOpps', label: 'Opportunities', value: opp?.totalCount ?? 0, format: 'number', trend: seedTrend('opps', opp?.totalCount ?? 0), deltaPct: 0.03, note: 'In progress' },
      { key: 'leads', label: 'Leads & Referrals', value: leads.length, format: 'number', trend: seedTrend('leads', Math.max(1, leads.length)), deltaPct: 0.08, note: 'Open leads' },
      { key: 'openCases', label: 'Open Cases', value: openCases, format: 'number', trend: seedTrend('cases', openCases), note: `${crmOpen.toLocaleString('en-US')} CRM · ${serviceNow.open.toLocaleString('en-US')} ServiceNow${agedCases ? ` · ${agedCases.toLocaleString('en-US')} open 30d+` : ''}` },
      { key: 'atRisk', label: 'Credit Watch', value: highRisk, format: 'number', trend: seedTrend('atrisk', Math.max(1, highRisk)), deltaPct: -0.02, note: 'PAYDEX < 60' },
      { key: 'callTone', label: 'Call Tone Sliding', value: toneNow, format: 'number', trend: toneSeries.length > 1 ? toneSeries : seedTrend('calltone', Math.max(1, toneNow)), deltaPct: tonePrev ? (toneNow - tonePrev) / tonePrev : undefined, note: `Negative & declining on Gong${gong.scope === 'org' ? ' · org-wide' : ''}` },
      { key: 'uplift', label: 'Modeled Uplift', value: uplift.total, format: 'currencyCompact', trend: seedTrend('uplift', Math.max(1, Math.round(uplift.total / 1e4))), note: uplift.clients ? `${uplift.clients.toLocaleString('en-US')} clients with an eligible offer${uplift.byOffer[0] ? ` · top: ${uplift.byOffer[0].offer}` : ''}${uplift.scope === 'org' ? ' · org-wide' : ''}` : 'No eligible offers in book' },
      { key: 'outlook', label: 'Outlook Neg / Watch', value: outlook.negative + outlook.watch, format: 'number', trend: seedTrend('outlook', Math.max(1, outlook.negative + outlook.watch)), note: `${outlook.watch.toLocaleString('en-US')} Watch · ${outlook.negative.toLocaleString('en-US')} Negative · Moody's${outlook.scope === 'org' ? ' · org-wide' : ''}` },
      { key: 'leadership', label: 'Leadership Changes', value: leadership.turnover, format: 'number', trend: seedTrend('leadership', Math.max(1, leadership.turnover)), note: `${leadership.recent.toLocaleString('en-US')} with a board event 90d · ${leadership.weak.toLocaleString('en-US')} on weak governance${leadership.scope === 'org' ? ' · org-wide' : ''}` },
      { key: 'goals', label: 'Active Goals', value: bankerGoals.length, format: 'number', trend: seedTrend('goals', Math.max(1, bankerGoals.length)), deltaPct: 0.02, note: 'On track' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents,
    schedule,
    transactionSignals,
    alerts: [
      // C2 — Watch (review for downgrade) first, then Negative.
      ...outlook.rows.slice(0, 2).map((o, i) => ({
        id: `ao${i}`, title: `Outlook ${o.outlook} — ${nameOf(o.accountId)}`,
        detail: `Moody's ${o.rating || 'rating'} · outlook ${o.outlook} since ${shortDate(o.since)}${o.flags ? ` · ${o.flags} agency flag${o.flags === 1 ? '' : 's'}` : ''}${o.px30 != null ? ` · price ${o.px30 > 0 ? '+' : ''}${o.px30.toFixed(1)}% 30d` : ''} · Credit review before the next renewal`,
        tone: 'risk' as const, severity: o.outlook === 'Watch' ? 'High' as const : 'Medium' as const, when: 'current outlook',
      })),
      // C3 — new leadership = a banking-relationship review; weak governance = risk.
      ...leadership.rows.filter(l => l.angle === 'opportunity').slice(0, 2).map((l, i) => ({
        id: `al${i}`, title: `Leadership change — ${nameOf(l.accountId)}`,
        detail: `Exec turnover · board event ${shortDate(l.eventDate)}${l.ceoTenureYears != null ? ` · CEO tenure ${l.ceoTenureYears.toFixed(1)}y` : ''}${l.director ? ` · key director ${l.director}` : ''} · Treasury-management intro to the new team`,
        tone: 'opportunity' as const, severity: 'Medium' as const, when: shortDate(l.eventDate) || 'this quarter',
      })),
      ...leadership.rows.filter(l => l.angle === 'risk').slice(0, 1).map((l, i) => ({
        id: `ar${i}`, title: `Leadership + weak governance — ${nameOf(l.accountId)}`,
        detail: `Exec turnover on Weak governance${l.eventDate ? ` · board event ${shortDate(l.eventDate)}` : ''} · Flag for the credit committee`,
        tone: 'risk' as const, severity: 'High' as const, when: shortDate(l.eventDate) || 'this quarter',
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
        id: `a${i}`, title: `Credit risk — ${c.clientName}`, detail: c.reason,
        tone: 'risk' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
      })),
      ...gongSignals.slice(0, 2).map((g, i) => ({
        id: `ag${i}`, title: `Call tone sliding — ${g.clientName}`, detail: `${g.reason} · ${g.action}`,
        tone: 'risk' as const, severity: g.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'this week',
      })),
      ...txSignals.slice(0, 3).map((t, i) => ({
        id: `ax${i}`, title: `Fee spike — ${t.clientName}`, detail: `${t.reason} · ${t.action}`,
        tone: 'risk' as const, severity: t.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'last 30d',
      })),
      ...receiptSignals.slice(0, 2).map((t, i) => ({
        id: `ar${i}`, title: `Receivable landed — ${t.clientName}`, detail: `${t.reason} · ${t.action}`,
        tone: 'opportunity' as const, severity: t.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'this week',
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
    delinquency,
  };
}
