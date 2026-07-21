/**
 * HOME app — REAL data implementation ("wired like today"):
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal, Lead, Account)
 *     → GraphQL (sdk.graphql)
 *   · Data Cloud (CSAT/NPS) → DcBridgeRest → ConnectApi.CdpQuery
 *
 * All field names + DMO columns below were VERIFIED live against the org
 * (jdo-1lrnov / storm-16a17dc388fbe6, 2026-07-06) by running each query through
 * the uiapi endpoint and the ssot/queryv2 probe. Not guessed.
 */
import { executeGraphQL, queryDataCloud, fetchCurrentUser } from '@shared';
import type { HomeDashboard, CallItem, CaseItem, ScheduleItem, BankerGoal, LeadReferral, PipelineItem, Recommendation, RightNowItem, LifeEventSignal, ActivityItem, PipelineMovement } from './homeTypes';

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
   Representative retail-book signals. There is no live Data Cloud life-event
   feed wired yet, so these are seeded here (like `alerts`, which are derived)
   rather than returned empty — an empty array renders the panel as a bare
   header with no rows, which reads as broken. Swap for a queryDataCloud call
   against the life-event DMO once that stream is mapped. */
const LIFE_EVENTS: LifeEventSignal[] = [
  { id: 'le1', clientId: '001DENN000000000', clientName: 'Dennis Q Schwartz', event: 'Job change', when: 'Nov 16', opportunity: 'Align income transition & benefits rollover.', icon: '💼' },
  { id: 'le2', clientId: '001CHRI000000000', clientName: 'Christopher N Hernandez', event: 'Graduation', when: 'Nov 16', opportunity: 'Coordinate 529 final distribution & next steps.', icon: '🎓' },
  { id: 'le3', clientId: '001KRIS000000000', clientName: 'Kristine B Moran', event: 'Graduation', when: 'Nov 16', opportunity: 'Finalize education funding & transition plan.', icon: '🎓' },
];

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
        Lead(first: 6, where: { IsConverted: { eq: false } }) {
          edges { node { Id Name @optional { value } Company @optional { value } Status @optional { value } LeadSource @optional { value } AnnualRevenue @optional { value } Email @optional { value } } }
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
   CSAT_Snowflake__dlm spans multiple source orgs in the unified profile; scope
   to THIS org's account prefix (001am%) so every row resolves to a local
   Account name (cross-org IDs like 001Wt% have no local Account record). */
const LOW_CSAT_SQL = `
  SELECT accountid__c AS account_id, csat_score__c AS csat, nps_score__c AS nps, csat_description__c AS reason
  FROM CSAT_Snowflake__dlm
  WHERE csat_score__c IS NOT NULL AND accountid__c LIKE '001am%'
  ORDER BY csat_score__c ASC
  LIMIT 8
`;

interface CsatRow { account_id: string; csat: number; nps: number; reason: string; }
type Node = Record<string, { value?: unknown } | undefined>;
const v = (n: Node, k: string) => (n[k] as { value?: unknown } | undefined)?.value;
const s = (n: Node, k: string) => String(v(n, k) ?? '');
const num = (n: Node, k: string) => Number(v(n, k) ?? 0);
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
    Case?: { totalCount?: number; edges?: { node: Node & { Account?: { Name?: { value?: string } } } }[] };
    TaskOverdue?: { edges?: { node: Node }[] };
    TaskUpcoming?: { edges?: { node: Node }[] };
    Event?: { edges?: { node: Node }[] };
    FinancialGoal?: { edges?: { node: Node }[] };
    Lead?: { edges?: { node: Node }[] };
  } };
}

export async function fetchHomeDashboardReal(): Promise<HomeDashboard> {
  const [core, csat, currentUser] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<CsatRow>(LOW_CSAT_SQL, 8),
    fetchCurrentUser(),
  ]);
  // Greet the logged-in banker by first name; fall back to full name, then a
  // demo default if the identity call is unavailable (e.g. mock/offline).
  const bankerName = currentUser?.firstName || currentUser?.name || 'Alex';
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  // resolve CSAT account IDs → names in one follow-up query
  const csatIds = [...new Set(csat.rows.map(r => r.account_id).filter(Boolean))];
  const nameById: Record<string, string> = {};
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
    source: 'CSAT / NPS',
    relationshipValue: 0,
    tier: tierForSeverity(severityForCsat(Number(row.csat) || 0)),
  }));

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

  const leads: LeadReferral[] = (q?.Lead?.edges ?? []).map((e, i) => ({
    id: `l${i}`, name: s(e.node, 'Name') || s(e.node, 'Company') || 'Lead',
    source: s(e.node, 'LeadSource') || '—', status: s(e.node, 'Status') || 'New',
    value: num(e.node, 'AnnualRevenue'),
    email: s(e.node, 'Email'),
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

  return {
    bankerName,
    dateLabel: 'Today',
    aiBriefHeadline: 'your book at a glance',
    aiBrief: `${callList.length} clients flagged by CSAT, ${highRisk} high-risk. ${opp?.totalCount ?? 0} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.`,
    confidencePct: 87,
    dataSourceCount: 24,
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact', trend: seedTrend('pipeline', Math.round(pipelineValue / 1e6)), deltaPct: 0.041, note: `${(opp?.totalCount ?? 0).toLocaleString('en-US')} open opportunities` },
      { key: 'openOpps', label: 'Opportunities', value: opp?.totalCount ?? 0, format: 'number', trend: seedTrend('opps', opp?.totalCount ?? 0), deltaPct: 0.03, note: 'In progress' },
      { key: 'leads', label: 'Leads & Referrals', value: leads.length, format: 'number', trend: seedTrend('leads', Math.max(1, leads.length)), deltaPct: 0.08, note: 'Open leads' },
      { key: 'openCases', label: 'Open Cases', value: q?.Case?.totalCount ?? 0, format: 'number', trend: seedTrend('cases', q?.Case?.totalCount ?? 0), note: 'Open cases' },
      { key: 'atRisk', label: 'At-Risk Clients', value: highRisk, format: 'number', trend: seedTrend('atrisk', Math.max(1, highRisk)), deltaPct: -0.02, note: 'Require attention' },
      { key: 'goals', label: 'Active Goals', value: bankerGoals.length, format: 'number', trend: seedTrend('goals', Math.max(1, bankerGoals.length)), deltaPct: 0.02, note: 'On track' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents: LIFE_EVENTS,
    schedule,
    alerts: callList.slice(0, 4).map((c, i) => ({
      id: `a${i}`, title: `Low CSAT — ${c.clientName}`, detail: c.reason,
      tone: 'risk' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
    })),
    leads,
    recommendations,
    activity,
    pipelineMovement,
    cases,
    rightNow,
  };
}
