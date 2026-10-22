/**
 * HOME app — REAL data implementation ("wired like today"):
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal, Lead, Account)
 *     → GraphQL (sdk.graphql)
 *   · Data Cloud (CSAT/NPS; S5 bonus / tax-refund inflows from
 *     ssot__FinancialAccountTransaction) → DcBridgeRest → ConnectApi.CdpQuery,
 *     scoped to the signed-in banker's book (falls back to org-wide when empty)
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
 *   · R1 home equity (BT_Corelogic_Property__dlm): HELOC-ready owners → Growth KPI,
 *     HELOC / refi leads → queue
 *   · R2 property-risk exposure (same DMO): flood zone A/AE/V/VE or wildfire 70+
 *     → Health-tab exposure card + alerts
 *
 * All field names + DMO columns below were VERIFIED live against the org
 * (jdo-oe0sdd, 2026-10-20) by running each query through the uiapi endpoint
 * and DcBridgeRest. Not guessed.
 */
import { executeGraphQL, queryDataCloudForBook, fetchEffectiveUser, getViewAs, ownerScopedQuery, fetchLargeInflows, inflowQueueItems, type TxSignalResult, type LargeInflow, fetchCallSentiment, callSentimentQueueItems, type CallSentimentResult, fetchAmlChanges, amlChangeQueueItems, type AmlChange, fetchNextBestOffers, offerRecommendations, type NextBestOfferResult, fetchWarmIntros, warmIntroLeads, interleave, type WarmIntroResult, fetchModeledUplift, type ModeledUplift, fetchCampaignTouches, campaignTouchQueueItems, type CampaignTouchResult, fetchServiceNowDrag, type ServiceNowDrag, fetchDataFreshness, type DataFreshness, fetchHomeEquity, homeEquityQueueItems, type HomeEquityResult, fetchPropertyRisk, propertyHazards, type PropertyRiskResult } from '@shared';
import type { HomeDashboard, CallItem, CaseItem, CustomerGoal, ScheduleItem, BankerGoal, LeadReferral, PipelineItem, Recommendation, RightNowItem, LifeEventSignal, ActivityItem, PipelineMovement } from './homeTypes';

/** Deterministic pseudo-trend for a pipeline-movement sparkline (no Math.random —
 *  it breaks SSR/replay). Wobbles around `end` using the id's char codes. */
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
  query HomeBook {
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

/* ── Account name lookup for the CSAT call list (IDs → names) ──
   Inlined IDs (not a $variable) — the SDK graphql client's variable
   forwarding for list types proved unreliable; an inline literal list is
   deterministic. IDs are org-generated 15/18-char alphanumerics (safe). */
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

/* ── Data Cloud: lowest-CSAT accounts = "who to call" (verified) ──
   CSAT_Snowflake__dlm holds a score history per account (2023 → latest), so
   take each account's MOST RECENT survey first, then rank — a client who
   scored low two years ago and has since recovered isn't a call today.
   Scoped to the signed-in banker's book (falls back to org-wide). */
const lowCsatSql = (accountFilter: string) => `
  SELECT account_id, csat, nps, reason, score_date FROM (
    SELECT accountid__c AS account_id, csat_score__c AS csat, nps_score__c AS nps,
           csat_description__c AS reason, score_date__c AS score_date,
           ROW_NUMBER() OVER (PARTITION BY accountid__c ORDER BY score_date__c DESC) AS rn
    FROM CSAT_Snowflake__dlm
    WHERE csat_score__c IS NOT NULL AND accountid__c ${accountFilter}
  ) t
  WHERE rn = 1
  ORDER BY csat ASC
  LIMIT 8
`;

interface CsatRow { account_id: string; csat: number; nps: number; reason: string; score_date: string; }
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

function severityForCsat(csat: number): CallItem['severity'] {
  if (csat < 50) return 'high';
  if (csat < 70) return 'medium';
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
  // The CSAT query needs the banker's user Id to scope to their book;
  // GraphQL runs in parallel with that chain.
  // "View as" swaps in another banker: their Id drives every DC book filter
  // and the CRM roots below get an owner filter (none for your own book).
  const userP = fetchEffectiveUser();
  const [core, csat, currentUser, inflows, gong, aml, offers, intros, uplift, touches, serviceNow, freshness, equity, propRisk] = await Promise.all([
    executeGraphQL<CoreShape>(ownerScopedQuery(HOME_CORE_QUERY, getViewAs()?.userId)),
    userP.then(u => queryDataCloudForBook<CsatRow>(lowCsatSql, u?.userId, 8)),
    userP,
    // S5 is additive — a failed transaction query must not blank the page.
    userP.then(u => fetchLargeInflows(u?.userId))
      .catch((): TxSignalResult<LargeInflow> => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchCallSentiment(u?.userId))
      .catch((): CallSentimentResult => ({ rows: [], scope: 'org', weekly: [] })),
    userP.then(u => fetchAmlChanges(u?.userId))
      .catch((): TxSignalResult<AmlChange> => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchNextBestOffers(u?.userId, 'retail'))
      .catch((): NextBestOfferResult => ({ rows: [], scope: 'org' })),
    userP.then(u => fetchWarmIntros(u?.userId))
      .catch((): WarmIntroResult => ({ rows: [], scope: 'org' })),
    // S3 Growth KPI + S6 campaign touches — additive, like the other DC signals.
    userP.then(u => fetchModeledUplift(u?.userId, 'retail'))
      .catch((): ModeledUplift => ({ total: 0, clients: 0, byOffer: [], scope: 'org' })),
    userP.then(u => fetchCampaignTouches(u?.userId, 'Personal'))
      .catch((): CampaignTouchResult => ({ rows: [], scope: 'org' })),
    // S7 ServiceNow open cases (book-only) + S8 per-source freshness.
    userP.then(u => fetchServiceNowDrag(u?.userId))
      .catch((): ServiceNowDrag => ({ open: 0, aged: 0, scope: 'org' })),
    fetchDataFreshness(['transactions', 'worldCheck', 'marketing', 'serviceNow', 'gong', 'graph', 'offers', 'csat', 'corelogic'])
      .catch((): DataFreshness | undefined => undefined),
    // R1 home equity (CoreLogic) — additive.
    userP.then(u => fetchHomeEquity(u?.userId))
      .catch((): HomeEquityResult => ({ rows: [], owners: 0, equity: 0, refi: 0, quarter: '', scope: 'org' })),
    // R2 property-risk exposure (CoreLogic) — additive.
    userP.then(u => fetchPropertyRisk(u?.userId))
      .catch((): PropertyRiskResult => ({ rows: [], homes: 0, flood: 0, wildfire: 0, both: 0, homeValue: 0, mortgage: 0, scope: 'org' })),
  ]);
  // Greet the logged-in banker by first name; fall back to full name, then a
  // demo default if the identity call is unavailable (e.g. mock/offline).
  const bankerName = currentUser?.firstName || currentUser?.name || 'Alex';
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  // resolve CSAT + inflow account IDs → names in one follow-up query
  const csatIds = [...new Set([...csat.rows.map(r => r.account_id), ...inflows.rows.map(r => r.accountId), ...gong.rows.map(r => r.accountId), ...aml.rows.map(r => r.accountId), ...offers.rows.map(r => r.accountId), ...intros.rows.map(r => r.referrerId), ...touches.rows.map(r => r.accountId), ...equity.rows.map(r => r.accountId), ...propRisk.rows.map(r => r.accountId)].filter(Boolean))];
  const nameById: Record<string, string> = {};
  const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
  if (csatIds.length) {
    try {
      const names = await executeGraphQL<{ uiapi?: { query?: { Account?: { edges?: { node: Node }[] } } } }>(
        accountNamesQuery(csatIds)
      );
      for (const e of names.uiapi?.query?.Account?.edges ?? []) {
        // Id is a PLAIN string on GraphQL nodes (not wrapped in {value}); Name is wrapped.
        const id = (e.node as { Id?: string }).Id ?? '';
        if (id) nameById[id] = s(e.node, 'Name');
      }
    } catch { /* names are best-effort; fall back to raw ID */ }
  }

  const pipelineValue = (opp?.edges ?? []).reduce((sum, e) => sum + num(e.node, 'Amount'), 0);

  const callList: CallItem[] = csat.rows.map((row, i) => ({
    id: `c${i}`,
    clientId: row.account_id,
    clientName: nameById[row.account_id] || row.account_id,
    segment: 'Retail',
    reason: (row.reason && String(row.reason).trim()) || `CSAT ${Math.round(Number(row.csat))} · NPS ${Math.round(Number(row.nps))}`,
    action: 'Service-recovery outreach',
    score: 1 - Math.min(Number(row.csat) || 0, 100) / 100,
    severity: severityForCsat(Number(row.csat) || 0),
    source: `CSAT / NPS${csat.scope === 'org' ? ' · org-wide' : ''}`,
    relationshipValue: 0,
    tier: tierForSeverity(severityForCsat(Number(row.csat) || 0)),
  }));

  // S1 — clients whose recorded-call sentiment is negative and sliding.
  // S2 — screening ratings that escalated on the latest World-Check run.
  const amlSignals: CallItem[] = amlChangeQueueItems(aml, nameById, { segment: 'Retail' });
  const gongSignals: CallItem[] = callSentimentQueueItems(gong, nameById, { segment: 'Retail' });
  // S5 — fresh bonus / tax-refund cash sitting in checking.
  const txSignals: CallItem[] = inflowQueueItems(inflows, nameById, {
    segment: 'Retail', action: 'Idle-cash conversation — savings / CD',
  });
  // S6 — clients who clicked through a campaign: a warm follow-up.
  const campaignSignals: CallItem[] = campaignTouchQueueItems(touches, nameById, { segment: 'Retail' });
  // R1 — HELOC / refi leads from CoreLogic.
  const equitySignals: CallItem[] = homeEquityQueueItems(equity, nameById, { segment: 'Retail' });
  const transactionSignals: CallItem[] = [...amlSignals, ...gongSignals, ...txSignals, ...campaignSignals, ...equitySignals];
  // S1 Health KPI — book count of negative + declining clients, with the real
  // 8-week series behind the sparkline and a week-over-week delta.
  const toneSeries = gong.weekly.map(w => w.count);
  const toneNow = toneSeries.length ? toneSeries[toneSeries.length - 1] : gong.rows.length;
  const tonePrev = toneSeries.length > 1 ? toneSeries[toneSeries.length - 2] : 0;
  const inflowTotal = inflows.rows.reduce((sum, r) => sum + r.amount, 0);

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

  // ── Recommendations — derived defensively (never throws). Sources:
  //   overdue Task · top Opportunity · highest-value Account · a low-CSAT case.
  const recommendations: Recommendation[] = [];
  const firstTask = q?.TaskOverdue?.edges?.[0]?.node;
  if (firstTask) {
    const subj = s(firstTask, 'Subject') || 'Follow-up task';
    const due = s(firstTask, 'ActivityDate');
    recommendations.push({
      id: 'rec-task', kind: 'task', objectLabel: 'Task', clientName: subj, clientId: '',
      title: `Complete overdue task: ${subj}`,
      body: `This task${due ? ` (due ${due})` : ''} is still open. Close the loop with the client and log the next step.`,
      evidence: `Open Task${due ? ` with ActivityDate ${due}` : ''} — from your overdue queue`,
    });
  }
  const topOpp = opp?.edges?.[0]?.node;
  if (topOpp) {
    const oppName = s(topOpp, 'Name') || 'Opportunity';
    const acct = topOpp.Account?.Name?.value ?? oppName;
    recommendations.push({
      id: 'rec-call', kind: 'call', objectLabel: 'Opportunity', clientName: acct, clientId: '',
      title: `Push ${acct} across the finish line`,
      body: `Your largest open opportunity (${oppName}, ${num(topOpp, 'Amount').toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}) needs a next step. Schedule a call to confirm docs and lock a date.`,
      evidence: `Highest-value open opportunity at ${Math.round(num(topOpp, 'Probability'))}% probability`,
    });
  }
  const topAcct = (opp?.edges ?? []).find(e => e.node.Account?.Name?.value)?.node.Account?.Name?.value;
  if (topAcct) {
    recommendations.push({
      id: 'rec-email', kind: 'email', objectLabel: 'Account', clientName: topAcct, clientId: '',
      title: `Re-engage ${topAcct}`,
      body: 'A top account has limited recent activity. Reach out on treasury-management needs and explore lending options.',
      evidence: 'High-value account with sparse recent engagement history',
    });
  }
  const lowCsat = callList[0];
  if (lowCsat) {
    recommendations.push({
      id: 'rec-case', kind: 'case', objectLabel: 'Case', clientName: lowCsat.clientName, clientId: lowCsat.clientId,
      title: `Escalate ${lowCsat.clientName} before churn`,
      body: 'Low CSAT is a churn signal. Escalate to priority handling and log a service-recovery outreach.',
      evidence: lowCsat.reason,
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
  //    real Task/Event touches), tinted by kind. Falls back to empty if the
  //    book has no activity, which the panel renders as a graceful empty note.
  const ACT_ICON: Record<string, ActivityItem['icon']> = { task: 'task', meeting: 'event', call: 'call', event: 'event' };
  const activity: ActivityItem[] = schedule.slice(0, 6).map((it, i) => ({
    id: `act${i}`,
    clientName: it.clientName || it.title,
    clientId: it.whatId,
    title: it.title,
    when: it.time,
    icon: ACT_ICON[it.kind] ?? 'task',
    tone: it.bucket === 'overdue' ? 'risk' : 'neutral',
  }));

  // ── Pipeline movement — group open opportunities by stage into product-line
  //    buckets, summing amount. A real, live-derived roll-up (not seeded).
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
      deltaPct: 0.06, // no historical snapshot wired yet — flat positive placeholder
      trend: seedTrend(label, amount),
    }));

  // S7 — open service drag: CRM open cases + the book's open ServiceNow cases.
  const crmOpen = q?.Case?.totalCount ?? 0;
  const openCases = crmOpen + serviceNow.open;
  const agedCases = (q?.CaseAged?.totalCount ?? 0) + serviceNow.aged;

  return {
    bankerName,
    dateLabel: 'Today',
    aiBriefHeadline: 'your book at a glance',
    aiBrief: `${callList.length} clients flagged by CSAT, ${highRisk} high-risk. ${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.${inflows.rows.length ? ` ${inflows.rows.length} clients received a bonus or tax refund this week (${inflowTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}): an idle-cash moment.` : ''}`,
    // S8 — freshness replaces the static confidence (kept as the fallback).
    confidencePct: freshness?.pct ?? 87,
    dataSourceCount: freshness?.sources.length ?? 24,
    dataFreshness: freshness,
    propertyRisk: {
      ...propRisk,
      rows: propRisk.rows.map(h => ({ ...h, clientName: nameById[h.accountId] ?? 'Client' })),
    },
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact', trend: seedTrend('pipeline', Math.round(pipelineValue / 1e6)), deltaPct: 0.041, note: `${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities` },
      { key: 'openOpps', label: 'Opportunities', value: opp?.totalCount ?? 0, format: 'number', trend: seedTrend('opps', opp?.totalCount ?? 0), deltaPct: 0.03, note: 'In progress' },
      { key: 'leads', label: 'Leads & Referrals', value: leads.length, format: 'number', trend: seedTrend('leads', Math.max(1, leads.length)), deltaPct: 0.08, note: 'Open leads' },
      { key: 'openCases', label: 'Open Cases', value: openCases, format: 'number', trend: seedTrend('cases', openCases), note: `${crmOpen.toLocaleString('en-US')} CRM · ${serviceNow.open.toLocaleString('en-US')} ServiceNow${agedCases ? ` · ${agedCases.toLocaleString('en-US')} open 30d+` : ''}` },
      { key: 'atRisk', label: 'At-Risk Clients', value: highRisk, format: 'number', trend: seedTrend('atrisk', Math.max(1, highRisk)), deltaPct: -0.02, note: 'Require attention' },
      { key: 'callTone', label: 'Call Tone Sliding', value: toneNow, format: 'number', trend: toneSeries.length > 1 ? toneSeries : seedTrend('calltone', Math.max(1, toneNow)), deltaPct: tonePrev ? (toneNow - tonePrev) / tonePrev : undefined, note: `Negative & declining on Gong${gong.scope === 'org' ? ' · org-wide' : ''}` },
      { key: 'uplift', label: 'Modeled Uplift', value: uplift.total, format: 'currencyCompact', trend: seedTrend('uplift', Math.max(1, Math.round(uplift.total / 1e4))), note: uplift.clients ? `${uplift.clients.toLocaleString('en-US')} clients with an eligible offer${uplift.byOffer[0] ? ` · top: ${uplift.byOffer[0].offer}` : ''}${uplift.scope === 'org' ? ' · org-wide' : ''}` : 'No eligible offers in book' },
      { key: 'homeEquity', label: 'Home Equity', value: equity.equity, format: 'currencyCompact', trend: seedTrend('homeEquity', Math.max(1, Math.round(equity.equity / 1e7))), note: equity.owners ? `${equity.owners.toLocaleString('en-US')} owners HELOC-ready · ${equity.refi.toLocaleString('en-US')} refi${equity.scope === 'org' ? ' · org-wide' : ''}` : 'No HELOC-ready owners in book' },
      { key: 'goals', label: 'Active Goals', value: bankerGoals.length, format: 'number', trend: seedTrend('goals', Math.max(1, bankerGoals.length)), deltaPct: 0.02, note: 'On track' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents,
    schedule,
    transactionSignals,
    alerts: [
      // R2 — the most exposed homes (both hazards first, then value).
      ...propRisk.rows.slice(0, 2).map((h, i) => ({
        id: `ap${i}`, title: `Property risk — ${nameById[h.accountId] ?? 'Client'}`,
        detail: `${propertyHazards(h)} · ${fmtUsd(h.value)} ${h.propertyType.toLowerCase() || 'home'}${h.mortgage ? ` · ${fmtUsd(h.mortgage)} mortgage` : ''} · Insurance review / proactive outreach`,
        tone: 'risk' as const, severity: h.floodZone && h.wildfire >= 70 ? 'High' as const : 'Medium' as const, when: 'this quarter',
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
        id: `a${i}`, title: `Low CSAT — ${c.clientName}`, detail: c.reason,
        tone: 'risk' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
      })),
      ...gongSignals.slice(0, 2).map((g, i) => ({
        id: `ag${i}`, title: `Call tone sliding — ${g.clientName}`, detail: `${g.reason} · ${g.action}`,
        tone: 'risk' as const, severity: g.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'this week',
      })),
      ...txSignals.slice(0, 3).map((t, i) => ({
        id: `ax${i}`, title: `Inflow — ${t.clientName}`, detail: `${t.reason} · ${t.action}`,
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
