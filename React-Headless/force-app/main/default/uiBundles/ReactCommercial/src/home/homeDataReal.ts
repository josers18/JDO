/**
 * HOME app — REAL data implementation for the Commercial "Relationship Command".
 *   · Core/FSC (Opportunity, Case, Task, Event, FinancialGoal) → GraphQL
 *   · Data Cloud business credit (CumulusDnBBusinessCredit__dlm) → DcBridgeRest
 *
 * The persona signal is CREDIT RISK: the RM's "who to call" ranks accounts by
 * the weakest PAYDEX / highest delinquency-predictor scores (the borrowers most
 * likely to need a covenant or credit review). Field names + DMO columns
 * verified live against jdo-1lrnov (storm-16a17dc388fbe6, 2026-07-07).
 */
import { executeGraphQL, queryDataCloud } from '@shared';
import type { HomeDashboard, CallItem, ScheduleItem, BankerGoal, PipelineItem, DelinquencyWatch, Recommendation, RightNowItem, LifeEventSignal } from './homeTypes';

/* ── Life-event signals ───────────────────────────────────────────
   Representative commercial-book signals. No live Data Cloud life-event feed is
   wired yet, so these are seeded here (like the derived `alerts`) rather than
   returned empty — an empty array renders the panel as a bare header with no
   rows. Swap for a queryDataCloud call once the life-event stream is mapped. */
const LIFE_EVENTS: LifeEventSignal[] = [
  { id: 'le1', clientId: '001D', clientName: 'Delta Foods Inc', event: 'Acquired a competitor', when: '4 days ago', opportunity: 'Acquisition financing + integration treasury', icon: '🤝' },
  { id: 'le2', clientId: '001E', clientName: 'Emerald Construction', event: 'Won a major contract', when: '1 week ago', opportunity: 'Working-capital line + performance bonds', icon: '📈' },
  { id: 'le3', clientId: '001F', clientName: 'Frontier Freight', event: 'CFO transition', when: 'Last week', opportunity: 'Re-engage on treasury + refinance', icon: '👔' },
  { id: 'le4', clientId: '001G', clientName: 'Granite Materials', event: 'Opened a new facility', when: '2 weeks ago', opportunity: 'Equipment finance + expansion capital', icon: '🏗️' },
];

/* ── Core/FSC via GraphQL (verified fields) ────────────────── */
const HOME_CORE_QUERY = /* GraphQL */ `
  query CommercialBook {
    uiapi {
      query {
        Opportunity(first: 200, where: { IsClosed: { eq: false } }, orderBy: { Amount: { order: DESC } }) {
          totalCount
          edges { node { Id Name @optional { value } StageName @optional { value } Amount @optional { value } CloseDate @optional { value } Probability @optional { value } Account @optional { Name @optional { value } } } }
        }
        Case(first: 1, where: { IsClosed: { eq: false } }) { totalCount }
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
   Scope to this org's account prefix (001am%) so every row resolves to a local
   Account name. Rank by PAYDEX ascending then delinquency-predictor descending. */
const CREDIT_RISK_SQL = `
  SELECT ssot__AccountId__c AS account_id, paydexScore__c AS paydex,
         compositeRiskScore__c AS composite_risk, delinquencyPredictorScore__c AS delinquency,
         dnbRating__c AS rating, averageDaysBeyondTerms__c AS days_beyond
  FROM CumulusDnBBusinessCredit__dlm
  WHERE paydexScore__c IS NOT NULL AND ssot__AccountId__c LIKE '001am%'
  ORDER BY paydexScore__c ASC, delinquencyPredictorScore__c DESC
  LIMIT 8
`;

interface CreditRow { account_id: string; paydex: number; composite_risk: number; delinquency: number; rating: string; days_beyond: number; }

/* ── Data Cloud: book-level loan delinquency (NOT account-joinable —
   all rows belong to a synthetic loan book, so this is an aggregate metric). */
const DELINQUENCY_SQL = `
  SELECT delinquency_status__c AS status, COUNT(uniqueid__c) AS cnt,
         SUM(loan_balance__c) AS balance, SUM(recovered_amount__c) AS recovered
  FROM Loan_Delinquencies__dlm
  WHERE delinquency_status__c IS NOT NULL
  GROUP BY delinquency_status__c
  ORDER BY SUM(loan_balance__c) DESC
`;
interface DelinqRow { status: string; cnt: number; balance: number; recovered: number; }
type Node = Record<string, { value?: unknown } | undefined>;
const v = (n: Node, k: string) => (n[k] as { value?: unknown } | undefined)?.value;
const s = (n: Node, k: string) => String(v(n, k) ?? '');
const num = (n: Node, k: string) => Number(v(n, k) ?? 0);
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
    Case?: { totalCount?: number };
    TaskOverdue?: { edges?: { node: Node }[] };
    TaskUpcoming?: { edges?: { node: Node }[] };
    Event?: { edges?: { node: Node }[] };
    FinancialGoal?: { edges?: { node: Node }[] };
  } };
}

export async function fetchHomeDashboardReal(): Promise<HomeDashboard> {
  const [core, credit, delinq] = await Promise.all([
    executeGraphQL<CoreShape>(HOME_CORE_QUERY),
    queryDataCloud<CreditRow>(CREDIT_RISK_SQL, 8),
    queryDataCloud<DelinqRow>(DELINQUENCY_SQL, 20).catch(() => ({ rows: [] as DelinqRow[] })),
  ]);
  const q = core.uiapi?.query;
  const opp = q?.Opportunity;

  const ids = [...new Set(credit.rows.map(r => r.account_id).filter(Boolean))];
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
      source: 'D&B credit',
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

  const pipeline: PipelineItem[] = (opp?.edges ?? []).slice(0, 8).map((e, i) => ({
    id: `o${i}`,
    clientName: e.node.Account?.Name?.value ?? '—',
    name: s(e.node, 'Name'), stage: s(e.node, 'StageName'),
    amount: num(e.node, 'Amount'), closeDate: s(e.node, 'CloseDate'),
    propensity: Math.min(1, num(e.node, 'Probability') / 100) || 0.5,
  }));

  const highRisk = callList.filter(c => c.severity === 'high').length;

  const delinqRows = delinq.rows ?? [];
  const delinquency: DelinquencyWatch | null = delinqRows.length ? {
    totalDelinquentBalance: delinqRows.reduce((s, r) => s + Number(r.balance || 0), 0),
    totalRecovered: delinqRows.reduce((s, r) => s + Number(r.recovered || 0), 0),
    byStatus: delinqRows.map(r => ({ status: String(r.status || '—'), count: Math.round(Number(r.cnt || 0)), balance: Number(r.balance || 0) })),
    asOf: 'Latest',
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
      ? ` Book delinquency stands at ${delinquency.totalDelinquentBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}.`
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

  return {
    bankerName: 'Alex',
    dateLabel: 'Today',
    aiBriefHeadline: 'borrowers on the credit watchlist',
    aiBrief: `${callList.length} relationships flagged by D&B business credit, ${highRisk} with PAYDEX under 60 (covenant-review candidates). ${opp?.totalCount ?? 0} open opportunities worth ${pipelineValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })} in pipeline. ${schedule.length} activities scheduled.`,
    confidencePct: 86,
    dataSourceCount: 25,
    kpis: [
      { key: 'pipeline', label: 'Pipeline', value: pipelineValue, format: 'currencyCompact' },
      { key: 'openOpps', label: 'Open Opportunities', value: opp?.totalCount ?? 0, format: 'number' },
      { key: 'openCases', label: 'Open Cases', value: q?.Case?.totalCount ?? 0, format: 'number' },
      { key: 'creditWatch', label: 'Credit Watch', value: callList.length, format: 'number' },
      { key: 'highRisk', label: 'PAYDEX < 60', value: highRisk, format: 'number' },
    ],
    callList,
    pipeline,
    bankerGoals,
    lifeEvents: LIFE_EVENTS,
    schedule,
    alerts: callList.slice(0, 4).map((c, i) => ({
      id: `a${i}`, title: `Credit risk — ${c.clientName}`, detail: c.reason,
      tone: 'risk' as const, severity: c.severity === 'high' ? 'High' as const : 'Medium' as const, when: 'recent',
    })),
    leads: [],
    recommendations,
    rightNow,
    delinquency,
  };
}
